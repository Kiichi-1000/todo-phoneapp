// Access check: subscription / promo coupon / release-wide promo.

import type { AccessGrant } from "./types.ts";

export async function checkAccess(
  adminClient: any,
  userId: string,
  now: Date,
): Promise<AccessGrant> {
  const nowISO = now.toISOString();

  // 1. Active subscription
  //   Basic プランは AI 機能を含まないプランのため、購読中でも AI 機能は拒否する。
  //   Standard / Pro のみ AI を解放。アプリ側でも同じプラン情報で AI タブの paywall
  //   ゲートを実装しているが、サーバー側でも防御線を引く (= クライアント改竄対策)。
  const { data: sub } = await adminClient
    .from("user_subscriptions")
    .select("status, plan, current_period_end")
    .eq("user_id", userId)
    .maybeSingle();

  if (
    sub &&
    (sub.status === "active" || sub.status === "trialing") &&
    sub.current_period_end &&
    new Date(sub.current_period_end) > now
  ) {
    if (sub.plan !== "basic") {
      return { allowed: true, reason: "active_subscription", expiresAt: sub.current_period_end };
    }
    // Basic 契約者: AI プランではないので 1〜3 を全部通したあとに専用理由で拒否する。
    // (= プロモ/リリース無料期間が並行して効いていれば、それは引き続き有効)
  }

  // 2. Active promo coupon redemption
  const { data: redemption } = await adminClient
    .from("ai_promo_redemptions")
    .select("valid_until")
    .eq("user_id", userId)
    .gt("valid_until", nowISO)
    .order("valid_until", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (redemption?.valid_until) {
    return { allowed: true, reason: "promo", expiresAt: redemption.valid_until };
  }

  // 3. Release-wide trial period
  const { data: releasePromo } = await adminClient
    .from("app_release_promos")
    .select("promo_ends_at")
    .eq("is_active", true)
    .lte("promo_starts_at", nowISO)
    .gte("promo_ends_at", nowISO)
    .order("promo_ends_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (releasePromo?.promo_ends_at) {
    return { allowed: true, reason: "release_promo", expiresAt: releasePromo.promo_ends_at };
  }

  // Basic プラン契約者は専用の理由で拒否 (Standard へのアップグレード誘導 UX のため)。
  if (sub?.plan === "basic" && (sub.status === "active" || sub.status === "trialing")) {
    return {
      allowed: false,
      reason: "basic_plan_no_ai",
      expiresAt: sub.current_period_end ?? undefined,
    };
  }

  return { allowed: false, reason: "none" };
}

const MIN_TURN_YEN = 1.5; // Minimum balance required to start a turn.

export async function getEffectiveBalance(
  adminClient: any,
  userId: string,
  now: Date,
): Promise<{ totalYen: number; needsRefresh: boolean }> {
  const { data: balance } = await adminClient
    .from("ai_token_balances")
    .select("current_grant_yen, current_grant_expires_at, carryover_yen, carryover_expires_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (!balance) return { totalYen: 0, needsRefresh: false };

  const nowMs = now.getTime();
  let total = 0;
  let needsRefresh = false;

  if (
    balance.current_grant_expires_at &&
    new Date(balance.current_grant_expires_at).getTime() > nowMs
  ) {
    total += Number(balance.current_grant_yen) || 0;
  } else if (Number(balance.current_grant_yen) > 0) {
    needsRefresh = true; // expired but not yet rolled over
  }

  if (
    balance.carryover_expires_at &&
    new Date(balance.carryover_expires_at).getTime() > nowMs
  ) {
    total += Number(balance.carryover_yen) || 0;
  } else if (Number(balance.carryover_yen) > 0) {
    needsRefresh = true;
  }

  return { totalYen: total, needsRefresh };
}

export function hasMinimumTurnBalance(yen: number): boolean {
  return yen >= MIN_TURN_YEN;
}
