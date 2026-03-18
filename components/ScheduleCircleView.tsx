import { useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
} from 'react-native';
import Svg, { Circle, Path, G, Text as SvgText, Line, Rect } from 'react-native-svg';
import { Schedule } from '@/types/database';
import { minutesToTimeString } from '@/lib/scheduleUtils';

const SCREEN_WIDTH = Dimensions.get('window').width;
const CHART_SIZE = Math.min(SCREEN_WIDTH - 48, 360);
const CENTER = CHART_SIZE / 2;
const OUTER_RADIUS = CHART_SIZE / 2 - 8;
const INNER_RADIUS = OUTER_RADIUS * 0.42;
const SLOT_INTERVAL = 30;
const TOTAL_SLOTS = 48;

interface Props {
  schedules: Schedule[];
  onEmptyPress: (startMinutes: number) => void;
  onSchedulePress: (schedule: Schedule) => void;
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const angleRad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(angleRad),
    y: cy + r * Math.sin(angleRad),
  };
}

function minutesToAngle(minutes: number): number {
  return (minutes / 1440) * 360;
}

function createWedgePath(
  cx: number, cy: number,
  innerR: number, outerR: number,
  startAngle: number, endAngle: number
): string {
  const outerStart = polarToCartesian(cx, cy, outerR, startAngle);
  const outerEnd = polarToCartesian(cx, cy, outerR, endAngle);
  const innerStart = polarToCartesian(cx, cy, innerR, startAngle);
  const innerEnd = polarToCartesian(cx, cy, innerR, endAngle);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;

  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${outerR} ${outerR} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${innerR} ${innerR} 0 ${largeArc} 0 ${innerStart.x} ${innerStart.y}`,
    'Z',
  ].join(' ');
}

export default function ScheduleCircleView({ schedules, onEmptyPress, onSchedulePress }: Props) {
  const hourMarkers = useMemo(() => {
    return Array.from({ length: 48 }, (_, i) => {
      const minutes = i * 30;
      const angle = minutesToAngle(minutes);
      const isHour = i % 2 === 0;
      const hour = Math.floor(minutes / 60);
      const outerPoint = polarToCartesian(CENTER, CENTER, OUTER_RADIUS, angle);
      const tickInner = polarToCartesian(CENTER, CENTER, OUTER_RADIUS - (isHour ? 8 : 4), angle);
      const labelPoint = polarToCartesian(CENTER, CENTER, INNER_RADIUS - 12, angle);
      const isMajor = minutes % 180 === 0;
      return { minutes, hour, angle, outerPoint, tickInner, labelPoint, isHour, isMajor };
    });
  }, []);

  const segments = useMemo(() => {
    return schedules.map(s => {
      const startAngle = minutesToAngle(s.start_minutes);
      const endAngle = minutesToAngle(s.end_minutes);
      const midAngle = (startAngle + endAngle) / 2;
      const arcPath = createWedgePath(CENTER, CENTER, INNER_RADIUS, OUTER_RADIUS, startAngle, endAngle);
      const labelPos = polarToCartesian(CENTER, CENTER, (INNER_RADIUS + OUTER_RADIUS) / 2, midAngle);
      return { ...s, startAngle, endAngle, arcPath, labelPos };
    });
  }, [schedules]);

  const emptySlots = useMemo(() => {
    const occupied = new Set<number>();
    for (const s of schedules) {
      const startSlot = Math.floor(s.start_minutes / SLOT_INTERVAL);
      const endSlot = Math.ceil(s.end_minutes / SLOT_INTERVAL);
      for (let i = startSlot; i < endSlot; i++) {
        occupied.add(i);
      }
    }
    const slots: { slotIndex: number; startMin: number; startAngle: number; endAngle: number; path: string }[] = [];
    for (let i = 0; i < TOTAL_SLOTS; i++) {
      if (!occupied.has(i)) {
        const startMin = i * SLOT_INTERVAL;
        const endMin = startMin + SLOT_INTERVAL;
        const startAngle = minutesToAngle(startMin);
        const endAngle = minutesToAngle(endMin);
        const path = createWedgePath(CENTER, CENTER, INNER_RADIUS, OUTER_RADIUS, startAngle, endAngle);
        slots.push({ slotIndex: i, startMin, startAngle, endAngle, path });
      }
    }
    return slots;
  }, [schedules]);

  const totalScheduled = useMemo(() => {
    return schedules.reduce((sum, s) => sum + (s.end_minutes - s.start_minutes), 0);
  }, [schedules]);

  const freeMinutes = 1440 - totalScheduled;
  const freeHours = Math.floor(freeMinutes / 60);
  const freeMins = freeMinutes % 60;

  const handleSlotPress = useCallback((startMin: number) => {
    onEmptyPress(startMin);
  }, [onEmptyPress]);

  return (
    <View style={styles.container}>
      <View style={styles.chartWrapper}>
        <Svg width={CHART_SIZE} height={CHART_SIZE}>
          <Circle
            cx={CENTER}
            cy={CENTER}
            r={OUTER_RADIUS}
            fill="#f8f9fa"
            stroke="#e0e0e0"
            strokeWidth={1}
          />
          <Circle
            cx={CENTER}
            cy={CENTER}
            r={INNER_RADIUS}
            fill="#fff"
            stroke="#e8e8e8"
            strokeWidth={1}
          />

          {hourMarkers.map(({ minutes, hour, outerPoint, tickInner, labelPoint, isHour, isMajor }) => (
            <G key={minutes}>
              <Line
                x1={tickInner.x}
                y1={tickInner.y}
                x2={outerPoint.x}
                y2={outerPoint.y}
                stroke={isHour ? (isMajor ? '#aaa' : '#ccc') : '#e0e0e0'}
                strokeWidth={isHour ? (isMajor ? 1.5 : 1) : 0.5}
              />
              {isMajor && (
                <SvgText
                  x={labelPoint.x}
                  y={labelPoint.y}
                  fill="#888"
                  fontSize={11}
                  fontWeight="600"
                  textAnchor="middle"
                  alignmentBaseline="central"
                >
                  {hour}
                </SvgText>
              )}
              {isHour && !isMajor && (
                <SvgText
                  x={labelPoint.x}
                  y={labelPoint.y}
                  fill="#bbb"
                  fontSize={9}
                  fontWeight="400"
                  textAnchor="middle"
                  alignmentBaseline="central"
                >
                  {hour}
                </SvgText>
              )}
            </G>
          ))}

          {emptySlots.map(slot => (
            <Path
              key={`empty-${slot.slotIndex}`}
              d={slot.path}
              fill="transparent"
              stroke="transparent"
              strokeWidth={0}
              onPress={() => handleSlotPress(slot.startMin)}
            />
          ))}

          {segments.map(seg => (
            <Path
              key={seg.id}
              d={seg.arcPath}
              fill={seg.color + 'CC'}
              stroke="#fff"
              strokeWidth={1.5}
              onPress={() => onSchedulePress(seg as Schedule)}
            />
          ))}

          {segments.map(seg => {
            const span = seg.endAngle - seg.startAngle;
            if (span < 10) return null;
            return (
              <SvgText
                key={`label-${seg.id}`}
                x={seg.labelPos.x}
                y={seg.labelPos.y}
                fill="#fff"
                fontSize={span > 30 ? 10 : 8}
                fontWeight="600"
                textAnchor="middle"
                alignmentBaseline="central"
                onPress={() => onSchedulePress(seg as Schedule)}
              >
                {seg.title.length > 6 ? seg.title.slice(0, 5) + '..' : seg.title}
              </SvgText>
            );
          })}
        </Svg>

        <View style={[styles.centerInfo, { top: CENTER - 28, left: CENTER - 44, width: 88 }]}>
          <Text style={styles.centerFreeLabel}>空き時間</Text>
          <Text style={styles.centerFreeTime}>
            {freeHours}h{freeMins > 0 ? ` ${freeMins}m` : ''}
          </Text>
          <Text style={styles.centerHint}>タップで追加</Text>
        </View>
      </View>

      <ScrollView style={styles.legend} showsVerticalScrollIndicator={false}>
        {schedules.length === 0 ? (
          <View style={styles.emptyLegend}>
            <Text style={styles.emptyText}>予定がありません</Text>
            <Text style={styles.emptySubText}>円グラフの空き時間をタップして追加</Text>
          </View>
        ) : (
          [...schedules]
            .sort((a, b) => a.start_minutes - b.start_minutes)
            .map(s => (
              <TouchableOpacity
                key={s.id}
                style={styles.legendItem}
                onPress={() => onSchedulePress(s)}
                activeOpacity={0.6}
              >
                <View style={[styles.legendDot, { backgroundColor: s.color }]} />
                <View style={styles.legendContent}>
                  <Text style={styles.legendTitle} numberOfLines={1}>{s.title}</Text>
                  <Text style={styles.legendTime}>
                    {minutesToTimeString(s.start_minutes)} - {minutesToTimeString(s.end_minutes)}
                  </Text>
                </View>
                <Text style={styles.legendDuration}>
                  {Math.round((s.end_minutes - s.start_minutes) / 60 * 10) / 10}h
                </Text>
              </TouchableOpacity>
            ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  chartWrapper: {
    alignItems: 'center',
    paddingVertical: 16,
    position: 'relative',
  },
  centerInfo: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerFreeLabel: {
    fontSize: 10,
    color: '#aaa',
    fontWeight: '500',
  },
  centerFreeTime: {
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
    marginTop: 2,
  },
  centerHint: {
    fontSize: 9,
    color: '#ccc',
    marginTop: 4,
  },
  legend: {
    flex: 1,
    paddingHorizontal: 20,
  },
  emptyLegend: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  emptyText: {
    fontSize: 15,
    color: '#999',
    fontWeight: '500',
  },
  emptySubText: {
    fontSize: 13,
    color: '#bbb',
    marginTop: 4,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: '#fff',
    borderRadius: 10,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#f0f0f0',
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 12,
  },
  legendContent: {
    flex: 1,
  },
  legendTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#222',
  },
  legendTime: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
  legendDuration: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
    marginLeft: 8,
  },
});
