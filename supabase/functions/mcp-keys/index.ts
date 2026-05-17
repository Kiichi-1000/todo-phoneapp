// mcp-keys: app-side API key management for the MCP integration.
//
// POST /functions/v1/mcp-keys
//
// Authenticated via the user's Supabase JWT (Authorization: Bearer <jwt>).
// Dispatches by `action` in the JSON body:
//
//   { action: "list" }                          → list this user's keys
//   { action: "create", label?: string }        → create a new key (returns plaintext ONCE)
//   { action: "revoke", id: string }            → revoke a key (soft delete via revoked_at)
//
// The plaintext key is only ever returned in the `create` response. After
// that, only the SHA-256 hash is stored. The first ~12 chars are kept as a
// display prefix so the UI can identify keys without the secret.

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

async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// URL-safe base64 of `n` random bytes, stripped of padding.
function randomToken(byteLen = 24): string {
  const bytes = new Uint8Array(byteLen);
  crypto.getRandomValues(bytes);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceKey) {
    return jsonResponse({ error: "Server misconfigured" }, 500);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return jsonResponse({ error: "Authorization header required" }, 401);
  }

  // Validate the user via their JWT.
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: userErr } = await userClient.auth.getUser();
  if (userErr || !user) {
    return jsonResponse({ error: "Invalid token" }, 401);
  }

  let body: { action?: string; label?: string; id?: string } = {};
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }

  const admin = createClient(supabaseUrl, serviceKey);
  const action = body.action ?? "";

  if (action === "list") {
    const { data, error } = await admin
      .from("mcp_api_keys")
      .select("id, key_prefix, label, last_used_at, revoked_at, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    if (error) return jsonResponse({ error: error.message }, 500);
    return jsonResponse({ keys: data });
  }

  if (action === "create") {
    const label = typeof body.label === "string" ? body.label.trim().slice(0, 100) : null;

    // Cap at 10 active keys per user to keep the table tidy.
    const { count: activeCount } = await admin
      .from("mcp_api_keys")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .is("revoked_at", null);
    if ((activeCount ?? 0) >= 10) {
      return jsonResponse(
        { error: "Maximum of 10 active keys. Revoke an unused one first." },
        409,
      );
    }

    const rawKey = `tsche_${randomToken(24)}`;
    const keyHash = await sha256Hex(rawKey);
    const keyPrefix = rawKey.slice(0, 12); // "tsche_AbCdEf"

    const { data, error } = await admin
      .from("mcp_api_keys")
      .insert({
        user_id: user.id,
        key_hash: keyHash,
        key_prefix: keyPrefix,
        label,
      })
      .select("id, key_prefix, label, created_at")
      .single();
    if (error) return jsonResponse({ error: error.message }, 500);

    // The plaintext key is included here ONCE. After this response, it can
    // never be retrieved — only the hash is stored.
    return jsonResponse({
      key: rawKey,
      id: data.id,
      prefix: data.key_prefix,
      label: data.label,
      created_at: data.created_at,
    });
  }

  if (action === "revoke") {
    const id = body.id;
    if (!id) return jsonResponse({ error: "id is required" }, 400);
    const { data, error } = await admin
      .from("mcp_api_keys")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", user.id) // belt-and-braces: enforce ownership
      .select("id")
      .maybeSingle();
    if (error) return jsonResponse({ error: error.message }, 500);
    if (!data) return jsonResponse({ error: "Key not found" }, 404);
    return jsonResponse({ ok: true, id: data.id });
  }

  return jsonResponse({ error: `Unknown action: ${action}` }, 400);
});
