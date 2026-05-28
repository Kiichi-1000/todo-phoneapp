// RevenueCat Webhook 受信 Edge Function.
//
// POST /functions/v1/revenuecat-webhook
//
// 役割:
//   RevenueCat から送られてくる課金イベント (INITIAL_PURCHASE, RENEWAL,
//   PRODUCT_CHANGE, CANCELLATION, EXPIRATION, BILLING_ISSUE, ...) を受け取り、
//   `user_subscriptions` テーブルに status / plan / billing_cycle /
//   current_period_* / product_id / platform / revenuecat_user_id を
//   upsert (user_id ベース) する。
//
// なぜ必要か:
//   これまで RevenueCat の購入結果を user_subscriptions に書き込むコードが
//   どこにも無く、ユーザーが App Store でサブスクを購入しても
//   checkAiAccess() が永遠に「未加入」を返していた (課金壁の無限ループ)。
//   この Function が「購入 → 解放」のサーバ側の結び目になる。
//
// 認証:
//   RevenueCat ダッシュボードの Webhook 設定で「Authorization header value」を
//   設定でき、その値が毎リクエストの `Authorization` ヘッダにそのまま入る。
//   ここでは環境変数 `REVENUECAT_WEBHOOK_AUTH_HEADER` と完全一致するか検証する。
//   (Supabase の JWT 検証は無効化してデプロイする想定 = --no-verify-jwt。
//    RevenueCat は Supabase の JWT を持たないため。代わりに上記共有シークレットで守る)
//
// app_user_id の前提:
//   RevenueCat SDK は `ensureRevenueCat(userId)` で `appUserID` に Supabase の
//   auth user_id を渡して configure している (lib/revenueCat.ts 参照)。
//   よって Webhook payload の `event.app_user_id` を Supabase の user_id と
//   みなして良い。ただし RevenueCat が匿名 ID ($RCAnonymousID:...) を送る
//   ケース (configure 前の購入等) は user_id として解決できないのでスキップする。
//
// 不明点 / 前提 (payload 形状の細部):
//   RevenueCat の Webhook payload は { event: {...}, api_version } 形。
//   - event.type        : イベント種別
//   - event.app_user_id : アプリ側で設定した appUserID
//   - event.original_app_user_id : 同上 (古い形)
//   - event.product_id  : 購入された商品ID (ASC の product_id)
//   - event.expiration_at_ms / purchased_at_ms : エポックミリ秒
//   - event.store        : "APP_STORE" | "PLAY_STORE" | "STRIPE" | ...
//   - event.environment  : "PRODUCTION" | "SANDBOX"
//   payload の細部はバージョンで揺れるため、必須でないフィールドは
//   オプショナル前提で防御的に読む。

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ------------------------------------------------------------
// 商品ID → plan / billing_cycle のマッピング
//
// ASC に実在する6商品 (参照名 / product_id / 周期):
//   AI Pro            / ToSche.AI.Pro.1.2        / 月額
//   AI Pro Yearly     / tosche_ai_pro_yearly     / 年額
//   AI Standard       / ToSche.AI.std.1.2        / 月額
//   AI Standard Yearly/ tosche_ai_standard_yearly/ 年額
//   ToSche Basic      / ToSche.std.1.2           / 月額
//   ToSche Yearly     / tosche_basic_yearly      / 年額
//
// Google Play は product_id に大文字を許可しないため、月額3商品は別名で登録する。
// 年額3商品は既に lowercase なので iOS と同じ ID を再利用する。
// Play 側で Tsukui-san が以下のID で6商品を作成する前提:
//   pro 月額      → tosche_ai_pro_monthly
//   pro 年額      → tosche_ai_pro_yearly (iOS と共通)
//   standard 月額 → tosche_ai_standard_monthly
//   standard 年額 → tosche_ai_standard_yearly (iOS と共通)
//   basic 月額    → tosche_basic_monthly
//   basic 年額    → tosche_basic_yearly (iOS と共通)
// ------------------------------------------------------------
type PlanTier = "basic" | "standard" | "pro";
type Cycle = "monthly" | "yearly";

