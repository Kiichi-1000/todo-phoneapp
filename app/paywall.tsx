// Paywall route — AI / Goals 機能とプレミアム機能の課金壁。
//
// ■ v1.3 — RevenueCatUI.Paywall（ダッシュボード製テンプレート）を廃止しカスタム実装。
//   デザイン案 (PayWall-risou) に合わせ、ヒーローは都市写真、本文はダークテーマ。
//
// なぜ RevenueCatUI.Paywall を廃止したか:
//   旧実装はダッシュボードのテンプレートを表示するだけで、価格表示・デザイン・
//   機能説明がコードから一切直せなかった。カスタム実装では getOfferings() の
//   pkg.product.priceString（StoreKit がローカライズした文字列）を使う。
//
// ■ 通貨表示
//   日本語ユーザーには必ず「¥」表示にする (displayPrice / resolveYen)。
//   - 本番ビルド: StoreKit が JP ストアフロントなら priceString が ¥ → そのまま使用。
//   - 開発ビルド (RC Test Store): currencyCode が USD で返るため、JPY_FALLBACK
//     (= ASC 実価格の円建て) にフォールバックして ¥ 表示を保証する。
//   - 英語ユーザー / 海外ストアフロント: priceString をそのまま使用 ($ など)。
//
// ■ ヒーロー背景
//   assets/images/paywall-city.jpg を ImageBackground で全幅表示し、上下に暗
//   グラデーションを重ねて文字の視認性とダーク本文への接続を確保する。
//
// ■ 機能コピー
//   AI 利用枠の具体額 (¥400分 等) は企業秘密のためカード・比較表に出さない。
//   カードの機能は短いキーワードのみ。詳細は機能比較表で補う。
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
  ImageBackground,
  Linking,
  Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
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
  fetchCustomerInfo,
  type PriceOption,
  type Plan,
  type Cycle,
} from '@/lib/revenueCat';
import { track } from '@/lib/posthog';

// ヒーロー背景の都市写真。
const CITY_IMG = require('../assets/images/paywall-city.jpg');

// ─────────────────────────────────────────────
// カラー（ダークテーマ）
// ─────────────────────────────────────────────
const C = {
  bg: '#0A0E1C',
  card: '#141A30',
  cardSelected: '#1B2342',
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
  heroSubtle: 'rgba(255,255,255,0.82)',
};

// ヒーロー写真の上に重ねる暗オーバーレイ。
// 上=Closeボタン/ステータスバーの視認性、中=写真を見せる、下=ダーク本文へ接続。
const GRAD_HERO_OVERLAY: readonly [string, string, string, string] = [
  'rgba(8,11,28,0.66)',
  'rgba(8,11,28,0.10)',
  'rgba(10,14,28,0.55)',
  '#0A0E1C',
];
const GRAD_CTA: readonly [string, string] = ['#6366F1', '#8B5CF6'];

const LEGAL_HUB =
  ((Constants.expoConfig?.extra as { legalDocsHubUrl?: string } | undefined)
    ?.legalDocsHubUrl as string) ||
  'https://todo-phoneapp.pages.dev/legal/tosche/';

