-- 円グラフスケジュールの詳細入力機能: description（詳細説明）を追加
--
-- description: 予定タイトルに対する詳細メモ。「予定を編集」モーダルで入力し、
-- 円グラフの広いセグメントではタイトルの下に小さく表示する。

ALTER TABLE schedules ADD COLUMN IF NOT EXISTS description text DEFAULT NULL;