const PRODUCT_MAP: Record<string, { plan: PlanTier; cycle: Cycle }> = {
  // iOS (App Store)
  "ToSche.AI.Pro.1.2": { plan: "pro", cycle: "monthly" },
  "tosche_ai_pro_yearly": { plan: "pro", cycle: "yearly" },
  "ToSche.AI.std.1.2": { plan: "standard", cycle: "monthly" },
  "tosche_ai_standard_yearly": { plan: "standard", cycle: "yearly" },
  "ToSche.std.1.2": { plan: "basic", cycle: "monthly" },
  "tosche_basic_yearly": { plan: "basic", cycle: "yearly" },
  // Android (Google Play) — 月額3商品は別ID。年額は上記と共通。
  "tosche_ai_pro_monthly": { plan: "pro", cycle: "monthly" },
  "tosche_ai_standard_monthly": { plan: "standard", cycle: "monthly" },
  "tosche_basic_monthly": { plan: "basic", cycle: "monthly" },
};

// PRODUCT_CHANGE で差額付与を計算するための plan → 月次付与額 (yen)。
// monthly-token-grant/index.ts の PLAN_GRANT_YEN と一致させること。
// basic は AI トークン無しのため 0 円。
const PLAN_GRANT_YEN: Record<PlanTier, number> = {
  basic: 0,
  standard: 400,
  pro: 700,
};

// RevenueCat の event.store → user_subscriptions.platform
function mapPlatform(store: string | undefined): "ios" | "android" | "web" {
  switch ((store || "").toUpperCase()) {
    case "PLAY_STORE":
      return "android";
    case "STRIPE":
    case "PADDLE":
    case "RC_BILLING":
      return "web";
    case "APP_STORE":
    case "MAC_APP_STORE":
    default:
      // ToSche は現状 iOS のみ。不明な store は ios 扱い (最も近い既定)。
      return "ios";
  }
}

// RevenueCat の event.type → user_subscriptions.status
//
// status CHECK: active/trialing/past_due/canceled/expired/promo/none
//
// 設計意図:
//   - INITIAL_PURCHASE / RENEWAL / PRODUCT_CHANGE / UNCANCELLATION
//       → active (= AI 機能解放)。トライアル中かどうかは event.period_type で
//         上書き判定する (下記 resolveStatus 参照)。
//   - CANCELLATION  → "解約予約" だが current_period_end までは使えるので
//                     active のまま (期限到来は EXPIRATION が別途飛んでくる)。
//                     ※ ここで canceled にすると即アクセス遮断になり UX を壊す。
//   - EXPIRATION    → expired (= 期限切れ。アクセス遮断)
//   - BILLING_ISSUE → past_due (= 支払い失敗。猶予期間中。判定上はアクセス遮断側)
//   - その他 (TRANSFER, SUBSCRIPTION_PAUSED, NON_RENEWING_PURCHASE 等) は
//     保守的に「触らない」= null を返してスキップする。
function resolveStatus(
  eventType: string,
  periodType: string | undefined,
): "active" | "trialing" | "past_due" | "expired" | null {
  switch (eventType) {
    case "INITIAL_PURCHASE":
    case "RENEWAL":
    case "PRODUCT_CHANGE":
    case "UNCANCELLATION":
      // period_type が "TRIAL" のときは trialing。それ以外は active。
      return (periodType || "").toUpperCase() === "TRIAL" ? "trialing" : "active";
    case "CANCELLATION":
      // 解約予約。current_period_end まではアクセス可 → active のまま据え置き。
      return "active";
    case "EXPIRATION":
      return "expired";
    case "BILLING_ISSUE":
      return "past_due";
    default:
      return null; // 未対応イベントはスキップ
  }
}

