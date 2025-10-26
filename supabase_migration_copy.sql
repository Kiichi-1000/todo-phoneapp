/*
  # Complete Database Migration - Idempotent Version
  Copy and paste this entire file to run in Supabase SQL Editor
  
  This SQL ensures your database reaches the optimal final state
  regardless of current migration status.
  
  Usage:
  1. Open Supabase Dashboard > SQL Editor
  2. Copy entire contents of this file
  3. Paste and Run
  4. Database will be updated to optimal state
*/

-- ============================================
-- STEP 1: Create core tables (if not exist)
-- ============================================

-- Create workspaces table
CREATE TABLE IF NOT EXISTS workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  type text NOT NULL CHECK (type IN ('four_grid', 'individual', 'note')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create todos table
CREATE TABLE IF NOT EXISTS todos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  content text NOT NULL,
  is_completed boolean DEFAULT false,
  due_date timestamptz,
  grid_area text CHECK (grid_area IN ('top_left', 'top_right', 'bottom_left', 'bottom_right')),
  position_x real,
  position_y real,
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz
);

-- Create reminders table
CREATE TABLE IF NOT EXISTS reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  todo_id uuid NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
  reminder_time timestamptz NOT NULL,
  repeat_type text DEFAULT 'none' CHECK (repeat_type IN ('none', 'daily', 'weekly', 'monthly')),
  minutes_before integer[] DEFAULT ARRAY[]::integer[],
  is_active boolean DEFAULT true
);

-- Create user_settings table
CREATE TABLE IF NOT EXISTS user_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  default_workspace_type text NOT NULL DEFAULT 'four_grid' CHECK (default_workspace_type IN ('four_grid', 'individual', 'note')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ============================================
-- STEP 2: Add/modify columns
-- ============================================

-- Add date column to workspaces if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'workspaces' AND column_name = 'date'
  ) THEN
    ALTER TABLE workspaces ADD COLUMN date date DEFAULT CURRENT_DATE;
  END IF;
END $$;

-- Add order column to todos if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'todos' AND column_name = 'order'
  ) THEN
    ALTER TABLE todos ADD COLUMN "order" integer DEFAULT 0;
  END IF;
END $$;

-- Remove is_archived column if it exists (no longer needed)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'workspaces' AND column_name = 'is_archived'
  ) THEN
    ALTER TABLE workspaces DROP COLUMN is_archived;
  END IF;
END $$;

-- ============================================
-- STEP 3: Clean up old constraints
-- ============================================

-- Remove old unique constraint on date only (if exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'workspaces_date_key'
  ) THEN
    ALTER TABLE workspaces DROP CONSTRAINT workspaces_date_key;
  END IF;
END $$;

-- ============================================
-- STEP 4: Add correct constraints
-- ============================================

-- Add unique constraint on (date, type) combination
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'workspaces_date_type_key'
  ) THEN
    ALTER TABLE workspaces ADD CONSTRAINT workspaces_date_type_key UNIQUE (date, type);
  END IF;
END $$;

-- ============================================
-- STEP 5: Create/update indexes
-- ============================================

-- Workspaces indexes
CREATE INDEX IF NOT EXISTS idx_workspaces_date ON workspaces(date);
CREATE INDEX IF NOT EXISTS idx_workspaces_date_type ON workspaces(date, type);

-- Todos indexes
CREATE INDEX IF NOT EXISTS idx_todos_workspace ON todos(workspace_id);
CREATE INDEX IF NOT EXISTS idx_todos_completed ON todos(is_completed);
CREATE INDEX IF NOT EXISTS idx_todos_order ON todos(workspace_id, grid_area, "order");

-- Reminders indexes
CREATE INDEX IF NOT EXISTS idx_reminders_todo ON reminders(todo_id);

-- ============================================
-- STEP 6: Enable Row Level Security
-- ============================================

ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE todos ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

-- ============================================
-- STEP 7: Create RLS policies
-- ============================================

-- Workspaces policies
DROP POLICY IF EXISTS "Allow all operations on workspaces" ON workspaces;
CREATE POLICY "Allow all operations on workspaces"
  ON workspaces FOR ALL
  USING (true)
  WITH CHECK (true);

-- Todos policies
DROP POLICY IF EXISTS "Allow all operations on todos" ON todos;
CREATE POLICY "Allow all operations on todos"
  ON todos FOR ALL
  USING (true)
  WITH CHECK (true);

-- Reminders policies
DROP POLICY IF EXISTS "Allow all operations on reminders" ON reminders;
CREATE POLICY "Allow all operations on reminders"
  ON reminders FOR ALL
  USING (true)
  WITH CHECK (true);

-- User settings policies
DROP POLICY IF EXISTS "Allow all operations on user_settings" ON user_settings;
CREATE POLICY "Allow all operations on user_settings"
  ON user_settings FOR ALL
  USING (true)
  WITH CHECK (true);

-- ============================================
-- STEP 8: Create trigger function
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- STEP 9: Create triggers
-- ============================================

-- Workspaces trigger
DROP TRIGGER IF EXISTS update_workspaces_updated_at ON workspaces;
CREATE TRIGGER update_workspaces_updated_at
  BEFORE UPDATE ON workspaces
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- User settings trigger
DROP TRIGGER IF EXISTS update_user_settings_updated_at ON user_settings;
CREATE TRIGGER update_user_settings_updated_at
  BEFORE UPDATE ON user_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- STEP 10: Initialize default data
-- ============================================

-- Insert default settings if not exists
INSERT INTO user_settings (default_workspace_type)
SELECT 'four_grid'
WHERE NOT EXISTS (SELECT 1 FROM user_settings LIMIT 1);

-- Update existing todos order based on created_at (only if all orders are 0)
-- This initializes order for existing data without affecting user-set order
DO $$
DECLARE
  _total_count INTEGER;
  _uninitialized_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO _total_count FROM todos;
  SELECT COUNT(*) INTO _uninitialized_count FROM todos WHERE "order" = 0;
  
  -- Only update if there are todos and they're all uninitialized
  IF _total_count > 0 AND _total_count = _uninitialized_count THEN
    UPDATE todos SET "order" = (
      SELECT COUNT(*) 
      FROM todos t2 
      WHERE t2.workspace_id = todos.workspace_id 
        AND t2.grid_area = todos.grid_area 
        AND t2.created_at <= todos.created_at
    ) - 1;
  END IF;
END $$;

-- ============================================
-- STEP 11: Add area titles JSON column to workspaces table
-- ============================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'workspaces' AND column_name = 'area_titles'
  ) THEN
    ALTER TABLE workspaces ADD COLUMN area_titles jsonb DEFAULT '{"top_left": "左上エリア", "top_right": "右上エリア", "bottom_left": "左下エリア", "bottom_right": "右下エリア"}'::jsonb;
  END IF;
END $$;

-- ============================================
-- STEP 12: Force Supabase to refresh schema cache
-- ============================================
-- This notification tells Supabase to rebuild its API schema cache
NOTIFY pgrst, 'reload schema';

-- ============================================
-- COMPLETE!
-- Your database is now in optimal state
-- Wait a few seconds for Supabase to refresh its cache
-- ============================================

