// Goal detail with vertical roadmap timeline.
//
// Tapping a goal card opens this modal. It shows:
//   1. Goal header (title / level / period / description) with an Edit button
//      that opens the existing GoalEditorModal.
//   2. Roadmap timeline — vertical list of milestones with status circles
//      connected by lines. "Current position" is the first incomplete step,
//      visually highlighted with a 📍 badge.
//   3. + ステップを追加 button at the bottom.
//
// Behavior:
//   - Tap circle → toggle that step's completion. The "current position"
//     auto-advances to the next incomplete step.
//   - Tap step row → opens MilestoneEditModal for editing/deleting.
//   - + 追加 → opens MilestoneEditModal in create mode.

import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  X,
  Pencil,
  Plus,
  Check,
  Calendar,
  MapPin,
  Target,
  Calendar as CalIcon,
  CalendarRange,
  CalendarDays,
  Sparkles,
} from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import type { Goal, GoalMilestone, GoalLevel } from '@/types/database';
import GoalEditorModal from './GoalEditorModal';
import MilestoneEditModal from './MilestoneEditModal';

interface Props {
  visible: boolean;
  goal: Goal | null;
  onClose: () => void;
  onGoalChanged: () => void; // called when goal or its milestones are modified
}

const LEVEL_STYLE: Record<GoalLevel, { icon: any; color: string; bg: string }> = {
  long_term: { icon: Target,        color: '#8B5CF6', bg: '#F3F0FF' },
  yearly:    { icon: CalIcon,       color: '#3B82F6', bg: '#EFF6FF' },
  half_year: { icon: CalendarRange, color: '#10B981', bg: '#ECFDF5' },
  monthly:   { icon: CalendarDays,  color: '#F59E0B', bg: '#FFFBEB' },
};

const LEVEL_LABEL_KEY: Record<GoalLevel, string> = {
  long_term: 'goal.level.longTerm',
  yearly:    'goal.level.yearly',
  half_year: 'goal.level.halfYear',
  monthly:   'goal.level.monthly',
};

// Compact period for the detail header. Numeric formatting is language-neutral
// enough that we don't need translations here.
function fmtPeriod(start: string, end: string, level: GoalLevel): string {
  const s = new Date(start);
  const e = new Date(end);
  if (level === 'monthly') return `${s.getFullYear()}/${s.getMonth() + 1}`;
  if (level === 'half_year') {
    const half = s.getMonth() < 6 ? 'H1' : 'H2';
    return `${s.getFullYear()} ${half}`;
  }
  if (level === 'yearly') return `${s.getFullYear()}`;
  return `${s.getFullYear()}–${e.getFullYear()}`;
}

function fmtTargetDate(
  d: string,
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  const dt = new Date(d);
  return t('goal.period.untilDate', {
    year: dt.getFullYear(),
    month: dt.getMonth() + 1,
    day: dt.getDate(),
  });
}

