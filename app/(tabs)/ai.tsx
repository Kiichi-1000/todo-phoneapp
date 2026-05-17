import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Send, Sparkles, RotateCcw, MessageSquare, Mic, Square as StopIcon } from 'lucide-react-native';
import * as voiceInput from '@/lib/voiceInput';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { supabase } from '@/lib/supabase';
import { sendChat, ChatMessage as APIChatMessage } from '@/lib/aiClient';
import { checkAiAccess } from '@/lib/aiAccess';
import ChatBubble from '@/components/ai/ChatBubble';
import ToolResultCard from '@/components/ai/ToolResultCard';
import TokenBalanceBadge from '@/components/ai/TokenBalanceBadge';
import ConversationList from '@/components/ai/ConversationList';
import AIConsentModal, { isAiConsentGranted } from '@/components/ai/AIConsentModal';

// Cap on how many recent messages we replay to the AI when a user opens an
// old conversation. Display still shows everything; this is purely about cost.
// 20 messages = ~10 turns = enough context for natural follow-up without
// blowing up token usage on long histories.
const HISTORY_REPLAY_LIMIT = 20;

interface UIMessage {
  id: string;
  kind: 'user' | 'assistant_text' | 'tool_card';
  text?: string;
  isStreaming?: boolean;
  toolName?: string;
  toolOk?: boolean;
  toolData?: any;
  toolError?: string;
  choicesDisabled?: boolean;
}

const SUGGESTIONS_JA = [
  '明日のタスクに英作文を追加',
  '13時から1時間ジムを入れて',
  '朝のルーティンに散歩を追加',
  '今週の達成率は？',
];

const SUGGESTIONS_EN = [
  'Add essay practice to tomorrow',
  'Schedule gym 1pm to 2pm',
  'Add a morning walk routine',
  'How am I doing this week?',
];

