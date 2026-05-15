// AI chat Edge Function (W1 + W2 skeleton)
//
// Flow per request:
//   1. Verify JWT, resolve user_id.
//   2. Check access (subscription / promo / release-wide trial).
//   3. Check token balance (>= ¥1.5 to start a turn).
//   4. Run Anthropic with tool-use loop, streaming text via SSE.
//   5. On final response, deduct cost and persist transaction.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk@0.30.1";
import {
  checkAccess,
  getEffectiveBalance,
  hasMinimumTurnBalance,
} from "./access.ts";
import { computeCostYen, consumeTokens } from "./billing.ts";
import { buildSystemPrompt } from "./prompt.ts";
import { TOOL_DEFS as ALL_TOOL_DEFS, TOOL_EXECUTORS } from "./tools.ts";

// General AI does NOT expose goal create/edit/delete — those are handled by
// the dedicated Goal-Coach AI. list_goals stays so the assistant can read
// existing goals when linking todos via goal_id. redirect_to_goal_coach is
// the prescribed handoff.
const GENERAL_AI_BLOCKLIST = new Set([
  "create_goal",
  "update_goal",
  "delete_goal",
]);
const TOOL_DEFS = ALL_TOOL_DEFS.filter((d) => !GENERAL_AI_BLOCKLIST.has(d.name));
import { loadUserMemory, formatMemoryForPrompt } from "./memory.ts";
import {
  ensureConversation,
  persistUserMessage,
  persistAssistantMessage,
} from "./persist.ts";
import type {
  AnthropicAssistantContentBlock,
  ChatMessage,
  ChatRequest,
  ToolContext,
} from "./types.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const sseHeaders = {
  ...corsHeaders,
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
};

const MODEL = "claude-haiku-4-5-20251001";
// 5 = enough for typical chains (list_workspace_areas → multiple create_*
// calls in parallel → reply, or list → toggle → reply). Duplicate
// prevention is enforced by the system prompt.
const MAX_TURN_LOOPS = 5;
const MAX_OUTPUT_TOKENS = 1024;

// Helper: write a single SSE event line.
function sseEvent(controller: ReadableStreamDefaultController, type: string, payload: unknown): void {
  const json = JSON.stringify(payload ?? {});
  controller.enqueue(new TextEncoder().encode(`event: ${type}\ndata: ${json}\n\n`));
}

