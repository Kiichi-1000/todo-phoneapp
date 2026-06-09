// 課題（期限）一覧 — 期限つき todo を「締め切りが近い順」に一元表示する。
//
// なぜ必要か:
//   期限つきの課題をカレンダー（スケジュール）に入れると予定と混在して
//   分かりづらい。本画面は全ワークスペース横断で「未完了かつ due_date あり」の
//   todo だけを集め、締め切りまでの残り日数でグルーピングして表示する。
//   予定（schedules）とは完全に分離した「やることリスト（締切順）」。
//
// v2 (2026-06-09):
//   + 課題追加（プラスボタン → モーダル）
//   + 授業名(course_name) 表示
//   + リピート課題（repeat_rule='weekly' → 完了時に翌週自動生成）
//   + 「今日やる」→ 今日のワークスペースに送る
//
// ToScheAI / MCP 連携:
//   ここに出るデータ (= todos.due_date) は ai-chat / MCP の list_tasks /
//   create_task からも読み書きできる。スケジュール分配は端末内 AI 専用。

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Modal,
  TextInput,
  Alert,
  Switch,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import {
  ArrowLeft,
  Check,
  ChevronRight,
  CalendarClock,
  CircleAlert,
  Plus,
  X,
  Calendar,
  BookOpen,
  Repeat,
  Play,
  Bell,
} from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import {
  scheduleDeadlineNotifications,
  cancelDeadlineNotification,
  OFFSET_PRESETS,
  type OffsetKey,
} from '@/lib/deadlineNotifications';

interface DeadlineTodo {
  id: string;
  content: string;
  due_date: string; // YYYY-MM-DD
  workspace_id: string;
  course_name: string | null;
  repeat_rule: 'weekly' | null;
  notification_offsets: string | null;
  workspaces?: { title: string | null; date: string | null } | null;
}

// 端末ローカルの「今日」を YYYY-MM-DD で取得。
function todayLocalISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// due_date(YYYY-MM-DD) と今日との日数差（今日=0, 明日=1, 昨日=-1）。
function dayDiffFromToday(due: string): number {
  const [ty, tm, td] = todayLocalISO().split('-').map(Number);
  const [dy, dm, dd] = due.split('-').map(Number);
  const todayMs = new Date(ty, tm - 1, td).getTime();
  const dueMs = new Date(dy, dm - 1, dd).getTime();
  return Math.round((dueMs - todayMs) / 86400000);
}

// 日付を n 日後に進める（リピート課題用）
function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  const ny = date.getFullYear();
  const nm = String(date.getMonth() + 1).padStart(2, '0');
  const nd = String(date.getDate()).padStart(2, '0');
  return `${ny}-${nm}-${nd}`;
}

// YYYY-MM-DD バリデーション
function isValidDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

type BucketKey = 'overdue' | 'today' | 'tomorrow' | 'd3' | 'w1' | 'm1' | 'later';

const BUCKET_ORDER: BucketKey[] = ['overdue', 'today', 'tomorrow', 'd3', 'w1', 'm1', 'later'];

const BUCKET_META: Record<BucketKey, { label: string; accent: string; bg: string }> = {
  overdue: { label: '期限切れ', accent: '#dc2626', bg: '#fef2f2' },
  today: { label: '今日まで', accent: '#ea580c', bg: '#fff7ed' },
  tomorrow: { label: '明日まで', accent: '#d97706', bg: '#fffbeb' },
  d3: { label: '3日以内', accent: '#ca8a04', bg: '#fefce8' },
  w1: { label: '今週（7日以内）', accent: '#16a34a', bg: '#f0fdf4' },
  m1: { label: '今月（30日以内）', accent: '#0891b2', bg: '#ecfeff' },
  later: { label: 'それ以降', accent: '#64748b', bg: '#f8fafc' },
};

function bucketFor(diff: number): BucketKey {
  if (diff < 0) return 'overdue';
  if (diff === 0) return 'today';
  if (diff === 1) return 'tomorrow';
  if (diff <= 3) return 'd3';
  if (diff <= 7) return 'w1';
  if (diff <= 30) return 'm1';
  return 'later';
}

