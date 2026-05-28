// 課題（期限）一覧 — 期限つき todo を「締め切りが近い順」に一元表示する。
//
// なぜ必要か:
//   期限つきの課題をカレンダー（スケジュール）に入れると予定と混在して
//   分かりづらい。本画面は全ワークスペース横断で「未完了かつ due_date あり」の
//   todo だけを集め、締め切りまでの残り日数でグルーピングして表示する。
//   予定（schedules）とは完全に分離した「やることリスト（締切順）」。
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
} from 'react-native';
import {
  ArrowLeft,
  Check,
  ChevronRight,
  CalendarClock,
  CircleAlert,
} from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

interface DeadlineTodo {
  id: string;
  content: string;
  due_date: string; // YYYY-MM-DD
  workspace_id: string;
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

  const load = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('todos')
      .select('id, content, due_date, workspace_id, workspaces(title, date)')
      .eq('user_id', user.id)
      .eq('is_completed', false)
      .not('due_date', 'is', null)
      .order('due_date', { ascending: true });
    if (!error) setTodos((data ?? []) as unknown as DeadlineTodo[]);
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

  const complete = useCallback(async (id: string) => {
    setTodos((prev) => prev.filter((t) => t.id !== id)); // optimistic
    await supabase
      .from('todos')
      .update({ is_completed: true, completed_at: new Date().toISOString() })
      .eq('id', id);
  }, []);

  // バケットごとにグルーピング（todos は due_date 昇順で取得済み）。
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
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBack}>
          <ArrowLeft size={22} color="#0f172a" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>課題（期限）</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6366F1" />}
      >
        <View style={styles.intro}>
          <CalendarClock size={18} color="#6366F1" />
          <Text style={styles.introText}>
            締め切りが近い順の課題一覧です。予定（カレンダー）とは分けて、ここでまとめて確認できます。
          </Text>
        </View>

        {loading ? (
          <ActivityIndicator style={{ paddingVertical: 40 }} color="#6366F1" />
        ) : total === 0 ? (
          <View style={styles.empty}>
            <CalendarClock size={28} color="#cbd5e1" />
            <Text style={styles.emptyText}>期限つきの課題はありません。</Text>
            <Text style={styles.emptySub}>ワークスペースで todo に期限を設定すると、ここに締切順で並びます。</Text>
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
                    <TouchableOpacity onPress={() => complete(t.id)} style={styles.checkbox} hitSlop={8}>
                      <Check size={15} color={meta.accent} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.rowBody}
                      onPress={() => router.push(`/workspace/${t.workspace_id}`)}
                    >
                      <Text style={styles.rowContent} numberOfLines={2}>
                        {t.content || '(無題の課題)'}
                      </Text>
                      <View style={styles.rowMeta}>
                        {key === 'overdue' && <CircleAlert size={12} color={meta.accent} />}
                        <Text style={[styles.rowDue, { color: meta.accent }]}>{dueLabel(t.due_date)}</Text>
                        {t.workspaces?.title ? (
                          <Text style={styles.rowWs} numberOfLines={1}> ・ {t.workspaces.title}</Text>
                        ) : null}
                      </View>
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
  rowContent: { fontSize: 14, color: '#0f172a', fontWeight: '500', lineHeight: 19 },
  rowMeta: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 3 },
  rowDue: { fontSize: 12, fontWeight: '700' },
  rowWs: { flex: 1, fontSize: 11, color: '#94a3b8' },
});