export default function GoalDetailModal({ visible, goal, onClose, onGoalChanged }: Props) {
  const { user } = useAuth();
  const router = useRouter();
  const { t } = useLanguage();
  const [milestones, setMilestones] = useState<GoalMilestone[]>([]);
  const [loading, setLoading] = useState(true);

  // Sub-modals
  const [editorVisible, setEditorVisible] = useState(false);
  const [milestoneEditorVisible, setMilestoneEditorVisible] = useState(false);
  const [activeMilestone, setActiveMilestone] = useState<GoalMilestone | null>(null);

  const loadMilestones = useCallback(async () => {
    if (!user || !goal) return;
    setLoading(true);
    try {
      const { data } = await supabase
        .from('goal_milestones')
        .select('*')
        .eq('goal_id', goal.id)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });
      setMilestones((data ?? []) as GoalMilestone[]);
    } finally {
      setLoading(false);
    }
  }, [user, goal]);

  useEffect(() => {
    if (visible && goal) loadMilestones();
    if (!visible) setMilestones([]);
  }, [visible, goal, loadMilestones]);

  if (!goal) return null;

  const lvStyle = LEVEL_STYLE[goal.level];
  const levelLabel = t(LEVEL_LABEL_KEY[goal.level]);
  const LevelIcon = lvStyle.icon;
  const period = fmtPeriod(goal.period_start, goal.period_end, goal.level);

  const completedCount = milestones.filter((m) => m.is_completed).length;
  const totalCount = milestones.length;
  const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  // Current position = first incomplete milestone index. -1 if all done.
  const currentIdx = milestones.findIndex((m) => !m.is_completed);

  const handleToggleMilestone = async (m: GoalMilestone) => {
    const newState = !m.is_completed;
    const completedAt = newState ? new Date().toISOString() : null;
    // Optimistic update
    setMilestones((cur) =>
      cur.map((x) =>
        x.id === m.id ? { ...x, is_completed: newState, completed_at: completedAt } : x,
      ),
    );
    try {
      await supabase
        .from('goal_milestones')
        .update({
          is_completed: newState,
          completed_at: completedAt,
          updated_at: new Date().toISOString(),
        })
        .eq('id', m.id);
    } catch {
      loadMilestones(); // revert
    }
  };

  const handleEditMilestone = (m: GoalMilestone) => {
    setActiveMilestone(m);
    setMilestoneEditorVisible(true);
  };

  const handleAddMilestone = () => {
    setActiveMilestone(null);
    setMilestoneEditorVisible(true);
  };

  // Navigate to Goal-Coach with a pre-filled prompt asking it to draft (or
  // expand) the roadmap for THIS goal. The coach has access to milestone
  // CRUD tools and will list existing steps first to avoid duplicates.
  const handleAskAI = () => {
    if (!goal) return;
    const hasMilestones = milestones.length > 0;
    const prefill = hasMilestones
      ? t('goal.roadmap.aiPrefillReview', { title: goal.title, count: milestones.length })
      : t('goal.roadmap.aiPrefillNew', {
          title: goal.title,
          start: goal.period_start,
          end: goal.period_end,
        });
    onClose();
    setTimeout(() => {
      router.push({ pathname: '/goal-coach', params: { prefill } } as any);
    }, 200);
  };

  const nextSortOrder = milestones.length > 0
    ? Math.max(...milestones.map((m) => m.sort_order)) + 1
    : 0;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={[styles.levelBadge, { backgroundColor: lvStyle.bg }]}>
              <LevelIcon size={14} color={lvStyle.color} strokeWidth={2.4} />
              <Text style={[styles.levelBadgeText, { color: lvStyle.color }]}>{levelLabel}</Text>
            </View>
            <Text style={styles.periodText}>{period}</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
            <X size={20} color="#475569" />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {/* Goal title + description + edit button */}
          <View style={styles.goalCard}>
            <Text style={[styles.goalTitle, goal.is_completed && styles.goalTitleDone]}>
              {goal.title}
            </Text>
            {goal.description ? (
              <Text style={styles.goalDescription}>{goal.description}</Text>
            ) : null}
            <TouchableOpacity
              style={styles.editGoalBtn}
              onPress={() => setEditorVisible(true)}
              activeOpacity={0.75}
            >
              <Pencil size={13} color="#475569" strokeWidth={2.4} />
              <Text style={styles.editGoalBtnText}>{t('goal.roadmap.editGoal')}</Text>
            </TouchableOpacity>
          </View>

          {/* Roadmap timeline */}
          <View style={styles.roadmapSection}>
            <View style={styles.roadmapHeader}>
              <Text style={styles.roadmapTitle}>🗺  {t('goal.roadmap.title')}</Text>
              {totalCount > 0 && (
                <View style={styles.progressBadge}>
                  <Text style={styles.progressBadgeText}>
                    {completedCount}/{totalCount} · {progressPct}%
                  </Text>
                </View>
              )}
            </View>

            {loading ? (
              <View style={styles.loadingWrap}>
                <ActivityIndicator color="#6366F1" />
              </View>
            ) : milestones.length === 0 ? (
              <View style={styles.emptyState}>
                <View style={styles.emptyIconBg}>
                  <MapPin size={28} color="#8B5CF6" strokeWidth={2} />
                </View>
                <Text style={styles.emptyTitle}>{t('goal.roadmap.emptyTitle')}</Text>
                <Text style={styles.emptySub}>
                  {t('goal.roadmap.emptyHint')}
                </Text>
                <TouchableOpacity
                  style={styles.emptyAIBtn}
                  onPress={handleAskAI}
                  activeOpacity={0.85}
                >
                  <Sparkles size={15} color="#fff" strokeWidth={2.6} />
                  <Text style={styles.emptyAIBtnText}>{t('goal.roadmap.buildWithAI')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.emptyManualBtn}
                  onPress={handleAddMilestone}
                  activeOpacity={0.75}
                >
                  <Plus size={14} color="#475569" strokeWidth={2.4} />
                  <Text style={styles.emptyManualBtnText}>{t('goal.actions.addManual')}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.timeline}>
                {milestones.map((m, idx) => {
                  const isCurrent = idx === currentIdx;
                  const isDone = m.is_completed;
                  const isFuture = !isDone && !isCurrent;
                  const isLast = idx === milestones.length - 1;

                  let circleStyle: any = styles.circleFuture;
                  let circleColor = '#CBD5E1';
                  let CircleIcon: any = null;

                  if (isDone) {
                    circleStyle = styles.circleDone;
                    circleColor = '#10B981';
                    CircleIcon = Check;
                  } else if (isCurrent) {
                    circleStyle = styles.circleCurrent;
                    circleColor = '#6366F1';
                  }

                  const lineStyle = isDone ? styles.lineDone : styles.lineFuture;

                  return (
                    <View key={m.id} style={styles.row}>
                      {/* Track (line + circle) */}
                      <View style={styles.track}>
                        {/* Top half-line */}
                        {idx > 0 && (
                          <View
                            style={[
                              styles.lineHalf,
                              styles.lineTopHalf,
                              isDone ? styles.lineDone : styles.lineFuture,
                            ]}
                          />
                        )}
                        {/* Circle */}
                        <TouchableOpacity
                          style={[styles.circle, circleStyle]}
                          onPress={() => handleToggleMilestone(m)}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          activeOpacity={0.7}
                        >
                          {CircleIcon ? (
                            <CircleIcon size={14} color="#fff" strokeWidth={3} />
                          ) : isCurrent ? (
                            <View style={styles.currentDot} />
                          ) : null}
                        </TouchableOpacity>
                        {/* Bottom half-line */}
                        {!isLast && (
                          <View
                            style={[
                              styles.lineHalf,
                              styles.lineBottomHalf,
                              // Line below current is incomplete look
                              isDone ? styles.lineDone : styles.lineFuture,
                            ]}
                          />
                        )}
                      </View>

                      {/* Content */}
                      <TouchableOpacity
                        style={[
                          styles.contentBtn,
                          isCurrent && styles.contentBtnCurrent,
                          isDone && styles.contentBtnDone,
                        ]}
                        onPress={() => handleEditMilestone(m)}
                        activeOpacity={0.7}
                      >
                        <View style={styles.contentHeader}>
                          <Text style={styles.stepIndex}>{t('goal.roadmap.step', { n: idx + 1 })}</Text>
                          {isCurrent && (
                            <View style={styles.currentBadge}>
                              <MapPin size={10} color="#fff" strokeWidth={2.6} />
                              <Text style={styles.currentBadgeText}>{t('goal.roadmap.currentPosition')}</Text>
                            </View>
                          )}
                        </View>
                        <Text
                          style={[
                            styles.stepTitle,
                            isDone && styles.stepTitleDone,
                          ]}
                          numberOfLines={2}
                        >
                          {m.title}
                        </Text>
                        {m.target_date && (
                          <View style={styles.targetDateRow}>
                            <Calendar size={11} color="#94A3B8" strokeWidth={2.4} />
                            <Text style={styles.targetDateText}>{fmtTargetDate(m.target_date, t)}</Text>
                          </View>
                        )}
                        {m.description && (
                          <Text style={styles.stepDescription} numberOfLines={2}>
                            {m.description}
                          </Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  );
                })}

                {/* Add button after last step */}
                <TouchableOpacity
                  style={styles.addRow}
                  onPress={handleAddMilestone}
                  activeOpacity={0.7}
                >
                  <Plus size={15} color="#475569" strokeWidth={2.4} />
                  <Text style={styles.addRowText}>{t('goal.roadmap.addStep')}</Text>
                </TouchableOpacity>

                {/* Secondary AI consultation link */}
                <TouchableOpacity
                  style={styles.aiInlineBtn}
                  onPress={handleAskAI}
                  activeOpacity={0.85}
                >
                  <Sparkles size={13} color="#8B5CF6" strokeWidth={2.4} />
                  <Text style={styles.aiInlineBtnText}>{t('goal.roadmap.reviewWithAI')}</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>

      {/* Sub-modal: edit goal */}
      <GoalEditorModal
        visible={editorVisible}
        level={goal.level}
        initialGoal={goal}
        onClose={() => setEditorVisible(false)}
        onSaved={() => {
          onGoalChanged();
        }}
      />

      {/* Sub-modal: edit/add milestone */}
      <MilestoneEditModal
        visible={milestoneEditorVisible}
        goalId={goal.id}
        initialMilestone={activeMilestone}
        nextSortOrder={nextSortOrder}
        onClose={() => setMilestoneEditorVisible(false)}
        onSaved={() => {
          loadMilestones();
          onGoalChanged();
        }}
      />
    </Modal>
  );
}

const cardShadow = Platform.select({
  ios: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
  },
  android: { elevation: 1 },
  default: {},
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFBFF' },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 6, paddingBottom: 12,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  levelBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999,
  },
  levelBadgeText: { fontSize: 11.5, fontWeight: '700', letterSpacing: 0.2 },
  periodText: { fontSize: 11, color: '#94A3B8', fontWeight: '600' },
  closeBtn: {
    width: 32, height: 32, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#E2E8F0',
  },

  // Scroll content
  scrollContent: { paddingHorizontal: 16, paddingBottom: 40 },

  // Goal card
  goalCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
    marginBottom: 22,
    ...cardShadow,
  },
  goalTitle: { fontSize: 19, fontWeight: '700', color: '#0F172A', lineHeight: 26 },
  goalTitleDone: { textDecorationLine: 'line-through', color: '#94A3B8' },
  goalDescription: { fontSize: 14, color: '#475569', marginTop: 8, lineHeight: 21 },
  editGoalBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf: 'flex-start', marginTop: 12,
    paddingHorizontal: 11, paddingVertical: 7,
    backgroundColor: '#F1F5F9', borderRadius: 9,
  },
  editGoalBtnText: { fontSize: 12, color: '#475569', fontWeight: '600' },

  // Roadmap section
  roadmapSection: { },
  roadmapHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 14,
  },
  roadmapTitle: { fontSize: 16, fontWeight: '700', color: '#0F172A' },
  progressBadge: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999,
    backgroundColor: '#EEF2FF',
  },
  progressBadgeText: { fontSize: 11.5, color: '#4F46E5', fontWeight: '700' },

  loadingWrap: { paddingVertical: 30, alignItems: 'center' },

  // Empty state
  emptyState: {
    alignItems: 'center', paddingVertical: 24, paddingHorizontal: 12,
    backgroundColor: '#fff', borderRadius: 14,
    borderWidth: 1, borderColor: '#E2E8F0',
    ...cardShadow,
  },
  emptyIconBg: {
    width: 56, height: 56, borderRadius: 18,
    backgroundColor: '#F3F0FF',
    alignItems: 'center', justifyContent: 'center', marginBottom: 14,
  },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: '#0F172A' },
  emptySub: {
    fontSize: 12.5, color: '#64748B', textAlign: 'center',
    marginTop: 8, lineHeight: 19,
  },
  emptyAddBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 18, paddingVertical: 11, borderRadius: 11,
    backgroundColor: '#0F172A', marginTop: 16,
  },
  emptyAddBtnText: { fontSize: 14, color: '#fff', fontWeight: '700' },
  emptyAIBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    paddingHorizontal: 18, paddingVertical: 12, borderRadius: 12,
    backgroundColor: '#8B5CF6', marginTop: 18,
    ...(Platform.OS === 'ios'
      ? { shadowColor: '#8B5CF6', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.25, shadowRadius: 6 }
      : { elevation: 3 }),
  },
  emptyAIBtnText: { fontSize: 14, color: '#fff', fontWeight: '700' },
  emptyManualBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 14, paddingVertical: 8,
    marginTop: 10,
  },
  emptyManualBtnText: { fontSize: 12.5, color: '#475569', fontWeight: '600' },

  // Timeline
  timeline: { },
  row: { flexDirection: 'row', minHeight: 80 },
  track: { width: 36, alignItems: 'center' },
  lineHalf: {
    position: 'absolute',
    left: '50%',
    width: 2,
    marginLeft: -1,
  },
  lineTopHalf: { top: 0, height: '50%' },
  lineBottomHalf: { bottom: 0, height: '50%' },
  lineDone: { backgroundColor: '#10B981' },
  lineFuture: { backgroundColor: '#E2E8F0' },
  circle: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    marginTop: 16,
    zIndex: 2,
  },
  circleDone: {
    backgroundColor: '#10B981',
    borderWidth: 3, borderColor: '#fff',
  },
  circleCurrent: {
    backgroundColor: '#6366F1',
    borderWidth: 3, borderColor: '#fff',
    ...(Platform.OS === 'ios'
      ? { shadowColor: '#6366F1', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.4, shadowRadius: 6 }
      : { elevation: 4 }),
  },
  circleFuture: {
    backgroundColor: '#F1F5F9',
    borderWidth: 2, borderColor: '#CBD5E1',
  },
  currentDot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: '#fff',
  },

  // Content (step body)
  contentBtn: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0',
    paddingHorizontal: 13, paddingVertical: 11,
    marginVertical: 8,
    marginLeft: 4,
  },
  contentBtnCurrent: {
    borderColor: '#C7D2FE', borderWidth: 1.5,
    backgroundColor: '#FAFAFF',
  },
  contentBtnDone: {
    backgroundColor: '#F8FAFC',
  },
  contentHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 4,
  },
  stepIndex: {
    fontSize: 10, fontWeight: '700', color: '#94A3B8',
    letterSpacing: 0.5,
  },
  currentBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 7, paddingVertical: 3, borderRadius: 999,
    backgroundColor: '#6366F1',
  },
  currentBadgeText: { fontSize: 10, color: '#fff', fontWeight: '700' },
  stepTitle: {
    fontSize: 14.5, fontWeight: '600', color: '#0F172A',
    lineHeight: 20,
  },
  stepTitleDone: {
    textDecorationLine: 'line-through', color: '#94A3B8',
  },
  targetDateRow: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    marginTop: 5,
  },
  targetDateText: { fontSize: 11, color: '#94A3B8', fontWeight: '600' },
  stepDescription: {
    fontSize: 12, color: '#64748B', marginTop: 5, lineHeight: 17,
  },

  // Add row
  addRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 12,
    marginTop: 6,
    marginLeft: 40,  // align with content column
    backgroundColor: '#FAFBFF',
    borderRadius: 11,
    borderWidth: 1, borderStyle: 'dashed', borderColor: '#CBD5E1',
  },
  addRowText: { fontSize: 13, color: '#475569', fontWeight: '600' },

  // Inline AI consultation button (when milestones already exist)
  aiInlineBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    paddingVertical: 9, marginTop: 8,
    marginLeft: 40,
    backgroundColor: '#F3F0FF',
    borderRadius: 9,
  },
  aiInlineBtnText: { fontSize: 12, color: '#8B5CF6', fontWeight: '600' },
});
