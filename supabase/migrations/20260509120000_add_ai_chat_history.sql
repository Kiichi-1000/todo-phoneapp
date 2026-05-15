/*
  # AI chat history + per-user memory (cost-optimized)

  Three tables:
  1. ai_conversations  — one row per chat session (title, counts, metadata)
  2. ai_messages       — user/assistant text only (tool internals not persisted
                         to keep DB lean)
  3. user_memory       — small key/value facts injected into system prompt for
                         cross-session personalization. Capped at 30 entries
                         per user (enforced in app code).

  Storage scale: ~1KB per message average. With 30-day retention + 50 conv cap
  per user, expect ~1MB/user/year. Within Supabase 8GB free tier.

  All tables have RLS scoped to auth.uid() = user_id.
*/

CREATE TABLE IF NOT EXISTS ai_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text,
  message_count integer NOT NULL DEFAULT 0,
  total_cost_yen numeric(10, 4) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_conversations_user_recent
  ON ai_conversations(user_id, last_message_at DESC);

CREATE TABLE IF NOT EXISTS ai_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_messages_conv
  ON ai_messages(conversation_id, created_at);

CREATE TABLE IF NOT EXISTS user_memory (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key text NOT NULL,
  value text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, key),
  CONSTRAINT user_memory_value_length CHECK (char_length(value) <= 300),
  CONSTRAINT user_memory_key_length CHECK (char_length(key) <= 60)
);

CREATE INDEX IF NOT EXISTS idx_user_memory_user_updated
  ON user_memory(user_id, updated_at DESC);

ALTER TABLE ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own ai_conversations"
  ON ai_conversations FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can manage own ai_messages"
  ON ai_messages FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can manage own user_memory"
  ON user_memory FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
