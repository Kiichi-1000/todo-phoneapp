-- ============================================
-- Force Supabase Schema Cache Refresh
-- ============================================
-- IMPORTANT: Run this AFTER adding the area_titles column
-- ============================================

-- Step 1: Add the column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'workspaces' AND column_name = 'area_titles'
  ) THEN
    ALTER TABLE workspaces ADD COLUMN area_titles jsonb DEFAULT '{"top_left": "左上エリア", "top_right": "右上エリア", "bottom_left": "左下エリア", "bottom_right": "右下エリア"}'::jsonb;
  END IF;
END $$;

-- Step 2: Force PostgREST to reload the schema
NOTIFY pgrst, 'reload schema';

-- Step 3: Alternative method - restart the PostgREST service
-- Note: This requires Supabase CLI or direct database access
SELECT pg_notify('pgrst', 'reload schema');

-- Step 4: Verify the column exists
SELECT 
  column_name, 
  data_type, 
  column_default
FROM information_schema.columns
WHERE table_name = 'workspaces' AND column_name = 'area_titles';

-- ============================================
-- After running this:
-- 1. Wait 30-60 seconds
-- 2. Restart your Expo app
-- 3. The error should be gone
-- ============================================

