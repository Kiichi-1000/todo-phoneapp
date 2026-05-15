/*
  # AI エージェント機能 基盤テーブル

  v2.0 で導入する AI エージェント機能の DB 基盤を一括作成する。

  1. 新規テーブル
    - `user_subscriptions` — サブスクリプション状態（RevenueCat 連携）
    - `ai_token_balances` — トークン残高（円ベース）
    - `ai_token_transactions` — トークン取引履歴（append-only）
    - `ai_promo_codes` — クーポンマスタ
    - `ai_promo_redemptions` — クーポン使用履歴
    - `app_release_promos` — リリース後の試運転期間管理

  2. セキュリティ
    - 全テーブルで RLS 有効
    - ユーザーは自分のデータのみ閲覧可能
    - 書き込みは Edge Function (service_role) のみ
*/

-- ============================================================
-- 1. user_subscriptions
-- ============================================================
CREATE TABLE IF NOT EXISTS user_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('active','trialing','past_due','canceled','expired','promo','none')) DEFAULT 'none',
  plan text CHECK (plan IN ('ai_light','ai_standard','promo')),
  billing_cycle text CHECK (billing_cycle IN ('monthly','half_year','yearly')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  next_grant_at timestamptz,
  revenuecat_user_id text,
  product_id text,
  platform text CHECK (platform IN ('ios','android','web')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user_id ON user_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_status ON user_subscriptions(status);

ALTER TABLE user_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own subscription"
  ON user_subscriptions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- INSERT/UPDATE/DELETE はサーバー側 (service_role) のみ。クライアントから直接書き込まない。

-- ============================================================
-- 2. ai_token_balances
-- ============================================================
CREATE TABLE IF NOT EXISTS ai_token_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  current_grant_yen numeric(10,2) NOT NULL DEFAULT 0,
  current_grant_expires_at timestamptz,
  carryover_yen numeric(10,2) NOT NULL DEFAULT 0,
  carryover_expires_at timestamptz,
  total_granted_yen numeric(12,2) NOT NULL DEFAULT 0,
  total_consumed_yen numeric(12,2) NOT NULL DEFAULT 0,
  total_expired_yen numeric(12,2) NOT NULL DEFAULT 0,
  last_consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT non_negative_balance CHECK (current_grant_yen >= 0 AND carryover_yen >= 0)
);

CREATE INDEX IF NOT EXISTS idx_ai_token_balances_user_id ON ai_token_balances(user_id);

ALTER TABLE ai_token_balances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own balance"
  ON ai_token_balances FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- 書き込みは service_role のみ

-- ============================================================
-- 3. ai_token_transactions (append-only)
-- ============================================================
CREATE TABLE IF NOT EXISTS ai_token_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('grant','carryover','consume','expire','refund','promo_grant','admin_adjust')),
  amount_yen numeric(10,4) NOT NULL,
  balance_after_yen numeric(10,2) NOT NULL,
  api_provider text CHECK (api_provider IN ('anthropic','openai')),
  api_model text,
  input_tokens int,
  output_tokens int,
  cache_read_tokens int,
  cache_write_tokens int,
  conversation_id uuid,
  message_id uuid,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_token_tx_user_created ON ai_token_transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_token_tx_kind ON ai_token_transactions(kind);

ALTER TABLE ai_token_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own transactions"
  ON ai_token_transactions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- 書き込みは service_role のみ

-- ============================================================
-- 4. ai_promo_codes (admin master)
-- ============================================================
CREATE TABLE IF NOT EXISTS ai_promo_codes (
  code text PRIMARY KEY,
  description text,
  grant_kind text NOT NULL CHECK (grant_kind IN ('free_access','token_grant')),
  duration_days int,
  token_yen numeric(10,2),
  max_redemptions int,
  current_redemptions int NOT NULL DEFAULT 0,
  starts_at timestamptz,
  expires_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT valid_grant_kind CHECK (
    (grant_kind = 'free_access' AND duration_days IS NOT NULL AND duration_days > 0)
    OR (grant_kind = 'token_grant' AND token_yen IS NOT NULL AND token_yen > 0)
  )
);

CREATE INDEX IF NOT EXISTS idx_ai_promo_codes_active ON ai_promo_codes(is_active, expires_at);

ALTER TABLE ai_promo_codes ENABLE ROW LEVEL SECURITY;

-- ユーザーはコード詳細を直接見ない（Edge Function 経由で検証する）
-- service_role のみ操作

-- ============================================================
-- 5. ai_promo_redemptions
-- ============================================================
CREATE TABLE IF NOT EXISTS ai_promo_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code text NOT NULL REFERENCES ai_promo_codes(code) ON DELETE CASCADE,
  redeemed_at timestamptz NOT NULL DEFAULT now(),
  valid_until timestamptz,
  granted_token_yen numeric(10,2),
  UNIQUE (user_id, code)
);

CREATE INDEX IF NOT EXISTS idx_ai_promo_redemptions_user ON ai_promo_redemptions(user_id, valid_until DESC);

ALTER TABLE ai_promo_redemptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own redemptions"
  ON ai_promo_redemptions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- 書き込みは Edge Function (service_role) 経由のみ

-- ============================================================
-- 6. app_release_promos (試運転期間管理)
-- ============================================================
CREATE TABLE IF NOT EXISTS app_release_promos (
  release_version text PRIMARY KEY,
  description text,
  promo_starts_at timestamptz NOT NULL,
  promo_ends_at timestamptz NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT valid_period CHECK (promo_ends_at > promo_starts_at)
);

ALTER TABLE app_release_promos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view release promos"
  ON app_release_promos FOR SELECT
  TO authenticated
  USING (is_active = true);

-- 書き込みは service_role のみ（マイグレーションで投入）

-- ============================================================
-- 7. updated_at 自動更新トリガ（共通関数）
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_subscriptions_updated_at ON user_subscriptions;
CREATE TRIGGER trg_user_subscriptions_updated_at
  BEFORE UPDATE ON user_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_ai_token_balances_updated_at ON ai_token_balances;
CREATE TRIGGER trg_ai_token_balances_updated_at
  BEFORE UPDATE ON ai_token_balances
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
