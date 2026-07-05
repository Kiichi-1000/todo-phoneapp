import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import Svg, { Circle, Path, G, Text as SvgText, Line } from 'react-native-svg';
import { Plus } from 'lucide-react-native';
import { Schedule } from '@/types/database';
import { minutesToTimeString } from '@/lib/scheduleUtils';
import { useLanguage } from '@/contexts/LanguageContext';

interface Props {
  schedules: Schedule[];
  onEmptyPress: (startMinutes: number) => void;
  onSchedulePress: (schedule: Schedule) => void;
  isToday?: boolean;
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

type SegmentLayout =
  | {
      mode: 'horizontal';
      radiusFrac: number;
      lines: string[];
      fontSize: number;
      descLines: string[];
      descFontSize: number;
    }
  | {
      mode: 'radial';
      fontSize: number;
      titleText: string;
      titleRadius: number;
      flipped: boolean;
    };

// ---- 文字幅の実測ベース計算（全角/半角判別）----
// 従来の一律 charWFactor=0.95 は日本語（全角）で実測より狭く、はみ出しの主因だった。
const FULL_WIDTH_RE = /[^\x01-\x7E]/;
const FULL_CHAR_W = 1.0;
const HALF_CHAR_W = 0.55;

function charWidth(ch: string, fontSize: number): number {
  return (FULL_WIDTH_RE.test(ch) ? FULL_CHAR_W : HALF_CHAR_W) * fontSize;
}

function textWidth(text: string, fontSize: number): number {
  let w = 0;
  for (const ch of text) w += charWidth(ch, fontSize);
  return w;
}

// 折り返し位置として自然な区切り文字。
// BREAK_AFTER はその文字の直後で、BREAK_BEFORE はその文字の直前で折る。
const BREAK_AFTER = new Set(['・', '、', '。', '，', ',', ' ', '　', '/', '／', '-', 'ー', '−', ')', '）', '】', '」', '·', '•']);
const BREAK_BEFORE = new Set(['(', '（', '【', '「']);

function preferSeparator(text: string, cut: number, maxFit: number): number {
  const isBreak = (k: number) =>
    k > 0 && k < text.length &&
    (BREAK_AFTER.has(text[k - 1]) || BREAK_BEFORE.has(text[k]));
  for (let d = 0; d <= 2; d++) {
    if (cut + d <= maxFit && isBreak(cut + d)) return cut + d;
    if (cut - d >= 1 && isBreak(cut - d)) return cut - d;
  }
  return cut;
}

// 行ごとの利用可能幅に合わせて折り返す。行間の文字数は均等配分を狙い、
// 区切り文字が近くにあればそこで折る。全行に収まらなければ null。
function wrapToLines(text: string, fontSize: number, widths: number[]): string[] | null {
  const lines: string[] = [];
  let rem = text;
  for (let i = 0; i < widths.length; i++) {
    if (rem.length === 0) break;
    const isLast = i === widths.length - 1;
    if (isLast) {
      if (textWidth(rem, fontSize) <= widths[i]) {
        lines.push(rem);
        rem = '';
      }
      break;
    }
    let maxFit = 0;
    let w = 0;
    for (let j = 0; j < rem.length; j++) {
      w += charWidth(rem[j], fontSize);
      if (w > widths[i]) break;
      maxFit = j + 1;
    }
    if (maxFit === 0) return null;
    if (maxFit >= rem.length) {
      lines.push(rem);
      rem = '';
      break;
    }
    const remainingLines = widths.length - i;
    const targetW = textWidth(rem, fontSize) / remainingLines;
    let cut = maxFit;
    w = 0;
    for (let j = 0; j < maxFit; j++) {
      w += charWidth(rem[j], fontSize);
      if (w >= targetW) { cut = j + 1; break; }
    }
    cut = preferSeparator(rem, cut, maxFit);
    lines.push(rem.slice(0, cut));
    rem = rem.slice(cut);
  }
  return rem.length === 0 ? lines : null;
}

// description 用: 収まらない分は末尾を「…」で切り詰める（入り切らなければ []）。
function wrapDescLines(desc: string, fontSize: number, widths: number[]): string[] {
  const lines: string[] = [];
  let rem = desc.replace(/\s*\n\s*/g, ' ').trim();
  for (let i = 0; i < widths.length && rem.length > 0; i++) {
    const isLast = i === widths.length - 1;
    let maxFit = 0;
    let w = 0;
    for (let j = 0; j < rem.length; j++) {
      w += charWidth(rem[j], fontSize);
      if (w > widths[i]) break;
      maxFit = j + 1;
    }
    if (maxFit < 2) return [];
    if (isLast && rem.length > maxFit) {
      const ellipsisW = charWidth('…', fontSize);
      let cut = 0;
      let cutW = 0;
      for (let j = 0; j < rem.length; j++) {
        const cw = charWidth(rem[j], fontSize);
        if (cutW + cw + ellipsisW > widths[i]) break;
        cutW += cw;
        cut = j + 1;
      }
      if (cut === 0) return [];
      lines.push(rem.slice(0, cut) + '…');
      rem = '';
    } else {
      const cut = maxFit >= rem.length ? rem.length : preferSeparator(rem, maxFit, maxFit);
      lines.push(rem.slice(0, cut));
      rem = rem.slice(cut);
    }
  }
  return lines;
}

const LINE_HEIGHT_FACTOR = 1.2;
const H_SAFETY_MARGIN = 16;
const H_EDGE_MARGIN = 6;
const H_MIN_R_FRAC = 0.26;
const CHORD_SAFETY = 0.96;

// 横配置ブロック内の各行の利用可能幅。
// 従来はブロック中心半径の弦のみで判定していたが、実際は行の位置（外周側/内周側）
// で弦の長さが変わるため、行ごとに wedge 制約（弦）と外周円制約の両方で判定する。
function computeLineWidths(
  outerRadius: number,
  midAngle: number,
  halfSin: number,
  targetCenterRadius: number,
  lineOffsets: number[]
): number[] {
  const rMax = outerRadius - H_EDGE_MARGIN;
  const c = polarToCartesian(0, 0, targetCenterRadius, midAngle);
  return lineOffsets.map(off => {
    const y = c.y + off;
    const r = Math.sqrt(c.x * c.x + y * y);
    const wWedge = 2 * r * halfSin * CHORD_SAFETY;
    const lim = rMax * rMax - y * y;
    const wCircle = lim <= 0 ? 0 : 2 * (Math.sqrt(lim) - Math.abs(c.x));
    return Math.max(0, Math.min(wWedge, wCircle));
  });
}

function computeHorizontalLayout(
  title: string,
  description: string | null,
  durationMin: number,
  outerRadius: number,
  midAngle: number
): { radiusFrac: number; lines: string[]; fontSize: number; descLines: string[]; descFontSize: number } {
  const displayTitle = title || '—';
  const sweepRad = (durationMin / 1440) * 2 * Math.PI;
  const halfSin = Math.max(Math.sin(sweepRad / 2), 0.001);

  const fontCandidates = [12, 11, 10, 9, 8, 7, 6];
  const maxLines = durationMin >= 120 ? 3 : durationMin >= 45 ? 2 : 1;
  const showDuration = durationMin >= 60;

  const tryLayout = (
    nLines: number,
    fs: number,
    descCount: number
  ): { radiusFrac: number; lines: string[]; fontSize: number; descLines: string[]; descFontSize: number } | null => {
    const lineHeight = fs * LINE_HEIGHT_FACTOR;
    const durFs = Math.max(8, fs - 2);
    const durLineHeight = showDuration ? durFs * LINE_HEIGHT_FACTOR : 0;
    const descFs = Math.max(6, fs - 2);
    const descLineHeight = descFs * LINE_HEIGHT_FACTOR;
    const totalHeight = nLines * lineHeight + durLineHeight + descCount * descLineHeight;
    const targetCenterRadius = outerRadius - H_SAFETY_MARGIN - totalHeight / 2;
    const radiusFrac = targetCenterRadius / outerRadius;
    if (radiusFrac < H_MIN_R_FRAC) return null;

    const blockTop = -totalHeight / 2;
    const titleOffsets: number[] = [];
    for (let i = 0; i < nLines; i++) {
      titleOffsets.push(blockTop + i * lineHeight + lineHeight / 2);
    }
    const titleWidths = computeLineWidths(outerRadius, midAngle, halfSin, targetCenterRadius, titleOffsets);
    const lines = wrapToLines(displayTitle, fs, titleWidths);
    if (!lines) return null;

    let descLines: string[] = [];
    if (descCount > 0) {
      if (!description) return null;
      const descOffsets: number[] = [];
      const descTop = blockTop + nLines * lineHeight + durLineHeight;
      for (let i = 0; i < descCount; i++) {
        descOffsets.push(descTop + i * descLineHeight + descLineHeight / 2);
      }
      const descWidths = computeLineWidths(outerRadius, midAngle, halfSin, targetCenterRadius, descOffsets);
      descLines = wrapDescLines(description, descFs, descWidths);
      if (descLines.length === 0) return null;
    }

    return { radiusFrac, lines, fontSize: fs, descLines, descFontSize: descFs };
  };

  for (let nLines = 1; nLines <= maxLines; nLines++) {
    for (const fs of fontCandidates) {
      const base = tryLayout(nLines, fs, 0);
      if (!base) continue;
      // スペースが余っている場合のみ description を追加表示（2行→1行の順で試す）
      if (description && description.trim().length > 0 && durationMin >= 60) {
        for (const descCount of [2, 1]) {
          const withDesc = tryLayout(nLines, fs, descCount);
          if (withDesc) return withDesc;
        }
      }
      return base;
    }
  }

  // フォールバック: 最小フォントでも収まらないタイトルは幅ベースで「…」切り詰め
  const fs = fontCandidates[fontCandidates.length - 1];
  const lineHeight = fs * LINE_HEIGHT_FACTOR;
  const durFs = Math.max(8, fs - 2);
  const durLineHeight = showDuration ? durFs * LINE_HEIGHT_FACTOR : 0;
  const totalHeight = maxLines * lineHeight + durLineHeight;
  const targetCenterRadius = Math.max(outerRadius * H_MIN_R_FRAC, outerRadius - H_SAFETY_MARGIN - totalHeight / 2);
  const radiusFrac = targetCenterRadius / outerRadius;
  const blockTop = -totalHeight / 2;
  const offsets: number[] = [];
  for (let i = 0; i < maxLines; i++) {
    offsets.push(blockTop + i * lineHeight + lineHeight / 2);
  }
  const widths = computeLineWidths(outerRadius, midAngle, halfSin, targetCenterRadius, offsets);
  const lines = wrapDescLines(displayTitle, fs, widths);
  return {
    radiusFrac,
    lines: lines.length > 0 ? lines : [displayTitle.slice(0, 2) + '…'],
    fontSize: fs,
    descLines: [],
    descFontSize: Math.max(6, fs - 2),
  };
}

function computeRadialLayout(
  title: string,
  durationMin: number,
  outerRadius: number,
  midAngle: number
): { fontSize: number; titleText: string; titleRadius: number; flipped: boolean } {
  const displayTitle = title || '—';
  const sweepRad = (durationMin / 1440) * 2 * Math.PI;
  const halfSin = Math.max(Math.sin(sweepRad / 2), 0.001);

  const innerMargin = 26;
  const outerMargin = 18;
  const outerEdgeMargin = 4; // 縁ギリギリの描画を防ぐ
  const heightFactor = 0.55;
  const fontCandidates = [13, 12, 11, 10, 9, 8, 7, 6];

  const flipped = midAngle > 180;
  const innerR = innerMargin;
  const outerR = outerRadius - outerMargin - outerEdgeMargin;

  for (const fs of fontCandidates) {
    const halfH = fs * heightFactor;
    const textW = textWidth(displayTitle, fs);
    const minR = halfH / halfSin;
    const textInnerEdge = Math.max(innerR, minR);
    const textOuterEdge = textInnerEdge + textW;
    if (textOuterEdge <= outerR) {
      const titleRadius = (textInnerEdge + textOuterEdge) / 2;
      return { fontSize: fs, titleText: displayTitle, titleRadius, flipped };
    }
  }

  const fs = fontCandidates[fontCandidates.length - 1];
  const halfH = fs * heightFactor;
  const minR = halfH / halfSin;
  const textInnerEdge = Math.max(innerR, minR);
  const availableLen = Math.max(charWidth('…', fs) + fs, outerR - textInnerEdge);
  const ellipsisW = charWidth('…', fs);
  let truncated = displayTitle;
  if (textWidth(displayTitle, fs) > availableLen) {
    let cut = 0;
    let w = 0;
    for (let j = 0; j < displayTitle.length; j++) {
      const cw = charWidth(displayTitle[j], fs);
      if (w + cw + ellipsisW > availableLen) break;
      w += cw;
      cut = j + 1;
    }
    truncated = displayTitle.slice(0, Math.max(1, cut)) + '…';
  }
  const textW = textWidth(truncated, fs);
  return {
    fontSize: fs,
    titleText: truncated,
    titleRadius: textInnerEdge + textW / 2,
    flipped,
  };
}

function computeSegmentLayout(
  title: string,
  description: string | null,
  durationMin: number,
  outerRadius: number,
  midAngle: number
): SegmentLayout {
  const RADIAL_THRESHOLD_DEG = 45;
  const sweepDeg = (durationMin / 1440) * 360;
  if (sweepDeg < RADIAL_THRESHOLD_DEG) {
    // 細いセグメント（放射配置）では description は表示しない
    return { mode: 'radial', ...computeRadialLayout(title, durationMin, outerRadius, midAngle) };
  }
  return { mode: 'horizontal', ...computeHorizontalLayout(title, description, durationMin, outerRadius, midAngle) };
}

export default function ScheduleCircleView({ schedules, onEmptyPress, onSchedulePress, isToday = false }: Props) {
  const { t } = useLanguage();
  const { width: screenWidth } = useWindowDimensions();
  const CHART_SIZE = Math.min(screenWidth - 32, 380);
  const CENTER = CHART_SIZE / 2;
  const OUTER_RADIUS = CHART_SIZE / 2 - 4;
  const LABEL_RADIUS = OUTER_RADIUS + 1;
  const TICK_OUTER = OUTER_RADIUS;
  const TICK_INNER = OUTER_RADIUS - 10;

  const [now, setNow] = useState(new Date());
  const [tappedHour, setTappedHour] = useState<number | null>(null);
  const legendScrollRef = useRef<ScrollView>(null);
  const legendItemOffsetsRef = useRef<Record<string, number>>({});

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
      const midMin = s.start_minutes + durationMin / 2;
      const midAngle = minutesToAngle(midMin);
      const layout = computeSegmentLayout(s.title || t('schedule.untitled'), s.description ?? null, durationMin, OUTER_RADIUS, midAngle);
      const dH = Math.floor(durationMin / 60);
      const dM = durationMin % 60;
      const durationLabel = dH > 0 && dM > 0 ? `${dH}h${dM}m` : dH > 0 ? `${dH}h` : `${dM}m`;

      return { ...s, path, midAngle, durationLabel, layout, durationMin };
    });
  }, [schedules, CENTER, OUTER_RADIUS]);

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

  const orderedLegendSchedules = useMemo(() => {
    if (!schedules.length) return [];
    return [...schedules].sort((a, b) => a.start_minutes - b.start_minutes);
  }, [schedules]);

  const nearestFutureOrCurrentId = useMemo(() => {
    if (!isToday || orderedLegendSchedules.length === 0) return null;
    const target = orderedLegendSchedules.find(s => s.end_minutes >= currentMinutes);
    return target?.id ?? null;
  }, [isToday, orderedLegendSchedules, currentMinutes]);

  const scrollLegendToTarget = useCallback(() => {
    if (!isToday || !nearestFutureOrCurrentId) return;
    const y = legendItemOffsetsRef.current[nearestFutureOrCurrentId];
    if (typeof y !== 'number') return;
    legendScrollRef.current?.scrollTo({ y: Math.max(y - 4, 0), animated: false });
  }, [isToday, nearestFutureOrCurrentId]);

  useEffect(() => {
    scrollLegendToTarget();
  }, [scrollLegendToTarget]);

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

          {scheduleSegments.map(seg => {
            const durationMin = seg.durationMin;

            let labelContent: React.ReactNode = null;

            if (durationMin >= 15 && seg.layout.mode === 'horizontal' && seg.layout.lines.length > 0) {
              const showDuration = durationMin >= 60;
              const titleFontSize = seg.layout.fontSize;
              const durationFontSize = Math.max(8, titleFontSize - 2);
              const titleLines = seg.layout.lines;
              const descLines = seg.layout.descLines;
              const descFontSize = seg.layout.descFontSize;
              const labelPos = polarToCartesian(CENTER, CENTER, OUTER_RADIUS * seg.layout.radiusFrac, seg.midAngle);
              const cx = labelPos.x;
              const cy = labelPos.y;
              const titleLineHeight = titleFontSize * 1.2;
              const durLineHeight = durationFontSize * 1.2;
              const descLineHeight = descFontSize * 1.2;
              const titleBlockHeight = titleLines.length * titleLineHeight;
              const durBlockHeight = showDuration ? durLineHeight : 0;
              const totalHeight = titleBlockHeight + durBlockHeight + descLines.length * descLineHeight;
              const blockTop = cy - totalHeight / 2;

              labelContent = (
                <>
                  {titleLines.map((line, i) => {
                    const yPos = blockTop + i * titleLineHeight + titleLineHeight / 2;
                    return (
                      <G key={`t-${seg.id}-${i}`}>
                        <SvgText
                          x={cx}
                          y={yPos}
                          fill="none"
                          stroke="rgba(0,0,0,0.55)"
                          strokeWidth={2.4}
                          strokeLinejoin="round"
                          fontSize={titleFontSize}
                          fontWeight="700"
                          textAnchor="middle"
                          alignmentBaseline="central"
                        >
                          {line}
                        </SvgText>
                        <SvgText
                          x={cx}
                          y={yPos}
                          fill="#fff"
                          fontSize={titleFontSize}
                          fontWeight="700"
                          textAnchor="middle"
                          alignmentBaseline="central"
                        >
                          {line}
                        </SvgText>
                      </G>
                    );
                  })}
                  {showDuration && (
                    <G>
                      <SvgText
                        x={cx}
                        y={blockTop + titleBlockHeight + durLineHeight / 2}
                        fill="none"
                        stroke="rgba(0,0,0,0.5)"
                        strokeWidth={2}
                        strokeLinejoin="round"
                        fontSize={durationFontSize}
                        fontWeight="600"
                        textAnchor="middle"
                        alignmentBaseline="central"
                      >
                        {seg.durationLabel}
                      </SvgText>
                      <SvgText
                        x={cx}
                        y={blockTop + titleBlockHeight + durLineHeight / 2}
                        fill="rgba(255,255,255,0.95)"
                        fontSize={durationFontSize}
                        fontWeight="600"
                        textAnchor="middle"
                        alignmentBaseline="central"
                      >
                        {seg.durationLabel}
                      </SvgText>
                    </G>
                  )}
                  {descLines.map((line, i) => {
                    const yPos = blockTop + titleBlockHeight + durBlockHeight + i * descLineHeight + descLineHeight / 2;
                    return (
                      <G key={`d-${seg.id}-${i}`}>
                        <SvgText
                          x={cx}
                          y={yPos}
                          fill="none"
                          stroke="rgba(0,0,0,0.5)"
                          strokeWidth={2}
                          strokeLinejoin="round"
                          fontSize={descFontSize}
                          fontWeight="500"
                          textAnchor="middle"
                          alignmentBaseline="central"
                        >
                          {line}
                        </SvgText>
                        <SvgText
                          x={cx}
                          y={yPos}
                          fill="rgba(255,255,255,0.88)"
                          fontSize={descFontSize}
                          fontWeight="500"
                          textAnchor="middle"
                          alignmentBaseline="central"
                        >
                          {line}
                        </SvgText>
                      </G>
                    );
                  })}
                </>
              );
            } else if (durationMin >= 15 && seg.layout.mode === 'radial' && seg.layout.titleText.length > 0) {
              const { fontSize, titleText, titleRadius, flipped } = seg.layout;
              const titlePos = polarToCartesian(CENTER, CENTER, titleRadius, seg.midAngle);
              const baseRotation = seg.midAngle - 90;
              const rotation = flipped ? baseRotation + 180 : baseRotation;

              labelContent = (
                <G transform={`rotate(${rotation}, ${titlePos.x}, ${titlePos.y})`}>
                  <SvgText
                    x={titlePos.x}
                    y={titlePos.y}
                    fill="none"
                    stroke="rgba(0,0,0,0.55)"
                    strokeWidth={2.4}
                    strokeLinejoin="round"
                    fontSize={fontSize}
                    fontWeight="700"
                    textAnchor="middle"
                    alignmentBaseline="central"
                  >
                    {titleText}
                  </SvgText>
                  <SvgText
                    x={titlePos.x}
                    y={titlePos.y}
                    fill="#fff"
                    fontSize={fontSize}
                    fontWeight="700"
                    textAnchor="middle"
                    alignmentBaseline="central"
                  >
                    {titleText}
                  </SvgText>
                </G>
              );
            }

            return (
              <G key={seg.id}>
                <Path
                  d={seg.path}
                  fill={seg.color}
                  opacity={0.88}
                  onPress={() => onSchedulePress(seg as unknown as Schedule)}
                />
                {labelContent}
              </G>
            );
          })}

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

      <ScrollView
        ref={legendScrollRef}
        style={styles.legend}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={scrollLegendToTarget}
      >
        {schedules.length === 0 ? (
          <View style={styles.emptyLegend}>
            <Text style={styles.emptyText}>{t('schedule.emptyTitle')}</Text>
            <Text style={styles.emptySubText}>{t('schedule.emptyHint')}</Text>
          </View>
        ) : (
          orderedLegendSchedules
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
                  onLayout={(event) => {
                    legendItemOffsetsRef.current[s.id] = event.nativeEvent.layout.y;
                  }}
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
