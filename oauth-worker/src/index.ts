// ToSche OAuth consent page proxy.
//
// Purpose: re-emit the HTML consent page from a non-supabase.co domain so
// that browsers don't inherit Supabase's enforced
// `Content-Security-Policy: default-src 'none'; sandbox` header, which
// would otherwise make the page's JS / forms inert.
//
// Routes:
//   GET /authorize?<oauth params>   → proxies mcp-server's /oauth/authorize
//   GET /                            → tiny info page
//
// The proxied JS still calls back to mcp-server for /oauth/authorize/approve
// (the API endpoint that issues the code). CORS on mcp-server is wide open
// for this purpose.

const UPSTREAM = "https://utfyxsvxyvzxjqcgzjjl.supabase.co/functions/v1/mcp-server";

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "*",
        },
      });
    }

    if (request.method === "GET" && url.pathname === "/authorize") {
      const upstreamUrl = `${UPSTREAM}/oauth/authorize${url.search}`;
      try {
        const upstream = await fetch(upstreamUrl, {
          method: "GET",
          headers: {
            Accept: "text/html",
            apikey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV0Znl4c3Z4eXZ6eGpxY2d6ampsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyMTU5NjksImV4cCI6MjA4OTc5MTk2OX0.dXQHhLdzLQ9vs3eP-HiqR_pWZ_CtVLcgN4icvWeGup8",
          },
          cf: { cacheTtl: 0, cacheEverything: false },
        });
        const body = await upstream.text();
        // Force 200 if upstream returns body — Cloudflare's edge sometimes
        // returns surprising statuses (404 with body) due to its own caching
        // policies on supabase.co. The body is the source of truth: if it
        // looks like our consent HTML, treat it as success.
        const ok = body.includes("<!doctype html>") || upstream.status === 200;
        return new Response(body, {
          status: ok ? 200 : upstream.status,
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-store",
            "X-Frame-Options": "DENY",
            "Content-Security-Policy":
              "default-src 'self'; " +
              "style-src 'self' 'unsafe-inline'; " +
              "script-src 'self' 'unsafe-inline' https://esm.sh https://cdn.jsdelivr.net; " +
              "connect-src https://utfyxsvxyvzxjqcgzjjl.supabase.co https://*.supabase.co;",
            // Debug header so we can verify which path produced the response
            "X-Tosche-Proxy": `upstream=${upstream.status} bodylen=${body.length}`,
          },
        });
      } catch (e) {
        return new Response(
          `<h1>Upstream error</h1><pre>${String(e)}</pre>`,
          { status: 502, headers: { "Content-Type": "text/html; charset=utf-8" } },
        );
      }
    }

    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "")) {
      return new Response(
        '<h1>ToSche OAuth consent proxy</h1>' +
        '<p>This service hosts the OAuth consent page for the ToSche MCP integration. ' +
        'Visit <code>/authorize</code> with the standard OAuth 2.1 query parameters.</p>',
        { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } },
      );
    }

    return new Response("Not found", { status: 404 });
  },
};
