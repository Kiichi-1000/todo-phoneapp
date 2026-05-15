// Paywall route — AI / Goals 機能とプレミアム機能の課金壁。
//
// ■ v1.3 — RevenueCatUI.Paywall（ダッシュボード製テンプレート）を廃止し、
//   カスタム実装。さらにデザイン案に合わせてダークテーマへ全面刷新。
//
// なぜ RevenueCatUI.Paywall を廃止したか:
//   旧実装はダッシュボードのテンプレートを表示するだけで、価格表示（日本ロケール
//   なのにドル表示）・デザイン・機能説明がコードから一切直せなかった。
//   ドル表示の正体: RC のパッケージは Test Store 商品（USD建て）と Apple 商品
//   （JPY建て）を束ねており、テンプレートが環境次第で USD 側を表示してしまう。
//   → カスタム実装では getOfferings() の pkg.product.priceString（StoreKit が
//     ローカライズした文字列＝Apple 決済シートと同じ正本）を直接使うため、実機
//     （本番/TestFlight）では確実に「¥」表示になる。
//
// ■ ヒーロー背景について
//   デザイン案は都市写真だが、写真アセットが未提供のため、ダークグラデーション＋
//   ビル群シルエット（react-native-svg で描画）で都市夜景の雰囲気を出している。
//   本物の写真を入れる場合は <HeroBackdrop> を ImageBackground に差し替えるだけ。
//
// ■ 既知の制約（コードでは直せないもの）
//   - Apple ネイティブ決済シートの桁区切り → iOS が端末の地域設定で描画。端末の
//     「設定 > 一般 > 言語と地域 > 地域」を「日本」にすると ¥2,000 表記になる。
//   - 開発ビルド（__DEV__）は RC Test Store 鍵を使うため Test Store 商品（USD建て
//     登録）が出る。RC ダッシュボードで Test Store 商品を JPY 登録し直すか
//     TestFlight ビルドで確認する。
//
// ■ トライアル表記は意図的に「なし」
//   ASC の6商品に introductory offer（無料トライアル）が設定されていないため、
//   実体のないトライアル表記は入れない（Apple ガイドライン 2.3.2 / 3.1.2 対策）。
//   トライアルを設定したら、このファイルにトライアル UI を追記する。
//
// ■ コンテキスト Paywall
//   ?context=ai / ?context=workspace / （指定なし）でヒーロー文言と初期選択プランを
//   出し分ける（SKU ごとに Paywall は分けない）。

import { useEffect, useState, useRef, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
  Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Svg, Rect } from 'react-native-svg';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import Constants from 'expo-constants';
import {
  X,
  Check,
  Infinity as InfinityIcon,
  Sparkles,
  Crown,
  Ban,
  Lock,
  RotateCcw,
} from 'lucide-react-native';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  ensureRevenueCat,
  isRevenueCatConfigured,
  getOfferings,
  purchasePackage,
  restorePurchases,
  syncSubscriptionAfterPurchase,
  type PriceOption,
  type Plan,
  type Cycle,
} from '@/lib/revenueCat';

// ─────────────────────────────────────────────
// カラー（ダークテーマ）
// ─────────────────────────────────────────────
const C = {
  bg: '#0A0E1C',
  card: '#141A30',
  cardSelected: '#1A2240',
  border: '#28324E',
  borderSoft: '#1F2740',
  divider: '#232C46',
  ink: '#F1F5F9',
  inkSoft: '#A3AEC6',
  inkFaint: '#6B7795',
  white: '#FFFFFF',
  basic: '#34D399', // green
  standard: '#60A5FA', // blue
  pro: '#A78BFA', // purple
  danger: '#F87171',
  heroSubtle: 'rgba(255,255,255,0.78)',
};

// グラデーション。リファレンス画像の「夕暮れ時のシティスカイライン」を再現。
// 空 (top) は夜の濃紫、中盤に夕陽のオレンジ・ピンク・マゼンタ、地平線手前は深いブルー。
const GRAD_HERO: readonly [string, string, string, string, string] = [
  '#080B1F', // top: deep night sky
  '#241540', // upper-mid: violet twilight
  '#7B2A5C', // mid: dusk magenta
  '#D14C2A', // lower-mid: warm sunset glow
  '#0A0E1C', // bottom: city horizon shadow
];
const GRAD_CTA: readonly [string, string] = ['#6366F1', '#8B5CF6'];

// ヒーロー下部のビル群シルエット (奥行きを出すため 2 レイヤー)。
// 写真ができたらこの 2 レイヤーを ImageBackground に差し替えるだけ。

// 奥のレイヤー: 暗くて低めの遠景ビル
const SKYLINE_FAR: { x: number; w: number; h: number }[] = [
  { x: 0, w: 50, h: 28 }, { x: 55, w: 38, h: 40 }, { x: 98, w: 44, h: 22 },
  { x: 148, w: 60, h: 34 }, { x: 215, w: 32, h: 26 }, { x: 252, w: 52, h: 42 },
  { x: 308, w: 38, h: 30 }, { x: 350, w: 50, h: 36 },
];

// 手前のレイヤー: 濃くて高めの主役ビル群
const SKYLINE: { x: number; w: number; h: number }[] = [
  { x: 0, w: 34, h: 56 }, { x: 37, w: 22, h: 84 }, { x: 62, w: 30, h: 46 },
  { x: 95, w: 26, h: 96 }, { x: 124, w: 40, h: 64 }, { x: 167, w: 24, h: 104 },
  { x: 194, w: 34, h: 52 }, { x: 231, w: 28, h: 78 }, { x: 262, w: 42, h: 60 },
  { x: 307, w: 24, h: 98 }, { x: 334, w: 34, h: 70 }, { x: 371, w: 29, h: 88 },
];

