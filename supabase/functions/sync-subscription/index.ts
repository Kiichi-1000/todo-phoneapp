// 購入直後のサブスク状態 即時同期 Edge Function.
//
// POST /functions/v1/sync-subscription
// Body: {
//   productId?: string,            // 購入した ASC product_id
//   activeEntitlements?: string[], // RevenueCat customerInfo.entitlements.active のキー
//   expiresAt?: string | null      // entitlement の expirationDate (ISO)
// }
// Returns: { ok: true, status, plan } | { ok: false, error }
//
// なぜ必要か:
//   RevenueCat Webhook (revenuecat-webhook) はサーバ間通信なので、購入完了から
//   user_subscriptions への反映まで数秒〜十数秒のラグがある。その間ユーザーが
//   AI タブに戻ると checkAiAccess() がまだ「未加入」を返し、課金壁が再表示
//   される (= 体感バグ)。
//   このラグを埋めるため、購入成功直後にクライアントから本 Function を呼び、
//   RevenueCat の customerInfo スナップショットを渡して user_subscriptions を
//   即時 upsert する。
//
// 信頼境界:
//   クライアントが渡す情報は「ヒント」であり信用しすぎない。Webhook が後から
//   正本 (source of truth) として上書きする前提。本 Function は
//   「entitlement が有効なら active にする / 期限が来ていれば触らない」
//   という保守的な更新に留める。なりすましても得られるのは一時的な
//   アクセスのみで、実利用はトークン残高 (= サーバ管理) で別途律速される。
//   Webhook が来れば誤った状態は自動補正される。
//
// 認証:
//   通常の Supabase JWT。redeem-promo と同じく Authorization ヘッダの
//   ユーザートークンを検証して user_id を解決する。

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// revenuecat-webhook と同じ ASC 実商品マッピング (重複だが Edge Function 間で
// import 共有していないため各自に持つ。値は必ず両者で一致させること)。
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
  // revenuecat-webhook の PRODUCT_MAP と一致させること。
  "tosche_ai_pro_monthly": { plan: "pro", cycle: "monthly" },
  "tosche_ai_standard_monthly": { plan: "standard", cycle: "monthly" },
  "tosche_basic_monthly": { plan: "basic", cycle: "monthly" },
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return jsonResponse({ error: "Authorization required" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // ユーザートークンから user_id を解決 (redeem-promo と同パターン)。
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: userErr } = await userClient.auth.getUser();
  if (userErr || !user) return jsonResponse({ error: "Invalid token" }, 401);

  let body: {
    productId?: string;
    activeEntitlements?: string[];
    expiresAt?: string | null;
  } = {};
  try {
    body = await req.json();
  } catch {
    /* ignore — 空ボディでも下で扱う */
  }

  const activeEntitlements = Array.isArray(body.activeEntitlements)
    ? body.activeEntitlements
    : [];
  const hasActiveEntitlement = activeEntitlements.length > 0;

  // entitlement が一つも無ければ「まだ解放されていない」。ここでは何も書かず
  // 現状を返す (Webhook の到着を待つ / 復元失敗等)。
  if (!hasActiveEntitlement) {
    return jsonResponse({ ok: true, status: "none", plan: null, note: "no_active_entitlement" });
  }

  // 期限チェック: expiresAt があり、かつ既に過去なら active にしない。
  const now = Date.now();
  const expiresAt = body.expiresAt ?? null;
  if (expiresAt) {
    const ts = new Date(expiresAt).getTime();
    if (Number.isFinite(ts) && ts <= now) {
      return jsonResponse({ ok: true, status: "expired", plan: null, note: "entitlement_expired" });
    }
  }

  const productId = body.productId || null;
  // Google Play は product_id が "subscriptionId:basePlanId" 形式のことがある
  // (例: tosche_ai_standard_monthly:monthly)。":" 以降を落として引く
  // (iOS は ":" 無しなので無変換)。revenuecat-webhook と同じ正規化。
  const baseProductId = productId ? productId.split(":")[0] : null;
  const mapped = baseProductId ? PRODUCT_MAP[baseProductId] : undefined;

  const adminClient = createClient(supabaseUrl, serviceKey);

  // 既存行を読んで plan/billing_cycle/period を温存判定。
  const { data: existing, error: readErr } = await adminClient
    .from("user_subscriptions")
    .select("plan, billing_cycle, platform, current_period_start, next_grant_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (readErr) {
    console.error("[sync-subscription] read failed:", readErr.message);
    return jsonResponse({ error: "db_read_failed" }, 500);
  }

  const nowISO = new Date().toISOString();
  const row: Record<string, unknown> = {
    user_id: user.id,
    status: "active", // entitlement 有効 & 未失効 → active
    plan: mapped?.plan ?? existing?.plan ?? null,
    billing_cycle: mapped?.cycle ?? existing?.billing_cycle ?? null,
    product_id: baseProductId ?? undefined,
    // platform: 即時同期では確定情報が無い。既存行があれば温存（webhook が
    // event.store から ios/android/web を確定済みのことが多い）。新規行のみ
    // 暫定で "ios" を入れ、直後に届く revenuecat-webhook が正値へ上書きする。
    // (旧実装は無条件 "ios" 固定で、Android の新規行に誤った platform を書いていた)
    platform: existing?.platform ?? "ios",
    revenuecat_user_id: user.id, // appUserID = Supabase user_id 前提
    current_period_end: expiresAt ?? undefined,
    updated_at: nowISO,
  };
  // product_id が無いとき undefined を渡すと supabase-js が無視してくれる。
  if (!productId) delete row.product_id;
  if (!expiresAt) delete row.current_period_end;

  // current_period_start / next_grant_at は無ければ「今」をセット (Webhook が
  // 後で正確な値に上書きする)。既存値があれば温存。
  row.current_period_start = existing?.current_period_start ?? nowISO;
  if (!existing?.next_grant_at) row.next_grant_at = nowISO;

  const { error: upsertErr } = await adminClient
    .from("user_subscriptions")
    .upsert(row, { onConflict: "user_id" });

  if (upsertErr) {
    console.error("[sync-subscription] upsert failed:", upsertErr.message);
    return jsonResponse({ error: "db_upsert_failed", detail: upsertErr.message }, 500);
  }

  return jsonResponse({ ok: true, status: "active", plan: row.plan });
});