function msToISO(ms: number | undefined | null): string | null {
  if (ms == null || !Number.isFinite(Number(ms))) return null;
  return new Date(Number(ms)).toISOString();
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  // 1. 共有シークレット検証 (RevenueCat ダッシュボードの Authorization header value)
  const expectedAuth = Deno.env.get("REVENUECAT_WEBHOOK_AUTH_HEADER");
  const gotAuth = req.headers.get("Authorization") || "";
  if (!expectedAuth) {
    // シークレット未設定 = 設定ミス。誰でも書き込めると危険なので 500 で止める。
    console.error("[revenuecat-webhook] REVENUECAT_WEBHOOK_AUTH_HEADER not set");
    return jsonResponse({ error: "webhook_not_configured" }, 500);
  }
  if (gotAuth !== expectedAuth) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  // 2. payload パース
  let payload: { event?: Record<string, unknown> } = {};
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: "invalid_json" }, 400);
  }

  const event = payload.event;
  if (!event || typeof event !== "object") {
    return jsonResponse({ error: "missing_event" }, 400);
  }

  const eventType = String(event.type || "");
  // app_user_id を Supabase の auth user_id とみなす (上部コメント参照)。
  const appUserId =
    (event.app_user_id as string | undefined) ||
    (event.original_app_user_id as string | undefined) ||
    "";

  // 匿名 ID は Supabase の user_id に解決できないのでスキップ (200 で握る:
  // RevenueCat にリトライさせない。我々側で扱えないだけでエラーではない)。
  if (!appUserId || appUserId.startsWith("$RCAnonymousID:")) {
    return jsonResponse({ ok: true, skipped: "anonymous_or_missing_app_user_id" });
  }

  // UUID 形式でなければ Supabase の user_id ではない → スキップ。
  const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_RE.test(appUserId)) {
    return jsonResponse({ ok: true, skipped: "app_user_id_not_uuid" });
  }

  // 3. status 解決。未対応イベントは触らずスキップ。
  const periodType = event.period_type as string | undefined;
  const status = resolveStatus(eventType, periodType);
  if (status === null) {
    return jsonResponse({ ok: true, skipped: `unhandled_event:${eventType}` });
  }

  // 4. 商品情報の解決
  // Google Play の subscription は product_id が "subscriptionId:basePlanId"
  // 形式 (例: tosche_ai_standard_monthly:monthly) で届く。PRODUCT_MAP は
  // basePlanId 抜きの素の product_id で持つため、":" 以降を落として引く。
  // iOS (App Store) の product_id は ":" を含まないので無変換 = 影響なし。
  // ※ これを怠ると plan=null となり monthly-token-grant が "unknown_plan" で
  //   スキップし、トークンが一切付与されない (= Android 課金後にAI解放されない)。
  const productId = (event.product_id as string | undefined) || null;
  const baseProductId = productId ? productId.split(":")[0] : null;
  const mapped = baseProductId ? PRODUCT_MAP[baseProductId] : undefined;
  // 未知の product_id でも status の更新だけは通す (アクセス解放を優先)。
  // plan / billing_cycle は分からなければ既存値を温存する (下記 upsert で制御)。
  const plan = mapped?.plan ?? null;
  const billingCycle = mapped?.cycle ?? null;

  const platform = mapPlatform(event.store as string | undefined);
  const currentPeriodEnd = msToISO(event.expiration_at_ms as number | undefined);
  const currentPeriodStart = msToISO(event.purchased_at_ms as number | undefined);
  const revenuecatUserId =
    (event.original_app_user_id as string | undefined) || appUserId;

  // 5. service_role クライアントで upsert
  const adminClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // 既存行を読む (user_id は UNIQUE)。plan/billing_cycle/period の温存判定に使う。
  const { data: existing, error: readErr } = await adminClient
    .from("user_subscriptions")
    .select(
      "id, plan, billing_cycle, current_period_start, current_period_end, next_grant_at",
    )
    .eq("user_id", appUserId)
    .maybeSingle();

  if (readErr) {
    console.error("[revenuecat-webhook] read failed:", readErr.message);
    return jsonResponse({ error: "db_read_failed" }, 500);
  }

  // upsert する行を組み立てる。
  // 未知商品 (mapped=undefined) のときは plan/billing_cycle を「既存値温存」。
  const row: Record<string, unknown> = {
    user_id: appUserId,
    status,
    plan: plan ?? existing?.plan ?? null,
    billing_cycle: billingCycle ?? existing?.billing_cycle ?? null,
    product_id: baseProductId ?? productId ?? null,
    platform,
    revenuecat_user_id: revenuecatUserId,
    updated_at: new Date().toISOString(),
  };

  // current_period_* は payload に入っていれば更新、無ければ既存値温存。
  // EXPIRATION/CANCELLATION でも expiration_at_ms は通常入る。
  if (currentPeriodStart) row.current_period_start = currentPeriodStart;
  else if (existing?.current_period_start) {
    row.current_period_start = existing.current_period_start;
  }
  if (currentPeriodEnd) row.current_period_end = currentPeriodEnd;
  else if (existing?.current_period_end) {
    row.current_period_end = existing.current_period_end;
  }

  // next_grant_at: monthly-token-grant Edge Function が「次の付与タイミング」を
  // 見るカラム。新規購入/更新で active になったら、トークン付与バッチが
  // すぐ拾えるよう current_period_start (= 今) をセットする。
  // 既に値があれば温存 (バッチが回した結果を上書きしない)。
  if (status === "active" || status === "trialing") {
    if (!existing?.next_grant_at) {
      row.next_grant_at = currentPeriodStart ?? new Date().toISOString();
    }
  }

  // upsert (user_id が UNIQUE なので onConflict: user_id)。
  const { error: upsertErr } = await adminClient
    .from("user_subscriptions")
    .upsert(row, { onConflict: "user_id" });

  if (upsertErr) {
    console.error("[revenuecat-webhook] upsert failed:", upsertErr.message);
    return jsonResponse({ error: "db_upsert_failed", detail: upsertErr.message }, 500);
  }

  // 6. PRODUCT_CHANGE のアップグレード差額付与
  //
  // ユーザーが期中に上位プランに乗り換えた場合 (例: Standard ¥400 → Pro ¥700)、
  // user_subscriptions.plan の更新だけだと当月分のトークンは旧プランのまま
  // (差額 ¥300 が反映されない)。月次バッチ (monthly-token-grant) は
  // next_grant_at 到来まで動かないため、ここで即時に差額を付与する。
  //
  // ダウングレード (Pro → Standard) は付与済みトークンを剥がさない (UX 優先)。
  //
  // 冪等性: 同じ event.id が ai_token_transactions.metadata に既に
  // 記録されていればスキップ (RC の再送対策)。
  const upgradeResult = await handleProductChangeDiff({
    adminClient,
    eventType,
    eventId: (event.id as string | undefined) || null,
    userId: appUserId,
    oldPlan: existing?.plan as PlanTier | null | undefined,
    newPlan: plan as PlanTier | null,
    currentGrantExpiresAt:
      (row.current_period_end as string | undefined) ?? null,
  });

  return jsonResponse({
    ok: true,
    event_type: eventType,
    user_id: appUserId,
    status,
    plan: row.plan,
    upgrade: upgradeResult,
  });
});

