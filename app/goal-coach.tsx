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
import { Send, Target, ArrowLeft, RotateCcw } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { sendCoach } from '@/lib/goalCoachClient';
import { checkAiAccess } from '@/lib/aiAccess';
import ChatBubble from '@/components/ai/ChatBubble';
import ToolResultCard from '@/components/ai/ToolResultCard';
import TokenBalanceBadge from '@/components/ai/TokenBalanceBadge';

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

const SUGGESTIONS = [
  '今月の目標を一緒に決めたい',
  '中長期で何を目指すか整理したい',
  '半期目標の進捗を振り返りたい',
  '前回立てた目標を見直したい',
];

export default function GoalCoachScreen() {
  const router = useRouter();
  // `prefill` lets external callers (e.g. the goal detail modal's "AIに相談"
  // button) drop a starter message into the input field. We don't auto-send —
  // the user can edit before tapping the send button.
  const params = useLocalSearchParams<{ prefill?: string }>();
  const { user } = useAuth();
  const { lang } = useLanguage();
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [balanceYen, setBalanceYen] = useState<number | null>(null);
  const [accessReason, setAccessReason] = useState<
    'active_subscription' | 'promo' | 'release_promo' | 'none' | null
  >(null);
  const [accessExpiresAt, setAccessExpiresAt] = useState<string | null>(null);
  const flatListRef = useRef<FlatList>(null);

  const toolNameByIdRef = useRef<Record<string, string>>({});

  const scrollToBottom = useCallback(() => {
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 50);
  }, []);

  // AI access gate: Goal Coach は AI 機能なので、契約プランが AI Standard 以上
  // でないと画面に居続けられない。Basic プラン契約者 / 未契約者がこの画面に到達した
  // 場合、自動的に /paywall に遷移して「AI Standard 以上で利用可能」を促す。
  // チェックは画面マウント時に 1 回。Standard/Pro なら何もせず通過。
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const access = await checkAiAccess(user.id);
      if (cancelled) return;
      if (!access.allowed) {
        // basic_plan_no_ai / none いずれの理由でも paywall に飛ばす。
        // goal-coach 画面はそのまま残るが、Apple 画面遷移で前面に paywall が乗る。
        router.replace('/paywall');
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

  // Voice input is intentionally NOT exposed here. The Goal-Coach is meant to
  // be a slow, reflective text dialogue. For quick voice capture, the workspace
  // has a dedicated Voice-Task tool that bypasses the AI agent entirely.

  const handleResetCoach = () => {
    if (messages.length === 0) return;
    Alert.alert(
      'コーチング履歴をリセット',
      '目標設定AIとの過去の会話をすべて削除します。AIは新しい状態からスタートします。よろしいですか？',
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '削除',
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
        ? '試運転期間が終了しています。プランを選んでください。'
        : e?.code === 'insufficient_balance'
        ? '今月のトークンを使い切りました。'
        : e?.message || 'エラーが発生しました';
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
  }, [sending, user, router, scrollToBottom]);

  const handleSend = () => {
    const text = input.trim();
    if (!text) return;
    sendMessage(text);
  };

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
              <Text style={styles.headerTitle}>目標設定AI</Text>
              <Text style={styles.headerSubtitle}>あなた専用のコーチ</Text>
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
                <Text style={styles.emptyTitle}>目標について話しましょう</Text>
                <Text style={styles.emptySub}>
                  このAIは過去の会話をすべて覚えています。{'\n'}
                  あなたの価値観や状況を踏まえた{'\n'}
                  パーソナライズドなコーチングを行います。
                </Text>
                <View style={styles.suggestionsWrap}>
                  {SUGGESTIONS.map((s) => (
                    <TouchableOpacity
                      key={s}
                      style={styles.suggestionChip}
                      onPress={() => sendMessage(s)}
                      activeOpacity={0.7}
                    >
                      <Target size={12} color="#8B5CF6" strokeWidth={2.2} />
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

          {/* Goal-coach is text-only by design. Voice dictation lives in the
              workspace where it directly inserts todos without invoking AI. */}
          <View style={styles.inputBarWrap}>
            <View style={[styles.inputBar, inputFocused && styles.inputBarFocused]}>
              <TextInput
                style={styles.input}
                value={input}
                onChangeText={setInput}
                placeholder="目標について話してみる…"
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
  voiceModeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingBottom: 4,
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

  recordingBar: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 14, marginBottom: 8,
    paddingHorizontal: 14, paddingVertical: 10,
    backgroundColor: '#FEF2F2', borderRadius: 14,
    borderWidth: 1, borderColor: '#FECACA', gap: 10,
  },
  recordingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#DC2626' },
  recordingText: { fontSize: 13, color: '#7F1D1D', flex: 1, fontWeight: '500' },
  recordingCancel: {
    paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8,
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#FCA5A5',
  },
  recordingCancelText: { fontSize: 12, color: '#B91C1C', fontWeight: '700' },
});
