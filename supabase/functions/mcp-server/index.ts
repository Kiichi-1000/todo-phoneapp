// MCP (Model Context Protocol) server for ToSche — v1.4 USP.
//
// POST /functions/v1/mcp-server
//
// Lets Claude.ai (and any other MCP-compatible client) write goals and
// roadmap milestones into the user's ToSche account using a static API key.
//
// Transport: Streamable HTTP. Each request is a JSON-RPC 2.0 envelope.
// Methods implemented: initialize / notifications/initialized / tools/list / tools/call.
// Notifications (no `id`) return 202 Accepted with no body. Requests return JSON.
//
// Auth:
//   Bearer token in Authorization header. The token is a long random string
//   ("tsche_" + 32 random chars). We SHA-256 it and look it up in
//   `mcp_api_keys.key_hash`. Plain text is never stored or logged.
//
// Why this is the v1.4 USP:
//   Claude.ai is the upstream goal-setting brain (long-term planning,
//   roadmap design). ToSche is the downstream execution brain (daily
//   tasks). Connecting them via MCP makes ToSche the only Apple-store
//   todo app that integrates seamlessly with Claude.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  MCP_TOOL_DEFS,
  MCP_TOOL_EXECUTORS,
  type ToolContext,
} from "./tools.ts";

const MCP_PROTOCOL_VERSION = "2025-06-18";
const SERVER_NAME = "tosche-mcp";
const SERVER_VERSION = "1.4.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, mcp-protocol-version, mcp-session-id",
  "Access-Control-Expose-Headers": "mcp-session-id",
};

function jsonRpcResult(id: unknown, result: unknown): Response {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id, result }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function jsonRpcError(
  id: unknown,
  code: number,
  message: string,
  data?: unknown,
): Response {
  return new Response(
    JSON.stringify({
      jsonrpc: "2.0",
      id,
      error: { code, message, ...(data !== undefined ? { data } : {}) },
    }),
    {
      status: 200, // JSON-RPC errors are still HTTP 200 (protocol-level error)
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
}

function httpError(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Look up a user_id by API key (Bearer token). Returns null if not found or revoked.
// Bumps last_used_at on success (fire-and-forget; we don't await).
async function authenticateApiKey(
  adminClient: any,
  rawKey: string,
): Promise<{ userId: string; keyId: string } | null> {
  if (!rawKey || rawKey.length < 16) return null;
  const hash = await sha256Hex(rawKey);
  const { data, error } = await adminClient
    .from("mcp_api_keys")
    .select("id, user_id, revoked_at")
    .eq("key_hash", hash)
    .maybeSingle();
  if (error || !data) return null;
  if (data.revoked_at) return null;

  // Fire-and-forget last_used_at update.
  adminClient
    .from("mcp_api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id)
    .then(() => {})
    .catch(() => {});

  return { userId: data.user_id as string, keyId: data.id as string };
}

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: unknown;
  method: string;
  params?: Record<string, unknown>;
}

// ------------- MCP method handlers -------------

function handleInitialize(id: unknown): Response {
  return jsonRpcResult(id, {
    protocolVersion: MCP_PROTOCOL_VERSION,
    capabilities: {
      tools: {},
    },
    serverInfo: {
      name: SERVER_NAME,
      version: SERVER_VERSION,
    },
    instructions:
      "ToSche MCP server. Use list_goals first to see what the user has, then create_goal / create_milestones_batch to add new goals and roadmaps. Mark progress with update_milestone.",
  });
}

function handleToolsList(id: unknown): Response {
  return jsonRpcResult(id, { tools: MCP_TOOL_DEFS });
}

async function handleToolsCall(
  id: unknown,
  params: Record<string, unknown> | undefined,
  ctx: ToolContext,
): Promise<Response> {
  const name = (params?.name as string) || "";
  const args = (params?.arguments as Record<string, unknown>) || {};
  const executor = MCP_TOOL_EXECUTORS[name];
  if (!executor) {
    return jsonRpcError(id, -32601, `Unknown tool: ${name}`);
  }
  try {
    const result = await executor(args, ctx);
    // MCP tool response: { content: [{type:"text", text:"..."}], isError: boolean }
    return jsonRpcResult(id, {
      content: [{ type: "text", text: JSON.stringify(result) }],
      isError: !result.ok,
    });
  } catch (e: any) {
    return jsonRpcResult(id, {
      content: [
        { type: "text", text: JSON.stringify({ ok: false, error: e?.message ?? String(e) }) },
      ],
      isError: true,
    });
  }
}

// ------------- HTTP entrypoint -------------

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  // Health check / discovery: GET returns server info (no auth required).
  if (req.method === "GET") {
    return httpError(200, {
      server: SERVER_NAME,
      version: SERVER_VERSION,
      protocol: MCP_PROTOCOL_VERSION,
      transport: "streamable-http",
      docs:
        "POST a JSON-RPC 2.0 request with Authorization: Bearer <api-key>. Generate keys at: tosche app → Settings → Claude integration.",
    });
  }
  if (req.method !== "POST") {
    return httpError(405, { error: "Method not allowed" });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return httpError(500, { error: "Server misconfigured" });
  }
  const adminClient = createClient(supabaseUrl, serviceKey);

  // Parse Authorization header
  const authHeader = req.headers.get("Authorization") || "";
  const bearerMatch = /^Bearer\s+(.+)$/i.exec(authHeader);
  const rawKey = bearerMatch?.[1]?.trim() ?? "";

  // Parse JSON-RPC body
  let body: JsonRpcRequest;
  try {
    body = await req.json();
  } catch {
    return jsonRpcError(null, -32700, "Parse error");
  }
  if (body?.jsonrpc !== "2.0" || typeof body.method !== "string") {
    return jsonRpcError(body?.id ?? null, -32600, "Invalid Request");
  }

  const isNotification = body.id === undefined;

  // initialize / notifications/initialized are allowed without auth so the
  // MCP client can probe the server before sending credentials. (Some
  // clients negotiate then prompt for the key.) We DO still gate tools.
  if (body.method === "initialize") {
    return handleInitialize(body.id);
  }
  if (body.method === "notifications/initialized") {
    return new Response(null, { status: 202, headers: corsHeaders });
  }
  if (isNotification) {
    // Unknown notification — accept silently.
    return new Response(null, { status: 202, headers: corsHeaders });
  }

  // From here on, methods require a valid API key.
  const auth = await authenticateApiKey(adminClient, rawKey);
  if (!auth) {
    return jsonRpcError(
      body.id,
      -32001,
      "Unauthorized: missing or invalid API key. Generate one in the ToSche app → Settings → Claude integration.",
    );
  }

  const ctx: ToolContext = {
    userId: auth.userId,
    adminClient,
    now: new Date(),
  };

  switch (body.method) {
    case "tools/list":
      return handleToolsList(body.id);
    case "tools/call":
      return await handleToolsCall(body.id, body.params, ctx);
    default:
      return jsonRpcError(body.id, -32601, `Method not found: ${body.method}`);
  }
});
