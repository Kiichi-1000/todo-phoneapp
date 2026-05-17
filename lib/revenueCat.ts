// RevenueCat SDK wrapper.
//
// API key selection logic:
//   - `__DEV__ === true` (Metro / dev client): use Test Store key (`test_xxx`)
//   - `__DEV__ === false` (TestFlight / App Store): prefer Production key (`appl_xxx`)
//                          fallback to Test key if Prod is not yet set
// → これで開発中は RC Test Store の dummy 課金で動作確認、本番ビルドでは自動的に
//   App Store 連携の Production Key に切り替わる。
//
// app.json の extra に以下のキーを設定:
//   revenuecatApiKeyIos      : test_xxx (Test Store)
//   revenuecatApiKeyIosProd  : appl_xxx (Production, App Store Connect 連携後に発行)
//   revenuecatApiKeyAndroid  : goog_xxx (v1.3 で Android 対応時)
//
// RevenueCat is configured per-platform. If no key is found, the module runs
// in "stub" mode and exposes a deterministic empty state — the rest of the
// app keeps building/running.

import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { supabase } from '@/lib/supabase';

function pickIosKey(): string {
  const extra = Constants.expoConfig?.extra as
    | { revenuecatApiKeyIos?: string; revenuecatApiKeyIosProd?: string }
    | undefined;
  // dev mode (Metro / dev client) は Test Store キーを使う
  if (__DEV__) {
    return (
      process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_IOS ||
      extra?.revenuecatApiKeyIos ||
      ''
    );
  }
  // production build は appl_ キー優先、fallback で test_
  return (
    process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_IOS_PROD ||
    extra?.revenuecatApiKeyIosProd ||
    extra?.revenuecatApiKeyIos ||
    ''
  );
}

function pickAndroidKey(): string {
  const extra = Constants.expoConfig?.extra as
    | { revenuecatApiKeyAndroid?: string; revenuecatApiKeyAndroidProd?: string }
    | undefined;
  if (__DEV__) {
    return (
      process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID ||
      extra?.revenuecatApiKeyAndroid ||
      ''
    );
  }
  return (
    process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID_PROD ||
    extra?.revenuecatApiKeyAndroidProd ||
    extra?.revenuecatApiKeyAndroid ||
    ''
  );
}

const REVENUECAT_PUBLIC_KEY_IOS = pickIosKey();
const REVENUECAT_PUBLIC_KEY_ANDROID = pickAndroidKey();

// Plan / Cycle は App Store Connect の実商品構成に合わせる。
// 実商品は Basic / Standard / Pro の3階層 × 月額 / 年額 の6つ。
// (旧 ai_light / ai_standard / half_year 設計は廃止)
export type Plan = 'basic' | 'standard' | 'pro';
export type Cycle = 'monthly' | 'yearly';

export interface PriceOption {
  identifier: string;        // App Store/Play product ID
  plan: Plan;
  cycle: Cycle;
  priceString: string;       // Localized price string from store, e.g. "¥1,000"
  priceMicros: number;       // Numeric value in micros (1¥ = 1,000,000 micros)
  currencyCode: string;      // "JPY" / "USD"
}

export interface PurchaseResult {
  success: boolean;
  cancelled?: boolean;
  error?: string;
  // RevenueCat の生 CustomerInfo。カスタム Paywall から
  // syncSubscriptionAfterPurchase() にそのまま渡せるよう公開する。
  customerInfo?: any;
  customerInfoSnapshot?: {
    activeEntitlements: string[];
    expiresAt?: string | null;
  };
}

