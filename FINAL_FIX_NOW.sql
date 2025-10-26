-- ============================================
-- 最終修正（今すぐ実行してください）
-- ============================================
-- Supabase SQL Editorでこのファイルを実行してください
-- ============================================

-- 1. area_titlesカラムを削除して再作成
ALTER TABLE workspaces DROP COLUMN IF EXISTS area_titles;
SELECT pg_sleep(1);
ALTER TABLE workspaces ADD COLUMN area_titles jsonb NOT NULL DEFAULT '{"top_left": "左上エリア", "top_right": "右上エリア", "bottom_left": "左下エリア", "bottom_right": "右下エリア"}'::jsonb;

-- 2. RPC関数を削除して再作成
DROP FUNCTION IF EXISTS update_workspace_area_titles(uuid, jsonb);
SELECT pg_sleep(1);
CREATE FUNCTION update_workspace_area_titles(workspace_id uuid, new_area_titles jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE result jsonb;
BEGIN
  UPDATE workspaces SET area_titles = new_area_titles, updated_at = now()
  WHERE id = workspace_id RETURNING area_titles INTO result;
  RETURN COALESCE(result, '{}'::jsonb);
END;
$$;

-- 3. 権限を付与
GRANT EXECUTE ON FUNCTION update_workspace_area_titles(uuid, jsonb) TO anon, authenticated, service_role;

-- 4. 確認
SELECT 'Column exists' AS status FROM information_schema.columns WHERE table_name = 'workspaces' AND column_name = 'area_titles';
SELECT 'Function exists' AS status FROM pg_proc WHERE proname = 'update_workspace_area_titles';

-- ============================================
-- 実行後：
-- 1. Settings > API でF5キーを押す
-- 2. 2分待つ
-- 3. アプリを再起動
-- ============================================

