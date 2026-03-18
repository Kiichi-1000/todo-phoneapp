import { useMemo } from 'react';
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
const CHART_SIZE = Math.min(SCREEN_WIDTH - 64, 340);
const CENTER = CHART_SIZE / 2;
const OUTER_RADIUS = CHART_SIZE / 2 - 8;
const INNER_RADIUS = OUTER_RADIUS * 0.45;
const LABEL_RADIUS = OUTER_RADIUS + 2;

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

function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArcFlag = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`;
}

function minutesToAngle(minutes: number): number {
  return (minutes / 1440) * 360;
}

export default function ScheduleCircleView({ schedules, onEmptyPress, onSchedulePress }: Props) {
  const hourMarkers = useMemo(() => {
    return Array.from({ length: 24 }, (_, i) => {
      const angle = (i / 24) * 360;
      const outerPoint = polarToCartesian(CENTER, CENTER, OUTER_RADIUS, angle);
      const tickInner = polarToCartesian(CENTER, CENTER, OUTER_RADIUS - 6, angle);
      const labelPoint = polarToCartesian(CENTER, CENTER, INNER_RADIUS - 10, angle);
      const isMajor = i % 3 === 0;
      return { hour: i, angle, outerPoint, tickInner, labelPoint, isMajor };
    });
  }, []);

  const segments = useMemo(() => {
    return schedules.map(s => {
      const startAngle = minutesToAngle(s.start_minutes);
      const endAngle = minutesToAngle(s.end_minutes);
      const midAngle = (startAngle + endAngle) / 2;
      const arcPath = createWedgePath(
        CENTER, CENTER,
        INNER_RADIUS, OUTER_RADIUS,
        startAngle, endAngle
      );
      const labelPos = polarToCartesian(CENTER, CENTER, (INNER_RADIUS + OUTER_RADIUS) / 2, midAngle);
      return { ...s, startAngle, endAngle, arcPath, labelPos };
    });
  }, [schedules]);

  const totalScheduled = useMemo(() => {
    return schedules.reduce((sum, s) => sum + (s.end_minutes - s.start_minutes), 0);
  }, [schedules]);

  const freeMinutes = 1440 - totalScheduled;
  const freeHours = Math.floor(freeMinutes / 60);
  const freeMins = freeMinutes % 60;

  const handleEmptyAreaPress = () => {
    const occupied = new Set<number>();
    for (const s of schedules) {
      for (let m = s.start_minutes; m < s.end_minutes; m += 10) {
        occupied.add(Math.floor(m / 10));
      }
    }
    for (let slot = 0; slot < 144; slot++) {
      if (!occupied.has(slot)) {
        onEmptyPress(slot * 10);
        return;
      }
    }
    onEmptyPress(0);
  };

  return (
    <View style={styles.container}>
      <View style={styles.chartWrapper}>
        <Svg width={CHART_SIZE} height={CHART_SIZE}>
          <Circle
            cx={CENTER}
            cy={CENTER}
            r={OUTER_RADIUS}
            fill="#f8f8f8"
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

          {hourMarkers.map(({ hour, outerPoint, tickInner, labelPoint, isMajor }) => (
            <G key={hour}>
              <Line
                x1={tickInner.x}
                y1={tickInner.y}
                x2={outerPoint.x}
                y2={outerPoint.y}
                stroke={isMajor ? '#bbb' : '#ddd'}
                strokeWidth={isMajor ? 1.5 : 0.5}
              />
              {isMajor && (
                <SvgText
                  x={labelPoint.x}
                  y={labelPoint.y}
                  fill="#999"
                  fontSize={10}
                  fontWeight="500"
                  textAnchor="middle"
                  alignmentBaseline="central"
                >
                  {hour}
                </SvgText>
              )}
            </G>
          ))}

          {segments.map(seg => (
            <Path
              key={seg.id}
              d={seg.arcPath}
              fill={seg.color + 'CC'}
              stroke="#fff"
              strokeWidth={1}
            />
          ))}

          {segments.map(seg => {
            const span = seg.endAngle - seg.startAngle;
            if (span < 12) return null;
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
              >
                {seg.title.length > 6 ? seg.title.slice(0, 5) + '..' : seg.title}
              </SvgText>
            );
          })}
        </Svg>

        <View style={[styles.centerInfo, { top: CENTER - 24, left: CENTER - 40, width: 80 }]}>
          <Text style={styles.centerFreeLabel}>空き</Text>
          <Text style={styles.centerFreeTime}>
            {freeHours}h {freeMins > 0 ? `${freeMins}m` : ''}
          </Text>
        </View>

        <TouchableOpacity
          style={styles.addCircleBtn}
          onPress={handleEmptyAreaPress}
          activeOpacity={0.7}
        >
          <Plus size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.legend} showsVerticalScrollIndicator={false}>
        {schedules.length === 0 ? (
          <View style={styles.emptyLegend}>
            <Text style={styles.emptyText}>予定がありません</Text>
            <Text style={styles.emptySubText}>円グラフの「+」ボタンで追加できます</Text>
          </View>
        ) : (
          schedules
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  chartWrapper: {
    alignItems: 'center',
    paddingVertical: 20,
    position: 'relative',
  },
  centerInfo: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerFreeLabel: {
    fontSize: 11,
    color: '#999',
    fontWeight: '500',
  },
  centerFreeTime: {
    fontSize: 16,
    fontWeight: '700',
    color: '#333',
    marginTop: 2,
  },
  addCircleBtn: {
    position: 'absolute',
    bottom: 12,
    right: 24,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#222',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
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
