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
import {
  handleAuthServerMetadata,
  handleProtectedResourceMetadata,
  handleRegister,
  handleAuthorizeGet,
  handleAuthorizeApprove,
  handleToken,
  lookupAccessToken,
} from "./oauth.ts";

const MCP_PROTOCOL_VERSION = "2025-06-18";
const SERVER_NAME = "tosche-mcp";
const SERVER_VERSION = "1.4.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, mcp-protocol-version, mcp-session-id",
  // Expose WWW-Authenticate so browser-based MCP clients (claude.ai)
  // can read it on 401 responses and trigger the OAuth discovery flow.
  "Access-Control-Expose-Headers": "mcp-session-id, WWW-Authenticate",
};

function jsonRpcResult(
  id: unknown,
  result: unknown,
  extraHeaders?: Record<string, string>,
): Response {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id, result }), {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      ...(extraHeaders ?? {}),
    },
  });
}

// Random session ID for MCP streamable-http transport. Claude Code 2.1.104+
// rejects servers that don't emit Mcp-Session-Id on initialize as "Failed to
// connect" in `claude mcp list`. We don't actually maintain per-session state
// server-side — the Bearer token in Authorization is the real identity — but
// the header presence is what the probe checks.
function generateMcpSessionId(): string {
  return crypto.randomUUID();
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

// Look up a user_id by Bearer token. Tries OAuth access tokens first (because
// OAuth tokens have a known prefix-free format and DB lookup is cheap), then
// falls back to the legacy static API key (`tsche_…`). Returns null on miss.
async function authenticateBearer(
  adminClient: any,
  rawKey: string,
): Promise<{ userId: string; source: "oauth" | "api_key" } | null> {
  if (!rawKey || rawKey.length < 16) return null;

  // 1. Try OAuth access token
  const oauthHit = await lookupAccessToken(adminClient, rawKey);
  if (oauthHit) return { userId: oauthHit.userId, source: "oauth" };

  // 2. Fall back to static API key (legacy / power user)
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

  return { userId: data.user_id as string, source: "api_key" };
}

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: unknown;
  method: string;
  params?: Record<string, unknown>;
}

// ------------- MCP method handlers -------------

function handleInitialize(id: unknown): Response {
  // Advertise an icon under several field names so each client implementation
  // can pick whichever it understands. The MCP spec (2025-06-18) doesn't yet
  // standardize icons, but Claude.ai and other clients look at:
  //   - serverInfo.icons[] (an array with src/mimeType/sizes)
  //   - serverInfo.iconUrl (single URL)
  //   - serverInfo._meta.iconUrl (vendor extension)
  // We also serve /favicon.ico and /icon.png on the same host as a fallback.
  const ICON_URL = "https://tosche-oauth.kiichitsukui111806.workers.dev/icon.png";
  return jsonRpcResult(id, {
    protocolVersion: MCP_PROTOCOL_VERSION,
    capabilities: {
      tools: {},
    },
    serverInfo: {
      name: SERVER_NAME,
      title: "ToSche",
      version: SERVER_VERSION,
      iconUrl: ICON_URL,
      icons: [{ src: ICON_URL, mimeType: "image/png", sizes: "256x256" }],
      _meta: { iconUrl: ICON_URL },
    },
    instructions:
      "ToSche MCP server. Use list_goals first to see what the user has, then create_goal / create_milestones_batch to add new goals and roadmaps. Mark progress with update_milestone.",
  }, { "Mcp-Session-Id": generateMcpSessionId() });
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

// ------------- OpenAPI 3.1 surface (for ChatGPT Custom GPT Actions) -------------
//
// ChatGPT's consumer UI does not yet accept arbitrary MCP server URLs the way
// Claude.ai does. The most reliable way to expose the same tools to ChatGPT
// users is a Custom GPT with an OpenAPI 3.x Action pointing at our REST surface.
//
// Endpoints:
//   GET  /functions/v1/mcp-server/openapi.json       → schema for Custom GPT setup
//   POST /functions/v1/mcp-server/api/<tool_name>    → call a tool (same Bearer auth)

const REST_BASE_PATH = "/functions/v1/mcp-server";

function buildOpenApiSpec(baseUrl: string): Record<string, unknown> {
  const paths: Record<string, unknown> = {};
  for (const tool of MCP_TOOL_DEFS) {
    const required = tool.inputSchema.required ?? [];
    // ChatGPT Custom GPT Actions caps operation `description` at 300 chars
    // and requires concise `summary`. Trim aggressively.
    const firstLine = tool.description.split("\n")[0];
    const summary = firstLine.length > 100
      ? firstLine.slice(0, 97) + "..."
      : firstLine;
    const fullDesc = tool.description.replace(/\s+/g, " ").trim();
    const description = fullDesc.length > 290
      ? fullDesc.slice(0, 287) + "..."
      : fullDesc;
    paths[`/api/${tool.name}`] = {
      post: {
        operationId: tool.name,
        summary,
        description,
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: required.length > 0,
          content: {
            "application/json": { schema: tool.inputSchema },
          },
        },
        responses: {
          "200": {
            description: "Tool result. ok=true on success with data, ok=false with error.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    ok: { type: "boolean" },
                    data: { type: "object", additionalProperties: true },
                    error: { type: "string" },
                  },
                  required: ["ok"],
                },
              },
            },
          },
          "401": { description: "Unauthorized" },
          "404": { description: "Unknown tool" },
          "500": { description: "Server error" },
        },
      },
    };
  }
  return {
    openapi: "3.1.0",
    info: {
      title: "ToSche Goals API",
      version: SERVER_VERSION,
      description:
        "REST surface over the ToSche MCP server. For ChatGPT Custom GPT Actions. " +
        "Auth via OAuth (preferred) or Bearer API key.",
    },
    servers: [{ url: baseUrl }],
    components: {
      // ChatGPT requires `schemas` to be an object — empty is fine.
      schemas: {},
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer" },
      },
    },
    paths,
  };
}