function sseError(
  controller: ReadableStreamDefaultController,
  code: string,
  message: string,
): void {
  sseEvent(controller, "error", { code, message });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  // 1. Auth
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Authorization header required" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anthropicApiKey = Deno.env.get("ANTHROPIC_API_KEY");

  if (!anthropicApiKey) {
    return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const userClient = createClient(supabaseUrl, supabaseAnon, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: userErr } = await userClient.auth.getUser();
  if (userErr || !user) {
    return new Response(JSON.stringify({ error: "Invalid token" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const adminClient = createClient(supabaseUrl, supabaseServiceKey);
  const userId = user.id;
  const now = new Date();

  // 2. Parse request
  let body: ChatRequest;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return new Response(JSON.stringify({ error: "messages is required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // 3. Access + balance check
  const access = await checkAccess(adminClient, userId, now);
  const balance = await getEffectiveBalance(adminClient, userId, now);

  if (!access.allowed) {
    return new Response(
      JSON.stringify({ error: "subscription_required", reason: access.reason }),
      {
        status: 402,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  // Subscription users still need balance to call the API. Promo / release_promo skip balance check.
  if (access.reason === "active_subscription" && !hasMinimumTurnBalance(balance.totalYen)) {
    return new Response(
      JSON.stringify({ error: "insufficient_balance", balance_yen: balance.totalYen }),
      {
        status: 402,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  // 4. Resolve language + load user memory in parallel
  const [{ data: settings }, memoryEntries] = await Promise.all([
    adminClient
      .from("user_settings")
      .select("preferred_language")
      .eq("user_id", userId)
      .maybeSingle(),
    loadUserMemory(adminClient, userId),
  ]);
  const language: "ja" | "en" =
    settings?.preferred_language === "en" ? "en" : "ja";

  // 4b. Persist the user message + ensure conversation row exists.
  // We do this BEFORE streaming so the user's input is durable even if the
  // AI response fails. Take last user message text as conversation title seed.
  const lastUserMsg = [...body.messages].reverse().find(
    (m: ChatMessage) => m.role === "user",
  ) as ChatMessage | undefined;
  const lastUserText =
    typeof lastUserMsg?.content === "string" ? lastUserMsg.content : "";

  let conversationId: string | null = null;
  try {
    if (lastUserText.trim()) {
      conversationId = await ensureConversation(
        adminClient,
        userId,
        body.conversationId,
        lastUserText,
      );
      await persistUserMessage(adminClient, conversationId, userId, lastUserText);
    }
  } catch (e) {
    // Persistence failures shouldn't break the chat — just log.
    console.error("persist user msg failed:", e);
  }

  // 5. Set up streaming response
  const stream = new ReadableStream({
    async start(controller) {
      const anthropic = new Anthropic({ apiKey: anthropicApiKey });
      const systemPrompt = buildSystemPrompt({
        language,
        userTimezone: "Asia/Tokyo",
        nowISO: now.toISOString(),
      });
      const memoryBlock = formatMemoryForPrompt(memoryEntries, language);

      // Anthropic message history starts from the user's input.
      // We mutate this array as we add assistant + tool_result turns.
      const messages: any[] = body.messages.map((m: ChatMessage) => {
        if (m.role === "tool") {
          return {
            role: "user",
            content: [
              {
                type: "tool_result",
                tool_use_id: m.tool_use_id,
                content: m.content,
              },
            ],
          };
        }
        return { role: m.role, content: m.content };
      });

      const usageAccum = {
        input_tokens: 0,
        output_tokens: 0,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
      };

      // Track the assistant's final reply text for persistence
      let assistantFinalText = "";

      try {
        sseEvent(controller, "session.start", {
          balance_yen: balance.totalYen,
          access_reason: access.reason,
          access_expires_at: access.expiresAt ?? null,
          conversation_id: conversationId,
        });

        const toolCtx: ToolContext = {
          userId,
          adminClient,
          now,
          language,
        };

        for (let loop = 0; loop < MAX_TURN_LOOPS; loop++) {
          const toolUseBlocks: AnthropicAssistantContentBlock[] = [];
          const assistantBlocks: AnthropicAssistantContentBlock[] = [];

          // Stream the model response.
          // Two cache breakpoints: static prompt (rarely changes) +
          // dynamic memory block (changes on remember/forget). Updates to
          // memory only invalidate the second breakpoint.
          const resp = await anthropic.messages.stream({
            model: MODEL,
            max_tokens: MAX_OUTPUT_TOKENS,
            system: [
              {
                type: "text",
                text: systemPrompt,
                cache_control: { type: "ephemeral" },
              },
              {
                type: "text",
                text: memoryBlock,
                cache_control: { type: "ephemeral" },
              },
            ],
            tools: TOOL_DEFS as any,
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
                sseEvent(controller, "assistant.text.delta", {
                  text: event.delta.text,
                });
              } else if (event.delta?.type === "input_json_delta") {
                // Tool input is streamed as JSON deltas; the final block we use comes from message_stop
              }
            } else if (event.type === "message_delta") {
              if (event.usage) {
                usageAccum.input_tokens += event.usage.input_tokens ?? 0;
                usageAccum.output_tokens += event.usage.output_tokens ?? 0;
                usageAccum.cache_read_input_tokens +=
                  event.usage.cache_read_input_tokens ?? 0;
                usageAccum.cache_creation_input_tokens +=
                  event.usage.cache_creation_input_tokens ?? 0;
              }
            }
          }

          // After streaming finishes, fetch the finalized message.
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
            if (block.type === "tool_use") {
              toolUseBlocks.push(block);
            }
          }

          // Append the assistant turn to message history.
          messages.push({ role: "assistant", content: assistantBlocks });

          if (toolUseBlocks.length === 0) {
            // No tools requested — final response.
            break;
          }

          // Execute tools sequentially.
          const toolResultBlocks: any[] = [];
          for (const toolUse of toolUseBlocks) {
            if (toolUse.type !== "tool_use") continue;
            const executor = TOOL_EXECUTORS[toolUse.name];
            sseEvent(controller, "tool.exec.start", {
              id: toolUse.id,
              name: toolUse.name,
              input: toolUse.input,
            });

            let resultPayload: string;
            if (!executor) {
              resultPayload = JSON.stringify({ ok: false, error: `Unknown tool: ${toolUse.name}` });
              sseEvent(controller, "tool.exec.error", {
                id: toolUse.id,
                error: "unknown_tool",
              });
            } else {
              try {
                const out = await executor(toolUse.input ?? {}, toolCtx);
                resultPayload = JSON.stringify(out);
                sseEvent(controller, "tool.exec.result", {
                  id: toolUse.id,
                  result: out,
                });
              } catch (e: any) {
                resultPayload = JSON.stringify({
                  ok: false,
                  error: e?.message ?? String(e),
                });
                sseEvent(controller, "tool.exec.error", {
                  id: toolUse.id,
                  error: e?.message ?? String(e),
                });
              }
            }

            toolResultBlocks.push({
              type: "tool_result",
              tool_use_id: toolUse.id,
              content: resultPayload,
            });
          }

          messages.push({ role: "user", content: toolResultBlocks });
          // Loop again — model will see tool_results and produce a final text response.
        }

        // Charge the user.
        const costYen = computeCostYen(usageAccum);
        let balanceAfter: number | null = null;
        if (access.reason === "active_subscription" && costYen > 0) {
          const r = await consumeTokens({
            adminClient,
            userId,
            costYen,
            usage: usageAccum,
            apiModel: MODEL,
            conversationId: conversationId ?? null,
          });
          balanceAfter = r.balanceAfter;
        }

        // Persist the assistant's final reply (text only — tool internals not
        // saved to keep DB lean). Failures shouldn't break the chat.
        if (conversationId && assistantFinalText.trim()) {
          try {
            await persistAssistantMessage(
              adminClient,
              conversationId,
              userId,
              assistantFinalText,
              costYen,
            );
          } catch (e) {
            console.error("persist assistant msg failed:", e);
          }
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
