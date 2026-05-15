// Lean goal card: title is the focus.
//
// Removed from the visual:
//   - Period badge (the section header already shows the period)
//   - Description (only seen when editing — opens the editor modal)
//   - Verbose progress bar (replaced with a small X/Y count to the right)
//
// Kept:
//   - Check circle on the left (toggle complete; tap again to revert)
//   - Title (large, strike-through when completed)
//   - Tiny parent indicator if the goal links to a higher-level one
//   - Subtle progress count if the goal has linked todos

import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { CircleCheck as CheckCircle2, Circle, CornerDownRight } from 'lucide-react-native';
import type { Goal } from '@/types/database';

interface Props {
  goal: Goal;
  todoStats?: { total: number; completed: number };
  parentTitle?: string | null;
  onToggleComplete?: (goal: Goal) => void;
  onPress?: (goal: Goal) => void;
}

export default function GoalCard({ goal, todoStats, parentTitle, onToggleComplete, onPress }: Props) {
  const hasTodos = todoStats && todoStats.total > 0;
  const isDone = goal.is_completed;

  return (
    <TouchableOpacity
      style={[styles.card, isDone && styles.cardDone]}
      onPress={() => onPress?.(goal)}
      activeOpacity={0.85}
    >
      <TouchableOpacity
        style={styles.checkBtn}
        onPress={() => onToggleComplete?.(goal)}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        {isDone ? (
          <CheckCircle2 size={22} color="#10B981" strokeWidth={2.4} />
        ) : (
          <Circle size={22} color="#CBD5E1" strokeWidth={2} />
        )}
      </TouchableOpacity>

      <View style={styles.body}>
        <Text
          style={[styles.title, isDone && styles.titleDone]}
          numberOfLines={2}
        >
          {goal.title}
        </Text>

        {parentTitle ? (
          <View style={styles.parentRow}>
            <CornerDownRight size={10} color="#94A3B8" strokeWidth={2.4} />
            <Text style={styles.parentText} numberOfLines={1}>
              {parentTitle}
            </Text>
          </View>
        ) : null}
      </View>

      {hasTodos && (
        <Text style={[styles.progressText, isDone && styles.progressTextDone]}>
          {todoStats!.completed}/{todoStats!.total}
        </Text>
      )}
    </TouchableOpacity>
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
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 14,
    paddingVertical: 13,
    marginBottom: 8,
    gap: 12,
    ...cardShadow,
  },
  cardDone: {
    backgroundColor: '#F8FAFC',
    opacity: 0.65,
  },
  checkBtn: {
    paddingVertical: 1,
  },
  body: { flex: 1, minWidth: 0 },
  title: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0F172A',
    lineHeight: 21,
  },
  titleDone: {
    textDecorationLine: 'line-through',
    color: '#94A3B8',
  },
  parentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 4,
  },
  parentText: {
    flex: 1,
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '500',
  },
  progressText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6366F1',
    fontVariant: ['tabular-nums'],
    marginLeft: 6,
  },
  progressTextDone: {
    color: '#94A3B8',
  },
});