// ------------------------------------------------------------
// PRODUCT_CHANGE 差額付与
// ------------------------------------------------------------
async function handleProductChangeDiff(args: {
  adminClient: ReturnType<typeof createClient>;
  eventType: string;
  eventId: string | null;
  userId: string;
  oldPlan: PlanTier | null | undefined;
  newPlan: PlanTier | null;
  currentGrantExpiresAt: string | null;
}): Promise<{ applied: boolean; reason?: string; diff_yen?: number }> {
  const { adminClient, eventType, eventId, userId, oldPlan, newPlan } = args;

  if (eventType !== "PRODUCT_CHANGE") {
    return { applied: false, reason: "not_product_change" };
  }
  if (!oldPlan || !newPlan || oldPlan === newPlan) {
    return { applied: false, reason: "no_plan_change" };
  }
  const oldGrant = PLAN_GRANT_YEN[oldPlan] ?? 0;
  const newGrant = PLAN_GRANT_YEN[newPlan] ?? 0;
  const diff = newGrant - oldGrant;
  if (diff <= 0) {
    return { applied: false, reason: "downgrade_or_equal", diff_yen: diff };
  }

  // 冪等性チェック: 同じ event_id が既に処理済みなら skip
  if (eventId) {
    const { data: dup, error: dupErr } = await adminClient
      .from("ai_token_transactions")
      .select("id")
      .eq("user_id", userId)
      .filter("metadata->>event_id", "eq", eventId)
      .limit(1)
      .maybeSingle();
    if (dupErr) {
      console.error("[product_change] dup check failed:", dupErr.message);
      // 続行 (重複付与の方がユーザーに不利益が無い)
    }
    if (dup) {
      return { applied: false, reason: "already_processed", diff_yen: diff };
    }
  }

  // 残高 read
  const { data: bal, error: balErr } = await adminClient
    .from("ai_token_balances")
    .select(
      "current_grant_yen, current_grant_expires_at, carryover_yen, carryover_expires_at, total_granted_yen, total_consumed_yen, total_expired_yen",
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (balErr) {
    console.error("[product_change] balance read failed:", balErr.message);
    return { applied: false, reason: "balance_read_failed" };
  }

  const oldCurrent = Number(bal?.current_grant_yen ?? 0);
  const oldTotalGranted = Number(bal?.total_granted_yen ?? 0);
  const carryover = Number(bal?.carryover_yen ?? 0);
  const newCurrent = oldCurrent + diff;
  const newTotalGranted = oldTotalGranted + diff;
  const balanceAfter = newCurrent + carryover;

  // current_grant_expires_at は既存の値を温存 (アップグレード時の有効期限延長は
  // しない: 当月分の差額を埋めるだけ)。ただし残高行が無い場合は newPlan の
  // 次サイクルまでで設定する必要がある。
  const newExpiresAt =
    bal?.current_grant_expires_at ?? args.currentGrantExpiresAt;

  if (!bal) {
    // ai_token_balances 行が無いケース (basic から upgrade など)
    const { error: insErr } = await adminClient
      .from("ai_token_balances")
      .insert({
        user_id: userId,
        current_grant_yen: newCurrent,
        current_grant_expires_at: newExpiresAt,
        carryover_yen: 0,
        carryover_expires_at: null,
        total_granted_yen: newTotalGranted,
        total_consumed_yen: 0,
        total_expired_yen: 0,
      });
    if (insErr) {
      console.error("[product_change] balance insert failed:", insErr.message);
      return { applied: false, reason: "balance_insert_failed" };
    }
  } else {
    const { error: updErr } = await adminClient
      .from("ai_token_balances")
      .update({
        current_grant_yen: newCurrent,
        total_granted_yen: newTotalGranted,
      })
      .eq("user_id", userId);
    if (updErr) {
      console.error("[product_change] balance update failed:", updErr.message);
      return { applied: false, reason: "balance_update_failed" };
    }
  }

  const { error: txErr } = await adminClient.from("ai_token_transactions")
    .insert({
      user_id: userId,
      kind: "grant",
      amount_yen: diff,
      balance_after_yen: balanceAfter,
      metadata: {
        source: "product_change_upgrade",
        from_plan: oldPlan,
        to_plan: newPlan,
        event_id: eventId,
      },
    });
  if (txErr) {
    console.error("[product_change] tx insert failed:", txErr.message);
    // 残高は更新済み。ログだけ失敗の状態だが、ユーザー影響は無いので続行。
  }

  return { applied: true, diff_yen: diff };
}
