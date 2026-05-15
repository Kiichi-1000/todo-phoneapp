// Goal-Coach Edge Function
//
// Differences vs ai-chat:
//   - One singleton conversation per user (mode='goal_coach')
//   - Server-side reconstructs FULL message history from DB on each call
//     (client only sends the new user message). Saves bandwidth and ensures
//     the AI always sees consistent context.
//   - Prompt cache covers the long history prefix → cost stays manageable
//   - Coaching-focused prompt + goal-only tools

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk@0.30.1";
import { checkAccess, getEffectiveBalance, hasMinimumTurnBalance } from "../ai-chat/access.ts";
import { computeCostYen, consumeTokens } from "../ai-chat/billing.ts";
import { loadUserMemory, formatMemoryForPrompt } from "../ai-chat/memory.ts";
import type { AnthropicAssistantContentBlock, ToolContext } from "../ai-chat/types.ts";
import { buildGoalCoachPrompt } from "./prompt.ts";
import { GOAL_COACH_TOOL_DEFS, GOAL_COACH_TOOL_EXECUTORS } from "./tools.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const sseHeaders = {
  ...corsHeaders,
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
};

const MODEL = "claude-haiku-4-5-20251001";
const MAX_TURN_LOOPS = 5;
const MAX_OUTPUT_TOKENS = 1536;
// Soft cap: full history beyond this gets the OLDEST messages dropped.
// At ~150 tokens/msg average, 200 messages ≈ 30K tokens — well within Haiku
// 4.5's context window (200K) but past this, prefix caching becomes less
// efficient and per-turn cost grows.
const MAX_HISTORY_MESSAGES = 200;

interface RequestBody {
  user_text: string;
}

function sseEvent(controller: ReadableStreamDefaultController, type: string, payload: unknown): void {
  const json = JSON.stringify(payload ?? {});
  controller.enqueue(new TextEncoder().encode(`event: ${type}\ndata: ${json}\n\n`));
}

