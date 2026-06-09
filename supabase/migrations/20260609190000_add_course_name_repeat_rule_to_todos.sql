-- 課題一覧機能の拡張: course_name（授業名）と repeat_rule（リピート設定）を追加
--
-- course_name: 大学の授業名など、課題が属するコース。課題一覧でグルーピング表示に使用。
-- repeat_rule: 'weekly' = 完了時に翌週の同じ曜日に次の課題を自動生成。null = リピートなし。

ALTER TABLE todos ADD COLUMN IF NOT EXISTS course_name text;
ALTER TABLE todos ADD COLUMN IF NOT EXISTS repeat_rule text CHECK (repeat_rule IS NULL OR repeat_rule IN ('weekly'));

-- course_name でのフィルタ用インデックス（任意だが課題一覧のグルーピング高速化に寄与）
CREATE INDEX IF NOT EXISTS idx_todos_course_name ON todos(course_name) WHERE course_name IS NOT NULL;
