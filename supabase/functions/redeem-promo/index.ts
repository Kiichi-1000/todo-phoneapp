// Coupon redemption Edge Function.
//
// POST /functions/v1/redeem-promo
// Body: { code: string }
// Returns: { ok: true, valid_until?, kind, granted_token_yen? } | { ok: false, error }

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

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: userErr } = await userClient.auth.getUser();
  if (userErr || !user) return jsonResponse({ error: "Invalid token" }, 401);

  let body: { code?: string } = {};
  try { body = await req.json(); } catch { /* ignore */ }
  const code = (body.code || "").trim().toUpperCase();
  if (!code) return jsonResponse({ ok: false, error: "code is required" }, 400);

  const adminClient = createClient(supabaseUrl, serviceKey);

  // 1. Lookup the code
  const { data: promo } = await adminClient
    .from("ai_promo_codes")
    .select("*")
    .eq("code", code)
    .maybeSingle();

  if (!promo) return jsonResponse({ ok: false, error: "code_not_found" }, 404);
  if (!promo.is_active) return jsonResponse({ ok: false, error: "code_inactive" }, 400);

  const now = new Date();
  const nowMs = now.getTime();
  if (promo.starts_at && new Date(promo.starts_at).getTime() > nowMs) {
    return jsonResponse({ ok: false, error: "code_not_yet_active" }, 400);
  }
  if (promo.expires_at && new Date(promo.expires_at).getTime() < nowMs) {
    return jsonResponse({ ok: false, error: "code_expired" }, 400);
  }
  if (
    promo.max_redemptions !== null &&
    promo.current_redemptions >= promo.max_redemptions
  ) {
    return jsonResponse({ ok: false, error: "code_redemption_limit_reached" }, 400);
  }

  // 2. Check if user already redeemed
  const { data: existing } = await adminClient
    .from("ai_promo_redemptions")
    .select("id, valid_until")
    .eq("user_id", user.id)
    .eq("code", code)
    .maybeSingle();

  if (existing) {
    return jsonResponse({
      ok: false,
      error: "already_redeemed",
      valid_until: existing.valid_until,
    }, 400);
  }

  // 3. Apply
  let validUntil: string | null = null;
  let grantedTokenYen: number | null = null;

  if (promo.grant_kind === "free_access") {
    const days = promo.duration_days ?? 30;
    validUntil = new Date(nowMs + days * 24 * 60 * 60 * 1000).toISOString();
  } else if (promo.grant_kind === "token_grant") {
    grantedTokenYen = Number(promo.token_yen ?? 0);
    // Add to current_grant_yen with carryover-like expiry of 60 days
    validUntil = new Date(nowMs + 60 * 24 * 60 * 60 * 1000).toISOString();

    // Update balance
    const { data: balance } = await adminClient
      .from("ai_token_balances")
      .select("current_grant_yen, current_grant_expires_at, total_granted_yen")
      .eq("user_id", user.id)
      .maybeSingle();

    if (balance) {
      await adminClient
        .from("ai_token_balances")
        .update({
          current_grant_yen: (Number(balance.current_grant_yen) || 0) + grantedTokenYen,
          current_grant_expires_at: validUntil,
          total_granted_yen: (Number(balance.total_granted_yen) || 0) + grantedTokenYen,
        })
        .eq("user_id", user.id);
    } else {
      await adminClient.from("ai_token_balances").insert({
        user_id: user.id,
        current_grant_yen: grantedTokenYen,
        current_grant_expires_at: validUntil,
        total_granted_yen: grantedTokenYen,
      });
    }

    await adminClient.from("ai_token_transactions").insert({
      user_id: user.id,
      kind: "promo_grant",
      amount_yen: grantedTokenYen,
      balance_after_yen: grantedTokenYen,
      metadata: { code },
    });
  }

  // 4. Insert redemption + bump counter (best-effort race tolerance via unique constraint)
  const { error: redemptionErr } = await adminClient
    .from("ai_promo_redemptions")
    .insert({
      user_id: user.id,
      code,
      valid_until: validUntil,
      granted_token_yen: grantedTokenYen,
    });

  if (redemptionErr) {
    if (redemptionErr.code === "23505") {
      return jsonResponse({ ok: false, error: "already_redeemed" }, 400);
    }
    return jsonResponse({ ok: false, error: redemptionErr.message }, 500);
  }

  await adminClient.rpc("noop"); // placeholder if we add a counter function later
  // Increment redemption count (race-tolerant: not perfect, but bounded by max_redemptions check above)
  await adminClient
    .from("ai_promo_codes")
    .update({ current_redemptions: promo.current_redemptions + 1 })
    .eq("code", code);

  return jsonResponse({
    ok: true,
    kind: promo.grant_kind,
    valid_until: validUntil,
    granted_token_yen: grantedTokenYen,
  });
});
