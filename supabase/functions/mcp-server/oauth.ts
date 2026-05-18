// OAuth 2.1 + Dynamic Client Registration handlers for the ToSche MCP server.
//
// Conforms to:
//   - RFC 6749 (OAuth 2.0) with OAuth 2.1 modernizations
//   - RFC 7591 (Dynamic Client Registration)
//   - RFC 7636 (PKCE, S256 mandatory)
//   - RFC 8414 (Authorization Server Metadata)
//   - MCP Authorization Spec 2025-06-18
//
// Security posture:
//   - Public clients only (no client_secret) — PKCE provides the security guarantee.
//   - All secrets (codes, access tokens, refresh tokens) stored as SHA-256 hex.
//   - Authorization codes: 10-min TTL, one-time use enforced by `used_at` column.
//   - Access tokens: 1-hour TTL.
//   - Refresh tokens: 30-day TTL, rotated on every use (old one revoked atomically).
//   - Redirect URI: exact-match against the client's registered list.
//   - Issuer URL forced to https:// (Supabase terminates TLS at the edge).

const ACCESS_TOKEN_TTL_SEC = 60 * 60;             // 1 hour
const REFRESH_TOKEN_TTL_SEC = 60 * 60 * 24 * 30;  // 30 days
const AUTH_CODE_TTL_SEC = 60 * 10;                // 10 minutes
const SUPPORTED_SCOPES = ["goals"];
const SCOPE_DEFAULT = "goals";

// Cloudflare Worker proxy hosts the consent HTML. Supabase + Cloudflare
// inject `Content-Security-Policy: default-src 'none'; sandbox` on every
// HTML response from *.supabase.co, which makes inline JS / forms inert.
// The Worker re-emits the page from a non-supabase domain with a permissive
// CSP so the consent flow actually works in the browser.
const CONSENT_PAGE_URL = "https://tosche-oauth.kiichitsukui111806.workers.dev/authorize";

// ------------- helpers -------------

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, mcp-protocol-version, mcp-session-id",
};

function json(payload: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...extra },
  });
}

function html(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "text/html; charset=utf-8",
      // Prevent OAuth pages from being iframed (clickjacking)
      "X-Frame-Options": "DENY",
      "Content-Security-Policy":
        "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' https://esm.sh https://cdn.jsdelivr.net; connect-src *;",
    },
  });
}