// Default placeholder offerings used when RevenueCat is not yet configured
// (stub モード / web / API キー未設定時のフォールバック表示用)。
//
// identifier は App Store Connect / Google Play に実在する商品の product_id に
// 厳密に一致させること。SDK 経由で取得した実 Offering の product_id とこの
// identifier を突き合わせて価格を上書きするため (getOfferings 参照)、ズレると
// 価格が出ない。
//
// iOS と Android で月額3商品は product_id が異なる (Play は大文字不可のため):
//   iOS                       / Android                       / 周期
//   ToSche.std.1.2            / tosche_basic_monthly          / 月額 basic
//   ToSche.AI.std.1.2         / tosche_ai_standard_monthly    / 月額 standard
//   ToSche.AI.Pro.1.2         / tosche_ai_pro_monthly         / 月額 pro
// 年額3商品は両プラットフォームで共通 (元から lowercase):
//   tosche_basic_yearly / tosche_ai_standard_yearly / tosche_ai_pro_yearly
//
// priceString / priceMicros は「仮置き」。実価格は RevenueCat / Store から
// 取得した値 (getOfferings 内で SDK の pkg.product から上書き) が正となる。
const PLACEHOLDER_OFFERINGS_IOS: PriceOption[] = [
  { identifier: 'ToSche.std.1.2',           plan: 'basic',    cycle: 'monthly', priceString: '¥300',    priceMicros: 300_000_000,    currencyCode: 'JPY' },
  { identifier: 'tosche_basic_yearly',      plan: 'basic',    cycle: 'yearly',  priceString: '¥3,240',  priceMicros: 3_240_000_000,  currencyCode: 'JPY' },
  { identifier: 'ToSche.AI.std.1.2',        plan: 'standard', cycle: 'monthly', priceString: '¥1,200',  priceMicros: 1_200_000_000,  currencyCode: 'JPY' },
  { identifier: 'tosche_ai_standard_yearly',plan: 'standard', cycle: 'yearly',  priceString: '¥12,960', priceMicros: 12_960_000_000, currencyCode: 'JPY' },
  { identifier: 'ToSche.AI.Pro.1.2',        plan: 'pro',      cycle: 'monthly', priceString: '¥2,000',  priceMicros: 2_000_000_000,  currencyCode: 'JPY' },
  { identifier: 'tosche_ai_pro_yearly',     plan: 'pro',      cycle: 'yearly',  priceString: '¥21,600', priceMicros: 21_600_000_000, currencyCode: 'JPY' },
];

const PLACEHOLDER_OFFERINGS_ANDROID: PriceOption[] = [
  { identifier: 'tosche_basic_monthly',       plan: 'basic',    cycle: 'monthly', priceString: '¥300',    priceMicros: 300_000_000,    currencyCode: 'JPY' },
  { identifier: 'tosche_basic_yearly',        plan: 'basic',    cycle: 'yearly',  priceString: '¥3,240',  priceMicros: 3_240_000_000,  currencyCode: 'JPY' },
  { identifier: 'tosche_ai_standard_monthly', plan: 'standard', cycle: 'monthly', priceString: '¥1,200',  priceMicros: 1_200_000_000,  currencyCode: 'JPY' },
  { identifier: 'tosche_ai_standard_yearly',  plan: 'standard', cycle: 'yearly',  priceString: '¥12,960', priceMicros: 12_960_000_000, currencyCode: 'JPY' },
  { identifier: 'tosche_ai_pro_monthly',      plan: 'pro',      cycle: 'monthly', priceString: '¥2,000',  priceMicros: 2_000_000_000,  currencyCode: 'JPY' },
  { identifier: 'tosche_ai_pro_yearly',       plan: 'pro',      cycle: 'yearly',  priceString: '¥21,600', priceMicros: 21_600_000_000, currencyCode: 'JPY' },
];

// `getOfferings` の placeholder 探索は iOS/Android 両方を含むテーブルを引く
// (SDK が返す productId はプラットフォーム由来なのでどちらの ID も来うる)。
// フォールバック表示は現プラットフォームの 6 商品だけにする。
const PLACEHOLDER_OFFERINGS_ALL: PriceOption[] = [
  ...PLACEHOLDER_OFFERINGS_IOS,
  ...PLACEHOLDER_OFFERINGS_ANDROID.filter(
    (a) => !PLACEHOLDER_OFFERINGS_IOS.some((i) => i.identifier === a.identifier),
  ),
];

const PLACEHOLDER_OFFERINGS: PriceOption[] =
  Platform.OS === 'android' ? PLACEHOLDER_OFFERINGS_ANDROID : PLACEHOLDER_OFFERINGS_IOS;

