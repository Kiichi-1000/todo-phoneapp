// Dedicated Goal-Coach AI page.
//
// Distinct from /ai (the general assistant):
//   - Singleton conversation per user (mode='goal_coach' in DB)
//   - On open, the FULL message history is loaded and displayed
//   - Each send to the server only carries the new user text — the server
//     reconstructs the full history from the DB and feeds it to Claude with
//     prompt caching for cost efficiency
//   - No history-list UI (one continuous coaching session)
//   - Branding distinct (purple gradient, "Goal Coach" label)

import { useCallback, useEffect, useRef, useState } from 'react';
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
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Send, Target, ArrowLeft, RotateCcw, Mic, Square as StopIcon } from 'lucide-react-native';
import * as voiceInput from '@/lib/voiceInput';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { sendCoach } from '@/lib/goalCoachClient';
import { checkAiAccess } from '@/lib/aiAccess';
import ChatBubble from '@/components/ai/ChatBubble';
import ToolResultCard from '@/components/ai/ToolResultCard';
import TokenBalanceBadge from '@/components/ai/TokenBalanceBadge';
import { track } from '@/lib/posthog';

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
  '今月の目標を一緒に決めたい',
  '中長期で何を目指すか整理したい',
  '半期目標の進捗を振り返りたい',
  '前回立てた目標を見直したい',
];

const SUGGESTIONS_EN = [
  "Let's set this month's goal together",
  'Help me clarify my long-term direction',
  'Reflect on my half-year goal progress',
  'Revisit the goals I set last time',
];

const STR = {
  ja: {
    title: '目標設定AI',
    subtitle: 'あなた専用のコーチ',
    resetTitle: 'コーチング履歴をリセット',
    resetBody: '目標設定AIとの過去の会話をすべて削除します。AIは新しい状態からスタートします。よろしいですか？',
    cancel: 'キャンセル',
    delete: '削除',
    emptyTitle: '目標について話しましょう',
    emptySub: 'このAIは過去の会話をすべて覚えています。\nあなたの価値観や状況を踏まえた\nパーソナライズドなコーチングを行います。',
    placeholder: '目標について話してみる…',
    errSubscription: '試運転期間が終了しています。プランを選んでください。',
    errBalance: '今月のトークンを使い切りました。',
    errGeneric: 'エラーが発生しました',
    micA11yStart: '音声で入力',
    micA11yStop: '録音を停止',
    voiceErrTitle: '音声入力エラー',
    voicePermDenied: 'マイクへのアクセスが許可されていません。設定アプリで許可してください。',
    voicePermStart: 'マイクへのアクセスを許可してください。',
    voiceErrTranscribe: '音声認識に失敗しました。',
    voiceErrStart: '録音を開始できませんでした。',
    voiceLimitTitle: '録音時間の上限に到達',
    voiceLimitBody: '録音音声が長すぎます。55秒以内にしてください。\n録音されていた分は文字起こししました。',
  },
  en: {
    title: 'Goal Coach AI',
    subtitle: 'Your personal coach',
    resetTitle: 'Reset coaching history',
    resetBody: 'This will delete all past conversations with the Goal Coach. It will start from scratch. Continue?',
    cancel: 'Cancel',
    delete: 'Delete',
    emptyTitle: "Let's talk about your goals",
    emptySub: 'This AI remembers every past conversation.\nIt coaches you in a way that fits your values\nand the realities of your life.',
    placeholder: 'Tell the coach about your goals…',
    errSubscription: 'Your trial has ended. Please choose a plan.',
    errBalance: "You've used up this month's tokens.",
    errGeneric: 'An error occurred',
    micA11yStart: 'Voice input',
    micA11yStop: 'Stop recording',
    voiceErrTitle: 'Voice input error',
    voicePermDenied: 'Microphone access is denied. Please grant permission in Settings.',
    voicePermStart: 'Please grant microphone access.',
    voiceErrTranscribe: 'Could not transcribe audio.',
    voiceErrStart: 'Could not start recording.',
    voiceLimitTitle: 'Recording limit reached',
    voiceLimitBody: 'Recording was too long. Please keep it under 55 seconds.\nWhat was recorded has been transcribed.',
  },
};

