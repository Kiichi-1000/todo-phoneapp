// Monthly token grant + carryover + expire batch.
//
// Idempotent. Designed to run on a schedule (Supabase Cron / pg_cron) once per hour.
// Processes any user_subscription whose `next_grant_at <= now()` AND status = 'active' or 'trialing'.
//
// Per user, on each grant cycle:
//   1. Existing carryover (last cycle's leftover) — expire any past its expiry, log `expire`.
//   2. Move whatever current_grant_yen remains to carryover_yen with new expiry = end of NEXT cycle.
//      Log `carryover` for that movement amount (positive on carryover, negative on the source).
//   3. Reset current_grant_yen to the plan's monthly grant.
//      Log `grant` with the plan amount.
//   4. Update next_grant_at = current_period_end (or +1 month from now if subscription is open-ended).
//
// Authorization:
//   Requires `Authorization: Bearer <SUPABASE_CRON_SHARED_SECRET>` to prevent abuse.

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

// Plan → monthly AI token grant (in yen).
// Basic は AI 機能を含まないプラン (¥300/月) のため付与額 0。
// この場合トークン関連の DB 更新はすべてスキップし、next_grant_at だけロールする。
const PLAN_GRANT_YEN: Record<string, number> = {
  basic: 0,
  standard: 400,
  pro: 700,
};

// One Supabase Cron tick = 1 month, but we keep the batch granularity hourly.
// That way users with mid-month period_end don't wait until midnight.
function addOneMonth(d: Date): Date {
  const r = new Date(d);
  r.setMonth(r.getMonth() + 1);
  return r;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const sharedSecret = Deno.env.get("CRON_SHARED_SECRET");
  const auth = req.headers.get("Authorization") || "";
  if (!sharedSecret || auth !== `Bearer ${sharedSecret}`) {
    return jsonResponse({ error: "Forbidden" }, 403);
  }

  const adminClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const now = new Date();
  const nowISO = now.toISOString();

  // 1. Find subscriptions whose next_grant_at <= now, and status indicates eligibility.
  const { data: dueSubs, error: fetchErr } = await adminClient
    .from("user_subscriptions")
    .select("user_id, plan, billing_cycle, next_grant_at, current_period_end, status")
    .in("status", ["active", "trialing"])
    .lte("next_grant_at", nowISO);

  if (fetchErr) {
    return jsonResponse({ error: fetchErr.message }, 500);
  }

  const results: Array<{ user_id: string; ok: boolean; error?: string }> = [];

  for (const sub of dueSubs ?? []) {
    try {
      const planKey = sub.plan ?? "";
      if (!(planKey in PLAN_GRANT_YEN)) {
        results.push({ user_id: sub.user_id, ok: false, error: "unknown_plan" });
        continue;
      }
      const grantAmount = PLAN_GRANT_YEN[planKey];

      // Basic プランは AI トークン付与なし。トークン関連の DB 更新はスキップし、
      // next_grant_at だけ翌月にロールしてバッチが繰り返し拾わないようにする。
      if (grantAmount <= 0) {
        const newNextGrantAt = addOneMonth(now).toISOString();
        await adminClient
          .from("user_subscriptions")
          .update({ next_grant_at: newNextGrantAt })
          .eq("user_id", sub.user_id);
        results.push({ user_id: sub.user_id, ok: true });
        continue;
      }

      // Read balance
      const { data: balance } = await adminClient
        .from("ai_token_balances")
        .select(
          "current_grant_yen, current_grant_expires_at, carryover_yen, carryover_expires_at, total_granted_yen, total_expired_yen",
        )
        .eq("user_id", sub.user_id)
        .maybeSingle();

      let oldCurrent = Number(balance?.current_grant_yen ?? 0);
      let oldCarryover = Number(balance?.carryover_yen ?? 0);
      let totalGranted = Number(balance?.total_granted_yen ?? 0);
      let totalExpired = Number(balance?.total_expired_yen ?? 0);
      const oldCarryoverExpiry = balance?.carryover_expires_at
        ? new Date(balance.carryover_expires_at)
        : null;

      const txInserts: any[] = [];

      // Step 1: Expire any past-due carryover (untouched from 2 cycles ago).
      if (oldCarryoverExpiry && oldCarryoverExpiry <= now && oldCarryover > 0) {
        txInserts.push({
          user_id: sub.user_id,
          kind: "expire",
          amount_yen: -oldCarryover,
          balance_after_yen: 0, // Will be recomputed below; kept conservative.
          metadata: { reason: "carryover_expired" },
        });
        totalExpired += oldCarryover;
        oldCarryover = 0;
      }

      // Step 2: Move remaining current_grant to carryover.
      const carryoverNew = oldCurrent;
      // Carryover lives until NEXT cycle's grant time (one more month).
      const nextNextGrant = addOneMonth(now);
      const carryoverExpiresAt = nextNextGrant.toISOString();

      if (oldCurrent > 0) {
        txInserts.push({
          user_id: sub.user_id,
          kind: "carryover",
          amount_yen: oldCurrent, // positive: amount carried over
          balance_after_yen: 0, // recomputed below
          metadata: { from: "current_grant" },
        });
      }

      // Step 3: Grant new month's tokens.
      const newCurrent = grantAmount;
      const newCurrentExpiresAt = nextNextGrant.toISOString(); // current grant expires at next cycle
      txInserts.push({
        user_id: sub.user_id,
        kind: "grant",
        amount_yen: grantAmount,
        balance_after_yen: 0, // recomputed below
        metadata: { plan: sub.plan, billing_cycle: sub.billing_cycle },
      });
      totalGranted += grantAmount;

      const finalBalance = newCurrent + carryoverNew;

      // Patch each transaction's balance_after_yen as final balance (simplification).
      for (const tx of txInserts) tx.balance_after_yen = finalBalance;

      // Update balance row (upsert if missing).
      if (!balance) {
        await adminClient.from("ai_token_balances").insert({
          user_id: sub.user_id,
          current_grant_yen: newCurrent,
          current_grant_expires_at: newCurrentExpiresAt,
          carryover_yen: carryoverNew,
          carryover_expires_at: carryoverNew > 0 ? carryoverExpiresAt : null,
          total_granted_yen: totalGranted,
          total_expired_yen: totalExpired,
        });
      } else {
        await adminClient
          .from("ai_token_balances")
          .update({
            current_grant_yen: newCurrent,
            current_grant_expires_at: newCurrentExpiresAt,
            carryover_yen: carryoverNew,
            carryover_expires_at: carryoverNew > 0 ? carryoverExpiresAt : null,
            total_granted_yen: totalGranted,
            total_expired_yen: totalExpired,
          })
          .eq("user_id", sub.user_id);
      }

      // Insert transactions.
      if (txInserts.length > 0) {
        await adminClient.from("ai_token_transactions").insert(txInserts);
      }

      // Update subscription's next_grant_at to roll forward.
      const newNextGrantAt = nextNextGrant.toISOString();
      await adminClient
        .from("user_subscriptions")
        .update({ next_grant_at: newNextGrantAt })
        .eq("user_id", sub.user_id);

      results.push({ user_id: sub.user_id, ok: true });
    } catch (e: any) {
      results.push({ user_id: sub.user_id, ok: false, error: e?.message ?? String(e) });
    }
  }

  return jsonResponse({
    processed: results.length,
    succeeded: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  });
});
