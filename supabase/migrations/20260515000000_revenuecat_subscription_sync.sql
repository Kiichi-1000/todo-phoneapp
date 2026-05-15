/*
  # RevenueCat 購入 → サブスク解放フロー対応 (plan CHECK 制約の更新)

  ## 背景 / なぜこの変更が必要か
  v2.0 で導入した `user_subscriptions.plan` の CHECK 制約は
  `('ai_light','ai_standard','promo')` という「AI ライト / AI スタンダード」の
  旧2階層設計のままだった。

  しかし App Store Connect に実在する商品は Basic / Standard / Pro の
  3階層 (各 月額 / 年額) であり、RevenueCat Webhook がサブスク状態を
  `user_subscriptions` に書き込もうとすると `plan` が CHECK 制約違反で
  INSERT/UPDATE に失敗する。
  → 結果としてサブスク行が永遠に作られず、`checkAiAccess()` が常に
    「未加入」を返し、課金壁が無限ループする。

  この欠落を埋めるため、`plan` が実際の商品階層 (basic / standard / pro) を
  受け付けられるよう CHECK 制約を更新する。

  ## 方針 (保守的・後方互換)
  - 旧値 ('ai_light','ai_standard','promo') は **削除せず温存** する。
    既にこれらの値で入っている行 (テスト/プロモ等) を壊さないため。
    'promo' はプロモコード経由のアクセス権で今後も使われる。
  - 新値 ('basic','standard','pro') を **追加** する。
    RevenueCat Webhook はこの3値を書き込む。
  - billing_cycle の CHECK は元々 ('monthly','half_year','yearly') で、
    ASC 実商品が使う ('monthly','yearly') の superset なので **変更不要**。
    (half_year は旧設計の名残だが、温存しても害がないため放置)
  - status の CHECK は元々 active/trialing/past_due/canceled/expired/promo/none を
    含んでおり、RevenueCat の全イベントをマップできる superset なので **変更不要**。

  ## 注意
  - アクセス解放の判定 (lib/aiAccess.ts / ai-chat/access.ts) は `status` のみを
    見ており `plan` は参照しない。よって plan の値は entitlement の区別
    (将来の上限制御 / 表示用) にのみ使われる。basic/standard/pro いずれも
    「AI 機能の入口は通れる」設計は不変。
  - monthly-token-grant Edge Function の PLAN_GRANT_YEN は ai_light/ai_standard
    キーのままだが、これは別タスクで basic/standard/pro 対応する想定。
    本マイグレーションはアクセス解放の経路を通すことだけにスコープを絞る。
*/

-- ============================================================
-- user_subscriptions.plan の CHECK 制約を更新
-- 旧値を温存しつつ basic / standard / pro を追加
-- ============================================================
ALTER TABLE user_subscriptions
  DROP CONSTRAINT IF EXISTS user_subscriptions_plan_check;

ALTER TABLE user_subscriptions
  ADD CONSTRAINT user_subscriptions_plan_check
  CHECK (plan IN (
    -- 新: ASC 実商品の3階層 (RevenueCat Webhook が書き込む値)
    'basic', 'standard', 'pro',
    -- 旧: 後方互換のため温存 (既存行 / プロモ用途を壊さない)
    'ai_light', 'ai_standard', 'promo'
  ));