export async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Base64-URL encode without padding (used for PKCE comparison + token gen).
function b64urlFromBytes(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomToken(byteLen = 32): string {
  const bytes = new Uint8Array(byteLen);
  crypto.getRandomValues(bytes);
  return b64urlFromBytes(bytes);
}

// PKCE S256: base64url(sha256(code_verifier))
async function pkceS256(verifier: string): Promise<string> {
  const buf = new TextEncoder().encode(verifier);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return b64urlFromBytes(new Uint8Array(hash));
}

// Match an incoming redirect_uri against a registered one. Exact match by
// default, except for loopback http URIs (RFC 8252), where the port is
// allowed to differ — Claude Code picks an ephemeral port per session so
// `http://127.0.0.1/callback` registered must match
// `http://127.0.0.1:54321/callback` at runtime, etc.
function redirectUriMatches(registered: string, incoming: string): boolean {
  if (registered === incoming) return true;
  try {
    const r = new URL(registered);
    const i = new URL(incoming);
    const isLoopback =
      r.protocol === "http:" &&
      i.protocol === "http:" &&
      (r.hostname === "127.0.0.1" || r.hostname === "localhost") &&
      r.hostname === i.hostname;
    if (!isLoopback) return false;
    return r.pathname === i.pathname && r.search === i.search;
  } catch {
    return false;
  }
}

function findMatchingRedirectUri(registered: string[], incoming: string): string | null {
  for (const r of registered) {
    if (redirectUriMatches(r, incoming)) return r;
  }
  return null;
}

// Resolve the canonical issuer URL (always https) from the incoming request.
export function issuerFromRequest(req: Request, basePath: string): string {
  const url = new URL(req.url);
  return `https://${url.host}${basePath}`;
}

// ------------- metadata endpoints -------------

export function handleAuthServerMetadata(req: Request, basePath: string): Response {
  const issuer = issuerFromRequest(req, basePath);
  return json({
    issuer,
    // authorization_endpoint points at the Cloudflare Worker proxy, not at
    // the Supabase mcp-server. See CONSENT_PAGE_URL comment above for why.
    authorization_endpoint: CONSENT_PAGE_URL,
    token_endpoint: `${issuer}/oauth/token`,
    registration_endpoint: `${issuer}/oauth/register`,
    scopes_supported: SUPPORTED_SCOPES,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    service_documentation: "https://synthera.jp/contact",
  });
}

// MCP resource server metadata — tells clients where the auth server lives.
export function handleProtectedResourceMetadata(req: Request, basePath: string): Response {
  const issuer = issuerFromRequest(req, basePath);
  return json({
    resource: issuer,
    authorization_servers: [issuer],
    scopes_supported: SUPPORTED_SCOPES,
    bearer_methods_supported: ["header"],
  });
}

// ------------- Dynamic Client Registration (RFC 7591) -------------

interface RegisterBody {
  client_name?: string;
  client_uri?: string;
  logo_uri?: string;
  redirect_uris?: string[];
  grant_types?: string[];
  response_types?: string[];
  scope?: string;
  token_endpoint_auth_method?: string;
  software_id?: string;
  software_version?: string;
}

export async function handleRegister(req: Request, admin: any): Promise<Response> {
  let body: RegisterBody;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_client_metadata", error_description: "Invalid JSON" }, 400);
  }

  const redirectUris = Array.isArray(body.redirect_uris) ? body.redirect_uris : [];
  if (redirectUris.length === 0) {
    return json({
      error: "invalid_redirect_uri",
      error_description: "At least one redirect_uri is required",
    }, 400);
  }
  // Validate redirect URIs: must be https (or loopback http for dev clients)
  for (const uri of redirectUris) {
    try {
      const u = new URL(uri);
      const isLoopback =
        u.protocol === "http:" && (u.hostname === "127.0.0.1" || u.hostname === "localhost");
      if (u.protocol !== "https:" && !isLoopback) {
        return json({
          error: "invalid_redirect_uri",
          error_description: `redirect_uri must be https or http loopback: ${uri}`,
        }, 400);
      }
    } catch {
      return json({
        error: "invalid_redirect_uri",
        error_description: `Not a valid URL: ${uri}`,
      }, 400);
    }
  }

  // Only "none" supported (public clients with PKCE).
  const authMethod = body.token_endpoint_auth_method ?? "none";
  if (authMethod !== "none") {
    return json({
      error: "invalid_client_metadata",
      error_description: "Only token_endpoint_auth_method=none is supported (public clients via PKCE)",
    }, 400);
  }

  const grantTypes = body.grant_types ?? ["authorization_code", "refresh_token"];
  const allowedGrants = new Set(["authorization_code", "refresh_token"]);
  for (const g of grantTypes) {
    if (!allowedGrants.has(g)) {
      return json({
        error: "invalid_client_metadata",
        error_description: `Unsupported grant_type: ${g}`,
      }, 400);
    }
  }

  const responseTypes = body.response_types ?? ["code"];
  if (!responseTypes.every((r: string) => r === "code")) {
    return json({
      error: "invalid_client_metadata",
      error_description: "Only response_type=code is supported",
    }, 400);
  }

  const scope = (body.scope ?? SCOPE_DEFAULT).split(/\s+/).every(s => SUPPORTED_SCOPES.includes(s))
    ? (body.scope ?? SCOPE_DEFAULT)
    : SCOPE_DEFAULT;

  const clientId = `tsche_clt_${randomToken(16)}`;
  const issuedAt = Math.floor(Date.now() / 1000);

  const { error } = await admin.from("oauth_clients").insert({
    client_id: clientId,
    client_name: body.client_name?.slice(0, 200) ?? null,
    client_uri: body.client_uri?.slice(0, 500) ?? null,
    logo_uri: body.logo_uri?.slice(0, 500) ?? null,
    redirect_uris: redirectUris,
    grant_types: grantTypes,
    response_types: responseTypes,
    scope,
    token_endpoint_auth_method: "none",
    software_id: body.software_id?.slice(0, 200) ?? null,
    software_version: body.software_version?.slice(0, 50) ?? null,
  });
  if (error) {
    console.error("[oauth/register] insert failed:", error.message);
    return json({ error: "server_error", error_description: error.message }, 500);
  }

  return json({
    client_id: clientId,
    client_id_issued_at: issuedAt,
    client_name: body.client_name ?? null,
    client_uri: body.client_uri ?? null,
    logo_uri: body.logo_uri ?? null,
    redirect_uris: redirectUris,
    grant_types: grantTypes,
    response_types: responseTypes,
    scope,
    token_endpoint_auth_method: "none",
  }, 201);
}

