import { useRef, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { Plus } from 'lucide-react-native';
import { Schedule } from '@/types/database';
import { minutesToTimeString } from '@/lib/scheduleUtils';

const HOUR_HEIGHT = 64;
const HOURS = Array.from({ length: 25 }, (_, i) => i);

interface Props {
  schedules: Schedule[];
  onSlotPress: (startMinutes: number) => void;
  onSchedulePress: (schedule: Schedule) => void;
}

export default function ScheduleListView({ schedules, onSlotPress, onSchedulePress }: Props) {
  const scrollRef = useRef<ScrollView>(null);

  const positionedSchedules = useMemo(() => {
    const sorted = [...schedules].sort((a, b) => a.start_minutes - b.start_minutes);

    const columns: Schedule[][] = [];
    const colAssignment = new Map<string, number>();

    for (const s of sorted) {
      let placed = false;
      for (let c = 0; c < columns.length; c++) {
        const lastInCol = columns[c][columns[c].length - 1];
        if (lastInCol.end_minutes <= s.start_minutes) {
          columns[c].push(s);
          colAssignment.set(s.id, c);
          placed = true;
          break;
        }
      }
      if (!placed) {
        columns.push([s]);
        colAssignment.set(s.id, columns.length - 1);
      }
    }

    const totalCols = Math.max(columns.length, 1);

    return sorted.map(s => {
      const col = colAssignment.get(s.id) || 0;
      const top = (s.start_minutes / 60) * HOUR_HEIGHT;
      const height = Math.max(((s.end_minutes - s.start_minutes) / 60) * HOUR_HEIGHT, 24);
      const widthPercent = 100 / totalCols;
      const leftPercent = col * widthPercent;
      return { schedule: s, top, height, widthPercent, leftPercent };
    });
  }, [schedules]);

  const occupiedHours = useMemo(() => {
    const set = new Set<number>();
    for (const s of schedules) {
      const startH = Math.floor(s.start_minutes / 60);
      const endH = Math.ceil(s.end_minutes / 60);
      for (let h = startH; h < endH; h++) set.add(h);
    }
    return set;
  }, [schedules]);

  const currentHourLine = useMemo(() => {
    const now = new Date();
    const minutes = now.getHours() * 60 + now.getMinutes();
    return (minutes / 60) * HOUR_HEIGHT;
  }, []);

  const scrollToNowLine = useCallback(() => {
    const targetY = Math.max(currentHourLine, 0);
    scrollRef.current?.scrollTo({ y: targetY, animated: false });
  }, [currentHourLine]);

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      onLayout={scrollToNowLine}
      onContentSizeChange={scrollToNowLine}
    >
      <View style={styles.timeline}>
        <View style={styles.timeLabels}>
          {HOURS.map(hour => (
            <View key={hour} style={[styles.timeLabelRow, { height: hour < 24 ? HOUR_HEIGHT : 0 }]}>
              <Text style={styles.timeText}>
                {hour.toString().padStart(2, '0')}:00
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.gridArea}>
          {HOURS.map(hour => (
            <View key={hour} style={{ height: hour < 24 ? HOUR_HEIGHT : 0 }}>
              <View style={styles.hourLine} />
              {hour < 24 && (
                <View style={styles.halfHourLine} />
              )}
            </View>
          ))}

          <View style={[styles.nowLine, { top: currentHourLine }]}>
            <View style={styles.nowDot} />
            <View style={styles.nowLineBar} />
          </View>

          {HOURS.filter(h => h < 24 && !occupiedHours.has(h)).map(hour => (
            <TouchableOpacity
              key={`slot-${hour}`}
              style={[
                styles.emptySlot,
                { top: hour * HOUR_HEIGHT, height: HOUR_HEIGHT },
              ]}
              onPress={() => onSlotPress(hour * 60)}
              activeOpacity={0.4}
            >
              <View style={styles.addIndicator}>
                <Plus size={12} color="#ccc" />
              </View>
            </TouchableOpacity>
          ))}

          {positionedSchedules.map(({ schedule: s, top, height, widthPercent, leftPercent }) => (
            <TouchableOpacity
              key={s.id}
              style={[
                styles.eventCard,
                {
                  top,
                  height,
                  left: `${leftPercent + 0.5}%` as any,
                  width: `${widthPercent - 1}%` as any,
                  backgroundColor: s.color + '18',
                  borderLeftColor: s.color,
                },
              ]}
              onPress={() => onSchedulePress(s)}
              activeOpacity={0.7}
            >
              <Text
                style={[styles.eventTitle, { color: s.color }]}
                numberOfLines={height < 40 ? 1 : 2}
              >
                {s.title}
              </Text>
              {height >= 36 && (
                <Text style={[styles.eventTime, { color: s.color }]}>
                  {minutesToTimeString(s.start_minutes)} - {minutesToTimeString(s.end_minutes)}
                </Text>
              )}
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    paddingBottom: 48,
  },
  timeline: {
    flexDirection: 'row',
  },
  timeLabels: {
    width: 56,
    paddingTop: 0,
  },
  timeLabelRow: {
    justifyContent: 'flex-start',
    paddingRight: 8,
    alignItems: 'flex-end',
  },
  timeText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#aaa',
    marginTop: -7,
  },
  gridArea: {
    flex: 1,
    position: 'relative',
    borderLeftWidth: 1,
    borderLeftColor: '#eaeaea',
  },
  hourLine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: '#eaeaea',
  },
  halfHourLine: {
    position: 'absolute',
    top: HOUR_HEIGHT / 2,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: '#f4f4f4',
  },
  nowLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 50,
  },
  nowDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E8654A',
    marginLeft: -4,
  },
  nowLineBar: {
    flex: 1,
    height: 1.5,
    backgroundColor: '#E8654A',
  },
  emptySlot: {
    position: 'absolute',
    left: 0,
    right: 0,
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingRight: 12,
    zIndex: 1,
  },
  addIndicator: {
    opacity: 0,
  },
  eventCard: {
    position: 'absolute',
    borderLeftWidth: 3,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    zIndex: 10,
    overflow: 'hidden',
  },
  eventTitle: {
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 17,
  },
  eventTime: {
    fontSize: 11,
    fontWeight: '400',
    opacity: 0.75,
    marginTop: 1,
  },
});
