import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Easing } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Gift, Zap } from 'lucide-react-native';

interface Props {
  balanceYen: number | null;
  accessReason:
    | 'active_subscription'
    | 'promo'
    | 'release_promo'
    | 'basic_plan_no_ai'
    | 'none'
    | null;
  expiresAt?: string | null;
  /**
   * プラン上限のトークン数。指定時はドーナツの進捗 % に使う。
   * Standard: 4000, Pro: 7000 を想定。
   * 未指定なら 100% 表示 (= 上限不明のため進捗バーを満たす)。
   */
  planMaxTokens?: number | null;
}

const DONUT_SIZE = 22; // バッジ高さに対して馴染むサイズ
const DONUT_STROKE = 3;
const DONUT_RADIUS = (DONUT_SIZE - DONUT_STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * DONUT_RADIUS;

function formatDateShort(iso: string): string {
  try {
    const d = new Date(iso);
    return `${d.getMonth() + 1}/${d.getDate()}まで`;
  } catch { return ''; }
}

/**
 * 残量ドーナツ。0% で円が空、100% で円が満タンに塗られる。
 * dashoffset = CIRCUMFERENCE * (1 - percent) で進捗を表現。
 * 12 時方向から時計回りに増えるよう rotation: -90deg を適用。
 */
function Donut({ percent, color, trackColor }: { percent: number; color: string; trackColor: string }) {
  const safePct = Math.max(0, Math.min(1, percent));
  const dashOffset = CIRCUMFERENCE * (1 - safePct);
  return (
    <Svg width={DONUT_SIZE} height={DONUT_SIZE}>
      {/* 背景の輪 */}
      <Circle
        cx={DONUT_SIZE / 2}
        cy={DONUT_SIZE / 2}
        r={DONUT_RADIUS}
        stroke={trackColor}
        strokeWidth={DONUT_STROKE}
        fill="none"
      />
      {/* 進捗の弧。原点 (cx,cy) を中心に -90度 (12時) から時計回り */}
      <Circle
        cx={DONUT_SIZE / 2}
        cy={DONUT_SIZE / 2}
        r={DONUT_RADIUS}
        stroke={color}
        strokeWidth={DONUT_STROKE}
        fill="none"
        strokeLinecap="round"
        strokeDasharray={`${CIRCUMFERENCE} ${CIRCUMFERENCE}`}
        strokeDashoffset={dashOffset}
        transform={`rotate(-90 ${DONUT_SIZE / 2} ${DONUT_SIZE / 2})`}
      />
    </Svg>
  );
}

export default function TokenBalanceBadge({ balanceYen, accessReason, expiresAt, planMaxTokens }: Props) {
  // 「未契約」表記は廃止 (Jobs 判断 2026-05-16):
  //   AI が使えない状態 (sub なし / basic_plan_no_ai) でラベルを貼っても情報量がなく、
  //   むしろアクセスゲートで paywall に飛ばす UX に統一する。バッジ自体を非表示にする。
  if (
    accessReason === null ||
    accessReason === 'none' ||
    accessReason === 'basic_plan_no_ai'
  ) {
    return null;
  }

  // --- 表示パターン分岐 -----------------------------------------------------
  // active_subscription: ドーナツ進捗 + タップで残量数を展開
  // release_promo / promo: ドーナツは使わず期間アイコン + 期限のみ (これらは時限制なので)
  // -------------------------------------------------------------------------

  if (accessReason === 'release_promo') {
    return (
      <PillBadge
        Icon={Zap}
        label={`試運転期間 ${expiresAt ? formatDateShort(expiresAt) : ''}`.trim()}
        bg="#FEF3C7" fg="#92400E" border="#FCD34D"
      />
    );
  }
  if (accessReason === 'promo') {
    return (
      <PillBadge
        Icon={Gift}
        label={`クーポン ${expiresAt ? formatDateShort(expiresAt) : ''}`.trim()}
        bg="#DCFCE7" fg="#166534" border="#86EFAC"
      />
    );
  }

  // active_subscription
  if (accessReason !== 'active_subscription' || balanceYen === null) {
    return null;
  }

  return <DonutBadge balanceYen={balanceYen} planMaxTokens={planMaxTokens ?? null} />;
}

// ---------------------------------------------------------------------------
// 通常時 (active_subscription) のドーナツバッジ。
// 普段はコンパクト (ドーナツ + % だけ)、タップで「3,847 トークン残」のテキストが
// 横に展開する。3 秒経過で自動折りたたみ。
// ---------------------------------------------------------------------------
function DonutBadge({ balanceYen, planMaxTokens }: { balanceYen: number; planMaxTokens: number | null }) {
  const [expanded, setExpanded] = useState(false);
  const animVal = useRef(new Animated.Value(0)).current;
  const collapseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const tokens = Math.max(0, Math.round(balanceYen * 10));
  // planMaxTokens 未指定の場合は「不明」として % は算出せず、残量だけ表示。
  // ただし進捗ドーナツの見た目を成り立たせるため、その場合は満タン (100%) で描画。
  const pct = planMaxTokens && planMaxTokens > 0
    ? Math.max(0, Math.min(1, tokens / planMaxTokens))
    : 1;
  const pctInt = Math.round(pct * 100);

  // 色帯。残量 % で判定 (絶対 yen ではなく相対 % にしておくと、プランによらず一貫)。
  let fg = '#3730A3';
  let trackColor = '#E0E7FF';
  if (pct <= 0.2) {
    fg = '#B91C1C'; trackColor = '#FEE2E2';
  } else if (pct <= 0.5) {
    fg = '#92400E'; trackColor = '#FEF3C7';
  }

  // 展開 → 3 秒後に自動で折りたたみ
  useEffect(() => {
    if (expanded) {
      Animated.timing(animVal, {
        toValue: 1,
        duration: 180,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start();
      collapseTimerRef.current = setTimeout(() => setExpanded(false), 3000);
    } else {
      Animated.timing(animVal, {
        toValue: 0,
        duration: 160,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: false,
      }).start();
      if (collapseTimerRef.current) {
        clearTimeout(collapseTimerRef.current);
        collapseTimerRef.current = null;
      }
    }
    return () => {
      if (collapseTimerRef.current) clearTimeout(collapseTimerRef.current);
    };
  }, [expanded, animVal]);

  // 展開時にテキスト幅ぶんを横に確保 (animated maxWidth で滑らかに)。
  const textMaxWidth = animVal.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 160],
  });
  const textOpacity = animVal.interpolate({
    inputRange: [0, 0.4, 1],
    outputRange: [0, 0, 1],
  });

  // 展開時の表示は残数のみ (ドーナツで全体比はすでに見えるため分母は不要)
  const detailText = `${tokens.toLocaleString('ja-JP')} トークン`;

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={() => setExpanded((v) => !v)}
      style={[styles.badge, { backgroundColor: '#FFFFFF', borderColor: trackColor }]}
      accessibilityRole="button"
      accessibilityLabel={`AI トークン 残り ${pctInt}%。タップで詳細表示。`}
    >
      <Donut percent={pct} color={fg} trackColor={trackColor} />
      <Text style={[styles.pctText, { color: fg }]}>{pctInt}%</Text>
      <Animated.View style={{ maxWidth: textMaxWidth, opacity: textOpacity, overflow: 'hidden' }}>
        <Text style={[styles.detailText, { color: fg }]} numberOfLines={1}>
          {detailText}
        </Text>
      </Animated.View>
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// 試運転期間 / プロモ用の従来形ピル型バッジ (これらは時限制なので進捗ではなく
// 期限の文字情報が主)。
// ---------------------------------------------------------------------------
function PillBadge({
  Icon, label, bg, fg, border,
}: { Icon: any; label: string; bg: string; fg: string; border: string }) {
  return (
    <View style={[styles.badge, { backgroundColor: bg, borderColor: border }]}>
      <Icon size={12} color={fg} strokeWidth={2.4} />
      <Text style={[styles.text, { color: fg, fontWeight: '600' }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    alignSelf: 'flex-start',
    gap: 6,
  },
  text: { fontSize: 11.5, letterSpacing: 0.2 },
  pctText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.2 },
  detailText: { fontSize: 11, fontWeight: '600', letterSpacing: 0.2, marginLeft: 2 },
});