// ------------- /oauth/authorize : consent HTML page -------------

interface AuthorizeQuery {
  client_id: string;
  redirect_uri: string;
  response_type: string;
  scope?: string;
  state?: string;
  code_challenge: string;
  code_challenge_method: string;
}

function parseAuthorizeQuery(url: URL): AuthorizeQuery | { error: string } {
  const q = url.searchParams;
  const required = ["client_id", "redirect_uri", "response_type", "code_challenge", "code_challenge_method"];
  for (const k of required) {
    if (!q.get(k)) return { error: `Missing required parameter: ${k}` };
  }
  if (q.get("response_type") !== "code") return { error: "response_type must be code" };
  if (q.get("code_challenge_method") !== "S256") return { error: "code_challenge_method must be S256" };
  return {
    client_id: q.get("client_id")!,
    redirect_uri: q.get("redirect_uri")!,
    response_type: q.get("response_type")!,
    scope: q.get("scope") ?? undefined,
    state: q.get("state") ?? undefined,
    code_challenge: q.get("code_challenge")!,
    code_challenge_method: q.get("code_challenge_method")!,
  };
}

export async function handleAuthorizeGet(req: Request, admin: any): Promise<Response> {
  const url = new URL(req.url);
  const parsed = parseAuthorizeQuery(url);
  if ("error" in parsed) {
    return html(errorPage(parsed.error), 400);
  }

  // Validate client_id exists and redirect_uri is registered.
  const { data: client, error } = await admin
    .from("oauth_clients")
    .select("client_id, client_name, client_uri, logo_uri, redirect_uris, scope")
    .eq("client_id", parsed.client_id)
    .maybeSingle();
  if (error) {
    console.error("[oauth/authorize] client lookup failed:", error.message);
    return html(errorPage("Server error looking up client"), 500);
  }
  if (!client) {
    return html(errorPage("Unknown client_id"), 400);
  }
  if (!findMatchingRedirectUri(client.redirect_uris as string[], parsed.redirect_uri)) {
    return html(errorPage(
      "redirect_uri is not registered for this client. " +
      "Re-register the client with this redirect_uri or use a different one.",
    ), 400);
  }

  const scope = parsed.scope ?? client.scope ?? SCOPE_DEFAULT;
  const clientName = (client.client_name as string | null) ?? parsed.client_id;
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

  return html(consentPage({
    clientId: parsed.client_id,
    clientName,
    clientUri: (client.client_uri as string | null) ?? "",
    logoUri: (client.logo_uri as string | null) ?? "",
    redirectUri: parsed.redirect_uri,
    scope,
    state: parsed.state ?? "",
    codeChallenge: parsed.code_challenge,
    codeChallengeMethod: parsed.code_challenge_method,
    supabaseUrl,
    supabaseAnonKey: anonKey,
  }));
}

