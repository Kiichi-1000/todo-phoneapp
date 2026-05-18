-- OAuth 2.1 + Dynamic Client Registration tables (MCP Authorization Spec).
--
-- All three tables are accessed by service-role only (no RLS exposure to
-- authenticated users) — the OAuth Edge Functions own the lifecycle.
-- Tokens and authorization codes are stored as SHA-256 hex of the plaintext;
-- the plaintext is only ever shown once (in the immediate response).

-- ------------------------------------------------------------
-- oauth_clients: registered OAuth clients (Claude.ai, ChatGPT, etc.)
--
-- Dynamic Client Registration (RFC 7591) writes new rows here. Each MCP
-- client (one per remote service) gets one row. All clients are "public"
-- in OAuth 2.1 terms — they have no client_secret because they cannot
-- keep one secret (e.g. browser-based, mobile). Security is provided by
-- PKCE + redirect URI exact match instead.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.oauth_clients (
  client_id text PRIMARY KEY,
  client_name text,
  client_uri text,
  logo_uri text,
  redirect_uris text[] NOT NULL,
  grant_types text[] NOT NULL DEFAULT ARRAY['authorization_code','refresh_token'],
  response_types text[] NOT NULL DEFAULT ARRAY['code'],
  scope text NOT NULL DEFAULT 'goals',
  token_endpoint_auth_method text NOT NULL DEFAULT 'none',
  software_id text,
  software_version text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT oauth_clients_token_method_chk
    CHECK (token_endpoint_auth_method = 'none')  -- v1: public clients only
);

-- ------------------------------------------------------------
-- oauth_codes: short-lived authorization codes (one-time use).
--
-- Used in the Authorization Code flow with PKCE. Plaintext code is hashed
-- before storage. The code_verifier (PKCE) is checked at /token time
-- against the stored code_challenge.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.oauth_codes (
  code_hash text PRIMARY KEY,
  client_id text NOT NULL REFERENCES public.oauth_clients(client_id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  redirect_uri text NOT NULL,
  code_challenge text NOT NULL,
  code_challenge_method text NOT NULL,
  scope text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,           -- enforces one-time use
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT oauth_codes_method_chk
    CHECK (code_challenge_method = 'S256')
);

CREATE INDEX IF NOT EXISTS oauth_codes_user_id_idx
  ON public.oauth_codes (user_id);

-- ------------------------------------------------------------
-- oauth_tokens: access + refresh tokens.
--
-- access_token_hash:  SHA-256 of the access token (sent in Bearer header).
-- refresh_token_hash: SHA-256 of the refresh token. Rotated on each use.
-- One row holds both tokens of a single grant. Revoking a row revokes
-- the entire grant.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.oauth_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  access_token_hash text NOT NULL UNIQUE,
  refresh_token_hash text UNIQUE,
  client_id text NOT NULL REFERENCES public.oauth_clients(client_id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scope text NOT NULL,
  access_expires_at timestamptz NOT NULL,
  refresh_expires_at timestamptz,
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS oauth_tokens_user_id_idx
  ON public.oauth_tokens (user_id);
CREATE INDEX IF NOT EXISTS oauth_tokens_refresh_idx
  ON public.oauth_tokens (refresh_token_hash) WHERE refresh_token_hash IS NOT NULL;

-- ------------------------------------------------------------
-- RLS: none of these tables are read/written directly by user JWTs.
-- All access goes through Edge Functions using the service_role key,
-- which bypasses RLS. We enable RLS with no policies to fail closed
-- against accidental anon/authenticated access.
-- ------------------------------------------------------------
ALTER TABLE public.oauth_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oauth_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oauth_tokens ENABLE ROW LEVEL SECURITY;