// 手前ビルに重ねる窓灯り (yellow dots)。手前ビルの座標から決定論的に算出。
// 関数ではなく事前計算しておくことで Svg のレンダコストを抑える。
const WINDOWS: { x: number; y: number; on: boolean }[] = (() => {
  const out: { x: number; y: number; on: boolean }[] = [];
  // SVG_H = 120 (= styles.skylineSvgHeight)。各ビルの内側に 5px グリッドで窓を打つ。
  const SVG_H = 120;
  let seed = 7;
  const rand = () => {
    // 単純な決定論的擬似乱数 (LCG)。ビルド間で同じ模様にする。
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  for (const b of SKYLINE) {
    const top = SVG_H - b.h + 4;
    const bottom = SVG_H - 6;
    for (let y = top; y < bottom; y += 5) {
      for (let x = b.x + 3; x < b.x + b.w - 3; x += 4) {
        out.push({ x, y, on: rand() > 0.35 }); // ~65% の窓に灯り
      }
    }
  }
  return out;
})();

const LEGAL_HUB =
  ((Constants.expoConfig?.extra as { legalDocsHubUrl?: string } | undefined)
    ?.legalDocsHubUrl as string) ||
  'https://todo-phoneapp.pages.dev/legal/tosche/';

// ─────────────────────────────────────────────
// プランのメタ情報
// 機能コピーは RC 旧 Paywall + docs/v2-requirements.md +
// monthly-token-grant（basic=0 / standard=¥400 / pro=¥700）に基づく実態ベース。
// ─────────────────────────────────────────────
type PlanMeta = {
  accent: string;
  gradient: readonly [string, string];
  Icon: typeof Check;
  nameJa: string;
  nameEn: string;
  /** カード内に出す短い機能ラベル（詳細は機能比較表で） */
  featuresJa: string[];
  featuresEn: string[];
  /** AI 機能を含まないプランの注記（basic のみ） */
  noteJa?: string;
  noteEn?: string;
};

const PLAN_META: Record<Plan, PlanMeta> = {
  basic: {
    accent: C.basic,
    gradient: ['#34D399', '#10B981'],
    Icon: InfinityIcon,
    nameJa: 'ToSche プラン',
    nameEn: 'ToSche',
    featuresJa: [
      'ワークスペースを無制限に作成',
      'ToDo・スケジュール・ルーティン・統計の全機能',
      '目標管理（年・半期・月・長期）',
    ],
    featuresEn: [
      'Unlimited workspace pages',
      'All core features (to-dos, schedule, routines, stats)',
      'Goal management (yearly / half-year / monthly / long-term)',
    ],
    noteJa: 'AIアシスタント・AI目標コーチは含まれません',
    noteEn: 'AI assistant & AI goal coach not included',
  },
  standard: {
    accent: C.standard,
    gradient: ['#60A5FA', '#3B82F6'],
    Icon: Sparkles,
    nameJa: 'AI Standard',
    nameEn: 'AI Standard',
    // ※ AIクレジット具体額（¥400分など）は企業秘密のためカードでは見せない。
    //   実体（標準枠での会話量）が伝わるニュアンスのコピーに留める。
    featuresJa: [
      'ToScheプランの全機能込み',
      'AIアシスタント（自然文でタスク・予定操作）',
      'AI目標コーチ（目標の分解と振り返り）',
      '毎月のAI利用枠付き',
    ],
    featuresEn: [
      'Everything in the ToSche plan',
      'AI assistant (plain-language task control)',
      'AI goal coach (break down and review goals)',
      'Monthly AI usage included',
    ],
  },
  pro: {
    accent: C.pro,
    gradient: ['#A78BFA', '#7C3AED'],
    Icon: Crown,
    nameJa: 'AI Pro',
    nameEn: 'AI Pro',
    featuresJa: [
      'ToScheプランの全機能込み',
      'AIアシスタント（自然文でタスク・予定操作）',
      'AI目標コーチ（目標の分解と振り返り）',
      'Standard より余裕のあるAI利用枠',
    ],
    featuresEn: [
      'Everything in the ToSche plan',
      'AI assistant (plain-language task control)',
      'AI goal coach (break down and review goals)',
      'Generously larger AI usage than Standard',
    ],
  },
};

const PLAN_ORDER: Plan[] = ['basic', 'standard', 'pro'];
const RECOMMENDED_PLAN: Plan = 'pro'; // デザイン案に合わせ「おすすめ」は AI Pro

// ─────────────────────────────────────────────
// 機能比較表（実態ベース。優先サポート等の未確認機能は載せない）
// ─────────────────────────────────────────────
type CompareValue = boolean | string;
const COMPARISON: {
  labelJa: string;
  labelEn: string;
  values: Record<Plan, CompareValue>;
}[] = [
  {
    labelJa: 'ワークスペース無制限',
    labelEn: 'Unlimited workspace',
    values: { basic: true, standard: true, pro: true },
  },
  {
    labelJa: 'ToDo・予定・ルーティン・統計',
    labelEn: 'To-dos, schedule, routines, stats',
    values: { basic: true, standard: true, pro: true },
  },
  {
    labelJa: '目標管理 (年/半期/月/長期)',
    labelEn: 'Goal management (yearly / half-year / monthly / long-term)',
    values: { basic: true, standard: true, pro: true },
  },
  {
    labelJa: 'すべての端末でデータ同期',
    labelEn: 'Sync across all devices',
    values: { basic: true, standard: true, pro: true },
  },
  {
    labelJa: 'AIアシスタント (自然文でタスク・予定操作)',
    labelEn: 'AI assistant (plain-language task control)',
    values: { basic: false, standard: true, pro: true },
  },
  {
    labelJa: 'AI目標コーチ (目標の分解と振り返り)',
    labelEn: 'AI goal coach (break down & review goals)',
    values: { basic: false, standard: true, pro: true },
  },
  // ※ AI 利用枠の具体額 (¥400分/¥700分) は企業秘密のため表に出さない。
  //   代わりに「標準/拡張」のニュアンスだけ伝える。
  {
    labelJa: 'AI利用枠',
    labelEn: 'AI usage allowance',
    values: { basic: '—', standard: '標準', pro: '拡張' },
  },
];

// ─────────────────────────────────────────────
// 文言（ja / en）
// ─────────────────────────────────────────────
const STRINGS = {
  ja: {
    close: '閉じる',
    eyebrow: 'ToSche Premium',
    heroTitle: 'ToSche を、もっと自由に。',
    heroSubtitle: 'あなたの時間設計を、思いどおりに。プランはいつでも変更・解約できます。',
    heroAiTitle: 'あなたの理想の1日を、AIがサポート。',
    heroAiSubtitle:
      '革新的なAIエージェントが、タスク管理から目標設定まですべてをサポートします。',
    heroWorkspaceTitle: 'ワークスペースを、無制限に。',
    heroWorkspaceSubtitle: '100ページの無料枠を解除して、思考を止めずに書き続ける。',
    monthlyKind: '月額プラン',
    yearlyKind: '年額プラン',
    yearlyOff: (pct: number) => `${pct}% OFF`,
    perMonth: '/月',
    perYear: '/年',
    perMonthEq: (price: string) => `月あたり ${price}`,
    cancelAnytime: 'いつでも解約できます',
    recommended: 'おすすめ',
    compareTitle: '機能比較',
    // ボトムバッジ (3 つ)。ASC で無料トライアル未設定のため「7日間トライアル」は出さない。
    // 代わりに、本アプリ独自の「100ページまで無料で使える」をアピール。
    footerFreeTier: '100ページまで無料',
    footerCancel: 'いつでもキャンセル可能',
    footerSecure: '安全な決済',
    ctaStart: (plan: string, cycle: string) => `${plan}（${cycle}）ではじめる`,
    ctaProcessing: '処理中…',
    restore: '購入を復元',
    restoring: '復元中…',
    legal:
      '購入を確定すると自動更新サブスクリプションが開始されます。期間（月額は1か月／年額は1年）終了の24時間以上前に解約しない限り自動的に更新され、同額が請求されます。解約は App Store の「サブスクリプション」からいつでも行えます。',
    terms: '利用規約',
    privacy: 'プライバシーポリシー',
    tokushoho: '特定商取引法に基づく表記',
    errorTitle: '読み込みに失敗しました',
    errorBody: 'プラン情報を取得できませんでした。通信環境を確認して再試行してください。',
    retry: '再試行',
    back: '戻る',
    purchaseFailed: '購入を完了できませんでした。',
    restoreFailed: '復元できる購入が見つかりませんでした。',
    notConfigured: '購入機能を準備中です。アプリを最新版に更新してからお試しください。',
  },
  en: {
    close: 'Close',
    eyebrow: 'ToSche Premium',
    heroTitle: 'Make ToSche truly yours.',
    heroSubtitle: 'Design your time, your way. Change or cancel anytime.',
    heroAiTitle: 'Let AI support your ideal day.',
    heroAiSubtitle:
      'An AI agent that supports everything — from task management to goal setting.',
    heroWorkspaceTitle: 'Unlimited workspace pages.',
    heroWorkspaceSubtitle: 'Remove the 100-page free cap and keep your ideas flowing.',
    monthlyKind: 'Monthly',
    yearlyKind: 'Yearly',
    yearlyOff: (pct: number) => `${pct}% OFF`,
    perMonth: '/mo',
    perYear: '/yr',
    perMonthEq: (price: string) => `${price} / month`,
    cancelAnytime: 'Cancel anytime',
    recommended: 'Recommended',
    compareTitle: 'Compare plans',
    footerFreeTier: 'Free for 100 pages',
    footerCancel: 'Cancel anytime',
    footerSecure: 'Secure payment',
    ctaStart: (plan: string, cycle: string) => `Start ${plan} (${cycle})`,
    ctaProcessing: 'Processing…',
    restore: 'Restore purchases',
    restoring: 'Restoring…',
    legal:
      'Confirming your purchase starts an auto-renewing subscription. It renews automatically — and you are charged the same amount — unless cancelled at least 24 hours before the end of the period (1 month for monthly, 1 year for yearly). Manage or cancel anytime under Subscriptions in the App Store.',
    terms: 'Terms of Use',
    privacy: 'Privacy Policy',
    tokushoho: 'Commercial Transactions Act notice',
    errorTitle: 'Failed to load',
    errorBody: 'We could not load the plans. Check your connection and try again.',
    retry: 'Retry',
    back: 'Back',
    purchaseFailed: 'The purchase could not be completed.',
    restoreFailed: 'No restorable purchases were found.',
    notConfigured: 'Purchases are being set up. Please update the app and try again.',
  },
};

// ─────────────────────────────────────────────
// 価格オプションを plan × cycle で引けるようにグルーピング
// ─────────────────────────────────────────────
type GroupedOfferings = Record<Plan, Partial<Record<Cycle, PriceOption>>>;

function groupOfferings(options: PriceOption[]): GroupedOfferings {
  const grouped: GroupedOfferings = { basic: {}, standard: {}, pro: {} };
  for (const opt of options) {
    if (grouped[opt.plan]) grouped[opt.plan][opt.cycle] = opt;
  }
  return grouped;
}

/** 月額×12 と年額の差から「年額の割引率（%）」を算出。出せないときは 0。 */
function yearlySavingsPct(group: Partial<Record<Cycle, PriceOption>>): number {
  const m = group.monthly;
  const y = group.yearly;
  if (!m || !y || m.priceMicros <= 0 || y.priceMicros <= 0) return 0;
  const pct = Math.round((1 - y.priceMicros / (m.priceMicros * 12)) * 100);
  return pct > 0 ? pct : 0;
}

/** 年額の「月あたり」価格文字列（¥ローカライズ簡易版）。 */
function perMonthString(yearly: PriceOption | undefined): string {
  if (!yearly || yearly.priceMicros <= 0) return '';
  const yen = Math.round(yearly.priceMicros / 12 / 1_000_000);
  return `¥${yen.toLocaleString('ja-JP')}`;
}

/** 触覚フィードバック（本質的でないので失敗は無視）。 */
function fireHaptic(kind: 'select' | 'tap') {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return;
  try {
    if (kind === 'select') {
      Haptics.selectionAsync().catch(() => {});
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }
  } catch {
    // no-op
  }
}

export default function PaywallScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ context?: string }>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { lang } = useLanguage();
  const t = lang === 'ja' ? STRINGS.ja : STRINGS.en;

  // エントリーポイント別のコンテキスト（"contextual paywall" パターン）。
  const entryContext =
    params.context === 'ai' || params.context === 'workspace'
      ? params.context
      : 'default';
  const heroTitle =
    entryContext === 'ai'
      ? t.heroAiTitle
      : entryContext === 'workspace'
        ? t.heroWorkspaceTitle
        : t.heroTitle;
  const heroSubtitle =
    entryContext === 'ai'
      ? t.heroAiSubtitle
      : entryContext === 'workspace'
        ? t.heroWorkspaceSubtitle
        : t.heroSubtitle;
  const initialPlan: Plan = entryContext === 'workspace' ? 'basic' : RECOMMENDED_PLAN;

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [offerings, setOfferings] = useState<GroupedOfferings | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<Plan>(initialPlan);
  const [selectedCycle, setSelectedCycle] = useState<Cycle>('monthly');
  const [purchasing, setPurchasing] = useState(false);
  const [restoringState, setRestoringState] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const leavingRef = useRef(false);

  // ── プラン情報の読み込み ──────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      if (isRevenueCatConfigured()) {
        await ensureRevenueCat(user?.id);
      }
      const options = await getOfferings();
      if (!options || options.length === 0) {
        setLoadError(true);
        return;
      }
      setOfferings(groupOfferings(options));
    } catch (e) {
      if (__DEV__) console.warn('[Paywall] load failed', e);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  // ── 閉じる（購入せず終了）→ workspace へ ────────
  const handleClose = useCallback(() => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    router.replace('/(tabs)/workspace');
  }, [router]);

  // ── 購入成功 → 即時同期 → AI タブへ ────────────
  const goToAiAfterPurchase = useCallback(
    async (customerInfo: unknown, productId?: string) => {
      if (leavingRef.current) return;
      leavingRef.current = true;
      try {
        await syncSubscriptionAfterPurchase(customerInfo, productId);
      } catch (e) {
        if (__DEV__) console.warn('[Paywall] sync after purchase failed', e);
      }
      router.replace('/(tabs)/ai');
    },
    [router],
  );

  // ── プラン購入 ───────────────────────────────
  const handlePurchase = useCallback(async () => {
    if (purchasing || restoringState) return;
    const opt = offerings?.[selectedPlan]?.[selectedCycle];
    if (!opt) return;

    if (!isRevenueCatConfigured()) {
      setActionError(t.notConfigured);
      return;
    }

    fireHaptic('tap');
    setActionError(null);
    setPurchasing(true);
    try {
      const result = await purchasePackage(opt.identifier);
      if (result.success) {
        await goToAiAfterPurchase(result.customerInfo, opt.identifier);
        return;
      }
      if (result.cancelled) return;
      if (__DEV__) console.warn('[Paywall] purchase error', result.error);
      setActionError(t.purchaseFailed);
    } catch (e) {
      if (__DEV__) console.warn('[Paywall] purchase threw', e);
      setActionError(t.purchaseFailed);
    } finally {
      setPurchasing(false);
    }
  }, [
    purchasing,
    restoringState,
    offerings,
    selectedPlan,
    selectedCycle,
    t,
    goToAiAfterPurchase,
  ]);

  // ── 購入の復元 ───────────────────────────────
  const handleRestore = useCallback(async () => {
    if (purchasing || restoringState) return;
    if (!isRevenueCatConfigured()) {
      setActionError(t.notConfigured);
      return;
    }
    setActionError(null);
    setRestoringState(true);
    try {
      const result = await restorePurchases();
      const restored =
        result.success &&
        (result.customerInfoSnapshot?.activeEntitlements?.length ?? 0) > 0;
      if (restored) {
        await goToAiAfterPurchase(result.customerInfo);
        return;
      }
      setActionError(t.restoreFailed);
    } catch (e) {
      if (__DEV__) console.warn('[Paywall] restore threw', e);
      setActionError(t.restoreFailed);
    } finally {
      setRestoringState(false);
    }
  }, [purchasing, restoringState, t, goToAiAfterPurchase]);

  const openLegal = useCallback((file: string) => {
    void Linking.openURL(LEGAL_HUB + file);
  }, []);

  const selectCard = useCallback((plan: Plan, cycle: Cycle) => {
    setSelectedPlan(plan);
    setSelectedCycle(cycle);
    fireHaptic('select');
  }, []);

  // ── 閉じるボタン（右上に固定） ─────────────────
  const renderCloseButton = () => (
    <TouchableOpacity
      onPress={handleClose}
      style={[styles.closeButton, { top: insets.top + 6 }]}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={t.close}
      hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
    >
      <X size={20} color={C.white} strokeWidth={2.6} />
    </TouchableOpacity>
  );

  // ── ローディング ─────────────────────────────
  if (loading) {
    return (
      <View style={styles.container}>
        {renderCloseButton()}
        <View style={styles.center}>
          <ActivityIndicator size="large" color={C.standard} />
        </View>
      </View>
    );
  }

  // ── 読み込みエラー ───────────────────────────
  if (loadError || !offerings) {
    return (
      <View style={styles.container}>
        {renderCloseButton()}
        <View style={styles.center}>
          <Text style={styles.errorTitle}>{t.errorTitle}</Text>
          <Text style={styles.errorBody}>{t.errorBody}</Text>
          <TouchableOpacity onPress={() => void load()} activeOpacity={0.85} style={styles.retryWrap}>
            <LinearGradient
              colors={GRAD_CTA}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.retryButton}
            >
              <Text style={styles.retryButtonText}>{t.retry}</Text>
            </LinearGradient>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleClose} style={styles.linkButton} activeOpacity={0.7}>
            <Text style={styles.linkButtonText}>{t.back}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── 本体 ─────────────────────────────────────
  const selectedOpt = offerings[selectedPlan]?.[selectedCycle];
  const selectedName =
    lang === 'ja' ? PLAN_META[selectedPlan].nameJa : PLAN_META[selectedPlan].nameEn;
  const selectedCycleLabel =
    selectedCycle === 'monthly' ? t.monthlyKind : t.yearlyKind;
  const busy = purchasing || restoringState;

  // 月額カード
  const renderMonthlyCard = (plan: Plan, index: number) => {
    const meta = PLAN_META[plan];
    const opt = offerings[plan]?.monthly;
    const isSelected = selectedPlan === plan && selectedCycle === 'monthly';
    const isRecommended = plan === RECOMMENDED_PLAN;
    const features = lang === 'ja' ? meta.featuresJa : meta.featuresEn;
    const note = lang === 'ja' ? meta.noteJa : meta.noteEn;

    return (
      <Animated.View
        key={`m-${plan}`}
        entering={FadeInDown.duration(420).delay(160 + index * 80)}
        style={styles.cardCol}
      >
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => selectCard(plan, 'monthly')}
          accessibilityRole="button"
          accessibilityState={{ selected: isSelected }}
          style={[
            styles.planCard,
            { borderColor: isSelected ? meta.accent : C.border },
            isSelected && { backgroundColor: C.cardSelected, shadowColor: meta.accent },
            isSelected && styles.planCardSelected,
          ]}
        >
          {isRecommended && (
            <View style={[styles.recoBadge, { backgroundColor: meta.accent }]}>
              <Text style={styles.recoBadgeText}>{t.recommended}</Text>
            </View>
          )}
          <View style={styles.planCardTopRow}>
            <Text style={[styles.planCardName, { color: meta.accent }]} numberOfLines={1}>
              {lang === 'ja' ? meta.nameJa : meta.nameEn}
            </Text>
            {isSelected ? (
              <View style={[styles.radioOn, { backgroundColor: meta.accent }]}>
                <Check size={11} color={C.bg} strokeWidth={3.6} />
              </View>
            ) : (
              <View style={styles.radioOff} />
            )}
          </View>
          <Text style={styles.planCardKind}>{t.monthlyKind}</Text>
          <View style={styles.priceRow}>
            <Text style={styles.priceValue}>{opt ? opt.priceString : '—'}</Text>
            <Text style={styles.pricePer}>{t.perMonth}</Text>
          </View>
          <Text style={styles.cancelNote}>{t.cancelAnytime}</Text>
          <View style={styles.cardDivider} />
          {features.map((f) => (
            <View key={f} style={styles.featureRow}>
              <View style={[styles.featureDot, { backgroundColor: meta.accent }]}>
                <Check size={8} color={C.bg} strokeWidth={4} />
              </View>
              <Text style={styles.featureText}>{f}</Text>
            </View>
          ))}
          {note && (
            <View style={styles.featureRow}>
              <View style={styles.featureDotOff}>
                <Ban size={9} color={C.inkFaint} strokeWidth={2.6} />
              </View>
              <Text style={styles.featureTextOff}>{note}</Text>
            </View>
          )}
        </TouchableOpacity>
      </Animated.View>
    );
  };

  // 年額カード（コンパクト）
  const renderYearlyCard = (plan: Plan, index: number) => {
    const meta = PLAN_META[plan];
    const group = offerings[plan];
    const opt = group?.yearly;
    const isSelected = selectedPlan === plan && selectedCycle === 'yearly';
    const off = yearlySavingsPct(group ?? {});
    const perMo = perMonthString(opt);

    return (
      <Animated.View
        key={`y-${plan}`}
        entering={FadeInDown.duration(420).delay(420 + index * 80)}
        style={styles.cardCol}
      >
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => selectCard(plan, 'yearly')}
          accessibilityRole="button"
          accessibilityState={{ selected: isSelected }}
          style={[
            styles.yearCard,
            { borderColor: isSelected ? meta.accent : C.borderSoft },
            isSelected && { backgroundColor: C.cardSelected, shadowColor: meta.accent },
            isSelected && styles.planCardSelected,
          ]}
        >
          <View style={styles.planCardTopRow}>
            <Text style={[styles.yearKind, { color: meta.accent }]} numberOfLines={1}>
              {t.yearlyKind}
              {off > 0 ? `（${t.yearlyOff(off)}）` : ''}
            </Text>
            {isSelected ? (
              <View style={[styles.radioOn, { backgroundColor: meta.accent }]}>
                <Check size={11} color={C.bg} strokeWidth={3.6} />
              </View>
            ) : (
              <View style={styles.radioOff} />
            )}
          </View>
          <View style={styles.priceRow}>
            <Text style={styles.priceValueSm}>{opt ? opt.priceString : '—'}</Text>
            <Text style={styles.pricePer}>{t.perYear}</Text>
          </View>
          {perMo !== '' && (
            <View style={[styles.perMoPill, { backgroundColor: meta.accent + '22' }]}>
              <Text style={[styles.perMoText, { color: meta.accent }]}>
                {t.perMonthEq(perMo)}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </Animated.View>
    );
  };

  // 機能比較表のセル
  const renderCompareCell = (value: CompareValue, plan: Plan) => {
    const meta = PLAN_META[plan];
    if (value === true) {
      return (
        <View style={styles.compareCell}>
          <Check size={16} color={meta.accent} strokeWidth={3} />
        </View>
      );
    }
    if (value === false) {
      return (
        <View style={styles.compareCell}>
          <X size={14} color={C.inkFaint} strokeWidth={2.6} />
        </View>
      );
    }
    return (
      <View style={styles.compareCell}>
        <Text style={[styles.compareCellText, { color: meta.accent }]}>{value}</Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {renderCloseButton()}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── ヒーロー（夕暮れの空 + シティスカイライン） ──
            実装メモ:
              1. ベースグラデーション (LinearGradient #1) で「夜→紫→マゼンタ→夕陽オレンジ→地平線」を表現。
              2. 右上に追加グラデ (LinearGradient #2) で太陽光を再現 (ホットスポット)。
              3. SVG で奥のビル群 → 手前のビル群 → 窓灯り の 3 層を重ねて奥行きを出す。
              4. 上端にダーク半透明オーバーレイで Close ボタン領域の視認性を確保。
            写真アセットを用意したら、この 3 つを単一の <ImageBackground source={...}> に置き換える。 */}
        <Animated.View entering={FadeIn.duration(450)}>
          <LinearGradient
            colors={GRAD_HERO}
            locations={[0, 0.32, 0.55, 0.78, 1]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={[styles.hero, { paddingTop: insets.top + 56 }]}
          >
            {/* 右上の太陽グロー（角度を付けて diagonal に） */}
            <LinearGradient
              colors={['rgba(252, 211, 77, 0.45)', 'rgba(244, 114, 182, 0.18)', 'rgba(124, 58, 237, 0)']}
              locations={[0, 0.4, 1]}
              start={{ x: 1, y: 0 }}
              end={{ x: 0.25, y: 0.6 }}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />

            {/* スカイライン 3 層 + 窓灯り */}
            <View style={styles.skylineWrap} pointerEvents="none">
              <Svg
                width="100%"
                height={120}
                viewBox="0 0 400 120"
                preserveAspectRatio="xMidYMax slice"
              >
                {/* 奥のビル群: 半透明の濃紺 */}
                {SKYLINE_FAR.map((b, i) => (
                  <Rect
                    key={`far-${i}`}
                    x={b.x}
                    y={120 - b.h}
                    width={b.w}
                    height={b.h}
                    rx={1}
                    fill="#0B0F22"
                    opacity={0.7}
                  />
                ))}
                {/* 手前のビル群: ほぼ黒 */}
                {SKYLINE.map((b, i) => (
                  <Rect
                    key={`near-${i}`}
                    x={b.x}
                    y={120 - b.h}
                    width={b.w}
                    height={b.h}
                    rx={1.5}
                    fill="#04060E"
                    opacity={0.95}
                  />
                ))}
                {/* 窓灯り: 灯り on の窓だけ描画して負荷を抑える */}
                {WINDOWS.filter((w) => w.on).map((w, i) => (
                  <Rect
                    key={`w-${i}`}
                    x={w.x}
                    y={w.y}
                    width={1.6}
                    height={1.6}
                    fill="#FCD34D"
                    opacity={0.85}
                  />
                ))}
              </Svg>
            </View>

            {/* 上端: Close ボタン領域の視認性向上のためのほのかな暗オーバーレイ */}
            <LinearGradient
              colors={['rgba(8, 11, 31, 0.55)', 'rgba(8, 11, 31, 0)']}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={styles.heroTopShade}
              pointerEvents="none"
            />

            <View style={styles.eyebrowChip}>
              <Sparkles size={13} color={C.white} strokeWidth={2.6} />
              <Text style={styles.eyebrowText}>{t.eyebrow}</Text>
            </View>
            <Text style={styles.heroTitle}>{heroTitle}</Text>
            <Text style={styles.heroSubtitle}>{heroSubtitle}</Text>
          </LinearGradient>
        </Animated.View>

        {/* ── 月額プラン（3カード） ── */}
        <View style={styles.cardRow}>
          {PLAN_ORDER.map((plan, i) => renderMonthlyCard(plan, i))}
        </View>

        {/* ── 年額プラン（3カード・コンパクト） ── */}
        <View style={[styles.cardRow, styles.cardRowTight]}>
          {PLAN_ORDER.map((plan, i) => renderYearlyCard(plan, i))}
        </View>

        {/* ── 機能比較表 ── */}
        <Animated.View entering={FadeInDown.duration(420).delay(560)} style={styles.compareCard}>
          <Text style={styles.compareTitle}>{t.compareTitle}</Text>
          <View style={styles.compareHeaderRow}>
            <View style={styles.compareLabelCell} />
            {PLAN_ORDER.map((plan) => (
              <View key={plan} style={styles.compareCell}>
                <Text style={[styles.compareHeaderText, { color: PLAN_META[plan].accent }]}>
                  {lang === 'ja' ? PLAN_META[plan].nameJa.replace('ToSche ', '') : PLAN_META[plan].nameEn}
                </Text>
              </View>
            ))}
          </View>
          {COMPARISON.map((row, idx) => (
            <View
              key={row.labelJa}
              style={[styles.compareRow, idx === COMPARISON.length - 1 && styles.compareRowLast]}
            >
              <View style={styles.compareLabelCell}>
                <Text style={styles.compareLabelText}>
                  {lang === 'ja' ? row.labelJa : row.labelEn}
                </Text>
              </View>
              {PLAN_ORDER.map((plan) => (
                <View key={plan}>{renderCompareCell(row.values[plan], plan)}</View>
              ))}
            </View>
          ))}
        </Animated.View>

        {/* ── フッター: 安心バッジ 3 つ + 法的開示 + リンク ── */}
        <View style={styles.footer}>
          <View style={styles.assuranceRow}>
            <View style={styles.assuranceItem}>
              <Check size={14} color={C.inkSoft} strokeWidth={2.6} />
              <Text style={styles.assuranceText}>{t.footerFreeTier}</Text>
            </View>
            <View style={styles.assuranceDivider} />
            <View style={styles.assuranceItem}>
              <RotateCcw size={14} color={C.inkSoft} strokeWidth={2.4} />
              <Text style={styles.assuranceText}>{t.footerCancel}</Text>
            </View>
            <View style={styles.assuranceDivider} />
            <View style={styles.assuranceItem}>
              <Lock size={14} color={C.inkSoft} strokeWidth={2.4} />
              <Text style={styles.assuranceText}>{t.footerSecure}</Text>
            </View>
          </View>
          <Text style={styles.legalText}>{t.legal}</Text>
          <View style={styles.legalLinks}>
            <TouchableOpacity onPress={() => openLegal('terms.html')} activeOpacity={0.7}>
              <Text style={styles.legalLink}>{t.terms}</Text>
            </TouchableOpacity>
            <Text style={styles.legalDot}>・</Text>
            <TouchableOpacity onPress={() => openLegal('privacy.html')} activeOpacity={0.7}>
              <Text style={styles.legalLink}>{t.privacy}</Text>
            </TouchableOpacity>
            <Text style={styles.legalDot}>・</Text>
            <TouchableOpacity onPress={() => openLegal('tokushoho.html')} activeOpacity={0.7}>
              <Text style={styles.legalLink}>{t.tokushoho}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      {/* ── 下部固定バー — グラデーション CTA + 復元 ── */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 14 }]}>
        {actionError && <Text style={styles.actionError}>{actionError}</Text>}
        <TouchableOpacity
          onPress={handlePurchase}
          activeOpacity={0.9}
          disabled={busy}
          accessibilityRole="button"
          style={[styles.ctaWrap, busy && styles.ctaWrapDisabled]}
        >
          <LinearGradient
            colors={GRAD_CTA}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.cta}
          >
            {purchasing ? (
              <ActivityIndicator size="small" color={C.white} />
            ) : (
              <Text style={styles.ctaText}>
                {selectedOpt
                  ? t.ctaStart(selectedName, selectedCycleLabel)
                  : t.ctaProcessing}
              </Text>
            )}
          </LinearGradient>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleRestore}
          disabled={busy}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={styles.restoreWrap}
        >
          <Text style={[styles.restoreText, busy && styles.restoreTextDisabled]}>
            {restoringState ? t.restoring : t.restore}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 24 },

  // 閉じるボタン（右上に固定）
  closeButton: {
    position: 'absolute',
    right: 16,
    zIndex: 20,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },

  // ローディング / エラー
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  errorTitle: { fontSize: 18, fontWeight: '800', color: C.ink, marginBottom: 8 },
  errorBody: {
    fontSize: 14,
    color: C.inkSoft,
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 22,
  },
  retryWrap: { borderRadius: 13, overflow: 'hidden' },
  retryButton: { paddingVertical: 13, paddingHorizontal: 36 },
  retryButtonText: { color: C.white, fontSize: 15, fontWeight: '800' },
  linkButton: { marginTop: 14, paddingVertical: 8, paddingHorizontal: 16 },
  linkButtonText: { color: C.inkSoft, fontSize: 14, fontWeight: '600' },

  // ヒーロー
  hero: {
    paddingHorizontal: 22,
    paddingBottom: 40,
    overflow: 'hidden',
  },
  skylineWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 120,
  },
  // ヒーロー上端のほのかな暗オーバーレイ (Close ボタン視認性のため)
  heroTopShade: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 110,
  },
  eyebrowChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.14)',
    marginBottom: 14,
  },
  eyebrowText: { color: C.white, fontSize: 11.5, fontWeight: '800', letterSpacing: 0.6 },
  heroTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: C.white,
    letterSpacing: -0.4,
    lineHeight: 35,
  },
  heroSubtitle: {
    fontSize: 13.5,
    color: C.heroSubtle,
    lineHeight: 21,
    marginTop: 9,
    maxWidth: '94%',
  },

  // カード行
  cardRow: {
    flexDirection: 'row',
    gap: 9,
    paddingHorizontal: 14,
    marginTop: 16,
    alignItems: 'stretch',
  },
  cardRowTight: { marginTop: 10 },
  cardCol: { flex: 1 },

  // 月額プランカード
  planCard: {
    flex: 1,
    backgroundColor: C.card,
    borderRadius: 16,
    borderWidth: 1.5,
    padding: 12,
  },
  planCardSelected: {
    shadowOpacity: 0.4,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  recoBadge: {
    position: 'absolute',
    top: -9,
    right: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  recoBadgeText: { color: C.bg, fontSize: 9.5, fontWeight: '900', letterSpacing: 0.2 },
  planCardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  planCardName: { flex: 1, fontSize: 12.5, fontWeight: '900', letterSpacing: 0.2 },
  radioOn: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOff: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: C.border,
  },
  planCardKind: { fontSize: 11, color: C.inkSoft, fontWeight: '600', marginTop: 6 },
  priceRow: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 3 },
  priceValue: { fontSize: 21, fontWeight: '900', color: C.ink, letterSpacing: -0.5 },
  priceValueSm: { fontSize: 17, fontWeight: '900', color: C.ink, letterSpacing: -0.4 },
  pricePer: { fontSize: 11, fontWeight: '700', color: C.inkFaint, marginLeft: 2, marginBottom: 2 },
  cancelNote: { fontSize: 9.5, color: C.inkFaint, marginTop: 3 },
  cardDivider: {
    height: 1,
    backgroundColor: C.divider,
    marginVertical: 10,
  },
  featureRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginBottom: 7 },
  featureDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  featureDotOff: {
    width: 14,
    height: 14,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
    backgroundColor: C.borderSoft,
  },
  featureText: { flex: 1, fontSize: 10.5, color: C.inkSoft, lineHeight: 15 },
  featureTextOff: { flex: 1, fontSize: 10.5, color: C.inkFaint, lineHeight: 15 },

  // 年額プランカード
  yearCard: {
    flex: 1,
    backgroundColor: C.card,
    borderRadius: 14,
    borderWidth: 1.5,
    padding: 12,
  },
  yearKind: { flex: 1, fontSize: 10, fontWeight: '800' },
  perMoPill: {
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  perMoText: { fontSize: 10.5, fontWeight: '800' },

  // 機能比較表
  compareCard: {
    marginHorizontal: 14,
    marginTop: 20,
    backgroundColor: C.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.borderSoft,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  compareTitle: { fontSize: 15, fontWeight: '800', color: C.ink, marginBottom: 10 },
  compareHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: C.divider,
  },
  compareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: C.divider,
  },
  compareRowLast: { borderBottomWidth: 0, paddingBottom: 2 },
  compareLabelCell: { flex: 1, paddingRight: 8 },
  compareLabelText: { fontSize: 11.5, color: C.inkSoft, lineHeight: 16 },
  compareCell: { width: 58, alignItems: 'center', justifyContent: 'center' },
  compareHeaderText: { fontSize: 11, fontWeight: '900', letterSpacing: 0.2 },
  compareCellText: { fontSize: 11, fontWeight: '800' },

  // フッター
  footer: { marginTop: 22, paddingHorizontal: 22 },
  // 3 つのバッジを横一列で表示。小画面でも収まるよう gap と font を調整。
  assuranceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  assuranceItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  assuranceText: { fontSize: 11, color: C.inkSoft, fontWeight: '600' },
  assuranceDivider: { width: 1, height: 14, backgroundColor: C.border },
  legalText: { fontSize: 10.5, color: C.inkFaint, lineHeight: 16, textAlign: 'center' },
  legalLinks: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  legalLink: { fontSize: 11.5, color: C.standard, fontWeight: '600' },
  legalDot: { fontSize: 11, color: C.inkFaint, marginHorizontal: 6 },

  // 下部固定バー
  bottomBar: {
    paddingHorizontal: 20,
    paddingTop: 14,
    backgroundColor: C.card,
    borderTopWidth: 1,
    borderTopColor: C.borderSoft,
  },
  actionError: { fontSize: 13, color: C.danger, textAlign: 'center', marginBottom: 10 },
  ctaWrap: {
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: C.standard,
    shadowOpacity: 0.45,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 7,
  },
  ctaWrapDisabled: { opacity: 0.55 },
  cta: { paddingVertical: 17, alignItems: 'center', justifyContent: 'center' },
  ctaText: { color: C.white, fontSize: 16, fontWeight: '900', letterSpacing: 0.2 },
  restoreWrap: { alignItems: 'center', marginTop: 12 },
  restoreText: { fontSize: 13, color: C.inkSoft, fontWeight: '700' },
  restoreTextDisabled: { opacity: 0.5 },
});
