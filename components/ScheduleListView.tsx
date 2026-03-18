import { useRef, useMemo } from 'react';
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

const ROW_HEIGHT = 48;
const INTERVAL = 10;
const HOUR_LABELS = Array.from({ length: 25 }, (_, i) => i);

interface Props {
  schedules: Schedule[];
  onSlotPress: (startMinutes: number) => void;
  onSchedulePress: (schedule: Schedule) => void;
}

export default function ScheduleListView({ schedules, onSlotPress, onSchedulePress }: Props) {
  const scrollRef = useRef<ScrollView>(null);

  const scheduleMap = useMemo(() => {
    const map = new Map<number, Schedule[]>();
    for (const s of schedules) {
      const startSlot = Math.floor(s.start_minutes / INTERVAL);
      const endSlot = Math.ceil(s.end_minutes / INTERVAL);
      for (let i = startSlot; i < endSlot; i++) {
        if (!map.has(i)) map.set(i, []);
        map.get(i)!.push(s);
      }
    }
    return map;
  }, [schedules]);

  const renderedIds = new Set<string>();

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {HOUR_LABELS.map(hour => {
        const slots = hour < 24 ? Array.from({ length: 6 }, (_, i) => hour * 6 + i) : [];
        const isLastHour = hour === 24;

        return (
          <View key={hour} style={styles.hourBlock}>
            <View style={styles.timeColumn}>
              <Text style={styles.hourLabel}>{hour}:00</Text>
            </View>
            <View style={styles.slotColumn}>
              {isLastHour ? (
                <View style={styles.hourDivider} />
              ) : (
                slots.map((slotIdx) => {
                  const startMin = slotIdx * INTERVAL;
                  const isHourStart = slotIdx % 6 === 0;
                  const isHalfHour = slotIdx % 3 === 0 && !isHourStart;
                  const itemsHere = scheduleMap.get(slotIdx) || [];
                  const primaryItem = itemsHere.find(s => !renderedIds.has(s.id));

                  if (primaryItem) {
                    renderedIds.add(primaryItem.id);
                    const spanSlots = Math.ceil((primaryItem.end_minutes - primaryItem.start_minutes) / INTERVAL);
                    const blockHeight = spanSlots * ROW_HEIGHT - 2;

                    return (
                      <View key={slotIdx} style={[styles.slotRow, { height: ROW_HEIGHT }]}>
                        <View style={[styles.slotDivider, isHourStart && styles.hourSlotDivider, isHalfHour && styles.halfHourDivider]} />
                        <TouchableOpacity
                          style={[
                            styles.scheduleBlock,
                            {
                              backgroundColor: primaryItem.color + '20',
                              borderLeftColor: primaryItem.color,
                              height: blockHeight,
                              zIndex: 10,
                            },
                          ]}
                          onPress={() => onSchedulePress(primaryItem)}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.scheduleTitle, { color: primaryItem.color }]} numberOfLines={1}>
                            {primaryItem.title}
                          </Text>
                          <Text style={[styles.scheduleTime, { color: primaryItem.color }]}>
                            {minutesToTimeString(primaryItem.start_minutes)} - {minutesToTimeString(primaryItem.end_minutes)}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    );
                  }

                  const isOccupied = itemsHere.length > 0;

                  return (
                    <TouchableOpacity
                      key={slotIdx}
                      style={[styles.slotRow, { height: ROW_HEIGHT }, !isOccupied && styles.emptySlotRow]}
                      onPress={() => !isOccupied && onSlotPress(startMin)}
                      activeOpacity={isOccupied ? 1 : 0.5}
                    >
                      <View style={[styles.slotDivider, isHourStart && styles.hourSlotDivider, isHalfHour && styles.halfHourDivider]} />
                      {!isOccupied && isHourStart && (
                        <View style={styles.addRow}>
                          <Plus size={14} color="#bbb" />
                          <Text style={styles.addHintText}>タップして追加</Text>
                        </View>
                      )}
                      {!isOccupied && isHalfHour && (
                        <View style={styles.halfHourLabel}>
                          <Text style={styles.halfHourText}>{hour}:30</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })
              )}
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingBottom: 40,
  },
  hourBlock: {
    flexDirection: 'row',
  },
  timeColumn: {
    width: 52,
    alignItems: 'flex-end',
    paddingRight: 10,
  },
  hourLabel: {
    fontSize: 11,
    color: '#999',
    fontWeight: '500',
    marginTop: -7,
  },
  slotColumn: {
    flex: 1,
    borderLeftWidth: 1,
    borderLeftColor: '#e5e5e5',
  },
  slotRow: {
    justifyContent: 'center',
    paddingLeft: 8,
    position: 'relative',
  },
  emptySlotRow: {
    backgroundColor: 'transparent',
  },
  slotDivider: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: '#f5f5f5',
  },
  hourSlotDivider: {
    backgroundColor: '#e0e0e0',
    height: 1,
  },
  halfHourDivider: {
    backgroundColor: '#ebebeb',
    height: 1,
  },
  hourDivider: {
    height: 1,
    backgroundColor: '#e0e0e0',
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    opacity: 0.6,
    paddingVertical: 4,
  },
  addHintText: {
    fontSize: 12,
    color: '#bbb',
    fontWeight: '400',
  },
  halfHourLabel: {
    position: 'absolute',
    left: -52,
    top: -7,
    width: 42,
    alignItems: 'flex-end',
    paddingRight: 2,
  },
  halfHourText: {
    fontSize: 10,
    color: '#c0c0c0',
    fontWeight: '400',
  },
  scheduleBlock: {
    position: 'absolute',
    left: 4,
    right: 8,
    top: 1,
    borderLeftWidth: 3,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    overflow: 'hidden',
  },
  scheduleTitle: {
    fontSize: 13,
    fontWeight: '600',
  },
  scheduleTime: {
    fontSize: 11,
    marginTop: 2,
    opacity: 0.8,
  },
});
