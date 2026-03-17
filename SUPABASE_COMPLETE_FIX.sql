-- ============================================
-- 完全なデータベース修正（エリア名保存対応）
-- ============================================
-- すべての問題を解決します
-- ============================================

-- ============================================
-- ステップ1: 問題のあるビューを削除
-- ============================================

DROP VIEW IF EXISTS public.task_completion_stats CASCADE;
DROP VIEW IF EXISTS public.today_tasks CASCADE;

-- ============================================
-- ステップ2: area_titlesカラムの確実な追加
-- ============================================

-- 既存のカラムを削除
ALTER TABLE workspaces DROP COLUMN IF EXISTS area_titles CASCADE;

-- 少し待つ
SELECT pg_sleep(1);

-- 新しいカラムを追加
ALTER TABLE workspaces ADD COLUMN area_titles jsonb NOT NULL DEFAULT '{"top_left": "左上エリア", "top_right": "右上エリア", "bottom_left": "左下エリア", "bottom_right": "右下エリア"}'::jsonb;

-- ============================================
-- ステップ3: RPC関数の作成
-- ============================================

-- 既存の関数を削除
DROP FUNCTION IF EXISTS update_workspace_area_titles(uuid, jsonb) CASCADE;

-- 少し待つ
SELECT pg_sleep(1);

-- 新しいRPC関数を作成
CREATE OR REPLACE FUNCTION update_workspace_area_titles(
  workspace_id uuid,
  new_area_titles jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  UPDATE workspaces
  SET area_titles = new_area_titles,
      updated_at = now()
  WHERE id = workspace_id
  RETURNING area_titles INTO result;
  
  RETURN COALESCE(result, '{}'::jsonb);
END;
$$;

-- 権限を付与
GRANT EXECUTE ON FUNCTION update_workspace_area_titles(uuid, jsonb) TO anon;
GRANT EXECUTE ON FUNCTION update_workspace_area_titles(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION update_workspace_area_titles(uuid, jsonb) TO service_role;

-- ============================================
-- ステップ4: RLSポリシーの確認と追加
-- ============================================

-- すべてのworkspacesポリシーを確認
SELECT policyname, cmd FROM pg_policies WHERE tablename = 'workspaces';

-- UPDATEポリシーがなければ追加
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'workspaces' AND cmd = 'UPDATE'
  ) THEN
    CREATE POLICY "Allow UPDATE on workspaces"
      ON workspaces FOR UPDATE
      USING (true)
      WITH CHECK (true);
    RAISE NOTICE 'Created UPDATE policy';
  ELSE
    RAISE NOTICE 'UPDATE policy already exists';
  END IF;
END $$;

-- ============================================
-- ステップ5: PostgRESTのスキーマキャッシュをリフレッシュ
-- ============================================

NOTIFY pgrst, 'reload schema';
SELECT pg_notify('pgrst', 'reload schema');

-- 少し待つ
SELECT pg_sleep(2);

-- ============================================
-- ステップ6: 確認
-- ============================================

SELECT 
  'Verification' AS step,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'workspaces' AND column_name = 'area_titles'
    ) THEN '✅ area_titles column exists'
    ELSE '❌ area_titles column missing'
  END AS column_status,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_proc
      WHERE proname = 'update_workspace_area_titles'
    ) THEN '✅ RPC function exists'
    ELSE '❌ RPC function missing'
  END AS function_status,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_policies
      WHERE tablename = 'workspaces' AND cmd = 'UPDATE'
    ) THEN '✅ UPDATE policy exists'
    ELSE '❌ UPDATE policy missing'
  END AS policy_status;

-- ============================================
-- 完了！
-- 
-- 次のステップ：
-- 1. Settings > API でページをリロード（F5）
-- 2. 1分待つ
-- 3. アプリを再起動
-- ============================================