let initPromise: Promise<void> | null = null;
let initialized = false;
let purchasesModule: any = null;

function shouldUseStub(): boolean {
  if (Platform.OS === 'web') return true;
  const key =
    Platform.OS === 'ios' ? REVENUECAT_PUBLIC_KEY_IOS : REVENUECAT_PUBLIC_KEY_ANDROID;
  return !key;
}

/**
 * Lazily initialize the SDK. Safe to call repeatedly.
 * No-op when running in stub mode (no API key, web, etc.).
 *
 * IMPORTANT: userId が undefined のまま configure すると RevenueCat は匿名 ID
 * ($RCAnonymousID:...) を振る。すると後続の Webhook が
 * `app_user_id_not_uuid` でスキップされ、user_subscriptions が永遠に更新されない
 * (= 課金壁の無限ループ)。よって `userId` 必須のセマンティクスで運用する:
 *   - userId 未指定で呼ばれた場合は init をスキップし、後で再呼出を待つ
 *   - 既に匿名で initialized 済みなら、logIn(userId) で identify を切り替える
 */
export async function ensureRevenueCat(userId?: string): Promise<void> {
  if (shouldUseStub()) return;
  if (!userId) return; // hydration 競合の保険。user.id が決まるまで configure しない
  if (initialized) {
    // SDK が既に動いている場合でも、appUserID が想定と違う可能性があるので
    // logIn を必ず通して紐付けを確定させる (logIn はべき等)。
    await logInToRevenueCat(userId);
    return;
  }
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      // Lazy import — react-native-purchases requires native module
      // and is excluded by web bundling.
      const mod = require('react-native-purchases');
      purchasesModule = mod?.default ?? mod;
      const apiKey =
        Platform.OS === 'ios' ? REVENUECAT_PUBLIC_KEY_IOS : REVENUECAT_PUBLIC_KEY_ANDROID;
      await purchasesModule.configure({ apiKey, appUserID: userId });
      initialized = true;
    } catch (e) {
      console.warn('[revenueCat] Failed to initialize, falling back to stub:', e);
      purchasesModule = null;
      initialized = false;
    }
  })();

  return initPromise;
}

/**
 * Supabase auth user_id を RevenueCat の appUserID として明示的に再紐付けする。
 * 直前に呼んでおくと「configure 時は匿名 → 購入時には正しい UUID」のレースに
 * 強くなる。SDK 内部でべき等。
 */
async function logInToRevenueCat(userId: string): Promise<void> {
  if (!purchasesModule || !userId) return;
  try {
    await purchasesModule.logIn(userId);
  } catch (e) {
    console.warn('[revenueCat] logIn failed:', e);
  }
}

/**
 * 現在の CustomerInfo を取得 (購入後のリトライで最新 entitlement を再確認するため)。
 * stub モード / 未 init では null。
 */
export async function fetchCustomerInfo(): Promise<any | null> {
  if (shouldUseStub() || !purchasesModule) return null;
  try {
    return await purchasesModule.getCustomerInfo();
  } catch (e) {
    console.warn('[revenueCat] getCustomerInfo failed:', e);
    return null;
  }
}

export async function getOfferings(): Promise<PriceOption[]> {
  if (shouldUseStub() || !purchasesModule) {
    return PLACEHOLDER_OFFERINGS;
  }
  try {
    const offerings = await purchasesModule.getOfferings();
    const current = offerings?.current;
    if (!current) return PLACEHOLDER_OFFERINGS;

    const result: PriceOption[] = [];
    for (const pkg of current.availablePackages ?? []) {
      const productId = pkg.product?.identifier ?? pkg.identifier;
      // PLACEHOLDER_OFFERINGS_ALL は iOS + Android 両方のIDを含む。SDK が返す
      // productId はプラットフォーム由来なのでどちらでも引けるよう全集合で探す。
      const placeholder = PLACEHOLDER_OFFERINGS_ALL.find((p) => p.identifier === productId);
      if (!placeholder) continue;
      result.push({
        ...placeholder,
        priceString: pkg.product?.priceString ?? placeholder.priceString,
        priceMicros: pkg.product?.priceAmountMicros ?? placeholder.priceMicros,
        currencyCode: pkg.product?.currencyCode ?? placeholder.currencyCode,
      });
    }
    return result.length > 0 ? result : PLACEHOLDER_OFFERINGS;
  } catch (e) {
    console.warn('[revenueCat] getOfferings failed:', e);
    return PLACEHOLDER_OFFERINGS;
  }
}