// ─────────────────────────────────────────────
// プランのメタ情報
// 機能はデザイン案に合わせた「短いキーワード」のみ。AI 利用枠の具体額は出さない。
// ─────────────────────────────────────────────
type PlanMeta = {
  accent: string;
  gradient: readonly [string, string];
  Icon: typeof Check;
  nameJa: string;
  nameEn: string;
  /** カードに出す短いキーワード機能ラベル（詳細は機能比較表で補う） */
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
    // プラン名はカードに1行で必ず収めるためシンプル化。
    // 「ToSche プラン」とした版は「ToSche」へ。日英で同じ表記。
    nameJa: 'ToSche',
    nameEn: 'ToSche',
    featuresJa: ['ワークスペース制限なし (100枚以上作成可能)', '目標設定機能'],
    featuresEn: ['Unlimited workspace (100+ pages)', 'Goal setting'],
    noteJa: 'AIエージェントは含まれません',
    noteEn: 'AI agent not included',
  },
  standard: {
    accent: C.standard,
    gradient: ['#60A5FA', '#3B82F6'],
    Icon: Sparkles,
    nameJa: 'AI Standard',
    nameEn: 'AI Standard',
    // 機能はユーザー指定の短いキーワード4点。分析インサイトはデフォルト機能のため除外。
    featuresJa: [
      'AIエージェント',
      'タスク管理サポート',
      '目標進捗管理AI',
      'ワークスペース制限なし',
    ],
    featuresEn: [
      'AI agent',
      'AI task support',
      'AI goal coach',
      'Unlimited workspace',
    ],
  },
  pro: {
    accent: C.pro,
    gradient: ['#A78BFA', '#7C3AED'],
    Icon: Crown,
    nameJa: 'AI Pro',
    nameEn: 'AI Pro',
    // Pro はカード上の見える機能は Standard と同じ。差は比較表の「AI利用枠」(標準/拡張)。
    featuresJa: [
      'AIエージェント',
      'タスク管理サポート',
      '目標進捗管理AI',
      'ワークスペース制限なし',
    ],
    featuresEn: [
      'AI agent',
      'AI task support',
      'AI goal coach',
      'Unlimited workspace',
    ],
  },
};

const PLAN_ORDER: Plan[] = ['basic', 'standard', 'pro'];
const RECOMMENDED_PLAN: Plan = 'pro'; // デザイン案に合わせ「おすすめ」は AI Pro

// ─────────────────────────────────────────────
// 機能比較表（短いキーワード。優先サポート等の未確認機能は載せない）
// ─────────────────────────────────────────────
type CompareValue = boolean | { ja: string; en: string };
const COMPARISON: {
  labelJa: string;
  labelEn: string;
  values: Record<Plan, CompareValue>;
}[] = [
  {
    labelJa: 'ワークスペース制限なし',
    labelEn: 'Unlimited workspace',
    values: { basic: true, standard: true, pro: true },
  },
  {
    labelJa: '目標設定・進捗管理',
    labelEn: 'Goals & progress',
    values: { basic: true, standard: true, pro: true },
  },
  {
    labelJa: '端末間データ同期',
    labelEn: 'Cross-device sync',
    values: { basic: true, standard: true, pro: true },
  },
  {
    labelJa: 'AIエージェント',
    labelEn: 'AI agent',
    values: { basic: false, standard: true, pro: true },
  },
  {
    labelJa: 'タスク管理サポート',
    labelEn: 'AI task support',
    values: { basic: false, standard: true, pro: true },
  },
  {
    labelJa: '目標進捗管理AI',
    labelEn: 'AI goal coach',
    values: { basic: false, standard: true, pro: true },
  },
  // AI 利用枠は「標準 / 拡張」の質的表現のみ（具体額は企業秘密のため非表示）。
  {
    labelJa: 'AI利用枠',
    labelEn: 'AI usage',
    values: {
      basic: { ja: '—', en: '—' },
      standard: { ja: '標準', en: 'Standard' },
      pro: { ja: '拡張', en: 'Expanded' },
    },
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

// ─────────────────────────────────────────────
// 通貨表示 — 日本語ユーザーには必ず円で見せる
// ─────────────────────────────────────────────
// ASC 実価格（円）。本番では StoreKit の priceString が正だが、開発ビルドの
// RC Test Store は USD を返すため、日本語ユーザーへ円表示を保証するための表。
const JPY_FALLBACK: Record<string, number> = {
  'ToSche.std.1.2': 300,
  tosche_basic_yearly: 3240,
  'ToSche.AI.std.1.2': 1200,
  tosche_ai_standard_yearly: 12960,
  'ToSche.AI.Pro.1.2': 2000,
  tosche_ai_pro_yearly: 21600,
};

/** 表示確定済みの「円」金額。JPYストアなら StoreKit 実値、非JPYならフォールバック。 */
function resolveYen(opt: PriceOption | undefined): number | null {
  if (!opt) return null;
  if (opt.currencyCode === 'JPY' && opt.priceMicros > 0) {
    return Math.round(opt.priceMicros / 1_000_000);
  }
  return JPY_FALLBACK[opt.identifier] ?? null;
}

/** プラン価格の表示文字列。日本語ユーザー→必ず¥、それ以外→ストアのローカライズ価格。 */
function displayPrice(opt: PriceOption | undefined, lang: string): string {
  if (!opt) return '—';
  if (lang === 'ja') {
    const yen = resolveYen(opt);
    if (yen != null) return `¥${yen.toLocaleString('ja-JP')}`;
  }
  return opt.priceString;
}

/** 年額の「月あたり」価格文字列。 */
function perMonthLabel(yearly: PriceOption | undefined, lang: string): string {
  if (!yearly) return '';
  if (lang === 'ja') {
    const yen = resolveYen(yearly);
    if (yen != null) return `¥${Math.round(yen / 12).toLocaleString('ja-JP')}`;
  }
  if (yearly.priceMicros > 0) {
    const v = yearly.priceMicros / 12 / 1_000_000;
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: yearly.currencyCode || 'USD',
      }).format(v);
    } catch {
      return '';
    }
  }
  return '';
}