// POST /oauth/authorize/approve — called by the consent page JS once the
// user is signed in and clicks "Allow". Returns the final redirect URL.
//
// Body: { access_token (Supabase JWT), client_id, redirect_uri, code_challenge,
//         code_challenge_method, scope, state }
// Response: { redirect_url }
export async function handleAuthorizeApprove(req: Request, admin: any, anonKey: string, supabaseUrl: string): Promise<Response> {
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const access_token = String(body.access_token ?? "");
  const clientId = String(body.client_id ?? "");
  const redirectUri = String(body.redirect_uri ?? "");
  const codeChallenge = String(body.code_challenge ?? "");
  const codeChallengeMethod = String(body.code_challenge_method ?? "");
  const scope = String(body.scope ?? SCOPE_DEFAULT);
  const state = body.state == null ? null : String(body.state);

  if (!access_token || !clientId || !redirectUri || !codeChallenge) {
    return json({ error: "Missing required fields" }, 400);
  }
  if (codeChallengeMethod !== "S256") {
    return json({ error: "code_challenge_method must be S256" }, 400);
  }

  // Verify user via Supabase auth
  const { createClient } = await import("npm:@supabase/supabase-js@2");
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${access_token}` } },
  });
  const { data: { user }, error: userErr } = await userClient.auth.getUser();
  if (userErr || !user) {
    return json({ error: "Invalid Supabase session" }, 401);
  }

  // Re-validate client + redirect_uri (in case payload was tampered)
  const { data: client } = await admin
    .from("oauth_clients")
    .select("client_id, redirect_uris, scope")
    .eq("client_id", clientId)
    .maybeSingle();
  if (!client) return json({ error: "Unknown client" }, 400);
  if (!findMatchingRedirectUri(client.redirect_uris as string[], redirectUri)) {
    return json({ error: "redirect_uri not registered" }, 400);
  }

  // Issue authorization code (10-min TTL, one-time use)
  const code = randomToken(32);
  const codeHash = await sha256Hex(code);
  const expiresAt = new Date(Date.now() + AUTH_CODE_TTL_SEC * 1000).toISOString();

  const { error: insErr } = await admin.from("oauth_codes").insert({
    code_hash: codeHash,
    client_id: clientId,
    user_id: user.id,
    redirect_uri: redirectUri,
    code_challenge: codeChallenge,
    code_challenge_method: codeChallengeMethod,
    scope,
    expires_at: expiresAt,
  });
  if (insErr) {
    console.error("[oauth/authorize/approve] code insert failed:", insErr.message);
    return json({ error: "Failed to issue code" }, 500);
  }

  // Build redirect URL
  const ru = new URL(redirectUri);
  ru.searchParams.set("code", code);
  if (state !== null) ru.searchParams.set("state", state);
  return json({ redirect_url: ru.toString() });
}

// ------------- /oauth/token : exchange code → tokens / refresh -------------

interface AccessTokenResponse {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  refresh_token?: string;
  scope: string;
}

async function issueTokenPair(admin: any, args: {
  client_id: string;
  user_id: string;
  scope: string;
}): Promise<AccessTokenResponse> {
  const access = randomToken(32);
  const refresh = randomToken(32);
  const accessHash = await sha256Hex(access);
  const refreshHash = await sha256Hex(refresh);
  const now = new Date();
  const accessExp = new Date(now.getTime() + ACCESS_TOKEN_TTL_SEC * 1000).toISOString();
  const refreshExp = new Date(now.getTime() + REFRESH_TOKEN_TTL_SEC * 1000).toISOString();

  await admin.from("oauth_tokens").insert({
    access_token_hash: accessHash,
    refresh_token_hash: refreshHash,
    client_id: args.client_id,
    user_id: args.user_id,
    scope: args.scope,
    access_expires_at: accessExp,
    refresh_expires_at: refreshExp,
  });

  return {
    access_token: access,
    token_type: "Bearer",
    expires_in: ACCESS_TOKEN_TTL_SEC,
    refresh_token: refresh,
    scope: args.scope,
  };
}

export async function handleToken(req: Request, admin: any): Promise<Response> {
  let params: URLSearchParams;
  const ct = req.headers.get("Content-Type") ?? "";
  try {
    if (ct.includes("application/x-www-form-urlencoded")) {
      params = new URLSearchParams(await req.text());
    } else if (ct.includes("application/json")) {
      const body = await req.json();
      params = new URLSearchParams();
      for (const [k, v] of Object.entries(body)) {
        if (v != null) params.set(k, String(v));
      }
    } else {
      return json({ error: "invalid_request", error_description: "Unsupported Content-Type" }, 400);
    }
  } catch {
    return json({ error: "invalid_request", error_description: "Invalid body" }, 400);
  }

  const grantType = params.get("grant_type");
  if (grantType === "authorization_code") {
    return await handleAuthCodeGrant(params, admin);
  }
  if (grantType === "refresh_token") {
    return await handleRefreshGrant(params, admin);
  }
  return json({ error: "unsupported_grant_type" }, 400);
}

async function handleAuthCodeGrant(params: URLSearchParams, admin: any): Promise<Response> {
  const code = params.get("code");
  const redirectUri = params.get("redirect_uri");
  const clientId = params.get("client_id");
  const codeVerifier = params.get("code_verifier");
  if (!code || !redirectUri || !clientId || !codeVerifier) {
    return json({ error: "invalid_request", error_description: "Missing fields" }, 400);
  }

  const codeHash = await sha256Hex(code);
  const { data: codeRow, error } = await admin
    .from("oauth_codes")
    .select("*")
    .eq("code_hash", codeHash)
    .maybeSingle();
  if (error) return json({ error: "server_error" }, 500);
  if (!codeRow) return json({ error: "invalid_grant", error_description: "Unknown code" }, 400);
  if (codeRow.used_at) return json({ error: "invalid_grant", error_description: "Code already used" }, 400);
  if (new Date(codeRow.expires_at).getTime() < Date.now()) {
    return json({ error: "invalid_grant", error_description: "Code expired" }, 400);
  }
  if (codeRow.client_id !== clientId) {
    return json({ error: "invalid_grant", error_description: "client_id mismatch" }, 400);
  }
  // For loopback URIs Claude Code uses ephemeral ports — accept port differences
  // (same scheme/host/path) so the token request from a freshly-bound port
  // still matches the stored auth code.
  if (!redirectUriMatches(codeRow.redirect_uri, redirectUri)) {
    return json({ error: "invalid_grant", error_description: "redirect_uri mismatch" }, 400);
  }
  // PKCE verification
  const computed = await pkceS256(codeVerifier);
  if (computed !== codeRow.code_challenge) {
    return json({ error: "invalid_grant", error_description: "PKCE verification failed" }, 400);
  }

  // Mark code used (one-time)
  await admin.from("oauth_codes").update({ used_at: new Date().toISOString() }).eq("code_hash", codeHash);

  const tokens = await issueTokenPair(admin, {
    client_id: clientId,
    user_id: codeRow.user_id,
    scope: codeRow.scope,
  });
  return json(tokens, 200, {
    // Per OAuth spec, token responses must not be cached
    "Cache-Control": "no-store",
    "Pragma": "no-cache",
  });
}

async function handleRefreshGrant(params: URLSearchParams, admin: any): Promise<Response> {
  const refresh = params.get("refresh_token");
  const clientId = params.get("client_id");
  if (!refresh || !clientId) {
    return json({ error: "invalid_request", error_description: "Missing fields" }, 400);
  }
  const refreshHash = await sha256Hex(refresh);
  const { data: row, error } = await admin
    .from("oauth_tokens")
    .select("*")
    .eq("refresh_token_hash", refreshHash)
    .maybeSingle();
  if (error) return json({ error: "server_error" }, 500);
  if (!row) return json({ error: "invalid_grant", error_description: "Unknown refresh_token" }, 400);
  if (row.revoked_at) return json({ error: "invalid_grant", error_description: "Token revoked" }, 400);
  if (row.client_id !== clientId) {
    return json({ error: "invalid_grant", error_description: "client_id mismatch" }, 400);
  }
  if (row.refresh_expires_at && new Date(row.refresh_expires_at).getTime() < Date.now()) {
    return json({ error: "invalid_grant", error_description: "Refresh token expired" }, 400);
  }

  // Rotation: revoke the old token row, issue a new pair
  await admin.from("oauth_tokens").update({ revoked_at: new Date().toISOString() }).eq("id", row.id);
  const tokens = await issueTokenPair(admin, {
    client_id: row.client_id,
    user_id: row.user_id,
    scope: row.scope,
  });
  return json(tokens, 200, { "Cache-Control": "no-store", "Pragma": "no-cache" });
}

// Lookup an access token; returns user_id if valid, null otherwise.
// Used by mcp-server's auth path.
export async function lookupAccessToken(admin: any, accessToken: string): Promise<{ userId: string; scope: string } | null> {
  if (!accessToken || accessToken.length < 20) return null;
  const hash = await sha256Hex(accessToken);
  const { data, error } = await admin
    .from("oauth_tokens")
    .select("id, user_id, scope, access_expires_at, revoked_at")
    .eq("access_token_hash", hash)
    .maybeSingle();
  if (error || !data) return null;
  if (data.revoked_at) return null;
  if (new Date(data.access_expires_at).getTime() < Date.now()) return null;

  // fire-and-forget last_used_at
  admin
    .from("oauth_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id)
    .then(() => {})
    .catch(() => {});

  return { userId: data.user_id as string, scope: data.scope as string };
}

// ------------- HTML pages -------------

function errorPage(message: string): string {
  const safe = escapeHtml(message);
  return `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><title>ToSche — エラー</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>${baseCss()}</style></head>
<body><main class="card">
  <h1>接続できません</h1>
  <p class="err">${safe}</p>
  <p class="muted">このウィンドウを閉じて、もう一度やり直してください。問題が続く場合は ToSche サポートにお問い合わせください。</p>
</main></body></html>`;
}

interface ConsentPageOpts {
  clientId: string;
  clientName: string;
  clientUri: string;
  logoUri: string;
  redirectUri: string;
  scope: string;
  state: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
}

function consentPage(opts: ConsentPageOpts): string {
  // Encode all fields safely for embedding in HTML/JS contexts.
  const j = (v: string) => JSON.stringify(v);
  return `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><title>ToSche を ${escapeHtml(opts.clientName)} に接続</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>${baseCss()}</style></head>
<body>
<main class="card" id="root">
  <header>
    <div class="brand">📋 ToSche</div>
    <h1>${escapeHtml(opts.clientName)} に接続</h1>
    <p class="muted">${escapeHtml(opts.clientName)} があなたの ToSche アカウントの目標・ロードマップを読み書きできるようになります。</p>
  </header>

  <section id="login-section">
    <h2>ToSche にサインイン</h2>
    <form id="login-form">
      <label>メールアドレス<input type="email" id="email" required autocomplete="email"></label>
      <label>パスワード <span class="muted">(Apple / Google サインインの方は空欄でOK)</span><input type="password" id="password" autocomplete="current-password"></label>
      <button type="submit" id="login-btn">サインイン</button>
    </form>
    <p class="muted" style="margin-top:10px">
      パスワードが分からない場合は
      <a href="#" id="magic-link-btn">メールでサインインリンクを送る</a>
    </p>
    <p id="login-err" class="err" hidden></p>
    <p id="magic-link-ok" class="muted" hidden>メールを送りました。届いたリンクを開くと、新しいタブが立ち上がってこの承認画面が表示されます。そこで「許可」をクリックしてください。</p>
  </section>

  <section id="consent-section" hidden>
    <h2>権限の確認</h2>
    <p>サインイン中: <strong id="user-email"></strong></p>
    <ul class="perms">
      <li>あなたの目標 (目標タブで管理) の <strong>閲覧と作成</strong></li>
      <li>あなたのロードマップ・ステップの <strong>閲覧・追加・更新</strong></li>
    </ul>
    <p class="muted">ToSche のタスク・スケジュール・他の個人データへはアクセスしません。アクセスは設定画面からいつでも取り消せます。</p>
    <div class="actions">
      <button id="deny-btn" type="button" class="secondary">キャンセル</button>
      <button id="allow-btn" type="button">許可する</button>
    </div>
    <p id="approve-err" class="err" hidden></p>
  </section>
</main>

<script type="module">
  import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
  const supabase = createClient(${j(opts.supabaseUrl)}, ${j(opts.supabaseAnonKey)});

  const flow = {
    client_id: ${j(opts.clientId)},
    redirect_uri: ${j(opts.redirectUri)},
    code_challenge: ${j(opts.codeChallenge)},
    code_challenge_method: ${j(opts.codeChallengeMethod)},
    scope: ${j(opts.scope)},
    state: ${j(opts.state)},
  };

  const $ = (id) => document.getElementById(id);

  async function showConsent(session) {
    $("login-section").hidden = true;
    $("consent-section").hidden = false;
    $("user-email").textContent = session.user.email ?? session.user.id;
  }

  async function tryRestoreSession() {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) await showConsent(session);
  }
  tryRestoreSession();

  $("login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    $("login-err").hidden = true;
    $("login-btn").disabled = true;
    const email = $("email").value.trim();
    const password = $("password").value;
    if (!password) {
      $("login-err").textContent = "パスワードを入力するか、下の「メールでサインインリンク」を使ってください。";
      $("login-err").hidden = false;
      $("login-btn").disabled = false;
      return;
    }
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    $("login-btn").disabled = false;
    if (error || !data?.session) {
      $("login-err").textContent = "サインインに失敗しました: " + (error?.message ?? "no session");
      $("login-err").hidden = false;
      return;
    }
    await showConsent(data.session);
  });

  $("magic-link-btn").addEventListener("click", async (e) => {
    e.preventDefault();
    $("login-err").hidden = true;
    $("magic-link-ok").hidden = true;
    const email = $("email").value.trim();
    if (!email) {
      $("login-err").textContent = "メールアドレスを先に入力してください。";
      $("login-err").hidden = false;
      return;
    }
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: window.location.href,
        shouldCreateUser: false,
      },
    });
    if (error) {
      $("login-err").textContent = "送信に失敗しました: " + error.message;
      $("login-err").hidden = false;
      return;
    }
    $("magic-link-ok").hidden = false;
  });

  // Re-check session every 2 seconds while waiting for magic link
  setInterval(async () => {
    if (!$("consent-section").hidden) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (session) await showConsent(session);
  }, 2000);

  $("deny-btn").addEventListener("click", () => {
    // Redirect back with error per OAuth spec
    const u = new URL(flow.redirect_uri);
    u.searchParams.set("error", "access_denied");
    if (flow.state) u.searchParams.set("state", flow.state);
    window.location.href = u.toString();
  });

  $("allow-btn").addEventListener("click", async () => {
    $("approve-err").hidden = true;
    $("allow-btn").disabled = true;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      $("approve-err").textContent = "セッションが切れました。再度サインインしてください。";
      $("approve-err").hidden = false;
      $("allow-btn").disabled = false;
      return;
    }
    const res = await fetch("https://utfyxsvxyvzxjqcgzjjl.supabase.co/functions/v1/mcp-server/oauth/authorize/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        access_token: session.access_token,
        ...flow,
      }),
    });
    const body = await res.json();
    if (!res.ok || !body.redirect_url) {
      $("approve-err").textContent = body.error ?? "承認に失敗しました";
      $("approve-err").hidden = false;
      $("allow-btn").disabled = false;
      return;
    }
    window.location.href = body.redirect_url;
  });