export async function purchasePackage(productId: string): Promise<PurchaseResult> {
  if (shouldUseStub() || !purchasesModule) {
    return {
      success: false,
      error: 'RevenueCat is not configured. Real purchases require RevenueCat + App Store Connect setup.',
    };
  }
  try {
    const offerings = await purchasesModule.getOfferings();
    const pkg = offerings?.current?.availablePackages?.find(
      (p: any) => p.product?.identifier === productId,
    );
    if (!pkg) {
      return { success: false, error: `Product ${productId} not found in offerings` };
    }
    const { customerInfo } = await purchasesModule.purchasePackage(pkg);
    return {
      success: true,
      customerInfo,
      customerInfoSnapshot: snapshotCustomerInfo(customerInfo),
    };
  } catch (e: any) {
    if (e?.userCancelled) return { success: false, cancelled: true };
    return { success: false, error: e?.message ?? String(e) };
  }
}

export async function restorePurchases(): Promise<PurchaseResult> {
  if (shouldUseStub() || !purchasesModule) {
    return { success: false, error: 'RevenueCat is not configured.' };
  }
  try {
    const customerInfo = await purchasesModule.restorePurchases();
    return {
      success: true,
      customerInfo,
      customerInfoSnapshot: snapshotCustomerInfo(customerInfo),
    };
  } catch (e: any) {
    return { success: false, error: e?.message ?? String(e) };
  }
}

function snapshotCustomerInfo(customerInfo: any) {
  const entitlements = customerInfo?.entitlements?.active ?? {};
  return {
    activeEntitlements: Object.keys(entitlements),
    expiresAt:
      Object.values(entitlements).map((e: any) => e?.expirationDate)[0] ?? null,
  };
}

/**
 * 購入/復元の直後に Supabase 側の user_subscriptions を「即時」更新する。
 *
 * なぜ必要か:
 *   購入の正本反映は RevenueCat Webhook (Edge Function: revenuecat-webhook) が
 *   担うが、サーバ間通信なので数秒〜十数秒のラグがある。その間に AI タブへ
 *   戻ると checkAiAccess() がまだ「未加入」を返し課金壁が再表示されてしまう。
 *   このラグを埋めるため、購入成功直後にクライアントから sync-subscription
 *   Edge Function を叩いて user_subscriptions を即 active にする。
 *
 *   渡す情報は「ヒント」であり、後から来る Webhook が正本として上書きする。
 *
 * @param customerInfo RevenueCat の CustomerInfo (purchase/restore の戻り値、
 *                      または RevenueCatUI.Paywall のコールバック引数)
 * @param productId    購入した ASC product_id (分かれば。restore 時は不明可)
 * @returns 同期に成功したか (失敗しても致命的ではない: Webhook が後で補正する)
 */
export async function syncSubscriptionAfterPurchase(
  customerInfo: any,
  productId?: string,
): Promise<boolean> {
  try {
    const snapshot = snapshotCustomerInfo(customerInfo);
    const { data, error } = await supabase.functions.invoke('sync-subscription', {
      body: {
        productId: productId ?? null,
        activeEntitlements: snapshot.activeEntitlements,
        expiresAt: snapshot.expiresAt,
      },
    });
    if (error) {
      console.warn('[revenueCat] syncSubscriptionAfterPurchase failed:', error);
      return false;
    }
    return (data as any)?.ok === true && (data as any)?.status === 'active';
  } catch (e) {
    // 同期失敗は致命的ではない。Webhook が後で正しい状態に補正する。
    console.warn('[revenueCat] syncSubscriptionAfterPurchase threw:', e);
    return false;
  }
}

export const isRevenueCatConfigured = () => !shouldUseStub();
