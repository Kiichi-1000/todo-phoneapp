// Goal hierarchy view — horizontal swipe between 4 pages.
//
// Page order (left → right):  monthly → half_year → yearly → long_term
// Default landing page: monthly (index 0). The user can swipe or tap the
// level tabs at the top to navigate.
//
// Each page is independently scrollable vertically and shows:
//   - The level's current period (e.g. "2026/5", "2026 H1", "2026", "2026–2030")
//   - A `+` button to add a new goal at that level
//   - Cards for each active goal at that level
//   - An empty CTA if no goals exist yet at that level
//
// Goal create/edit happens via the shared GoalEditorModal.

import { useState, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  FlatList,
  useWindowDimensions,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  Target,
  Calendar,
  CalendarRange,
  CalendarDays,
  Sparkles,
  Plus,
} from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import type { Goal, GoalLevel } from '@/types/database';
import GoalCard from './GoalCard';
import GoalEditorModal from './GoalEditorModal';
import GoalDetailModal from './GoalDetailModal';

// monthly first per user request — proximity-based ordering, finest-grained
// goals first because they need the most attention day-to-day.
const PAGE_LEVELS: GoalLevel[] = ['monthly', 'half_year', 'yearly', 'long_term'];

// Visual style per level (icon + colors). Labels are looked up from i18n at
// render time via the t() function so language switching works.
const LEVEL_STYLE: Record<GoalLevel, { icon: any; color: string; bg: string }> = {
  monthly:   { icon: CalendarDays,  color: '#F59E0B', bg: '#FFFBEB' },
  half_year: { icon: CalendarRange, color: '#10B981', bg: '#ECFDF5' },
  yearly:    { icon: Calendar,      color: '#3B82F6', bg: '#EFF6FF' },
  long_term: { icon: Target,        color: '#8B5CF6', bg: '#F3F0FF' },
};

const LEVEL_LABEL_KEY: Record<GoalLevel, string> = {
  monthly:   'goal.level.monthly',
  half_year: 'goal.level.halfYear',
  yearly:    'goal.level.yearly',
  long_term: 'goal.level.longTerm',
};

const LEVEL_SHORT_LABEL_KEY: Record<GoalLevel, string> = {
  monthly:   'goal.level.monthlyShort',
  half_year: 'goal.level.halfYearShort',
  yearly:    'goal.level.yearlyShort',
  long_term: 'goal.level.longTermShort',
};

const LEVEL_DESC_KEY: Record<GoalLevel, string> = {
  monthly:   'goal.level.monthlyDesc',
  half_year: 'goal.level.halfYearDesc',
  yearly:    'goal.level.yearlyDesc',
  long_term: 'goal.level.longTermDesc',
};

function fmtPeriodForLevel(
  level: GoalLevel,
  t: (key: string, params?: Record<string, string | number>) => string,
  now: Date = new Date(),
): string {
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  if (level === 'monthly') return t('goal.period.yearMonth', { year: y, month: m });
  if (level === 'half_year') {
    return m <= 6
      ? t('goal.period.yearH1', { year: y })
      : t('goal.period.yearH2', { year: y });
  }
  if (level === 'yearly') return t('goal.period.year', { year: y });
  return t('goal.period.yearRange', { from: y, to: y + 4 });
}

