// Google Cloud OAuth2 helper for service-account JWT authentication.
//
// Caches the access token at module scope (Edge Function isolates reuse module
// state across invocations), so a single isolate hits Google's OAuth endpoint
// at most once per hour.

import * as jose from "npm:jose@5.6.3";

interface ServiceAccount {
  client_email: string;
  private_key: string;
  private_key_id: string;
  project_id: string;
}

let parsedSA: ServiceAccount | null = null;

function getServiceAccount(): ServiceAccount {
  if (parsedSA) return parsedSA;
  const raw = Deno.env.get("GOOGLE_CLOUD_SERVICE_ACCOUNT");
  if (!raw) throw new Error("GOOGLE_CLOUD_SERVICE_ACCOUNT env var is not set");
  try {
    parsedSA = JSON.parse(raw) as ServiceAccount;
  } catch (e: any) {
    throw new Error("GOOGLE_CLOUD_SERVICE_ACCOUNT is not valid JSON: " + e?.message);
  }
  return parsedSA;
}

export function getGoogleProjectId(): string {
  return getServiceAccount().project_id;
}

let cachedToken: { value: string; expiresAt: number } | null = null;

export async function getGoogleAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.value;
  }

  const sa = getServiceAccount();
  const privateKey = await jose.importPKCS8(sa.private_key, "RS256");
  const now = Math.floor(Date.now() / 1000);

  const jwt = await new jose.SignJWT({
    scope: "https://www.googleapis.com/auth/cloud-platform",
  })
    .setProtectedHeader({ alg: "RS256", kid: sa.private_key_id })
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .setIssuer(sa.client_email)
    .setAudience("https://oauth2.googleapis.com/token")
    .setSubject(sa.client_email)
    .sign(privateKey);

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body:
      "grant_type=" +
      encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer") +
      "&assertion=" +
      jwt,
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    throw new Error(`Google OAuth token exchange failed (${tokenRes.status}): ${errText}`);
  }

  const data = await tokenRes.json() as { access_token: string; expires_in: number };
  cachedToken = {
    value: data.access_token,
    // 2-minute safety margin so we don't hand out a token that expires mid-request
    expiresAt: Date.now() + (data.expires_in - 120) * 1000,
  };
  return cachedToken.value;
}