function dueLabel(due: string): string {
  const diff = dayDiffFromToday(due);
  const [, m, d] = due.split('-');
  const md = `${Number(m)}/${Number(d)}`;
  if (diff < 0) return `${md}（${Math.abs(diff)}日超過）`;
  if (diff === 0) return `${md}（今日）`;
  if (diff === 1) return `${md}（明日）`;
  return `${md}（あと${diff}日）`;
}

export default function DeadlinesScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [todos, setTodos] = useState<DeadlineTodo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // 追加モーダル state
  const [showAddModal, setShowAddModal] = useState(false);
  const [newContent, setNewContent] = useState('');
  const [newDueDate, setNewDueDate] = useState('');
  const [newCourseName, setNewCourseName] = useState('');
  const [newRepeatWeekly, setNewRepeatWeekly] = useState(false);
  const [newNotifOffsets, setNewNotifOffsets] = useState<Set<OffsetKey>>(new Set());
  const [adding, setAdding] = useState(false);

  const toggleOffset = useCallback((key: OffsetKey) => {
    setNewNotifOffsets((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const load = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('todos')
      .select('id, content, due_date, workspace_id, course_name, repeat_rule, notification_offsets, workspaces(title, date)')
      .eq('user_id', user.id)
      .eq('is_completed', false)
      .not('due_date', 'is', null)
      .order('due_date', { ascending: true });
    if (!error) {
      const loaded = (data ?? []) as unknown as DeadlineTodo[];
      setTodos(loaded);
      // 期限通知をスケジュール（朝8時＋夜20時）
      scheduleDeadlineNotifications(loaded).catch(() => {});
    }
    setLoading(false);
    setRefreshing(false);
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  // 完了処理（リピート課題は翌週分を自動生成）
  const complete = useCallback(async (todo: DeadlineTodo) => {
    setTodos((prev) => prev.filter((t) => t.id !== todo.id));
    // 完了した課題の通知をキャンセル
    cancelDeadlineNotification(todo.id).catch(() => {});

    await supabase
      .from('todos')
      .update({ is_completed: true, completed_at: new Date().toISOString() })
      .eq('id', todo.id);

    // リピート課題: 翌週に新しい課題を自動生成
    if (todo.repeat_rule === 'weekly' && user) {
      const nextDue = addDays(todo.due_date, 7);
      const { data: newTodo } = await supabase
        .from('todos')
        .insert({
          user_id: user.id,
          workspace_id: todo.workspace_id,
          content: todo.content,
          due_date: nextDue,
          course_name: todo.course_name,
          repeat_rule: 'weekly' as const,
          notification_offsets: todo.notification_offsets,
          is_completed: false,
        })
        .select('id, content, due_date, workspace_id, course_name, repeat_rule, notification_offsets, workspaces(title, date)')
        .single();
      if (newTodo) {
        setTodos((prev) => [...prev, newTodo as unknown as DeadlineTodo]
          .sort((a, b) => a.due_date.localeCompare(b.due_date)));
      }
    }
  }, [user]);

  // 「今日やる」→ 今日のワークスペースに新しいtodoを作成
  const sendToToday = useCallback(async (todo: DeadlineTodo) => {
    if (!user) return;
    const today = todayLocalISO();

    // 今日のワークスペースを検索（なければ作成）
    let { data: ws } = await supabase
      .from('workspaces')
      .select('id')
      .eq('user_id', user.id)
      .eq('date', today)
      .maybeSingle();

    if (!ws) {
      const { data: newWs, error: wsErr } = await supabase
        .from('workspaces')
        .insert({
          user_id: user.id,
          title: '',
          type: 'four_grid',
          date: today,
        })
        .select('id')
        .single();
      if (wsErr || !newWs) {
        Alert.alert('エラー', 'ワークスペースの作成に失敗しました');
        return;
      }
      ws = newWs;
    }

    // 今日のワークスペースにtodoを作成
    const label = todo.course_name ? `[${todo.course_name}] ${todo.content}` : todo.content;
    const { error } = await supabase
      .from('todos')
      .insert({
        user_id: user.id,
        workspace_id: ws.id,
        content: label,
        is_completed: false,
        due_date: today,
        grid_area: 'top_left',
        order: 0,
      });

    if (error) {
      Alert.alert('エラー', 'タスクの追加に失敗しました');
    } else {
      Alert.alert('追加しました', `「${todo.content}」を今日のワークスペースに送りました`);
    }
  }, [user]);

  // 課題追加
  const addTask = useCallback(async () => {
    if (!user) return;
    const content = newContent.trim();
    if (!content) {
      Alert.alert('入力エラー', '課題名を入力してください');
      return;
    }
    if (!newDueDate || !isValidDate(newDueDate)) {
      Alert.alert('入力エラー', '期限を YYYY-MM-DD 形式で入力してください');
      return;
    }

    setAdding(true);
    const today = todayLocalISO();

    // 課題はデフォルトで今日のワークスペースに紐づけ（期限管理の起点）
    let { data: ws } = await supabase
      .from('workspaces')
      .select('id')
      .eq('user_id', user.id)
      .eq('date', today)
      .maybeSingle();

    if (!ws) {
      const { data: newWs, error: wsErr } = await supabase
        .from('workspaces')
        .insert({
          user_id: user.id,
          title: '',
          type: 'four_grid',
          date: today,
        })
        .select('id')
        .single();
      if (wsErr || !newWs) {
        Alert.alert('エラー', 'ワークスペースの作成に失敗しました');
        setAdding(false);
        return;
      }
      ws = newWs;
    }

    const offsetsStr = newNotifOffsets.size > 0
      ? Array.from(newNotifOffsets).join(',')
      : null;

    const { error } = await supabase
      .from('todos')
      .insert({
        user_id: user.id,
        workspace_id: ws.id,
        content,
        due_date: newDueDate,
        course_name: newCourseName.trim() || null,
        repeat_rule: newRepeatWeekly ? 'weekly' : null,
        notification_offsets: offsetsStr,
        is_completed: false,
      });

    setAdding(false);
    if (error) {
      Alert.alert('エラー', `課題の追加に失敗しました: ${error.message}`);
    } else {
      setNewContent('');
      setNewDueDate('');
      setNewCourseName('');
      setNewRepeatWeekly(false);
      setNewNotifOffsets(new Set());
      setShowAddModal(false);
      load();
    }
  }, [user, newContent, newDueDate, newCourseName, newRepeatWeekly, newNotifOffsets, load]);

  // バケットごとにグルーピング
  const grouped = useMemo(() => {
    const map: Record<BucketKey, DeadlineTodo[]> = {
      overdue: [], today: [], tomorrow: [], d3: [], w1: [], m1: [], later: [],
    };
    for (const t of todos) {
      if (!t.due_date) continue;
      map[bucketFor(dayDiffFromToday(t.due_date))].push(t);
    }
    return map;
  }, [todos]);

  const total = todos.length;

  return (
    <SafeAreaView style={styles.container}>
      {/* ヘッダー */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBack}>
          <ArrowLeft size={22} color="#0f172a" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>課題（期限）</Text>
        <TouchableOpacity onPress={() => setShowAddModal(true)} style={styles.headerAdd}>
          <Plus size={22} color="#6366F1" />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6366F1" />}
      >
        <View style={styles.intro}>
          <CalendarClock size={18} color="#6366F1" />
          <Text style={styles.introText}>
            締め切りが近い順の課題一覧です。＋ボタンで課題を追加できます。
          </Text>
        </View>

        {loading ? (
          <ActivityIndicator style={{ paddingVertical: 40 }} color="#6366F1" />
        ) : total === 0 ? (
          <View style={styles.empty}>
            <CalendarClock size={28} color="#cbd5e1" />
            <Text style={styles.emptyText}>期限つきの課題はありません。</Text>
            <Text style={styles.emptySub}>右上の＋ボタンから課題を追加してみましょう。</Text>
            <TouchableOpacity style={styles.emptyAddBtn} onPress={() => setShowAddModal(true)}>
              <Plus size={16} color="#fff" />
              <Text style={styles.emptyAddBtnText}>課題を追加</Text>
            </TouchableOpacity>
          </View>
        ) : (
          BUCKET_ORDER.map((key) => {
            const items = grouped[key];
            if (items.length === 0) return null;
            const meta = BUCKET_META[key];
            return (
              <View key={key} style={styles.section}>
                <View style={styles.sectionHeader}>
                  <View style={[styles.sectionDot, { backgroundColor: meta.accent }]} />
                  <Text style={[styles.sectionTitle, { color: meta.accent }]}>{meta.label}</Text>
                  <Text style={styles.sectionCount}>{items.length}</Text>
                </View>
                {items.map((t) => (
                  <View key={t.id} style={[styles.row, { backgroundColor: meta.bg }]}>
                    {/* 完了チェック */}
                    <TouchableOpacity onPress={() => complete(t)} style={styles.checkbox} hitSlop={8}>
                      <Check size={15} color={meta.accent} />
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.rowBody}
                      onPress={() => router.push(`/workspace/${t.workspace_id}`)}
                    >
                      {/* 授業名バッジ */}
                      {t.course_name ? (
                        <View style={styles.courseBadge}>
                          <BookOpen size={10} color="#6366F1" />
                          <Text style={styles.courseBadgeText}>{t.course_name}</Text>
                          {t.repeat_rule === 'weekly' && (
                            <Repeat size={10} color="#6366F1" />
                          )}
                        </View>
                      ) : t.repeat_rule === 'weekly' ? (
                        <View style={styles.courseBadge}>
                          <Repeat size={10} color="#6366F1" />
                          <Text style={styles.courseBadgeText}>毎週</Text>
                        </View>
                      ) : null}

                      <Text style={styles.rowContent} numberOfLines={2}>
                        {t.content || '(無題の課題)'}
                      </Text>
                      <View style={styles.rowMeta}>
                        {key === 'overdue' && <CircleAlert size={12} color={meta.accent} />}
                        <Text style={[styles.rowDue, { color: meta.accent }]}>{dueLabel(t.due_date)}</Text>
                        {t.notification_offsets ? (
                          <Bell size={11} color="#6366F1" />
                        ) : null}
                        {t.workspaces?.title ? (
                          <Text style={styles.rowWs} numberOfLines={1}> ・ {t.workspaces.title}</Text>
                        ) : null}
                      </View>
                    </TouchableOpacity>

                    {/* 「今日やる」ボタン */}
                    <TouchableOpacity
                      onPress={() => sendToToday(t)}
                      style={styles.todayBtn}
                      hitSlop={6}
                    >
                      <Play size={12} color="#6366F1" fill="#6366F1" />
                    </TouchableOpacity>

                    <ChevronRight size={16} color="#94a3b8" />
                  </View>
                ))}
              </View>
            );
          })
        )}
        <View style={{ height: 32 }} />
      </ScrollView>

      {/* 課題追加モーダル */}
      <Modal
        visible={showAddModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowAddModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalCard}>
            {/* モーダルヘッダー */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>課題を追加</Text>
              <TouchableOpacity onPress={() => setShowAddModal(false)}>
                <X size={22} color="#64748b" />
              </TouchableOpacity>
            </View>

            {/* 課題名 */}
            <Text style={styles.modalLabel}>課題名 *</Text>
            <TextInput
              style={styles.modalInput}
              value={newContent}
              onChangeText={setNewContent}
              placeholder="例: 数学レポート第3回"
              placeholderTextColor="#94a3b8"
              autoFocus
            />

            {/* 期限 */}
            <Text style={styles.modalLabel}>期限 *</Text>
            <View style={styles.dateRow}>
              <Calendar size={18} color="#64748b" />
              <TextInput
                style={[styles.modalInput, { flex: 1, marginBottom: 0 }]}
                value={newDueDate}
                onChangeText={setNewDueDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#94a3b8"
                keyboardType="numbers-and-punctuation"
              />
            </View>

            {/* 授業名（任意） */}
            <Text style={styles.modalLabel}>授業名（任意）</Text>
            <View style={styles.dateRow}>
              <BookOpen size={18} color="#64748b" />
              <TextInput
                style={[styles.modalInput, { flex: 1, marginBottom: 0 }]}
                value={newCourseName}
                onChangeText={setNewCourseName}
                placeholder="例: 線形代数学"
                placeholderTextColor="#94a3b8"
              />
            </View>

            {/* 毎週繰り返し */}
            <View style={styles.repeatRow}>
              <Repeat size={18} color="#64748b" />
              <Text style={styles.repeatLabel}>毎週繰り返す</Text>
              <Switch
                value={newRepeatWeekly}
                onValueChange={setNewRepeatWeekly}
                trackColor={{ false: '#e2e8f0', true: '#c7d2fe' }}
                thumbColor={newRepeatWeekly ? '#6366F1' : '#f4f4f5'}
              />
            </View>
            {newRepeatWeekly && (
              <Text style={styles.repeatHint}>
                完了すると、翌週の同じ曜日に次の課題が自動で作られます。
              </Text>
            )}

            {/* 通知タイミング */}
            <Text style={styles.modalLabel}>通知タイミング（任意）</Text>
            <View style={styles.offsetRow}>
              <Bell size={18} color="#64748b" />
              <View style={styles.offsetChips}>
                {OFFSET_PRESETS.map((p) => {
                  const selected = newNotifOffsets.has(p.key);
                  return (
                    <TouchableOpacity
                      key={p.key}
                      style={[styles.offsetChip, selected && styles.offsetChipSelected]}
                      onPress={() => toggleOffset(p.key)}
                    >
                      <Text style={[styles.offsetChipText, selected && styles.offsetChipTextSelected]}>
                        {p.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
            <Text style={styles.repeatHint}>
              締切日の朝8時＋夜20時の通知は常に届きます。追加で事前通知が欲しい場合に選択してください。
            </Text>

            {/* 追加ボタン */}
            <TouchableOpacity
              style={[styles.addButton, adding && { opacity: 0.6 }]}
              onPress={addTask}
              disabled={adding}
            >
              {adding ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.addButtonText}>追加する</Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  headerBack: { padding: 4 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#0f172a' },
  headerAdd: {
    padding: 4,
    backgroundColor: '#eef2ff',
    borderRadius: 8,
  },
  scroll: { padding: 16 },
  intro: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#eef2ff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  introText: { flex: 1, fontSize: 12.5, color: '#3730a3', lineHeight: 18 },
  empty: { alignItems: 'center', gap: 8, paddingVertical: 48 },
  emptyText: { fontSize: 14, fontWeight: '600', color: '#64748b' },
  emptySub: { fontSize: 12, color: '#94a3b8', textAlign: 'center', paddingHorizontal: 24, lineHeight: 17 },
  emptyAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#6366F1',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 12,
  },
  emptyAddBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  section: { marginBottom: 18 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8, paddingHorizontal: 2 },
  sectionDot: { width: 8, height: 8, borderRadius: 4 },
  sectionTitle: { fontSize: 14, fontWeight: '700' },
  sectionCount: { fontSize: 12, color: '#94a3b8', fontWeight: '600' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: { flex: 1 },
  courseBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#eef2ff',
    alignSelf: 'flex-start',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginBottom: 3,
  },
  courseBadgeText: { fontSize: 10.5, color: '#4f46e5', fontWeight: '600' },
  rowContent: { fontSize: 14, color: '#0f172a', fontWeight: '500', lineHeight: 19 },
  rowMeta: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 3 },
  rowDue: { fontSize: 12, fontWeight: '700' },
  rowWs: { flex: 1, fontSize: 11, color: '#94a3b8' },
  todayBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#eef2ff',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // モーダル
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  modalCard: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 36,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: { fontSize: 17, fontWeight: '700', color: '#0f172a' },
  modalLabel: { fontSize: 13, fontWeight: '600', color: '#475569', marginBottom: 6, marginTop: 12 },
  modalInput: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#0f172a',
    backgroundColor: '#f8fafc',
    marginBottom: 4,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  repeatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 16,
    paddingVertical: 4,
  },
  repeatLabel: { flex: 1, fontSize: 14, color: '#334155', fontWeight: '500' },
  repeatHint: {
    fontSize: 12,
    color: '#6366F1',
    marginTop: 4,
    marginLeft: 28,
    lineHeight: 17,
  },
  addButton: {
    backgroundColor: '#6366F1',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 20,
  },
  addButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  // 通知オフセット
  offsetRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 4,
  },
  offsetChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    flex: 1,
  },
  offsetChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
  },
  offsetChipSelected: {
    borderColor: '#6366F1',
    backgroundColor: '#eef2ff',
  },
  offsetChipText: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: '500',
  },
  offsetChipTextSelected: {
    color: '#4f46e5',
    fontWeight: '600',
  },
});