</script>
</body></html>`;
}

function baseCss(): string {
  return `
    *{box-sizing:border-box}
    body{margin:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#0f172a;padding:24px}
    .card{max-width:480px;margin:48px auto;background:#fff;border-radius:16px;padding:32px;box-shadow:0 2px 10px rgba(15,23,42,0.05)}
    h1{font-size:22px;margin:8px 0 4px}
    h2{font-size:15px;margin:20px 0 12px;color:#475569}
    .brand{font-size:13px;font-weight:600;color:#6366f1;letter-spacing:.04em}
    .muted{color:#64748b;font-size:13px;line-height:1.55}
    form label{display:block;font-size:13px;font-weight:500;margin-top:14px;color:#334155}
    form input{display:block;width:100%;margin-top:6px;padding:11px 12px;border:1px solid #cbd5e1;border-radius:8px;font-size:14px}
    form input:focus{outline:none;border-color:#6366f1;box-shadow:0 0 0 3px rgba(99,102,241,0.15)}
    button{margin-top:18px;padding:11px 16px;border-radius:9px;border:0;background:#6366f1;color:#fff;font-size:14px;font-weight:600;cursor:pointer;width:100%}
    button:disabled{opacity:.6;cursor:not-allowed}
    button.secondary{background:#e2e8f0;color:#475569;margin-right:8px}
    .actions{display:flex;gap:10px;margin-top:18px}
    .actions button{margin:0;flex:1}
    .perms{margin:12px 0;padding-left:20px;color:#0f172a;font-size:14px;line-height:1.7}
    .err{color:#dc2626;font-size:13px;margin-top:10px}
  `;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    return ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    } as Record<string, string>)[c]!;
  });
}