export default function AIScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { t, lang } = useLanguage();
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  // 音声入力 (Speech-to-Text) の状態。録音中 → true、API 文字起こし待ち → transcribing。
  // 既存 lib/voiceInput.ts が startRecording/stopAndTranscribe を提供しているので、
  // ここではトグル UI と state のみを管理する。
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [balanceYen, setBalanceYen] = useState<number | null>(null);
  // 現在のプラン (active_subscription 時のみ意味あり)。バッジで「プラン上限に対する%」
  // を出すために必要。基本: standard → 4000 トークン上限、pro → 7000 トークン上限。
  const [planMaxTokens, setPlanMaxTokens] = useState<number | null>(null);
  const [accessReason, setAccessReason] = useState<
    | 'active_subscription'
    | 'promo'
    | 'release_promo'
    | 'basic_plan_no_ai'
    | 'none'
    | null
  >(null);
  const [accessExpiresAt, setAccessExpiresAt] = useState<string | null>(null);
  const [historyVisible, setHistoryVisible] = useState(false);
  const [loadingConversation, setLoadingConversation] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  const apiHistoryRef = useRef<APIChatMessage[]>([]);
  const toolNameByIdRef = useRef<Record<string, string>>({});
  // Server-assigned conversation id. Persisted server-side; cleared locally
  // when user resets the chat → next send starts a brand-new conversation row.
  const conversationIdRef = useRef<string | undefined>(undefined);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 50);
  }, []);

  // ----------------------------------------------------------------------
  // 課金壁ゲート: AI ページが「フォーカスされた瞬間」に access を判定し、
  // 未加入なら paywall モーダルを即時表示する。
  //
  // useFocusEffect を使う理由:
  // - useEffect[] だと AI タブが裏に回って戻ってきたときに再評価されない
  //   (expo-router の Tabs は画面を unmount しないため)。
  // - useFocusEffect なら「タブに切り替わる → 都度判定」になり、
  //   paywall を閉じて他タブ → AI タブ に戻ってきた時も再判定が走る。
  //
  // ※ ToSche Basic / AI Standard / AI Pro どれでも access.reason === 'active_subscription'
  //    で通る (= ToSche Basic も AI を使える前提)。
  //    実際の利用上限はトークン残高で別途制御される。
  // ----------------------------------------------------------------------
  const hasGatedRef = useRef(false); // 同じ focus 中に二重 push しない

  // 共通の access 再評価ロジック。useFocusEffect (タブ切替時) と useEffect
  // (user.id hydration 時) の両方から呼ぶ。これにより:
  //   - アプリ起動直後で user 未確定の瞬間にバッジが「未契約」っぽく見える
  //     hydration race を解消 (user.id が変わったタイミングで必ず再評価)
  //   - タブ切替や paywall から戻った時にも再評価される (= 既存挙動を維持)
  const evaluateAccess = useCallback(async () => {
    if (!user?.id) return;
    const access = await checkAiAccess(user.id);
    setAccessReason(access.allowed ? access.reason : 'none');
    setAccessExpiresAt(access.expiresAt);
    if (!access.allowed && !hasGatedRef.current) {
      hasGatedRef.current = true;
      router.push('/paywall?context=ai');
    }
    // あわせて残高とプランをフェッチしてバッジに反映
    // (バッジが古い値で残らないように、また % 表示の分母 = プラン上限を確定するため)
    try {
      const [{ data: bal }, { data: sub }] = await Promise.all([
        supabase
          .from('ai_token_balances')
          .select('current_grant_yen, carryover_yen')
          .eq('user_id', user.id)
          .maybeSingle(),
        supabase
          .from('user_subscriptions')
          .select('plan')
          .eq('user_id', user.id)
          .maybeSingle(),
      ]);
      if (bal) {
        setBalanceYen(
          (Number(bal.current_grant_yen) || 0) + (Number(bal.carryover_yen) || 0),
        );
      }
      // プラン → トークン上限 (yen × 10)。Standard ¥400 = 4000 トークン、Pro ¥700 = 7000。
      // monthly-token-grant の PLAN_GRANT_YEN と合わせること。
      const planKey = (sub?.plan as string | null) ?? null;
      if (planKey === 'standard') setPlanMaxTokens(4000);
      else if (planKey === 'pro') setPlanMaxTokens(7000);
      else setPlanMaxTokens(null);
    } catch {
      // 失敗は無視 (バッジが ai-chat の SSE 経由で後から更新される)
    }
  }, [user?.id, router]);

  // user.id 確定タイミングでの再評価。useFocusEffect だけだと
  // 「AI タブが最初の focus 時に user 未確定 → return → そのまま」になるため。
  useEffect(() => {
    void evaluateAccess();
    // user.id が undefined → 値 に変わった瞬間に走らせたいので、
    // dependency に evaluateAccess (= user?.id 依存) を入れる。
  }, [evaluateAccess]);

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      hasGatedRef.current = false;
      let cancelled = false;
      (async () => {
        if (cancelled) return;
        await evaluateAccess();
      })();
      return () => {
        cancelled = true;
      };
    }, [user, evaluateAccess]),
  );

  // Note: voice input was removed from this chat. Pure dictation is now done
  // via the workspace's Voice-Task button, which inserts directly into todos
  // without invoking the AI agent. Chat here is text-only by design.

  // Reset to a clean slate (UI + ref + server-conv-id). Used by "New chat"
  // in the history modal AND by the manual reset button in the header.
  const resetConversation = useCallback(() => {
    setMessages([]);
    apiHistoryRef.current = [];
    conversationIdRef.current = undefined;
  }, []);

  const handleNewChat = () => {
    resetConversation();
  };

  // Load an existing conversation: display ALL messages in the UI, but only
  // replay the last HISTORY_REPLAY_LIMIT into the AI's context (cost control).
  const handleSelectConversation = async (id: string) => {
    if (!user || sending) return;
    setLoadingConversation(true);
    try {
      const { data, error } = await supabase
        .from('ai_messages')
        .select('id, role, text, created_at')
        .eq('conversation_id', id)
        .eq('user_id', user.id)
        .order('created_at', { ascending: true });
      if (error) throw error;

      const rows = (data ?? []) as Array<{ id: string; role: 'user' | 'assistant'; text: string }>;

      // Build UI messages — show everything we have stored.
      const uiMessages: UIMessage[] = rows.map((r) => ({
        id: `m-${r.id}`,
        kind: r.role === 'user' ? 'user' : 'assistant_text',
        text: r.text,
        isStreaming: false,
      }));

      // Build API replay history — only most recent N for cost control.
      const replayRows = rows.slice(-HISTORY_REPLAY_LIMIT);
      const apiHistory: APIChatMessage[] = replayRows.map((r) =>
        r.role === 'user'
          ? { role: 'user', content: r.text }
          : { role: 'assistant', content: [{ type: 'text', text: r.text }] },
      );

      setMessages(uiMessages);
      apiHistoryRef.current = apiHistory;
      conversationIdRef.current = id;
      scrollToBottom();
    } catch (e: any) {
      Alert.alert(
        lang === 'ja' ? '読み込み失敗' : 'Load failed',
        e?.message || 'Could not load conversation',
      );
    } finally {
      setLoadingConversation(false);
    }
  };

  const handleClearHistory = () => {
    if (messages.length === 0) return;
    Alert.alert(
      t('ai.clearTitle') || '履歴をクリア',
      t('ai.clearBody') || 'チャット履歴をクリアします。よろしいですか？',
      [
        { text: t('common.cancel') || 'キャンセル', style: 'cancel' },
        {
          text: t('common.clear') || 'クリア',
          style: 'destructive',
          onPress: resetConversation,
        },
      ],
    );
  };

  // Apple ガイドライン 5.1.1(i) / 5.1.2(i) 対応:
  // 第三者 AI サービス (Anthropic) へのデータ送信前に、明示的な同意を取る。
  // 同意は AsyncStorage で端末ごとに永続化される (初回 1 回だけ)。
  // 同意未取得時にユーザーが送信ボタンを押すと、まず consent モーダルが出る。
  // 同意取得後、pendingMessageRef に保持していたメッセージを実際に送信。
  const [aiConsentVisible, setAiConsentVisible] = useState(false);
  const pendingMessageRef = useRef<string | null>(null);

  const sendMessage = useCallback(async (text: string) => {
    if (!text || sending || !user) return;

    // 第三者 AI 同意チェック (5.1.1(i) / 5.1.2(i))
    const consented = await isAiConsentGranted();
    if (!consented) {
      // 送信前に同意を取る。テキストを保持しておき、同意取得後に再呼出。
      pendingMessageRef.current = text;
      setAiConsentVisible(true);
      return;
    }

    setSending(true);
    setInput('');
    toolNameByIdRef.current = {};

    const userMsgId = 'u-' + Date.now();
    const assistantMsgId = 'a-' + Date.now();

    setMessages((prev) => [
      ...prev.map((m) => (m.kind === 'tool_card' ? { ...m, choicesDisabled: true } : m)),
      { id: userMsgId, kind: 'user', text },
      { id: assistantMsgId, kind: 'assistant_text', text: '', isStreaming: true },
    ]);
    scrollToBottom();

    apiHistoryRef.current = [...apiHistoryRef.current, { role: 'user', content: text }];

    let assistantBuf = '';

    try {
      await sendChat({
        messages: apiHistoryRef.current,
        conversationId: conversationIdRef.current,
        onEvent: (event) => {
          if (event.type === 'session.start') {
            setBalanceYen(event.data.balance_yen);
            setAccessReason(event.data.access_reason as any);
            setAccessExpiresAt(event.data.access_expires_at);
            if (event.data.conversation_id) {
              conversationIdRef.current = event.data.conversation_id;
            }
          } else if (event.type === 'assistant.text.delta') {
            assistantBuf += event.data.text;
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantMsgId ? { ...m, text: assistantBuf } : m)),
            );
          } else if (event.type === 'tool.exec.start') {
            toolNameByIdRef.current[event.data.id] = event.data.name;
          } else if (event.type === 'tool.exec.result') {
            const r = event.data.result;
            const toolCardId = `tc-${event.data.id}`;
            const name = toolNameByIdRef.current[event.data.id] || 'unknown';
            setMessages((prev) => {
              const idx = prev.findIndex((m) => m.id === assistantMsgId);
              const next = [...prev];
              const card: UIMessage = {
                id: toolCardId,
                kind: 'tool_card',
                toolName: name,
                toolOk: r.ok,
                toolData: r.data,
                toolError: r.error,
              };
              next.splice(idx, 0, card);
              return next;
            });
            scrollToBottom();
          } else if (event.type === 'session.end') {
            if (typeof event.data.balance_after_yen === 'number') {
              setBalanceYen(event.data.balance_after_yen);
            }
            setAccessReason(event.data.access_reason as any);
          } else if (event.type === 'error') {
            assistantBuf = `⚠️ ${event.data.message}`;
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantMsgId ? { ...m, text: assistantBuf } : m)),
            );
          }
        },
      });
    } catch (e: any) {
      const message = e?.code === 'subscription_required'
        ? '試運転期間が終了しています。プランを選んでください。'
        : e?.code === 'insufficient_balance'
        ? '今月のトークンを使い切りました。来月までお待ちいただくか、上位プランをご検討ください。'
        : e?.message || 'エラーが発生しました';
      assistantBuf = `⚠️ ${message}`;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId ? { ...m, text: assistantBuf, isStreaming: false } : m,
        ),
      );
      if (e?.code === 'subscription_required' || e?.code === 'insufficient_balance') {
        setTimeout(() => router.push('/paywall?context=ai'), 800);
      }
    } finally {
      setMessages((prev) =>
        prev.map((m) => (m.id === assistantMsgId ? { ...m, isStreaming: false } : m)),
      );
      if (assistantBuf) {
        apiHistoryRef.current = [
          ...apiHistoryRef.current,
          { role: 'assistant', content: [{ type: 'text', text: assistantBuf }] },
        ];
      }
      setSending(false);
      scrollToBottom();
    }
  }, [sending, user, router, scrollToBottom]);

  const handleSend = () => {
    const text = input.trim();
    if (!text) return;
    sendMessage(text);
  };

  // ----------------------------------------------------------------------
  // 音声入力 (Speech-to-Text)
  //   - 1 タップで録音開始 → アイコンが「停止」ボタンに変わる
  //   - もう 1 タップで録音停止 → transcribe-audio Edge Function に送信
  //   - 結果を input に "追記" する (既存テキストを上書きしないよう ' ' 区切りで連結)
  //   - 55 秒上限 (Google STT v2 inline の制限) で自動停止 → 同じく transcribe へ。
  //     その際は文字起こし完了後に「録音時間の上限」アラートを出してユーザーに
  //     「なぜ自動で止まったか」を伝える。
  // ----------------------------------------------------------------------
  const autoStoppedRef = useRef(false);

  const handleMicPress = useCallback(async () => {
    if (sending || transcribing) return;

    if (recording) {
      const wasAutoStopped = autoStoppedRef.current;
      autoStoppedRef.current = false;
      setRecording(false);
      setTranscribing(true);
      try {
        // 'raw' = Google STT の生テキストをそのまま返す (Claude 後処理を経由しない)。
        // トークン消費を抑えるため & ユーザーが話した通りの入力にするための選択。
        // 後処理 (clean / summary / bullet) は将来のオプション機能として残す。
        const result = await voiceInput.stopAndTranscribe(
          (lang === 'en' ? 'en' : 'ja') as 'ja' | 'en',
          'raw',
        );
        const newText = (result.text || '').trim();
        if (newText) {
          setInput((prev) => (prev ? `${prev} ${newText}` : newText));
        }
        // 55 秒の上限に達して自動停止していた場合は、ユーザーに理由を明示する。
        if (wasAutoStopped) {
          Alert.alert(
            lang === 'ja' ? '録音時間の上限に到達' : 'Recording limit reached',
            lang === 'ja'
              ? '録音音声が長すぎます。55秒以内にしてください。\n録音されていた分は文字起こししました。'
              : 'Recording was too long. Please keep it under 55 seconds.\nWhat was recorded has been transcribed.',
          );
        }
      } catch (e: any) {
        const msg =
          e?.message === 'mic_permission_denied'
            ? lang === 'ja'
              ? 'マイクへのアクセスが許可されていません。設定アプリで許可してください。'
              : 'Microphone access is denied. Please grant permission in Settings.'
            : e?.message || (lang === 'ja' ? '音声認識に失敗しました。' : 'Could not transcribe audio.');
        Alert.alert(lang === 'ja' ? '音声入力エラー' : 'Voice input error', msg);
      } finally {
        setTranscribing(false);
      }
      return;
    }

    try {
      autoStoppedRef.current = false;
      await voiceInput.startRecording({
        onAutoStop: () => {
          // 55 秒経過。Alert は文字起こし完了後に出すので、ここでは flag だけ立てる。
          autoStoppedRef.current = true;
          setTimeout(() => {
            handleMicPress();
          }, 0);
        },
      });
      setRecording(true);
    } catch (e: any) {
      const msg =
        e?.message === 'mic_permission_denied'
          ? lang === 'ja'
            ? 'マイクへのアクセスを許可してください。'
            : 'Please grant microphone access.'
          : e?.message || (lang === 'ja' ? '録音を開始できませんでした。' : 'Could not start recording.');
      Alert.alert(lang === 'ja' ? '音声入力エラー' : 'Voice input error', msg);
    }
  }, [recording, transcribing, sending, lang]);

  const handleChoiceTap = (prompt: string) => {
    if (sending) return;
    sendMessage(prompt);
  };

  const handleNavTap = (route: string) => {
    // The redirect_to_goal_coach tool uses this to send the user to /goal-coach.
    // Cast to any because the route is dynamic and not in expo-router's typed routes.
    router.push(route as any);
  };

  const suggestions = lang === 'ja' ? SUGGESTIONS_JA : SUGGESTIONS_EN;

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#FAFBFF', '#F4F6FB']}
        style={StyleSheet.absoluteFillObject}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
      />

      <SafeAreaView style={styles.flex} edges={['top']}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <LinearGradient
              colors={['#6366F1', '#8B5CF6']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.headerIcon}
            >
              <Sparkles size={14} color="#fff" strokeWidth={2.4} />
            </LinearGradient>
            <View>
              <Text style={styles.headerTitle}>
                {lang === 'ja' ? 'AIアシスタント' : 'AI Assistant'}
              </Text>
              <Text style={styles.headerSubtitle}>
                {lang === 'ja' ? 'Powered by Claude' : 'Powered by Claude'}
              </Text>
            </View>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity
              onPress={() => setHistoryVisible(true)}
              style={styles.headerBtn}
              activeOpacity={0.7}
            >
              <MessageSquare size={17} color="#475569" />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleClearHistory}
              style={[styles.headerBtn, messages.length === 0 && styles.headerBtnDisabled]}
              disabled={messages.length === 0}
              activeOpacity={0.7}
            >
              <RotateCcw size={17} color={messages.length === 0 ? '#CBD5E1' : '#475569'} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.statusBar}>
          <TokenBalanceBadge
            balanceYen={balanceYen}
            accessReason={accessReason}
            expiresAt={accessExpiresAt}
            planMaxTokens={planMaxTokens}
          />
        </View>

        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
        >
          {messages.length === 0 ? (
            <ScrollView contentContainerStyle={styles.emptyScroll}>
              <View style={styles.empty}>
                <LinearGradient
                  colors={['#EEF2FF', '#FAE8FF']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.emptyIconBg}
                >
                  <Sparkles size={36} color="#8B5CF6" strokeWidth={2} />
                </LinearGradient>
                <Text style={styles.emptyTitle}>
                  {lang === 'ja' ? '何かお手伝いしましょうか？' : 'How can I help you today?'}
                </Text>
                <Text style={styles.emptySub}>
                  {lang === 'ja'
                    ? 'タスク・スケジュール・ルーティンを\n話しかけるだけで操作できます'
                    : 'Manage tasks, schedules, and routines\njust by talking.'}
                </Text>

                <View style={styles.suggestionsWrap}>
                  {suggestions.map((s) => (
                    <TouchableOpacity
                      key={s}
                      style={styles.suggestionChip}
                      onPress={() => sendMessage(s)}
                      activeOpacity={0.7}
                    >
                      <Sparkles size={12} color="#8B5CF6" strokeWidth={2.2} />
                      <Text style={styles.suggestionText}>{s}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </ScrollView>
          ) : (
            <FlatList
              ref={flatListRef}
              data={messages}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => {
                if (item.kind === 'tool_card') {
                  return (
                    <ToolResultCard
                      toolName={item.toolName!}
                      ok={item.toolOk!}
                      data={item.toolData}
                      error={item.toolError}
                      onChoiceTap={handleChoiceTap}
                      onNavTap={handleNavTap}
                      choicesDisabled={item.choicesDisabled}
                    />
                  );
                }
                return (
                  <ChatBubble
                    role={item.kind === 'user' ? 'user' : 'assistant'}
                    text={item.text || ''}
                    isStreaming={item.isStreaming}
                  />
                );
              }}
              contentContainerStyle={styles.list}
              onContentSizeChange={scrollToBottom}
              showsVerticalScrollIndicator={false}
            />
          )}

          {/* Input — テキスト入力 + 音声入力 (Speech-to-Text)。
              音声は lib/voiceInput.ts (expo-av + transcribe-audio Edge Function)
              を使う。録音中は Mic アイコンが停止アイコン (赤背景) に変わり、
              再タップで停止 → 文字起こし結果を input に追記する。 */}
          <View style={styles.inputBarWrap}>
            <View style={[styles.inputBar, inputFocused && styles.inputBarFocused]}>
              <TextInput
                style={styles.input}
                value={input}
                onChangeText={setInput}
                placeholder={
                  lang === 'ja' ? 'メッセージを入力…' : 'Send a message…'
                }
                placeholderTextColor="#94A3B8"
                multiline
                maxLength={2000}
                editable={!sending}
                onFocus={() => setInputFocused(true)}
                onBlur={() => setInputFocused(false)}
                onSubmitEditing={handleSend}
                returnKeyType="send"
                blurOnSubmit
              />

              {/* 音声入力ボタン: 入力欄が空 (or 短い) ときに最も活躍するので
                  send ボタンの左隣に置く。録音中は赤背景、文字起こし中はスピナー。 */}
              <TouchableOpacity
                style={[
                  styles.micBtn,
                  recording && styles.micBtnActive,
                  transcribing && styles.micBtnTranscribing,
                ]}
                onPress={handleMicPress}
                disabled={sending}
                activeOpacity={0.75}
                accessibilityLabel={
                  recording
                    ? lang === 'ja' ? '録音を停止' : 'Stop recording'
                    : lang === 'ja' ? '音声で入力' : 'Voice input'
                }
              >
                {transcribing ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : recording ? (
                  <StopIcon size={16} color="#fff" strokeWidth={2.5} fill="#fff" />
                ) : (
                  <Mic size={18} color="#475569" strokeWidth={2.2} />
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.sendBtn, (!input.trim() || sending) && styles.sendBtnDisabled]}
                onPress={handleSend}
                disabled={!input.trim() || sending}
                activeOpacity={0.8}
              >
                {sending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <LinearGradient
                    colors={
                      !input.trim()
                        ? ['#CBD5E1', '#CBD5E1']
                        : ['#6366F1', '#8B5CF6']
                    }
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.sendBtnInner}
                  >
                    <Send size={16} color="#fff" strokeWidth={2.2} />
                  </LinearGradient>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>

      <ConversationList
        visible={historyVisible}
        activeConversationId={conversationIdRef.current}
        onClose={() => setHistoryVisible(false)}
        onSelectConversation={handleSelectConversation}
        onNewChat={handleNewChat}
      />

      {/*
        Apple ガイドライン 5.1.1(i) / 5.1.2(i) 対応の同意モーダル。
        初回 AI 利用時に表示。同意後は pendingMessageRef に保持しておいたテキストを再送信。
        同意しないを選んだ場合は workspace に戻す (= AI 機能を放棄させる)。
      */}
      <AIConsentModal
        visible={aiConsentVisible}
        onConsent={() => {
          setAiConsentVisible(false);
          const pending = pendingMessageRef.current;
          pendingMessageRef.current = null;
          if (pending) {
            // 同意取得直後に再送信。ここでは consent チェックを既にパスしてるので
            // sendMessage の再呼び出しで素直に送信される。
            void sendMessage(pending);
          }
        }}
        onDecline={() => {
          setAiConsentVisible(false);
          pendingMessageRef.current = null;
          // AI 利用を断った → workspace に戻す (= 課金壁と同じパターン)
          router.replace('/(tabs)/workspace');
        }}
      />

      {loadingConversation && (
        <View style={styles.loadingOverlay} pointerEvents="auto">
          <ActivityIndicator size="large" color="#6366F1" />
        </View>
      )}
    </View>
  );
}

