import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CircleCheck as CheckCircle2, TrendingUp, Sunrise, Sun, Moon, ListChecks, ChevronDown, ChevronUp } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Todo, UserSettings, RoutineSlot } from '@/types/database';

interface StatsSummary {
  todayCompleted: number;
  weekCompleted: number;
  monthCompleted: number;
  totalCompleted: number;
  totalPending: number;
  completionRate: number;
}

interface RoutineItemStat {
  id: string;
  title: string;
  slot: RoutineSlot;
  is_active: boolean;
  totalDays: number;
  completedDays: number;
  rate: number;
}

interface RoutineOverallStat {
  totalPossible: number;
  totalCompleted: number;
  rate: number;
}

const SLOTS_ORDER: RoutineSlot[] = ['morning', 'daytime', 'evening'];

const SLOT_LABELS: Record<RoutineSlot, string> = {
  morning: '朝',
  daytime: '日中',
  evening: '夜',
};

const SLOT_ICONS: Record<RoutineSlot, any> = {
  morning: Sunrise,
  daytime: Sun,
  evening: Moon,
};

const SLOT_COLORS: Record<RoutineSlot, string> = {
  morning: '#E8954A',
  daytime: '#3B82F6',
  evening: '#7C5CFC',
};

function formatDateLocal(d: Date): string {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getRateColor(rate: number): string {
  if (rate >= 80) return '#22c55e';
  if (rate >= 60) return '#eab308';
  if (rate >= 40) return '#f97316';
  return '#ef4444';
}

export default function StatisticsScreen() {
  const { user } = useAuth();
  const [stats, setStats] = useState<StatsSummary>({
    todayCompleted: 0,
    weekCompleted: 0,
    monthCompleted: 0,
    totalCompleted: 0,
    totalPending: 0,
    completionRate: 0,
  });
  const [routineItems, setRoutineItems] = useState<RoutineItemStat[]>([]);
  const [routineOverall, setRoutineOverall] = useState<RoutineOverallStat>({
    totalPossible: 0,
    totalCompleted: 0,
    rate: 0,
  });
  const [refreshing, setRefreshing] = useState(false);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [routineExpanded, setRoutineExpanded] = useState(true);

  useEffect(() => {
    loadSettings();
  }, []);

  useEffect(() => {
    if (settings) {
      loadStatistics();
      loadRoutineStats();
    }
  }, [settings]);

  useFocusEffect(
    useCallback(() => {
      if (user) {
        loadSettings();
      }
    }, [user])
  );

  const loadSettings = async () => {
    try {
      const { data, error } = (await supabase
        .from('user_settings')
        .select('*')
        .limit(1)
        .maybeSingle()) as { data: UserSettings | null; error: any };

      if (error) throw error;
      setSettings(data);
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  };

  const loadStatistics = async () => {
    try {
      const currentType = settings?.default_workspace_type || 'four_grid';

      const { data: workspaces, error: workspacesError } = (await supabase
        .from('workspaces')
        .select('id')
        .eq('type', currentType)) as {
        data: Array<{ id: string }> | null;
        error: any;
      };

      if (workspacesError) throw workspacesError;
      if (!workspaces || workspaces.length === 0) return;

      const workspaceIds = workspaces.map((w) => w.id);

      const { data: todos, error } = (await supabase
        .from('todos')
        .select('*')
        .in('workspace_id', workspaceIds)) as { data: Todo[] | null; error: any };

      if (error) throw error;
      if (!todos) return;

      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

      const todayCompleted = todos.filter(
        (t) => t.is_completed && t.completed_at && new Date(t.completed_at) >= todayStart
      ).length;

      const weekCompleted = todos.filter(
        (t) => t.is_completed && t.completed_at && new Date(t.completed_at) >= weekStart
      ).length;

      const monthCompleted = todos.filter(
        (t) => t.is_completed && t.completed_at && new Date(t.completed_at) >= monthStart
      ).length;

      const totalCompleted = todos.filter((t) => t.is_completed).length;
      const totalPending = todos.filter((t) => !t.is_completed).length;
      const total = todos.length;
      const completionRate = total > 0 ? (totalCompleted / total) * 100 : 0;

      setStats({
        todayCompleted,
        weekCompleted,
        monthCompleted,
        totalCompleted,
        totalPending,
        completionRate,
      });
    } catch (error) {
      console.error('Error loading statistics:', error);
    }
  };

  const loadRoutineStats = async () => {
    if (!user) return;
    try {
      const { data: template, error: tmplError } = (await supabase
        .from('routine_templates')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle()) as { data: { id: string } | null; error: any };

      if (tmplError || !template) {
        setRoutineItems([]);
        setRoutineOverall({ totalPossible: 0, totalCompleted: 0, rate: 0 });
        return;
      }

      const { data: templateItems, error: itemsError } = (await supabase
        .from('routine_template_items')
        .select('*')
        .eq('template_id', template.id)
        .is('today_only_date', null)
        .order('slot')
        .order('sort_order')) as { data: any[] | null; error: any };

      if (itemsError || !templateItems || templateItems.length === 0) {
        setRoutineItems([]);
        setRoutineOverall({ totalPossible: 0, totalCompleted: 0, rate: 0 });
        return;
      }

      const itemIds = templateItems.map((i: any) => i.id);

      const { data: completions, error: compError } = (await supabase
        .from('routine_completions')
        .select('item_id, date')
        .eq('user_id', user.id)
        .in('item_id', itemIds)) as {
        data: Array<{ item_id: string; date: string }> | null;
        error: any;
      };

      if (compError) throw compError;

      const { data: skips } = (await supabase
        .from('routine_skips')
        .select('item_id, date')
        .eq('user_id', user.id)
        .in('item_id', itemIds)) as {
        data: Array<{ item_id: string; date: string }> | null;
        error: any;
      };

      const completionMap = new Map<string, Set<string>>();
      for (const c of completions || []) {
        if (!completionMap.has(c.item_id)) completionMap.set(c.item_id, new Set());
        completionMap.get(c.item_id)!.add(c.date);
      }

      const skipMap = new Map<string, Set<string>>();
      for (const s of skips || []) {
        if (!skipMap.has(s.item_id)) skipMap.set(s.item_id, new Set());
        skipMap.get(s.item_id)!.add(s.date);
      }

      const today = new Date();
      const todayStr = formatDateLocal(today);

      let overallTotal = 0;
      let overallCompleted = 0;

      const itemStats: RoutineItemStat[] = templateItems.map((item: any) => {
        const startDate = formatDateLocal(new Date(item.created_at));
        const itemCompletions = completionMap.get(item.id) || new Set();
        const itemSkips = skipMap.get(item.id) || new Set();

        let totalDays = 0;
        let completedDays = 0;

        const start = new Date(startDate);
        const end = new Date(todayStr);
        const cursor = new Date(start);

        while (cursor <= end) {
          const dateStr = formatDateLocal(cursor);
          if (!itemSkips.has(dateStr)) {
            totalDays++;
            if (itemCompletions.has(dateStr)) {
              completedDays++;
            }
          }
          cursor.setDate(cursor.getDate() + 1);
        }

        overallTotal += totalDays;
        overallCompleted += completedDays;

        return {
          id: item.id,
          title: item.title || '(無題)',
          slot: item.slot as RoutineSlot,
          is_active: item.is_active,
          totalDays,
          completedDays,
          rate: totalDays > 0 ? Math.round((completedDays / totalDays) * 100) : 0,
        };
      });

      itemStats.sort((a, b) => {
        const slotOrder: Record<RoutineSlot, number> = { morning: 0, daytime: 1, evening: 2 };
        return slotOrder[a.slot] - slotOrder[b.slot];
      });

      setRoutineItems(itemStats);
      setRoutineOverall({
        totalPossible: overallTotal,
        totalCompleted: overallCompleted,
        rate: overallTotal > 0 ? Math.round((overallCompleted / overallTotal) * 100) : 0,
      });
    } catch (error) {
      console.error('Error loading routine stats:', error);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadStatistics(), loadRoutineStats()]);
    setRefreshing(false);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header} />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.summaryCard}>
          <View style={styles.summaryHeader}>
            <CheckCircle2 size={24} color="#fff" />
            <Text style={styles.summaryTitle}>ToDo達成率</Text>
          </View>
          <Text style={styles.summaryValue}>{Math.round(stats.completionRate)}%</Text>
          <Text style={styles.summarySubtext}>
            {stats.totalCompleted} / {stats.totalCompleted + stats.totalPending} 完了
          </Text>
        </View>

        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>今日</Text>
            <Text style={styles.statValue}>{stats.todayCompleted}</Text>
            <Text style={styles.statUnit}>完了</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>今週</Text>
            <Text style={styles.statValue}>{stats.weekCompleted}</Text>
            <Text style={styles.statUnit}>完了</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>今月</Text>
            <Text style={styles.statValue}>{stats.monthCompleted}</Text>
            <Text style={styles.statUnit}>完了</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>合計</Text>
            <Text style={styles.statValue}>{stats.totalCompleted}</Text>
            <Text style={styles.statUnit}>完了</Text>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <TrendingUp size={20} color="#000" />
            <Text style={styles.cardTitle}>現在の状況</Text>
          </View>
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>完了済み</Text>
            <Text style={styles.statusValue}>{stats.totalCompleted}</Text>
          </View>
          <View style={[styles.statusRow, { borderBottomWidth: 0 }]}>
            <Text style={styles.statusLabel}>未完了</Text>
            <Text style={styles.statusValue}>{stats.totalPending}</Text>
          </View>
        </View>

        <View style={styles.routineSection}>
          <TouchableOpacity
            style={styles.routineSectionHeader}
            onPress={() => setRoutineExpanded(!routineExpanded)}
            activeOpacity={0.7}
          >
            <View style={styles.routineSectionTitleRow}>
              <ListChecks size={22} color="#000" />
              <Text style={styles.routineSectionTitle}>ルーティン完遂率</Text>
            </View>
            {routineExpanded ? (
              <ChevronUp size={20} color="#999" />
            ) : (
              <ChevronDown size={20} color="#999" />
            )}
          </TouchableOpacity>

          {routineExpanded && (
            <>
              {routineItems.length > 0 ? (
                <>
                  <View style={styles.routineOverallCard}>
                    <Text style={styles.routineOverallLabel}>全体の完遂率</Text>
                    <View style={styles.routineOverallRow}>
                      <Text
                        style={[
                          styles.routineOverallRate,
                          { color: getRateColor(routineOverall.rate) },
                        ]}
                      >
                        {routineOverall.rate}%
                      </Text>
                      <Text style={styles.routineOverallSub}>
                        {routineOverall.totalCompleted} / {routineOverall.totalPossible} 回
                      </Text>
                    </View>
                    <View style={styles.routineOverallBarBg}>
                      <View
                        style={[
                          styles.routineOverallBarFill,
                          {
                            width: `${routineOverall.rate}%`,
                            backgroundColor: getRateColor(routineOverall.rate),
                          },
                        ]}
                      />
                    </View>
                  </View>

                  {SLOTS_ORDER.map((slot) => {
                    const slotItems = routineItems.filter((i) => i.slot === slot);
                    if (slotItems.length === 0) return null;
                    const SlotIcon = SLOT_ICONS[slot];
                    const slotColor = SLOT_COLORS[slot];
                    return (
                      <View key={slot} style={styles.routineSlotGroup}>
                        <View style={styles.routineSlotHeader}>
                          <SlotIcon size={16} color={slotColor} />
                          <Text style={[styles.routineSlotLabel, { color: slotColor }]}>
                            {SLOT_LABELS[slot]}
                          </Text>
                        </View>
                        {slotItems.map((item) => (
                          <View
                            key={item.id}
                            style={[
                              styles.routineItemRow,
                              !item.is_active && styles.routineItemInactive,
                            ]}
                          >
                            <View style={styles.routineItemInfo}>
                              <Text
                                style={[
                                  styles.routineItemTitle,
                                  !item.is_active && styles.routineItemTitleInactive,
                                ]}
                                numberOfLines={1}
                              >
                                {item.title}
                              </Text>
                              <Text style={styles.routineItemDays}>
                                {item.completedDays}/{item.totalDays}日
                              </Text>
                            </View>
                            <View style={styles.routineItemBarContainer}>
                              <View style={styles.routineItemBarBg}>
                                <View
                                  style={[
                                    styles.routineItemBarFill,
                                    {
                                      width: `${item.rate}%`,
                                      backgroundColor: getRateColor(item.rate),
                                    },
                                  ]}
                                />
                              </View>
                              <Text
                                style={[
                                  styles.routineItemRate,
                                  { color: getRateColor(item.rate) },
                                ]}
                              >
                                {item.rate}%
                              </Text>
                            </View>
                          </View>
                        ))}
                      </View>
                    );
                  })}
                </>
              ) : (
                <View style={styles.routineEmptyCard}>
                  <ListChecks size={32} color="#ccc" />
                  <Text style={styles.routineEmptyText}>
                    ルーティンを作成するとここに完遂率が表示されます
                  </Text>
                </View>
              )}
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9f9f9',
  },
  header: {
    padding: 20,
    paddingTop: 10,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5e5',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '600',
    color: '#000',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  summaryCard: {
    backgroundColor: '#000',
    borderRadius: 12,
    padding: 24,
    marginBottom: 16,
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginLeft: 8,
  },
  summaryValue: {
    fontSize: 48,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
  },
  summarySubtext: {
    fontSize: 14,
    color: '#ccc',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 16,
    gap: 12,
  },
  statCard: {
    flex: 1,
    minWidth: '47%',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e5e5e5',
  },
  statLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  statValue: {
    fontSize: 32,
    fontWeight: '700',
    color: '#000',
    marginBottom: 4,
  },
  statUnit: {
    fontSize: 12,
    color: '#999',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e5e5e5',
    marginBottom: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginLeft: 8,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  statusLabel: {
    fontSize: 14,
    color: '#666',
  },
  statusValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
  },
  routineSection: {
    marginTop: 4,
  },
  routineSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e5e5e5',
    marginBottom: 12,
  },
  routineSectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  routineSectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
  },
  routineOverallCard: {
    backgroundColor: '#111',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
  },
  routineOverallLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#aaa',
    marginBottom: 8,
  },
  routineOverallRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 12,
    marginBottom: 12,
  },
  routineOverallRate: {
    fontSize: 40,
    fontWeight: '800',
  },
  routineOverallSub: {
    fontSize: 13,
    color: '#888',
  },
  routineOverallBarBg: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#333',
    overflow: 'hidden',
  },
  routineOverallBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  routineSlotGroup: {
    marginBottom: 12,
  },
  routineSlotHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  routineSlotLabel: {
    fontSize: 14,
    fontWeight: '700',
  },
  routineItemRow: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#f0f0f0',
  },
  routineItemInactive: {
    opacity: 0.5,
  },
  routineItemInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  routineItemTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#222',
    flex: 1,
    marginRight: 8,
  },
  routineItemTitleInactive: {
    color: '#999',
  },
  routineItemDays: {
    fontSize: 12,
    color: '#999',
  },
  routineItemBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  routineItemBarBg: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#f0f0f0',
    overflow: 'hidden',
  },
  routineItemBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  routineItemRate: {
    fontSize: 14,
    fontWeight: '700',
    minWidth: 40,
    textAlign: 'right',
  },
  routineEmptyCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e5e5',
    gap: 12,
  },
  routineEmptyText: {
    fontSize: 13,
    color: '#999',
    textAlign: 'center',
    lineHeight: 20,
  },
});
