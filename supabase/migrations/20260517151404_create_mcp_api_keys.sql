-- MCP API keys for the Claude.ai integration (v1.4).
--
-- Each row represents a static API key that lets an external MCP client
-- (claude.ai's "Custom Connector" or any other MCP client) call the
-- `mcp-server` Edge Function on behalf of a specific user.
--
-- We never store the plaintext key — only SHA-256 hex of it. The plaintext
-- is shown to the user exactly once on creation. The `key_prefix` (first
-- ~12 chars) is stored separately so the UI can list / identify keys
-- without needing the full secret.

CREATE TABLE IF NOT EXISTS public.mcp_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key_hash text NOT NULL UNIQUE,
  key_prefix text NOT NULL,
  label text,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mcp_api_keys_user_id_idx
  ON public.mcp_api_keys (user_id);

-- RLS: each user can only see / manage their own keys. The Edge Functions
-- use the service_role client and bypass RLS for key lookup.
ALTER TABLE public.mcp_api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mcp_api_keys_select_own"
  ON public.mcp_api_keys FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "mcp_api_keys_insert_own"
  ON public.mcp_api_keys FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "mcp_api_keys_update_own"
  ON public.mcp_api_keys FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "mcp_api_keys_delete_own"
  ON public.mcp_api_keys FOR DELETE
  USING (auth.uid() = user_id);