function sseError(controller: ReadableStreamDefaultController, code: string, message: string): void {
  sseEvent(controller, "error", { code, message });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  // Auth
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Authorization header required" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anthropicApiKey = Deno.env.get("ANTHROPIC_API_KEY");

  if (!anthropicApiKey) {
    return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const userClient = createClient(supabaseUrl, supabaseAnon, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: userErr } = await userClient.auth.getUser();
  if (userErr || !user) {
    return new Response(JSON.stringify({ error: "Invalid token" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const adminClient = createClient(supabaseUrl, supabaseServiceKey);
  const userId = user.id;
  const now = new Date();

  // Parse request
  let body: RequestBody;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const userText = (body.user_text ?? "").trim();
  if (!userText) {
    return new Response(JSON.stringify({ error: "user_text is required" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Access + balance check
  const access = await checkAccess(adminClient, userId, now);
  if (!access.allowed) {
    return new Response(
      JSON.stringify({ error: "subscription_required", reason: access.reason }),
      { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
  const balance = await getEffectiveBalance(adminClient, userId, now);
  if (access.reason === "active_subscription" && !hasMinimumTurnBalance(balance.totalYen)) {
    return new Response(
      JSON.stringify({ error: "insufficient_balance", balance_yen: balance.totalYen }),
      { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // Resolve language + memory in parallel
  const [{ data: settings }, memoryEntries] = await Promise.all([
    adminClient
      .from("user_settings")
      .select("preferred_language")
      .eq("user_id", userId)
      .maybeSingle(),
    loadUserMemory(adminClient, userId),
  ]);
  const language: "ja" | "en" = settings?.preferred_language === "en" ? "en" : "ja";

  // ----- Singleton conversation lookup / creation -----
  let conversationId: string;
  {
    const { data: existing } = await adminClient
      .from("ai_conversations")
      .select("id")
      .eq("user_id", userId)
      .eq("mode", "goal_coach")
      .maybeSingle();
    if (existing?.id) {
      conversationId = existing.id;
    } else {
      const { data: created, error: createErr } = await adminClient
        .from("ai_conversations")
        .insert({ user_id: userId, mode: "goal_coach", title: "目標設定セッション" })
        .select("id")
        .single();
      if (createErr || !created) {
        return new Response(JSON.stringify({ error: "Failed to create coach conversation" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      conversationId = created.id;
    }
  }

  // ----- Persist user message immediately -----
  await adminClient.from("ai_messages").insert({
    conversation_id: conversationId,
    user_id: userId,
    role: "user",
    text: userText,
  });

  // ----- Reconstruct full message history from DB (capped) -----
  const { data: historyRows } = await adminClient
    .from("ai_messages")
    .select("role, text, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(MAX_HISTORY_MESSAGES);
  // The newly-inserted user message is included in this read. Convert to
  // Anthropic message format: text-only, no tool_use blocks (we never persist
  // tool internals — those get reconstructed each session).
  const messages: any[] = (historyRows ?? []).map((m: any) =>
    m.role === "user"
      ? { role: "user", content: m.text }
      : { role: "assistant", content: [{ type: "text", text: m.text }] },
  );

  // Set up streaming response
  const stream = new ReadableStream({
    async start(controller) {
      const anthropic = new Anthropic({ apiKey: anthropicApiKey });
      const systemPrompt = buildGoalCoachPrompt({
        language,
        userTimezone: "Asia/Tokyo",
        nowISO: now.toISOString(),
      });
      const memoryBlock = formatMemoryForPrompt(memoryEntries, language);

      const usageAccum = {
        input_tokens: 0,
        output_tokens: 0,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
      };

      let assistantFinalText = "";

      try {
        sseEvent(controller, "session.start", {
          balance_yen: balance.totalYen,
          access_reason: access.reason,
          access_expires_at: access.expiresAt ?? null,
          conversation_id: conversationId,
        });

        const toolCtx: ToolContext = { userId, adminClient, now, language };

        for (let loop = 0; loop < MAX_TURN_LOOPS; loop++) {
          const toolUseBlocks: AnthropicAssistantContentBlock[] = [];
          const assistantBlocks: AnthropicAssistantContentBlock[] = [];

          const resp = await anthropic.messages.stream({
            model: MODEL,
            max_tokens: MAX_OUTPUT_TOKENS,
            system: [
              { type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } },
              { type: "text", text: memoryBlock,  cache_control: { type: "ephemeral" } },
            ],
            tools: GOAL_COACH_TOOL_DEFS as any,
            messages,
          } as any);

          for await (const event of resp as any) {
            if (event.type === "content_block_start") {
              if (event.content_block?.type === "text") {
                sseEvent(controller, "assistant.text.start", {});
              } else if (event.content_block?.type === "tool_use") {
                sseEvent(controller, "assistant.tool_use.start", {
                  id: event.content_block.id,
                  name: event.content_block.name,
                });
              }
            } else if (event.type === "content_block_delta") {
              if (event.delta?.type === "text_delta") {
                assistantFinalText += event.delta.text;
                sseEvent(controller, "assistant.text.delta", { text: event.delta.text });
              }
            } else if (event.type === "message_delta") {
              if (event.usage) {
                usageAccum.input_tokens += event.usage.input_tokens ?? 0;
                usageAccum.output_tokens += event.usage.output_tokens ?? 0;
                usageAccum.cache_read_input_tokens += event.usage.cache_read_input_tokens ?? 0;
                usageAccum.cache_creation_input_tokens += event.usage.cache_creation_input_tokens ?? 0;
              }
            }
          }

          const finalMessage = await (resp as any).finalMessage();
          if (finalMessage.usage) {
            usageAccum.input_tokens = finalMessage.usage.input_tokens ?? usageAccum.input_tokens;
            usageAccum.output_tokens = finalMessage.usage.output_tokens ?? usageAccum.output_tokens;
            usageAccum.cache_read_input_tokens =
              finalMessage.usage.cache_read_input_tokens ?? usageAccum.cache_read_input_tokens;
            usageAccum.cache_creation_input_tokens =
              finalMessage.usage.cache_creation_input_tokens ?? usageAccum.cache_creation_input_tokens;
          }

          for (const block of finalMessage.content) {
            assistantBlocks.push(block);
            if (block.type === "tool_use") toolUseBlocks.push(block);
          }

          messages.push({ role: "assistant", content: assistantBlocks });
          if (toolUseBlocks.length === 0) break;

          // Execute tools sequentially
          const toolResultBlocks: any[] = [];
          for (const toolUse of toolUseBlocks) {
            if (toolUse.type !== "tool_use") continue;
            const executor = GOAL_COACH_TOOL_EXECUTORS[toolUse.name];
            sseEvent(controller, "tool.exec.start", {
              id: toolUse.id, name: toolUse.name, input: toolUse.input,
            });
            let resultPayload: string;
            if (!executor) {
              resultPayload = JSON.stringify({ ok: false, error: `Unknown tool: ${toolUse.name}` });
              sseEvent(controller, "tool.exec.error", { id: toolUse.id, error: "unknown_tool" });
            } else {
              try {
                const out = await executor(toolUse.input ?? {}, toolCtx);
                resultPayload = JSON.stringify(out);
                sseEvent(controller, "tool.exec.result", { id: toolUse.id, result: out });
              } catch (e: any) {
                resultPayload = JSON.stringify({ ok: false, error: e?.message ?? String(e) });
                sseEvent(controller, "tool.exec.error", { id: toolUse.id, error: e?.message ?? String(e) });
              }
            }
            toolResultBlocks.push({
              type: "tool_result", tool_use_id: toolUse.id, content: resultPayload,
            });
          }
          messages.push({ role: "user", content: toolResultBlocks });
        }

        // Charge
        const costYen = computeCostYen(usageAccum);
        let balanceAfter: number | null = null;
        if (access.reason === "active_subscription" && costYen > 0) {
          const r = await consumeTokens({
            adminClient, userId, costYen, usage: usageAccum,
            apiModel: MODEL + "-coach",
            conversationId,
          });
          balanceAfter = r.balanceAfter;
        }

        // Persist assistant final text
        if (assistantFinalText.trim()) {
          await adminClient.from("ai_messages").insert({
            conversation_id: conversationId,
            user_id: userId,
            role: "assistant",
            text: assistantFinalText,
          });

          // Bump counters on conversation
          const { data: conv } = await adminClient
            .from("ai_conversations")
            .select("message_count, total_cost_yen")
            .eq("id", conversationId)
            .maybeSingle();
          await adminClient
            .from("ai_conversations")
            .update({
              message_count: (conv?.message_count ?? 0) + 2,
              total_cost_yen: Number(conv?.total_cost_yen ?? 0) + costYen,
              last_message_at: new Date().toISOString(),
            })
            .eq("id", conversationId);
        }

        sseEvent(controller, "session.end", {
          usage: usageAccum,
          cost_yen: costYen,
          balance_after_yen: balanceAfter,
          access_reason: access.reason,
          conversation_id: conversationId,
        });
      } catch (err: any) {
        sseError(controller, "internal_error", err?.message ?? String(err));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { status: 200, headers: sseHeaders });
});