/** 年額の割引率（%）。円建てに揃えて算出（通貨非依存の比率）。 */
function yearlySavingsPct(group: Partial<Record<Cycle, PriceOption>>): number {
  const m = group.monthly;
  const y = group.yearly;
  if (!m || !y) return 0;
  const mYen = resolveYen(m);
  const yYen = resolveYen(y);
  if (mYen && yYen && mYen > 0) {
    const pct = Math.round((1 - yYen / (mYen * 12)) * 100);
    return pct > 0 ? pct : 0;
  }
  if (m.priceMicros > 0 && y.priceMicros > 0) {
    const pct = Math.round((1 - y.priceMicros / (m.priceMicros * 12)) * 100);
    return pct > 0 ? pct : 0;
  }
  return 0;
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

  // コンテキスト別の表示プラン:
  //  - ai       : Basic は AI 非対応なので隠す → AI Standard + AI Pro の 2 プランのみ
  //  - workspace: 3 プラン全部表示 (Basic を入口にする想定の文脈)
  //  - default  : 3 プラン全部表示
  const visiblePlans: Plan[] =
    entryContext === 'ai' ? ['standard', 'pro'] : ['basic', 'standard', 'pro'];

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
  //
  // user.id が確定する前に ensureRevenueCat() を呼ぶと appUserID が undefined
  // のまま configure され、RevenueCat は匿名 ID ($RCAnonymousID:...) を振る。
  // すると Webhook 側で `app_user_id_not_uuid` でスキップされ、購入しても
  // user_subscriptions が永遠に更新されない (= 課金壁の無限ループ)。
  // → user.id が来るまで load() を保留する。
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
    // RevenueCat が設定済み (本番/TestFlight) のときは user.id が来るまで待つ。
    // stub モード時は user.id 不問でロード OK (オフェリングはプレースホルダ)。
    if (isRevenueCatConfigured() && !user?.id) return;
    void load();
  }, [load, user?.id]);

  // Analytics: fire paywall_view exactly once on mount, with the entry
  // context so we can segment funnels by where the paywall opened from.
  const paywallViewedRef = useRef(false);
  useEffect(() => {
    if (paywallViewedRef.current) return;
    paywallViewedRef.current = true;
    track('paywall_view', { context: params?.context ?? 'unknown' }).catch(() => {});
  }, [params?.context]);

  // ── 閉じる（購入せず終了）→ workspace へ ────────
  const handleClose = useCallback(() => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    track('paywall_dismiss').catch(() => {});
    router.replace('/(tabs)/workspace');
  }, [router]);

  // ── 購入成功 → 即時同期 → AI タブへ ────────────
  //
  // StoreKit Sandbox (TestFlight) では purchasePackage の解決直後に
  // customerInfo.entitlements.active がまだ空のまま返ってくることがある。
  // 一回 sync が「no_active_entitlement」を返したまま AI タブに戻ると
  // checkAiAccess() で未加入扱いになり、ユーザーは Paywall に戻される。
  // → 1.5s 間隔で最大 3 回 customerInfo を再取得して sync をリトライ。
  //   それでも entitlement が見えない場合は Webhook 到着を信じて
  //   AI タブに遷移する (Webhook が後で正本反映する)。
  const goToAiAfterPurchase = useCallback(
    async (customerInfo: unknown, productId?: string) => {
      if (leavingRef.current) return;
      leavingRef.current = true;
      try {
        let synced = await syncSubscriptionAfterPurchase(customerInfo, productId);
        for (let i = 0; i < 3 && !synced; i++) {
          await new Promise((r) => setTimeout(r, 1500));
          const fresh = await fetchCustomerInfo();
          if (!fresh) break; // stub モード等
          synced = await syncSubscriptionAfterPurchase(fresh, productId);
        }
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
    const productId = opt.identifier;
    const planProps = { plan: selectedPlan, cycle: selectedCycle, product_id: productId };
    track('subscription_purchase_started', planProps).catch(() => {});
    try {
      const result = await purchasePackage(productId);
      if (result.success) {
        track('subscription_purchase_success', planProps).catch(() => {});
        await goToAiAfterPurchase(result.customerInfo, productId);
        return;
      }
      if (result.cancelled) {
        track('subscription_purchase_failure', { ...planProps, reason: 'cancelled' }).catch(() => {});
        return;
      }
      if (__DEV__) console.warn('[Paywall] purchase error', result.error);
      track('subscription_purchase_failure', { ...planProps, reason: 'error' }).catch(() => {});
      setActionError(t.purchaseFailed);
    } catch (e) {
      if (__DEV__) console.warn('[Paywall] purchase threw', e);
      track('subscription_purchase_failure', { ...planProps, reason: 'threw' }).catch(() => {});
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

  // 月額カード（主役・大きめ）
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
        entering={FadeInDown.duration(420).delay(140 + index * 80)}
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
          {/* 選択ラジオはカード右上に絶対配置 → 名前行を1行で必ず収める。 */}
          {isSelected ? (
            <View style={[styles.radioAbsWrap, styles.radioOn, { backgroundColor: meta.accent }]}>
              <Check size={12} color={C.bg} strokeWidth={3.6} />
            </View>
          ) : (
            <View style={[styles.radioAbsWrap, styles.radioOff]} />
          )}
          <View style={styles.planCardTopRow}>
            <Text
              style={[styles.planCardName, { color: meta.accent }]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.78}
            >
              {lang === 'ja' ? meta.nameJa : meta.nameEn}
            </Text>
          </View>
          <Text style={styles.planCardKind}>{t.monthlyKind}</Text>
          <View style={styles.priceRow}>
            <Text style={styles.priceValue}>{displayPrice(opt, lang)}</Text>
            <Text style={styles.pricePer}>{t.perMonth}</Text>
          </View>
          <Text style={styles.cancelNote}>{t.cancelAnytime}</Text>
          <View style={styles.cardDivider} />
          {features.map((f) => (
            <View key={f} style={styles.featureRow}>
              <View style={[styles.featureDot, { backgroundColor: meta.accent }]}>
                <Check size={8} color={C.bg} strokeWidth={4} />
              </View>
              {/* 1〜2行折返し許容。3カラム時の幅でも崩れにくいよう細字+10pt。 */}
              <Text style={styles.featureText} numberOfLines={2}>
                {f}
              </Text>
            </View>
          ))}
          {note && (
            <View style={styles.featureRow}>
              <View style={styles.featureDotOff}>
                <Ban size={9} color={C.inkFaint} strokeWidth={2.6} />
              </View>
              <Text style={styles.featureTextOff} numberOfLines={2}>
                {note}
              </Text>
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
    const perMo = perMonthLabel(opt, lang);

    return (
      <Animated.View
        key={`y-${plan}`}
        entering={FadeInDown.duration(420).delay(380 + index * 80)}
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
          {/* 選択ラジオはカード右上に絶対配置。 */}
          {isSelected ? (
            <View style={[styles.radioAbsWrap, styles.radioOn, { backgroundColor: meta.accent }]}>
              <Check size={12} color={C.bg} strokeWidth={3.6} />
            </View>
          ) : (
            <View style={[styles.radioAbsWrap, styles.radioOff]} />
          )}
          <View style={styles.planCardTopRow}>
            <Text
              style={[styles.yearKind, { color: meta.accent }]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.75}
            >
              {t.yearlyKind}
              {off > 0 ? `（${t.yearlyOff(off)}）` : ''}
            </Text>
          </View>
          <View style={styles.priceRow}>
            <Text style={styles.priceValueSm}>{displayPrice(opt, lang)}</Text>
            <Text style={styles.pricePer}>{t.perYear}</Text>
          </View>
          {perMo !== '' && (
            <View style={[styles.perMoPill, { backgroundColor: meta.accent + '22' }]}>
              {/* 「月あたり ¥1,080」がカード幅を超える機種でも末尾「…」省略を避けるため、
                  numberOfLines=1 で adjustsFontSizeToFit。最低 75% まで縮小可能。 */}
              <Text
                style={[styles.perMoText, { color: meta.accent }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.75}
              >
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
        <Text style={[styles.compareCellText, { color: meta.accent }]}>
          {lang === 'ja' ? value.ja : value.en}
        </Text>
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
        {/* ── ヒーロー（都市写真 + 暗オーバーレイ） ── */}
        <Animated.View entering={FadeIn.duration(450)}>
          <ImageBackground
            source={CITY_IMG}
            style={[styles.hero, { paddingTop: insets.top + 54 }]}
            imageStyle={styles.heroImage}
          >
            {/* 写真の上の暗グラデーション（上=視認性 / 下=本文へ接続） */}
            <LinearGradient
              colors={GRAD_HERO_OVERLAY}
              locations={[0, 0.4, 0.72, 1]}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
            <View style={styles.eyebrowChip}>
              <Sparkles size={13} color={C.white} strokeWidth={2.6} />
              <Text style={styles.eyebrowText}>{t.eyebrow}</Text>
            </View>
            <Text style={styles.heroTitle}>{heroTitle}</Text>
            <Text style={styles.heroSubtitle}>{heroSubtitle}</Text>
          </ImageBackground>
        </Animated.View>

        {/* ── 月額プラン（3カード） ── */}
        <View style={styles.cardRow}>
          {visiblePlans.map((plan, i) => renderMonthlyCard(plan, i))}
        </View>

        {/* ── 年額プラン（3カード・コンパクト） ── */}
        <View style={[styles.cardRow, styles.cardRowTight]}>
          {visiblePlans.map((plan, i) => renderYearlyCard(plan, i))}
        </View>

        {/* ── 機能比較表 ── */}
        <Animated.View entering={FadeInDown.duration(420).delay(560)} style={styles.compareCard}>
          <Text style={styles.compareTitle}>{t.compareTitle}</Text>
          <View style={styles.compareHeaderRow}>
            <View style={styles.compareLabelCell} />
            {visiblePlans.map((plan) => (
              <View key={plan} style={styles.compareCell}>
                <Text style={[styles.compareHeaderText, { color: PLAN_META[plan].accent }]}>
                  {lang === 'ja' ? PLAN_META[plan].nameJa : PLAN_META[plan].nameEn}
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
              {visiblePlans.map((plan) => (
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
    backgroundColor: 'rgba(0,0,0,0.5)',
  },

  // ローディング / エラー
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  errorTitle: { fontSize: 18, fontWeight: '700', color: C.ink, marginBottom: 8 },
  errorBody: {
    fontSize: 14,
    color: C.inkSoft,
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 22,
  },
  retryWrap: { borderRadius: 10, overflow: 'hidden' },
  retryButton: { paddingVertical: 13, paddingHorizontal: 36 },
  retryButtonText: { color: C.white, fontSize: 15, fontWeight: '700' },
  linkButton: { marginTop: 14, paddingVertical: 8, paddingHorizontal: 16 },
  linkButtonText: { color: C.inkSoft, fontSize: 14, fontWeight: '600' },

  // ヒーロー（都市写真）
  hero: {
    paddingHorizontal: 22,
    paddingBottom: 46,
    minHeight: 322,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  heroImage: {
    resizeMode: 'cover',
  },
  eyebrowChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.18)',
    marginBottom: 12,
  },
  eyebrowText: { color: C.white, fontSize: 11.5, fontWeight: '700', letterSpacing: 1.0 },
  heroTitle: {
    fontSize: 27,
    fontWeight: '700',
    color: C.white,
    letterSpacing: -0.2,
    lineHeight: 36,
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 10,
  },
  heroSubtitle: {
    fontSize: 13.5,
    color: C.heroSubtle,
    lineHeight: 21,
    marginTop: 9,
    maxWidth: '96%',
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },

  // カード行 — 横余白を最小限にしてカード幅を最大化。
  cardRow: {
    flexDirection: 'row',
    gap: 7,
    paddingHorizontal: 8,
    marginTop: 16,
    alignItems: 'stretch',
  },
  cardRowTight: { marginTop: 10 },
  cardCol: { flex: 1 },

  // 月額プランカード（主役・大きめ）
  // 横padding を詰めて文字の表示領域を最大化。ラジオは absolute 配置なので
  // 名前行は paddingRight (planCardTopRow) でラジオとの重なりを避ける。
  planCard: {
    flex: 1,
    backgroundColor: C.card,
    borderRadius: 14,
    borderWidth: 1.25,
    paddingHorizontal: 8,
    paddingTop: 16,
    paddingBottom: 14,
  },
  planCardSelected: {
    shadowOpacity: 0.45,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 7,
  },
  recoBadge: {
    position: 'absolute',
    top: -10,
    right: 10,
    paddingHorizontal: 9,
    paddingVertical: 3.5,
    borderRadius: 6,
  },
  recoBadgeText: { color: C.bg, fontSize: 10, fontWeight: '700', letterSpacing: 0.4 },
  planCardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    // 絶対配置ラジオ (right:12, 幅20) と重ならないよう、名前行に右余白を確保。
    paddingRight: 28,
  },
  // 「キリッ」感: 900の極太 → 700のbold、letterSpacing 1.0 で英字大文字感を強める。
  planCardName: { flex: 1, fontSize: 13, fontWeight: '700', letterSpacing: 1.0 },
  radioOn: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOff: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: C.border,
  },
  // ラジオ絶対配置用ラッパ (radioOn / radioOff と合成して使用)
  radioAbsWrap: {
    position: 'absolute',
    top: 12,
    right: 12,
    zIndex: 2,
  },
  planCardKind: { fontSize: 11, color: C.inkSoft, fontWeight: '600', marginTop: 8 },
  priceRow: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 3 },
  // 価格は強さを保ちつつ「極太の丸み」を抑える: 900 → 800、tight な letterSpacing。
  priceValue: { fontSize: 25, fontWeight: '800', color: C.ink, letterSpacing: -0.6 },
  priceValueSm: { fontSize: 18, fontWeight: '800', color: C.ink, letterSpacing: -0.4 },
  pricePer: { fontSize: 11, fontWeight: '600', color: C.inkFaint, marginLeft: 3, marginBottom: 3 },
  cancelNote: { fontSize: 10, color: C.inkFaint, marginTop: 4 },
  cardDivider: {
    height: 1,
    backgroundColor: C.divider,
    marginTop: 12,
    marginBottom: 11,
  },
  // 機能リスト — 3カラム時にも収まるよう、細字+小さめ。
  // 短いラベル (例「AIエージェント」「タスク管理サポート」「目標進捗管理AI」) が
  // 1行に収まるよう、fontSize=9 / gap=4 / dot=12 まで詰めてテキスト幅を確保する。
  // 長いラベル「ワークスペース制限なし (100枚以上作成可能)」のみ意図的に2行折返し。
  // 半角スペースを文中に入れて自然な折返し位置を担保している (PLAN_META 参照)。
  featureRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 4,
    marginBottom: 7,
  },
  featureDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1.5,
  },
  featureDotOff: {
    width: 12,
    height: 12,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.borderSoft,
    marginTop: 1.5,
  },
  featureText: { flex: 1, fontSize: 9, color: C.inkSoft, fontWeight: '400', lineHeight: 12.5 },
  featureTextOff: { flex: 1, fontSize: 9, color: C.inkFaint, fontWeight: '400', lineHeight: 12.5 },

  // 年額プランカード
  yearCard: {
    flex: 1,
    backgroundColor: C.card,
    borderRadius: 12,
    borderWidth: 1.25,
    paddingHorizontal: 8,
    paddingTop: 14,
    paddingBottom: 13,
  },
  yearKind: { flex: 1, fontSize: 10, fontWeight: '800' },
  // 月あたり pill —「月あたり ¥1,800」がカード幅 (~100px) を超えて末尾「…」省略
  // されてしまっていた。fontSize 11→9.5 / padding 9→6 / pill 幅を flex で
  // カード幅一杯まで広げ、末尾省略を起こさないように。
  perMoPill: {
    alignSelf: 'stretch',
    marginTop: 9,
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 5,
    alignItems: 'center',
  },
  perMoText: { fontSize: 9.5, fontWeight: '700', textAlign: 'center' },

  // 機能比較表
  compareCard: {
    marginHorizontal: 12,
    marginTop: 20,
    backgroundColor: C.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.borderSoft,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  compareTitle: { fontSize: 16, fontWeight: '700', color: C.ink, marginBottom: 12 },
  compareHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 9,
    borderBottomWidth: 1,
    borderBottomColor: C.divider,
  },
  compareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.divider,
  },
  compareRowLast: { borderBottomWidth: 0, paddingBottom: 2 },
  compareLabelCell: { flex: 1, paddingRight: 8 },
  compareLabelText: { fontSize: 12, color: C.inkSoft, lineHeight: 16 },
  compareCell: { width: 56, alignItems: 'center', justifyContent: 'center' },
  compareHeaderText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8 },
  compareCellText: { fontSize: 11, fontWeight: '700' },

  // フッター
  footer: { marginTop: 22, paddingHorizontal: 22 },
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
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: C.standard,
    shadowOpacity: 0.45,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 7,
  },
  ctaWrapDisabled: { opacity: 0.55 },
  cta: { paddingVertical: 17, alignItems: 'center', justifyContent: 'center' },
  ctaText: { color: C.white, fontSize: 16, fontWeight: '700', letterSpacing: 0.4 },
  restoreWrap: { alignItems: 'center', marginTop: 12 },
  restoreText: { fontSize: 13, color: C.inkSoft, fontWeight: '700' },
  restoreTextDisabled: { opacity: 0.5 },
});