interface GoalPageProps {
  level: GoalLevel;
  width: number;
  goals: Goal[];
  todoStatsByGoal: Record<string, { total: number; completed: number }>;
  titleById: Map<string, string>;
  refreshing: boolean;
  onRefresh: () => void;
  onAddGoal: (level: GoalLevel) => void;
  onEditGoal: (goal: Goal) => void;
  onToggleComplete: (goal: Goal) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

function GoalPage({
  level,
  width,
  goals,
  todoStatsByGoal,
  titleById,
  refreshing,
  onRefresh,
  onAddGoal,
  onEditGoal,
  onToggleComplete,
  t,
}: GoalPageProps) {
  const style = LEVEL_STYLE[level];
  const label = t(LEVEL_LABEL_KEY[level]);
  const Icon = style.icon;
  const period = useMemo(() => fmtPeriodForLevel(level, t), [level, t]);

  return (
    <View style={[pageStyles.container, { width }]}>
      <ScrollView
        contentContainerStyle={pageStyles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={pageStyles.header}>
          <View style={[pageStyles.headerIcon, { backgroundColor: style.bg }]}>
            <Icon size={18} color={style.color} strokeWidth={2.4} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={pageStyles.headerTitle}>{label}</Text>
            <Text style={pageStyles.headerPeriod}>{period}</Text>
          </View>
          <TouchableOpacity
            style={[pageStyles.addBtn, { backgroundColor: style.color }]}
            onPress={() => onAddGoal(level)}
            activeOpacity={0.85}
          >
            <Plus size={16} color="#fff" strokeWidth={2.6} />
            <Text style={pageStyles.addBtnText}>{t('goal.actions.add')}</Text>
          </TouchableOpacity>
        </View>

        {goals.length === 0 ? (
          <View style={pageStyles.emptyState}>
            <View style={[pageStyles.emptyIconBg, { backgroundColor: style.bg }]}>
              <Icon size={28} color={style.color} strokeWidth={2} />
            </View>
            <Text style={pageStyles.emptyTitle}>
              {t('goal.view.emptyForLevel', { level: label })}
            </Text>
            <Text style={pageStyles.emptySub}>
              {t('goal.view.emptyForLevelHint', { period })}
            </Text>
            <TouchableOpacity
              style={[pageStyles.emptyAddBtn, { backgroundColor: style.color }]}
              onPress={() => onAddGoal(level)}
              activeOpacity={0.85}
            >
              <Plus size={15} color="#fff" strokeWidth={2.6} />
              <Text style={pageStyles.emptyAddBtnText}>
                {t('goal.view.addForLevel', { level: label })}
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {goals.map((g) => (
              <GoalCard
                key={g.id}
                goal={g}
                todoStats={todoStatsByGoal[g.id]}
                parentTitle={g.parent_id ? titleById.get(g.parent_id) ?? null : null}
                onToggleComplete={onToggleComplete}
                onPress={onEditGoal}
              />
            ))}
            <TouchableOpacity
              style={pageStyles.addRow}
              onPress={() => onAddGoal(level)}
              activeOpacity={0.7}
            >
              <Plus size={14} color="#94A3B8" strokeWidth={2.4} />
              <Text style={pageStyles.addRowText}>{t('goal.view.addAnother')}</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </View>
  );
}

export default function GoalView() {
  const { user } = useAuth();
  const router = useRouter();
  const { t } = useLanguage();
  const { width: screenWidth } = useWindowDimensions();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [todoStatsByGoal, setTodoStatsByGoal] = useState<Record<string, { total: number; completed: number }>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activePageIndex, setActivePageIndex] = useState(0);

  const flatListRef = useRef<FlatList<GoalLevel>>(null);

  // Editor modal state (used only for NEW goal creation via section "+" button)
  const [editorVisible, setEditorVisible] = useState(false);
  const [editorLevel, setEditorLevel] = useState<GoalLevel>('monthly');
  const [editorGoal, setEditorGoal] = useState<Goal | null>(null);

  // Detail modal state (used when tapping an existing card → opens roadmap view)
  const [detailVisible, setDetailVisible] = useState(false);
  const [detailGoal, setDetailGoal] = useState<Goal | null>(null);

  const todayStr = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
  }, []);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      // Show all goals whose active period covers today, including completed
      // ones — they remain visible (with a strikethrough) so the user can
      // untap if they accidentally checked them off.
      const { data: goalRows } = await supabase
        .from('goals')
        .select('*')
        .eq('user_id', user.id)
        .lte('period_start', todayStr)
        .gte('period_end', todayStr)
        .order('is_completed', { ascending: true })   // active first, completed below
        .order('level', { ascending: true })
        .order('period_start', { ascending: true })
        .order('sort_order', { ascending: true });

      const goalList = (goalRows ?? []) as Goal[];
      setGoals(goalList);

      const goalIds = goalList.map((g) => g.id);
      if (goalIds.length > 0) {
        const { data: todoRows } = await supabase
          .from('todos')
          .select('goal_id, is_completed')
          .eq('user_id', user.id)
          .in('goal_id', goalIds);
        const stats: Record<string, { total: number; completed: number }> = {};
        for (const t of (todoRows ?? []) as { goal_id: string; is_completed: boolean }[]) {
          const g = t.goal_id;
          if (!stats[g]) stats[g] = { total: 0, completed: 0 };
          stats[g].total++;
          if (t.is_completed) stats[g].completed++;
        }
        setTodoStatsByGoal(stats);
      } else {
        setTodoStatsByGoal({});
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user, todayStr]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  const goalsByLevel = useMemo(() => {
    const m: Record<GoalLevel, Goal[]> = { long_term: [], yearly: [], half_year: [], monthly: [] };
    for (const g of goals) m[g.level].push(g);
    return m;
  }, [goals]);

  const titleById = useMemo(() => {
    const m = new Map<string, string>();
    for (const g of goals) m.set(g.id, g.title);
    return m;
  }, [goals]);

  // Toggle completion in place — keep the card visible so the user can revert
  // by tapping again. Optimistically update local state first, then persist.
  const handleToggleComplete = async (goal: Goal) => {
    const newState = !goal.is_completed;
    const completedAt = newState ? new Date().toISOString() : null;

    setGoals((cur) =>
      cur.map((g) =>
        g.id === goal.id ? { ...g, is_completed: newState, completed_at: completedAt } : g,
      ),
    );

    try {
      await supabase
        .from('goals')
        .update({
          is_completed: newState,
          completed_at: completedAt,
          updated_at: new Date().toISOString(),
        })
        .eq('id', goal.id);
    } catch {
      // Revert via full reload on error
      load();
    }
  };

  const openEditorForNew = (level: GoalLevel) => {
    setEditorLevel(level);
    setEditorGoal(null);
    setEditorVisible(true);
  };

  // Tapping a card now opens the detail modal (with roadmap timeline) — the
  // editor modal is reached from inside the detail modal's "編集" button.
  const openDetailForGoal = (goal: Goal) => {
    setDetailGoal(goal);
    setDetailVisible(true);
  };

  const handleEditorSaved = () => {
    load();
  };

  const handleDetailGoalChanged = () => {
    load();
    // If the underlying goal was edited (e.g. title changed), refresh the
    // copy held in the detail modal so the displayed data stays in sync.
    if (detailGoal) {
      supabase
        .from('goals')
        .select('*')
        .eq('id', detailGoal.id)
        .maybeSingle()
        .then(({ data }: any) => {
          if (data) setDetailGoal(data as Goal);
        });
    }
  };

  // Goals are coached by the dedicated goal-coach AI (separate from the
  // general /ai assistant). The coach retains full conversation history.
  const goToCoach = () => router.push('/goal-coach');

  const jumpToPage = (idx: number) => {
    if (idx === activePageIndex) return;
    setActivePageIndex(idx);
    flatListRef.current?.scrollToIndex({ index: idx, animated: true });
  };

  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (viewableItems.length > 0) {
      const item = viewableItems[Math.floor(viewableItems.length / 2)] || viewableItems[0];
      if (item && typeof item.index === 'number') {
        setActivePageIndex(item.index);
      }
    }
  }).current;

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 }).current;

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#6366F1" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Level tab indicator (sticky on top) */}
      <View style={styles.tabBar}>
        {PAGE_LEVELS.map((lv, idx) => {
          const lvStyle = LEVEL_STYLE[lv];
          const Icon = lvStyle.icon;
          const isActive = idx === activePageIndex;
          return (
            <TouchableOpacity
              key={lv}
              style={styles.tabBtn}
              onPress={() => jumpToPage(idx)}
              activeOpacity={0.7}
            >
              <View style={styles.tabContent}>
                <Icon
                  size={13}
                  color={isActive ? lvStyle.color : '#94A3B8'}
                  strokeWidth={2.4}
                />
                <Text
                  style={[
                    styles.tabText,
                    isActive && { color: lvStyle.color },
                  ]}
                >
                  {t(LEVEL_SHORT_LABEL_KEY[lv])}
                </Text>
                {goalsByLevel[lv].length > 0 && (
                  <View
                    style={[
                      styles.tabBadge,
                      isActive && { backgroundColor: lvStyle.color + '20' },
                    ]}
                  >
                    <Text
                      style={[
                        styles.tabBadgeText,
                        isActive && { color: lvStyle.color },
                      ]}
                    >
                      {goalsByLevel[lv].length}
                    </Text>
                  </View>
                )}
              </View>
              <View
                style={[
                  styles.tabUnderline,
                  isActive && { backgroundColor: lvStyle.color },
                ]}
              />
            </TouchableOpacity>
          );
        })}
      </View>

      <FlatList
        ref={flatListRef}
        data={PAGE_LEVELS}
        keyExtractor={(item) => item}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        getItemLayout={(_, index) => ({
          length: screenWidth,
          offset: screenWidth * index,
          index,
        })}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        initialScrollIndex={0}
        renderItem={({ item }) => (
          <GoalPage
            level={item}
            width={screenWidth}
            goals={goalsByLevel[item]}
            todoStatsByGoal={todoStatsByGoal}
            titleById={titleById}
            refreshing={refreshing}
            onRefresh={onRefresh}
            onAddGoal={openEditorForNew}
            onEditGoal={openDetailForGoal}
            onToggleComplete={handleToggleComplete}
            t={t}
          />
        )}
      />

      <View style={styles.aiBtnWrap}>
        <TouchableOpacity style={styles.aiBtnInline} onPress={goToCoach} activeOpacity={0.85}>
          <Target size={14} color="#8B5CF6" strokeWidth={2.4} />
          <Text style={styles.aiBtnInlineText}>{t('goal.view.consultCoachAI')}</Text>
        </TouchableOpacity>
      </View>

      <GoalEditorModal
        visible={editorVisible}
        level={editorLevel}
        initialGoal={editorGoal}
        onClose={() => setEditorVisible(false)}
        onSaved={handleEditorSaved}
      />

      <GoalDetailModal
        visible={detailVisible}
        goal={detailGoal}
        onClose={() => setDetailVisible(false)}
        onGoalChanged={handleDetailGoalChanged}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Top tab indicator
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2E8F0',
    paddingTop: 6,
  },
  tabBtn: {
    flex: 1,
    alignItems: 'center',
  },
  tabContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 10,
  },
  tabText: { fontSize: 12.5, fontWeight: '600', color: '#94A3B8' },
  tabBadge: {
    minWidth: 18,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 9,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBadgeText: { fontSize: 10, fontWeight: '700', color: '#94A3B8' },
  tabUnderline: {
    height: 2,
    width: '60%',
    backgroundColor: 'transparent',
    borderTopLeftRadius: 1,
    borderTopRightRadius: 1,
  },

  // AI relay button
  aiBtnWrap: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    paddingTop: 4,
    backgroundColor: 'transparent',
  },
  aiBtnInline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    backgroundColor: '#F3F0FF',
    borderRadius: 10,
  },
  aiBtnInlineText: { fontSize: 13, color: '#8B5CF6', fontWeight: '600' },
});

const pageStyles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { paddingHorizontal: 14, paddingTop: 16, paddingBottom: 24 },

  // Page header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
    paddingHorizontal: 2,
  },
  headerIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#0F172A', letterSpacing: 0.2 },
  headerPeriod: { fontSize: 12, color: '#64748B', marginTop: 2, fontWeight: '500' },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  addBtnText: { fontSize: 13, color: '#fff', fontWeight: '700' },

  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 18,
  },
  emptyIconBg: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#0F172A', textAlign: 'center' },
  emptySub: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 19,
  },
  emptyAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 11,
    marginTop: 18,
  },
  emptyAddBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  // Add another row
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    marginTop: 4,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderStyle: 'dashed',
    backgroundColor: '#FAFBFF',
  },
  addRowText: { fontSize: 13, color: '#94A3B8', fontWeight: '500' },
});
