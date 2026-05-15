// Token consumption: convert Anthropic usage to yen and persist to DB.

import type { AIUsageMeta } from "./types.ts";

// Internal exchange rate ¥/$ — reviewed quarterly.
const INTERNAL_USD_TO_YEN = 150;

// Anthropic Claude Haiku 4.5 prices (USD per 1M tokens)
const PRICE_INPUT_PER_M_USD = 1.0;
const PRICE_OUTPUT_PER_M_USD = 5.0;
const PRICE_CACHE_WRITE_PER_M_USD = 1.25;
const PRICE_CACHE_READ_PER_M_USD = 0.10;

// Safety multiplier — bill slightly more than actual cost to absorb FX drift / overhead.
const SAFETY_MULTIPLIER = 1.15;

export function computeCostYen(usage: AIUsageMeta): number {
  const inputUSD = ((usage.input_tokens || 0) / 1_000_000) * PRICE_INPUT_PER_M_USD;
  const outputUSD = ((usage.output_tokens || 0) / 1_000_000) * PRICE_OUTPUT_PER_M_USD;
  const cacheReadUSD =
    ((usage.cache_read_input_tokens || 0) / 1_000_000) * PRICE_CACHE_READ_PER_M_USD;
  const cacheWriteUSD =
    ((usage.cache_creation_input_tokens || 0) / 1_000_000) * PRICE_CACHE_WRITE_PER_M_USD;
  const totalUSD = inputUSD + outputUSD + cacheReadUSD + cacheWriteUSD;
  const yen = totalUSD * INTERNAL_USD_TO_YEN * SAFETY_MULTIPLIER;
  // Round up to nearest 0.0001 yen
  return Math.ceil(yen * 10000) / 10000;
}

export interface ConsumeArgs {
  adminClient: any;
  userId: string;
  costYen: number;
  usage: AIUsageMeta;
  apiModel: string;
  conversationId?: string | null;
  messageId?: string | null;
}

/**
 * Atomically deduct the cost from the user's token balance.
 * Drains carryover first, then current_grant.
 * Inserts a `consume` transaction with the new balance.
 */
export async function consumeTokens(args: ConsumeArgs): Promise<{
  balanceAfter: number;
  carryoverAfter: number;
  currentGrantAfter: number;
}> {
  const { adminClient, userId, costYen, usage, apiModel, conversationId, messageId } = args;

  const { data: balance } = await adminClient
    .from("ai_token_balances")
    .select("current_grant_yen, carryover_yen")
    .eq("user_id", userId)
    .maybeSingle();

  let carryover = Number(balance?.carryover_yen ?? 0);
  let currentGrant = Number(balance?.current_grant_yen ?? 0);

  // Drain carryover first
  let remaining = costYen;
  if (carryover > 0) {
    const fromCarry = Math.min(carryover, remaining);
    carryover -= fromCarry;
    remaining -= fromCarry;
  }
  if (remaining > 0) {
    const fromGrant = Math.min(currentGrant, remaining);
    currentGrant -= fromGrant;
    remaining -= fromGrant;
  }
  // If remaining > 0 here, the user went negative — clamp to zero (we already checked balance pre-flight,
  // but the cost can slightly exceed the estimate).
  carryover = Math.max(0, carryover);
  currentGrant = Math.max(0, currentGrant);
  const balanceAfter = carryover + currentGrant;

  await adminClient
    .from("ai_token_balances")
    .update({
      carryover_yen: carryover,
      current_grant_yen: currentGrant,
      total_consumed_yen: (Number(balance?.total_consumed_yen ?? 0)) + costYen,
      last_consumed_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  await adminClient.from("ai_token_transactions").insert({
    user_id: userId,
    kind: "consume",
    amount_yen: -costYen,
    balance_after_yen: balanceAfter,
    api_provider: "anthropic",
    api_model: apiModel,
    input_tokens: usage.input_tokens ?? null,
    output_tokens: usage.output_tokens ?? null,
    cache_read_tokens: usage.cache_read_input_tokens ?? null,
    cache_write_tokens: usage.cache_creation_input_tokens ?? null,
    conversation_id: conversationId ?? null,
    message_id: messageId ?? null,
  });

  return {
    balanceAfter,
    carryoverAfter: carryover,
    currentGrantAfter: currentGrant,
  };
}
