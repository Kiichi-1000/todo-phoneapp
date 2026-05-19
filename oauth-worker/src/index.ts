// ToSche MCP frontend on a dedicated subdomain.
//
// Why a Worker subdomain rather than the raw Supabase Edge Function URL:
//   1. claude.ai's MCP custom-connector flow does NOT consistently honor
//      path-prefixed `.well-known/oauth-authorization-server` discovery —
//      it tends to construct `<origin>/authorize` from the MCP URL host,
//      which on supabase.co lands on an unrelated path. Putting MCP at the
//      root of a dedicated host makes all RFC 8414 / RFC 9728 discovery
//      shapes (origin-rooted AND path-suffix) hit the right document.
//   2. Supabase auto-injects `Content-Security-Policy: default-src 'none';
//      sandbox` on every HTML response from *.supabase.co, which breaks the
//      inline JS in the OAuth consent page. The Worker re-emits the page
//      with a permissive CSP.
//
// Routing:
//   * GET  /.well-known/oauth-authorization-server  → fetched from upstream,
//                                                      response URLs rewritten
//                                                      to point at the Worker.
//   * GET  /.well-known/oauth-protected-resource    → same rewrite.
//   * GET  /authorize                                → consent HTML (proxied
//                                                      from upstream, CSP
//                                                      replaced).
//   * GET  /openapi.json                             → passthrough.
//   * GET  /                                         → MCP server info
//                                                      (passthrough, URLs
//                                                      rewritten).
//   * POST /oauth/register                           → passthrough.
//   * POST /oauth/authorize/approve                  → passthrough.
//   * POST /oauth/token                              → passthrough.
//   * POST /                                         → MCP JSON-RPC,
//                                                      passthrough.
//   * POST /api/<tool>                               → REST surface for
//                                                      ChatGPT, passthrough.
//
// Anything else returns 404.

const UPSTREAM_BASE = "https://utfyxsvxyvzxjqcgzjjl.supabase.co/functions/v1/mcp-server";
const UPSTREAM_HOST = "utfyxsvxyvzxjqcgzjjl.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV0Znl4c3Z4eXZ6eGpxY2d6ampsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyMTU5NjksImV4cCI6MjA4OTc5MTk2OX0.dXQHhLdzLQ9vs3eP-HiqR_pWZ_CtVLcgN4icvWeGup8";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, Accept, mcp-protocol-version, mcp-session-id",
  "Access-Control-Expose-Headers": "mcp-session-id, WWW-Authenticate",
};

// Rewrite any string that points at the Supabase function URL so the response
// references the Worker host instead. Used on metadata + server-info bodies
// so clients only ever see the Worker URL.
function rewriteHostInString(s: string, workerOrigin: string): string {
  return s.split(UPSTREAM_BASE).join(workerOrigin);
}

function rewriteHostInJson(value: unknown, workerOrigin: string): unknown {
  if (typeof value === "string") return rewriteHostInString(value, workerOrigin);
  if (Array.isArray(value)) return value.map((v) => rewriteHostInJson(v, workerOrigin));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = rewriteHostInJson(v, workerOrigin);
    }
    return out;
  }
  return value;
}

// Forward an arbitrary request to the upstream MCP server, preserving method,
// headers (minus Host), and body. Returns the upstream Response untouched.
async function passthrough(request: Request, url: URL): Promise<Response> {
  const upstreamUrl = `${UPSTREAM_BASE}${url.pathname}${url.search}`;

  // Clone request headers, drop Host so fetch sets it correctly for upstream.
  const headers = new Headers();
  for (const [k, v] of request.headers.entries()) {
    if (k.toLowerCase() === "host") continue;
    headers.set(k, v);
  }
  // Supabase Edge Functions require an `apikey` even when the function has
  // verify_jwt=false (Cloudflare in front of supabase.co strips unauthorized
  // POSTs otherwise). The mcp-server function ignores this for auth purposes
  // — it uses its own Bearer logic — but the request has to carry it.
  if (!headers.has("apikey")) headers.set("apikey", SUPABASE_ANON_KEY);

  // Read body once (Request streams aren't re-fetchable in the Worker
  // runtime); for GET/HEAD/OPTIONS use undefined.
  const method = request.method.toUpperCase();
  let body: BodyInit | undefined;
  if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
    body = await request.arrayBuffer();
  }

  return await fetch(upstreamUrl, {
    method,
    headers,
    body,
  });
}