const headerShadow = Platform.select({
  ios: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
  },
  android: { elevation: 1 },
  default: {},
});

const inputShadow = Platform.select({
  ios: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
  },
  android: { elevation: 3 },
  default: {},
});

const sendBtnShadow = Platform.select({
  ios: {
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
  },
  android: { elevation: 3 },
  default: {},
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 6,
    paddingBottom: 10,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerActions: { flexDirection: 'row', gap: 8 },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    ...headerShadow,
  },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#0F172A', letterSpacing: 0.1 },
  headerSubtitle: { fontSize: 11, color: '#94A3B8', marginTop: 1, fontWeight: '500' },
  headerBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  headerBtnDisabled: { backgroundColor: '#F8FAFC' },

  statusBar: {
    paddingHorizontal: 18,
    paddingBottom: 10,
  },

  // Empty state
  emptyScroll: { flexGrow: 1 },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingVertical: 40,
  },
  emptyIconBg: {
    width: 80,
    height: 80,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0F172A',
    textAlign: 'center',
    letterSpacing: 0.1,
  },
  emptySub: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 10,
    lineHeight: 21,
  },
  suggestionsWrap: {
    width: '100%',
    marginTop: 32,
    gap: 10,
  },
  suggestionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#fff',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  suggestionText: { fontSize: 13.5, color: '#334155', fontWeight: '500', flex: 1 },

  // List
  list: { paddingTop: 10, paddingBottom: 20 },

  // Input
  inputBarWrap: {
    paddingHorizontal: 12,
    paddingTop: 4,
    paddingBottom: Platform.OS === 'ios' ? 8 : 12,
  },
  voiceModeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingBottom: 4,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 6,
    paddingVertical: 6,
    backgroundColor: '#fff',
    borderRadius: 26,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 6,
    ...inputShadow,
  },
  inputBarFocused: {
    borderColor: '#C7D2FE',
  },
  input: {
    flex: 1,
    minHeight: 38,
    maxHeight: 120,
    paddingHorizontal: 8,
    paddingTop: 9,
    paddingBottom: 9,
    fontSize: 15,
    color: '#0F172A',
    fontWeight: '500',
  },
  sendBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    ...sendBtnShadow,
  },
  sendBtnInner: {
    width: '100%',
    height: '100%',
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { shadowOpacity: 0, elevation: 0 },
  micBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  micBtnActive: { backgroundColor: '#DC2626' },
  micBtnTranscribing: { backgroundColor: '#7C3AED' },

  // Recording bar
  recordingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 14,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#FEF2F2',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#FECACA',
    gap: 10,
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#DC2626',
  },
  recordingText: { fontSize: 13, color: '#7F1D1D', flex: 1, fontWeight: '500' },
  recordingCancel: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  recordingCancelText: { fontSize: 12, color: '#B91C1C', fontWeight: '700' },
});
