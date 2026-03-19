import { useMemo, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
} from 'react-native';
import Svg, { Circle, Path, G, Text as SvgText, Line } from 'react-native-svg';
import { Plus } from 'lucide-react-native';
import { Schedule } from '@/types/database';
import { minutesToTimeString } from '@/lib/scheduleUtils';

const SCREEN_WIDTH = Dimensions.get('window').width;
const CHART_SIZE = Math.min(SCREEN_WIDTH - 32, 380);
const CENTER = CHART_SIZE / 2;
const OUTER_RADIUS = CHART_SIZE / 2 - 4;
const LABEL_RADIUS = OUTER_RADIUS + 1;
const TICK_OUTER = OUTER_RADIUS;
const TICK_INNER = OUTER_RADIUS - 10;

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

function createPieSlicePath(
  cx: number, cy: number,
  radius: number,
  startAngle: number, endAngle: number
): string {
  let sweep = endAngle - startAngle;
  if (sweep <= 0) return '';
  if (sweep >= 360) sweep = 359.99;
  const start = polarToCartesian(cx, cy, radius, startAngle);
  const end = polarToCartesian(cx, cy, radius, endAngle);
  const largeArc = sweep > 180 ? 1 : 0;

  return [
    `M ${cx} ${cy}`,
    `L ${start.x} ${start.y}`,
    `A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y}`,
    'Z',
  ].join(' ');
}

