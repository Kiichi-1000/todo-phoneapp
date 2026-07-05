-- ワークスペースタスクの詳細表示機能: description（詳細説明）を追加
--
-- description: グリッド上の簡潔な表示（content）に対する、より詳細な説明。
-- 長押しメニュー「タスクの詳細を表示」から閲覧・編集する。

ALTER TABLE todos ADD COLUMN IF NOT EXISTS description text DEFAULT NULL;
