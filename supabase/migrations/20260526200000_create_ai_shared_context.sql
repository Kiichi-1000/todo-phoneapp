-- AI 連携メモ（共有コンテキスト）
--
-- ユーザーが編集する自由記述のメモ。MCP（Claude / ChatGPT）と
-- 端末内 AI（ToScheAI）の両方が参照できる「前提・指示の共有メモ」。
-- ToScheAI のシステムプロンプトに <shared_context> として注入し、MCP からは
-- get_shared_context / update_shared_context ツールで読み書きする。
-- 1 ユーザー 1 行（user_id を主キーに）。auto-memory (user_memory) とは別物で、
-- こちらはユーザー自身が編集する。

CREATE TABLE IF NOT EXISTS ai_shared_context (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  content text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_shared_context_length CHECK (char_length(content) <= 4000)
);

ALTER TABLE ai_shared_context ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own ai_shared_context"
  ON ai_shared_context FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