export default function ScheduleCircleView({ schedules, onEmptyPress, onSchedulePress }: Props) {
  const [now, setNow] = useState(new Date());
  const [tappedHour, setTappedHour] = useState<number | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (tappedHour !== null) {
      const timeout = setTimeout(() => setTappedHour(null), 600);
      return () => clearTimeout(timeout);
    }
  }, [tappedHour]);

  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const currentTimeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
  const handAngle = minutesToAngle(currentMinutes);
  const handEnd = polarToCartesian(CENTER, CENTER, OUTER_RADIUS - 30, handAngle);

  const hourLabels = useMemo(() => {
    return Array.from({ length: 24 }, (_, i) => {
      const angle = (i / 24) * 360;
      const labelPos = polarToCartesian(CENTER, CENTER, LABEL_RADIUS - 22, angle);
      const tickO = polarToCartesian(CENTER, CENTER, TICK_OUTER, angle);
      const tickI = polarToCartesian(CENTER, CENTER, TICK_INNER, angle);
      return { hour: i, angle, labelPos, tickO, tickI };
    });
  }, []);

  const scheduleSegments = useMemo(() => {
    return schedules.map(s => {
      const startAngle = minutesToAngle(s.start_minutes);
      const endAngle = minutesToAngle(s.end_minutes);
      const path = createPieSlicePath(CENTER, CENTER, OUTER_RADIUS, startAngle, endAngle);
      const durationMin = s.end_minutes - s.start_minutes;
      const hourCount = Math.ceil(durationMin / 60);
      const hourDividers: { angle: number }[] = [];
      for (let i = 1; i < hourCount; i++) {
        const divMin = s.start_minutes + i * 60;
        if (divMin < s.end_minutes) {
          hourDividers.push({ angle: minutesToAngle(divMin) });
        }
      }

      const hourLabelsInSegment: { pos: { x: number; y: number }; label: string }[] = [];
      const segHours = Math.max(1, Math.floor(durationMin / 60));
      const remainder = durationMin % 60;

      for (let i = 0; i < segHours; i++) {
        const slotStart = s.start_minutes + i * 60;
        const slotEnd = Math.min(slotStart + 60, s.end_minutes);
        const slotDur = slotEnd - slotStart;
        const midMin = slotStart + slotDur / 2;
        const midAngle = minutesToAngle(midMin);
        const labelR = OUTER_RADIUS * 0.5;
        const pos = polarToCartesian(CENTER, CENTER, labelR, midAngle);
        const h = Math.floor(slotDur / 60);
        const m = slotDur % 60;
        const label = h > 0 ? `${h}:${m.toString().padStart(2, '0')}` : `0:${m.toString().padStart(2, '0')}`;
        hourLabelsInSegment.push({ pos, label });
      }

      if (remainder > 0 && segHours > 0) {
        const lastSlotStart = s.start_minutes + segHours * 60;
        if (lastSlotStart < s.end_minutes) {
          const slotDur = s.end_minutes - lastSlotStart;
          const midMin = lastSlotStart + slotDur / 2;
          const midAngle = minutesToAngle(midMin);
          const labelR = OUTER_RADIUS * 0.5;
          const pos = polarToCartesian(CENTER, CENTER, labelR, midAngle);
          const m = slotDur;
          hourLabelsInSegment.push({ pos, label: `0:${m.toString().padStart(2, '0')}` });
        }
      }

      return { ...s, path, startAngle, endAngle, hourDividers, hourLabelsInSegment, durationMin };
    });
  }, [schedules]);

  const emptyHourSlots = useMemo(() => {
    const occupied = new Set<number>();
    for (const s of schedules) {
      const startSlot = Math.floor(s.start_minutes / 60);
      const endSlot = Math.ceil(s.end_minutes / 60);
      for (let i = startSlot; i < endSlot; i++) occupied.add(i);
    }
    const slots: { hour: number; path: string }[] = [];
    for (let h = 0; h < 24; h++) {
      if (!occupied.has(h)) {
        const startAngle = minutesToAngle(h * 60);
        const endAngle = minutesToAngle((h + 1) * 60);
        const path = createPieSlicePath(CENTER, CENTER, OUTER_RADIUS, startAngle, endAngle);
        slots.push({ hour: h, path });
      }
    }
    return slots;
  }, [schedules]);

  const handleHourTap = (hour: number) => {
    setTappedHour(hour);
    onEmptyPress(hour * 60);
  };

  return (
    <View style={styles.container}>
      <View style={styles.chartWrapper}>
        <Svg width={CHART_SIZE} height={CHART_SIZE}>
          <Circle
            cx={CENTER}
            cy={CENTER}
            r={OUTER_RADIUS}
            fill="#a8a8a8"
          />

          {emptyHourSlots.map(slot => (
            <Path
              key={`empty-${slot.hour}`}
              d={slot.path}
              fill={tappedHour === slot.hour ? '#8a8a8a' : 'transparent'}
              onPress={() => handleHourTap(slot.hour)}
            />
          ))}

          {scheduleSegments.map(seg => (
            <G key={seg.id}>
              <Path
                d={seg.path}
                fill={seg.color}
                opacity={0.7}
                onPress={() => onSchedulePress(seg as unknown as Schedule)}
              />
              {seg.hourDividers.map((div, i) => {
                const lineEnd = polarToCartesian(CENTER, CENTER, OUTER_RADIUS, div.angle);
                return (
                  <Line
                    key={`div-${seg.id}-${i}`}
                    x1={CENTER}
                    y1={CENTER}
                    x2={lineEnd.x}
                    y2={lineEnd.y}
                    stroke="#fff"
                    strokeWidth={1}
                    opacity={0.6}
                  />
                );
              })}
              {seg.hourLabelsInSegment.map((hl, i) => {
                const angleDeg = minutesToAngle(
                  i === 0
                    ? seg.startAngle / 360 * 1440 + (Math.min(60, seg.durationMin)) / 2
                    : 0
                );
                return (
                  <SvgText
                    key={`hlbl-${seg.id}-${i}`}
                    x={hl.pos.x}
                    y={hl.pos.y}
                    fill="#fff"
                    fontSize={11}
                    fontWeight="500"
                    textAnchor="middle"
                    alignmentBaseline="central"
                    opacity={0.9}
                  >
                    {hl.label}
                  </SvgText>
                );
              })}
            </G>
          ))}

          {hourLabels.map(({ hour, tickO, tickI }) => {
            const hourMin = hour * 60;
            const isOnSchedule = schedules.some(s => s.start_minutes <= hourMin && s.end_minutes > hourMin);
            return (
              <Line
                key={`tick-${hour}`}
                x1={tickI.x}
                y1={tickI.y}
                x2={tickO.x}
                y2={tickO.y}
                stroke={isOnSchedule ? 'rgba(255,255,255,0.6)' : '#b0b0b0'}
                strokeWidth={1.5}
              />
            );
          })}

          {hourLabels.map(({ hour, labelPos }) => {
            const hourMin = hour * 60;
            const isOnSchedule = schedules.some(s => s.start_minutes <= hourMin && s.end_minutes > hourMin);
            return (
              <SvgText
                key={`lbl-${hour}`}
                x={labelPos.x}
                y={labelPos.y + 1}
                fill={isOnSchedule ? 'rgba(255,255,255,0.85)' : '#888'}
                fontSize={11}
                fontWeight="500"
                textAnchor="middle"
                alignmentBaseline="central"
              >
                {hour}
              </SvgText>
            );
          })}

          <Line
            x1={CENTER}
            y1={CENTER}
            x2={handEnd.x}
            y2={handEnd.y}
            stroke="#fff"
            strokeWidth={1.5}
            strokeLinecap="round"
          />
          <Circle
            cx={handEnd.x}
            cy={handEnd.y}
            r={3}
            fill="#fff"
          />
        </Svg>

        <View style={styles.centerOverlay} pointerEvents="none">
          <Text style={styles.centerTime}>{currentTimeStr}</Text>
        </View>
      </View>

      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => {
            const hour = Math.floor(currentMinutes / 60);
            onEmptyPress(hour * 60);
          }}
          activeOpacity={0.7}
        >
          <Plus size={28} color="#fff" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.legend} showsVerticalScrollIndicator={false}>
        {schedules.length === 0 ? (
          <View style={styles.emptyLegend}>
            <Text style={styles.emptyText}>予定がありません</Text>
            <Text style={styles.emptySubText}>+ ボタンまたは円グラフをタップして追加</Text>
          </View>
        ) : (
          [...schedules]
            .sort((a, b) => a.start_minutes - b.start_minutes)
            .map(s => {
              const durationMin = s.end_minutes - s.start_minutes;
              const dH = Math.floor(durationMin / 60);
              const dM = durationMin % 60;
              const dLabel = dH > 0 && dM > 0 ? `${dH}h${dM}m` : dH > 0 ? `${dH}h` : `${dM}m`;
              return (
                <TouchableOpacity
                  key={s.id}
                  style={styles.legendItem}
                  onPress={() => onSchedulePress(s)}
                  activeOpacity={0.6}
                >
                  <View style={[styles.legendBar, { backgroundColor: s.color }]} />
                  <View style={styles.legendContent}>
                    <Text style={styles.legendTitle} numberOfLines={1}>{s.title}</Text>
                    <Text style={styles.legendTime}>
                      {minutesToTimeString(s.start_minutes)} - {minutesToTimeString(s.end_minutes)}
                    </Text>
                  </View>
                  <Text style={styles.legendDuration}>{dLabel}</Text>
                </TouchableOpacity>
              );
            })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9f9f9',
  },
  chartWrapper: {
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 4,
    position: 'relative',
  },
  centerOverlay: {
    position: 'absolute',
    top: 12,
    left: 0,
    right: 0,
    bottom: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerTime: {
    fontSize: 28,
    fontWeight: '300',
    color: '#fff',
    letterSpacing: 2,
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: 24,
    paddingVertical: 8,
  },
  addButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#222',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  legend: {
    flex: 1,
    paddingHorizontal: 20,
  },
  emptyLegend: {
    alignItems: 'center',
    paddingVertical: 20,
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
    paddingHorizontal: 14,
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#f0f0f0',
  },
  legendBar: {
    width: 4,
    height: 32,
    borderRadius: 2,
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