// Same as passthrough but tries to parse the response as JSON and rewrite
// any `UPSTREAM_BASE` references in it to point at the Worker. Falls back
// to returning the raw body on parse failure.
async function passthroughWithJsonRewrite(
  request: Request,
  url: URL,
  workerOrigin: string,
): Promise<Response> {
  const upstream = await passthrough(request, url);
  const ct = upstream.headers.get("Content-Type") ?? "";
  if (!ct.includes("application/json")) {
    return rebuildResponse(upstream);
  }
  const text = await upstream.text();
  let bodyOut = text;
  try {
    const parsed = JSON.parse(text);
    bodyOut = JSON.stringify(rewriteHostInJson(parsed, workerOrigin));
  } catch {
    // not JSON despite content-type — fall through
    bodyOut = rewriteHostInString(text, workerOrigin);
  }
  const headers = new Headers(upstream.headers);
  for (const [k, v] of Object.entries(CORS_HEADERS)) headers.set(k, v);
  headers.set("Content-Type", "application/json");
  headers.delete("Content-Length"); // we changed the body length
  return new Response(bodyOut, { status: upstream.status, headers });
}

// Rebuild a response with CORS headers attached so the Worker presents a
// consistent surface to browser-based MCP clients.
function rebuildResponse(upstream: Response): Response {
  const headers = new Headers(upstream.headers);
  for (const [k, v] of Object.entries(CORS_HEADERS)) headers.set(k, v);
  return new Response(upstream.body, { status: upstream.status, headers });
}

// Serve the consent page from the Worker (rather than supabase.co) so the
// inline JS can run. The upstream HTML is fetched verbatim; we replace
// the response CSP / X-Frame-Options to permit the JS to function.
async function serveAuthorizeConsent(request: Request, url: URL): Promise<Response> {
  const upstreamUrl = `${UPSTREAM_BASE}/oauth/authorize${url.search}`;
  const upstream = await fetch(upstreamUrl, {
    method: "GET",
    headers: {
      Accept: "text/html",
      apikey: SUPABASE_ANON_KEY,
    },
  });
  const body = await upstream.text();
  // Cloudflare's edge layer in front of supabase.co occasionally returns a
  // surprising status for HTML responses. Trust the body: if it begins with
  // a doctype/html marker, it's the consent page; treat it as 200.
  const looksLikePage = body.includes("<!doctype html>") || body.includes("<!DOCTYPE html>");
  return new Response(body, {
    status: looksLikePage ? 200 : upstream.status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Frame-Options": "DENY",
      "Content-Security-Policy":
        "default-src 'self'; " +
        "style-src 'self' 'unsafe-inline'; " +
        "script-src 'self' 'unsafe-inline' https://esm.sh https://cdn.jsdelivr.net; " +
        "connect-src https://utfyxsvxyvzxjqcgzjjl.supabase.co https://*.supabase.co;",
      "X-Tosche-Proxy": `upstream=${upstream.status} bodylen=${body.length}`,
    },
  });
}

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const workerOrigin = `${url.protocol}//${url.host}`;

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // OAuth + MCP discovery endpoints — rewrite returned URLs to Worker.
    if (
      request.method === "GET" &&
      (url.pathname === "/.well-known/oauth-authorization-server" ||
        url.pathname === "/.well-known/oauth-protected-resource")
    ) {
      return passthroughWithJsonRewrite(request, url, workerOrigin);
    }

    // Consent page — fetch from upstream but re-emit with our own CSP so the
    // inline JS can actually run in the browser.
    if (request.method === "GET" && url.pathname === "/authorize") {
      return serveAuthorizeConsent(request, url);
    }

    // MCP root + server-info — rewrite the body so the surfaces reference
    // the Worker host. The MCP `initialize` response also flows through
    // here (POST /), but we don't rewrite its body because it doesn't
    // include URLs that need rewriting.
    if (request.method === "GET" && url.pathname === "/") {
      return passthroughWithJsonRewrite(request, url, workerOrigin);
    }

    // OpenAPI spec used by ChatGPT Custom GPT Actions. Rewrite the
    // `servers[0].url` to point at the Worker so the GPT calls the Worker
    // (which proxies through to Supabase). This means existing GPTs
    // configured with the Supabase URL keep working; new ones can use the
    // Worker URL.
    if (request.method === "GET" && url.pathname === "/openapi.json") {
      return passthroughWithJsonRewrite(request, url, workerOrigin);
    }

    // OAuth flow endpoints — pass through verbatim.
    if (
      (request.method === "POST" &&
        (url.pathname === "/oauth/register" ||
          url.pathname === "/oauth/authorize/approve" ||
          url.pathname === "/oauth/token")) ||
      (request.method === "GET" && url.pathname === "/oauth/authorize")
    ) {
      const upstream = await passthrough(request, url);
      return rebuildResponse(upstream);
    }

    // MCP JSON-RPC endpoint at the root, and REST surface under /api/*.
    // Both pass straight through to Supabase, preserving headers including
    // Authorization (Bearer) and mcp-session-id.
    if (
      (request.method === "POST" && url.pathname === "/") ||
      (request.method === "POST" && url.pathname.startsWith("/api/"))
    ) {
      const upstream = await passthrough(request, url);
      return rebuildResponse(upstream);
    }

    return new Response("Not found", {
      status: 404,
      headers: { ...CORS_HEADERS, "Content-Type": "text/plain" },
    });
  },
};