export default function GoalCoachScreen() {
  const router = useRouter();
  // `prefill` lets external callers (e.g. the goal detail modal's "AIに相談"
  // button) drop a starter message into the input field. We don't auto-send —
  // the user can edit before tapping the send button.
  const params = useLocalSearchParams<{ prefill?: string }>();
  const { user } = useAuth();
  const { lang } = useLanguage();
  const s = lang === 'en' ? STR.en : STR.ja;
  const suggestions = lang === 'en' ? SUGGESTIONS_EN : SUGGESTIONS_JA;
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  // 音声入力 (Speech-to-Text) state — ai.tsx と同じパターン
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [balanceYen, setBalanceYen] = useState<number | null>(null);
  // バッジで「プラン上限に対する%」を出すために必要。standard=4000、pro=7000。
  // ai-chat と同じ式: yen × 10 = AIトークン量。
  const [planMaxTokens, setPlanMaxTokens] = useState<number | null>(null);
  // Must include every variant of lib/aiAccess.ts#AccessReason, otherwise
  // setAccessReason(access.reason) rejects the basic_plan_no_ai case.
  const [accessReason, setAccessReason] = useState<
    'active_subscription' | 'promo' | 'release_promo' | 'basic_plan_no_ai' | 'none' | null
  >(null);
  const [accessExpiresAt, setAccessExpiresAt] = useState<string | null>(null);
  const flatListRef = useRef<FlatList>(null);

  const toolNameByIdRef = useRef<Record<string, string>>({});
  // 55秒の自動停止に到達したかどうかのフラグ (handleMicPress 内で参照)
  const autoStoppedRef = useRef(false);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 50);
  }, []);

  // AI access gate: Goal Coach は AI 機能なので、契約プランが AI Standard 以上
  // でないと画面に居続けられない。Basic プラン契約者 / 未契約者がこの画面に到達した
  // 場合、自動的に /paywall に遷移して「AI Standard 以上で利用可能」を促す。
  // チェックは画面マウント時に 1 回。Standard/Pro なら何もせず通過。
  //
  // 加えて (2026-05-16 追加):
  //   開いた瞬間に AIトークン残量バッジ (ドーナツ) を表示するため、access チェックと
  //   同じタイミングで ai_token_balances と user_subscriptions.plan を取得し、
  //   バッジ用の state を初期化する。これがないと SSE で 1 ターン返ってくるまで
  //   バッジが空のまま、という UX バグが残る。
  //
  //   注意: ai-chat と goal-coach は同じ ai_token_balances テーブル (= 同一 user_id)
  //   を共有しているので、ここで取得した残高は AI エージェント側と完全に一致する。
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    track('ai_coach_open').catch(() => {});
    (async () => {
      const access = await checkAiAccess(user.id);
      if (cancelled) return;
      if (!access.allowed) {
        // basic_plan_no_ai / none いずれの理由でも paywall に飛ばす。
        // goal-coach 画面はそのまま残るが、Apple 画面遷移で前面に paywall が乗る。
        router.replace('/paywall');
        return;
      }
      // access OK → バッジ初期表示用に残高とプランを取得。
      setAccessReason(access.reason);
      setAccessExpiresAt(access.expiresAt);
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
        if (cancelled) return;
        if (bal) {
          setBalanceYen(
            (Number(bal.current_grant_yen) || 0) + (Number(bal.carryover_yen) || 0),
          );
        }
        const planKey = (sub?.plan as string | null) ?? null;
        if (planKey === 'standard') setPlanMaxTokens(4000);
        else if (planKey === 'pro') setPlanMaxTokens(7000);
        else setPlanMaxTokens(null);
      } catch {
        // 失敗は無視 (SSE 経由で後から更新される)
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, router]);

  // Load full history on mount
  useEffect(() => {
    const loadHistory = async () => {
      if (!user) return;
      try {
        const { data: convData } = await supabase
          .from('ai_conversations')
          .select('id')
          .eq('user_id', user.id)
          .eq('mode', 'goal_coach')
          .maybeSingle();

        if (!convData?.id) {
          setLoadingHistory(false);
          return;
        }

        const { data: msgRows } = await supabase
          .from('ai_messages')
          .select('id, role, text, created_at')
          .eq('conversation_id', convData.id)
          .order('created_at', { ascending: true });

        const ui: UIMessage[] = (msgRows ?? []).map((m: any) => ({
          id: `m-${m.id}`,
          kind: m.role === 'user' ? 'user' : 'assistant_text',
          text: m.text,
        }));
        setMessages(ui);
        scrollToBottom();
      } finally {
        setLoadingHistory(false);
      }
    };
    loadHistory();
  }, [user, scrollToBottom]);

  // Apply prefill prompt (passed from external callers like the goal detail
  // modal). Runs once when params.prefill becomes available.
  useEffect(() => {
    if (params.prefill && typeof params.prefill === 'string') {
      setInput(params.prefill);
    }
  }, [params.prefill]);

  const handleResetCoach = () => {
    if (messages.length === 0) return;
    Alert.alert(
      s.resetTitle,
      s.resetBody,
      [
        { text: s.cancel, style: 'cancel' },
        {
          text: s.delete,
          style: 'destructive',
          onPress: async () => {
            if (!user) return;
            await supabase
              .from('ai_conversations')
              .delete()
              .eq('user_id', user.id)
              .eq('mode', 'goal_coach');
            setMessages([]);
            toolNameByIdRef.current = {};
          },
        },
      ],
    );
  };

  const sendMessage = useCallback(async (text: string) => {
    if (!text || sending || !user) return;

    setSending(true);
    setInput('');
    toolNameByIdRef.current = {};
    // Analytics: count *that* a message was sent — NEVER the message body.
    track('ai_coach_message_sent', { text_length: text.length }).catch(() => {});

    const userMsgId = 'u-' + Date.now();
    const assistantMsgId = 'a-' + Date.now();

    setMessages((prev) => [
      ...prev.map((m) => (m.kind === 'tool_card' ? { ...m, choicesDisabled: true } : m)),
      { id: userMsgId, kind: 'user', text },
      { id: assistantMsgId, kind: 'assistant_text', text: '', isStreaming: true },
    ]);
    scrollToBottom();

    let assistantBuf = '';

    try {
      await sendCoach({
        userText: text,
        onEvent: (event) => {
          if (event.type === 'session.start') {
            setBalanceYen(event.data.balance_yen);
            setAccessReason(event.data.access_reason as any);
            setAccessExpiresAt(event.data.access_expires_at);
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
        ? s.errSubscription
        : e?.code === 'insufficient_balance'
        ? s.errBalance
        : e?.message || s.errGeneric;
      assistantBuf = `⚠️ ${message}`;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId ? { ...m, text: assistantBuf, isStreaming: false } : m,
        ),
      );
      if (e?.code === 'subscription_required' || e?.code === 'insufficient_balance') {
        setTimeout(() => router.push('/paywall'), 800);
      }
    } finally {
      setMessages((prev) =>
        prev.map((m) => (m.id === assistantMsgId ? { ...m, isStreaming: false } : m)),
      );
      setSending(false);
      scrollToBottom();
    }
  }, [sending, user, router, scrollToBottom, s]);

  const handleSend = () => {
    const text = input.trim();
    if (!text) return;
    sendMessage(text);
  };

  // 音声入力 (Speech-to-Text) — ai.tsx と同じパターン
  // - 1 タップで録音開始 / 再タップで停止+文字起こし
  // - 55 秒経過で自動停止 → 文字起こし完了後に「上限到達」アラート
  // - 'raw' モード: Google STT v2 の生テキストをそのまま input に追記
  const handleMicPress = useCallback(async () => {
    if (sending || transcribing) return;

    if (recording) {
      const wasAutoStopped = autoStoppedRef.current;
      autoStoppedRef.current = false;
      setRecording(false);
      setTranscribing(true);
      try {
        const result = await voiceInput.stopAndTranscribe(
          (lang === 'en' ? 'en' : 'ja') as 'ja' | 'en',
          'raw',
        );
        const newText = (result.text || '').trim();
        if (newText) {
          setInput((prev) => (prev ? `${prev} ${newText}` : newText));
        }
        if (wasAutoStopped) {
          Alert.alert(s.voiceLimitTitle, s.voiceLimitBody);
        }
      } catch (e: any) {
        const msg =
          e?.message === 'mic_permission_denied'
            ? s.voicePermDenied
            : e?.message || s.voiceErrTranscribe;
        Alert.alert(s.voiceErrTitle, msg);
      } finally {
        setTranscribing(false);
      }
      return;
    }

    try {
      autoStoppedRef.current = false;
      await voiceInput.startRecording({
        onAutoStop: () => {
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
          ? s.voicePermStart
          : e?.message || s.voiceErrStart;
      Alert.alert(s.voiceErrTitle, msg);
    }
  }, [recording, transcribing, sending, lang, s]);

  const handleChoiceTap = (prompt: string) => {
    if (sending) return;
    sendMessage(prompt);
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#FAF5FF', '#F0F0FF']}
        style={StyleSheet.absoluteFillObject}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
      />

      <SafeAreaView style={styles.flex} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => router.back()}
            activeOpacity={0.7}
          >
            <ArrowLeft size={20} color="#475569" />
          </TouchableOpacity>

          <View style={styles.headerCenter}>
            <LinearGradient
              colors={['#8B5CF6', '#A78BFA']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.headerIcon}
            >
              <Target size={14} color="#fff" strokeWidth={2.4} />
            </LinearGradient>
            <View>
              <Text style={styles.headerTitle}>{s.title}</Text>
              <Text style={styles.headerSubtitle}>{s.subtitle}</Text>
            </View>
          </View>

          <TouchableOpacity
            onPress={handleResetCoach}
            style={[styles.headerBtn, messages.length === 0 && styles.headerBtnDisabled]}
            disabled={messages.length === 0}
            activeOpacity={0.7}
          >
            <RotateCcw size={17} color={messages.length === 0 ? '#CBD5E1' : '#475569'} />
          </TouchableOpacity>
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
          {loadingHistory ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator color="#8B5CF6" />
            </View>
          ) : messages.length === 0 ? (
            <ScrollView contentContainerStyle={styles.emptyScroll}>
              <View style={styles.empty}>
                <LinearGradient
                  colors={['#F3F0FF', '#FAE8FF']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.emptyIconBg}
                >
                  <Target size={36} color="#8B5CF6" strokeWidth={2} />
                </LinearGradient>
                <Text style={styles.emptyTitle}>{s.emptyTitle}</Text>
                <Text style={styles.emptySub}>{s.emptySub}</Text>
                <View style={styles.suggestionsWrap}>
                  {suggestions.map((sugg) => (
                    <TouchableOpacity
                      key={sugg}
                      style={styles.suggestionChip}
                      onPress={() => sendMessage(sugg)}
                      activeOpacity={0.7}
                    >
                      <Target size={12} color="#8B5CF6" strokeWidth={2.2} />
                      <Text style={styles.suggestionText}>{sugg}</Text>
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

          {/* Input — テキスト + 音声 (Speech-to-Text)。Mic ボタンは送信ボタンの左隣。
              録音中は赤背景＋停止アイコン、文字起こし中はスピナー。 */}
          <View style={styles.inputBarWrap}>
            <View style={[styles.inputBar, inputFocused && styles.inputBarFocused]}>
              <TextInput
                style={styles.input}
                value={input}
                onChangeText={setInput}
                placeholder={s.placeholder}
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

              <TouchableOpacity
                style={[
                  styles.micBtn,
                  recording && styles.micBtnActive,
                  transcribing && styles.micBtnTranscribing,
                ]}
                onPress={handleMicPress}
                disabled={sending}
                activeOpacity={0.75}
                accessibilityLabel={recording ? s.micA11yStop : s.micA11yStart}
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
                    colors={!input.trim() ? ['#CBD5E1', '#CBD5E1'] : ['#8B5CF6', '#A78BFA']}
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
    </View>
  );
}

const headerShadow = Platform.select({
  ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4 },
  android: { elevation: 1 },
  default: {},
});
const inputShadow = Platform.select({
  ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 12 },
  android: { elevation: 3 },
  default: {},
});
const sendBtnShadow = Platform.select({
  ios: { shadowColor: '#8B5CF6', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.25, shadowRadius: 6 },
  android: { elevation: 3 },
  default: {},
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 6,
    paddingBottom: 10,
    gap: 10,
  },
  backBtn: {
    width: 34, height: 34, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#E2E8F0',
  },
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerIcon: {
    width: 32, height: 32, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    ...headerShadow,
  },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#0F172A', letterSpacing: 0.1 },
  headerSubtitle: { fontSize: 11, color: '#94A3B8', marginTop: 1, fontWeight: '500' },
  headerBtn: {
    width: 34, height: 34, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#E2E8F0',
  },
  headerBtnDisabled: { backgroundColor: '#F8FAFC' },
  statusBar: { paddingHorizontal: 18, paddingBottom: 10 },

  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  emptyScroll: { flexGrow: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, paddingVertical: 40 },
  emptyIconBg: {
    width: 80, height: 80, borderRadius: 24,
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: '#0F172A', textAlign: 'center', letterSpacing: 0.1 },
  emptySub: { fontSize: 13.5, color: '#64748B', textAlign: 'center', marginTop: 12, lineHeight: 21 },
  suggestionsWrap: { width: '100%', marginTop: 28, gap: 10 },
  suggestionChip: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#fff', paddingHorizontal: 14, paddingVertical: 12,
    borderRadius: 14, borderWidth: 1, borderColor: '#E2E8F0',
  },
  suggestionText: { fontSize: 13.5, color: '#334155', fontWeight: '500', flex: 1 },

  list: { paddingTop: 10, paddingBottom: 20 },

  inputBarWrap: {
    paddingHorizontal: 12,
    paddingTop: 4,
    paddingBottom: Platform.OS === 'ios' ? 8 : 12,
  },
  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end',
    paddingHorizontal: 6, paddingVertical: 6,
    backgroundColor: '#fff', borderRadius: 26,
    borderWidth: 1, borderColor: '#E2E8F0', gap: 6,
    ...inputShadow,
  },
  inputBarFocused: { borderColor: '#C4B5FD' },
  input: {
    flex: 1, minHeight: 38, maxHeight: 120,
    paddingHorizontal: 8, paddingTop: 9, paddingBottom: 9,
    fontSize: 15, color: '#0F172A', fontWeight: '500',
  },
  sendBtn: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden', ...sendBtnShadow,
  },
  sendBtnInner: {
    width: '100%', height: '100%', borderRadius: 19,
    alignItems: 'center', justifyContent: 'center',
  },
  sendBtnDisabled: { shadowOpacity: 0, elevation: 0 },
  micBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: '#F1F5F9',
    alignItems: 'center', justifyContent: 'center',
  },
  micBtnActive: { backgroundColor: '#DC2626' },
  micBtnTranscribing: { backgroundColor: '#7C3AED' },
});