async function handleRestCall(
  toolName: string,
  bodyJson: unknown,
  ctx: ToolContext,
): Promise<Response> {
  const executor = MCP_TOOL_EXECUTORS[toolName];
  if (!executor) {
    return httpError(404, { ok: false, error: `Unknown tool: ${toolName}` });
  }
  const args =
    bodyJson && typeof bodyJson === "object"
      ? (bodyJson as Record<string, unknown>)
      : {};
  try {
    const result = await executor(args, ctx);
    return new Response(JSON.stringify(result), {
      // 200 even on validation errors so Custom GPT sees the error field
      // and can react/retry. Reserve non-200 for transport-level problems.
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return httpError(500, { ok: false, error: e?.message ?? String(e) });
  }
}

// ------------- HTTP entrypoint -------------

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const url = new URL(req.url);
  // Normalize path: Supabase strips the `/functions/v1/<name>` prefix in some
  // runtimes but not others. Handle both shapes, plus trailing slashes.
  let path = url.pathname;
  if (path.startsWith(REST_BASE_PATH)) {
    path = path.slice(REST_BASE_PATH.length);
  } else if (path.startsWith("/mcp-server")) {
    path = path.slice("/mcp-server".length);
  }
  if (path === "") path = "/";
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);

  // --- GET / : server info (no auth) ---
  if (req.method === "GET" && path === "/") {
    return httpError(200, {
      server: SERVER_NAME,
      version: SERVER_VERSION,
      protocol: MCP_PROTOCOL_VERSION,
      transport: "streamable-http",
      surfaces: {
        mcp: { method: "POST", path: "/" },
        openapi: { method: "GET", path: "/openapi.json" },
        rest: { method: "POST", path: "/api/<tool_name>" },
      },
      docs:
        "Bearer auth. Keys are generated in the ToSche app → Settings → Claude integration.",
    });
  }

  // --- GET /openapi.json : schema for ChatGPT Custom GPT Action ---
  if (req.method === "GET" && path === "/openapi.json") {
    // Force https because Supabase terminates TLS at the edge and the
    // internal req.url surfaces as http://; ChatGPT Custom GPT Actions
    // reject non-https `servers.url`.
    const baseUrl = `https://${url.host}${REST_BASE_PATH}`;
    return new Response(JSON.stringify(buildOpenApiSpec(baseUrl)), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey || !anonKey) {
    return httpError(500, { error: "Server misconfigured" });
  }
  const adminClient = createClient(supabaseUrl, serviceKey);

  // ---------- OAuth 2.1 surface ----------
  // GET /.well-known/oauth-protected-resource : tells clients where the auth server lives
  if (req.method === "GET" && path === "/.well-known/oauth-protected-resource") {
    return handleProtectedResourceMetadata(req, REST_BASE_PATH);
  }
  // GET /.well-known/oauth-authorization-server : the auth server metadata
  if (req.method === "GET" && path === "/.well-known/oauth-authorization-server") {
    return handleAuthServerMetadata(req, REST_BASE_PATH);
  }
  // POST /oauth/register : Dynamic Client Registration (RFC 7591)
  if (req.method === "POST" && path === "/oauth/register") {
    return await handleRegister(req, adminClient);
  }
  // GET /oauth/authorize : consent HTML page
  if (req.method === "GET" && path === "/oauth/authorize") {
    return await handleAuthorizeGet(req, adminClient);
  }
  // POST /oauth/authorize/approve : called by the consent page JS
  if (req.method === "POST" && path === "/oauth/authorize/approve") {
    return await handleAuthorizeApprove(req, adminClient, anonKey, supabaseUrl);
  }
  // POST /oauth/token : authorization_code or refresh_token grants
  if (req.method === "POST" && path === "/oauth/token") {
    return await handleToken(req, adminClient);
  }

  // Parse Authorization header (used by both MCP and REST paths)
  const authHeader = req.headers.get("Authorization") || "";
  const bearerMatch = /^Bearer\s+(.+)$/i.exec(authHeader);
  const rawKey = bearerMatch?.[1]?.trim() ?? "";

  // --- POST /api/<tool_name> : REST surface for ChatGPT ---
  if (req.method === "POST" && path.startsWith("/api/")) {
    const toolName = path.slice("/api/".length);
    const auth = await authenticateBearer(adminClient, rawKey);
    if (!auth) {
      return httpError(401, {
        ok: false,
        error:
          "Unauthorized: missing or invalid API key. Generate one in the ToSche app → Settings → Claude integration.",
      });
    }
    let bodyJson: unknown = {};
    try {
      const text = await req.text();
      bodyJson = text ? JSON.parse(text) : {};
    } catch {
      return httpError(400, { ok: false, error: "Invalid JSON body" });
    }
    return handleRestCall(toolName, bodyJson, {
      userId: auth.userId,
      adminClient,
      now: new Date(),
    });
  }

  // --- POST / : MCP JSON-RPC 2.0 (Claude.ai, Claude Code, Cursor, etc.) ---
  if (req.method !== "POST" || path !== "/") {
    return httpError(404, { error: "Not found" });
  }

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
  // MCP client can probe the server before sending credentials.
  if (body.method === "initialize") {
    return handleInitialize(body.id);
  }
  if (body.method === "notifications/initialized") {
    return new Response(null, { status: 202, headers: corsHeaders });
  }
  if (isNotification) {
    return new Response(null, { status: 202, headers: corsHeaders });
  }

  const auth = await authenticateBearer(adminClient, rawKey);
  if (!auth) {
    // MCP Authorization Spec 2025-06-18: when authentication is required and
    // missing/invalid, return HTTP 401 with a `WWW-Authenticate: Bearer
    // resource_metadata="<URL>"` header pointing at the OAuth protected-
    // resource metadata. This is the signal MCP clients (Claude.ai etc.)
    // use to discover the auth server and trigger the OAuth flow.
    const resourceMetadataUrl =
      `https://${url.host}${REST_BASE_PATH}/.well-known/oauth-protected-resource`;
    return new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        id: body.id,
        error: {
          code: -32001,
          message:
            "Unauthorized: missing or invalid token. Complete the OAuth flow at the authorization_endpoint, or generate a static API key in the ToSche app → Settings → AI連携.",
        },
      }),
      {
        status: 401,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "WWW-Authenticate": `Bearer resource_metadata="${resourceMetadataUrl}"`,
        },
      },
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
