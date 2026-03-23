/*
  # Complete Database Setup for TodoApp

  This migration creates all tables required for the full application:

  1. New Tables
    - `workspaces` - Date-based task boards with grid/individual/note modes
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `title` (text)
      - `type` (text, default 'four_grid')
      - `date` (date)
      - `area_titles` (jsonb, nullable)
      - `created_at`, `updated_at` (timestamptz)

    - `todos` - Task items belonging to workspaces
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `workspace_id` (uuid, references workspaces)
      - `content` (text)
      - `is_completed` (boolean, default false)
      - `due_date` (date, nullable)
      - `grid_area` (text, nullable)
      - `position_x`, `position_y` (real, nullable)
      - `order` (integer, default 0)
      - `completed_at` (timestamptz, nullable)
      - `reminder_at` (timestamptz, nullable)
      - `notification_id` (text, nullable)
      - `created_at` (timestamptz)

    - `user_settings` - Per-user application preferences
      - `id` (uuid, primary key)
      - `user_id` (uuid, unique, references auth.users)
      - `default_workspace_type` (text, default 'four_grid')
      - `todo_schedule_sync` (boolean, default true)
      - `created_at`, `updated_at` (timestamptz)

    - `schedules` - Daily time-block schedule entries
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `date` (date)
      - `start_minutes`, `end_minutes` (integer)
      - `title` (text)
      - `color` (text, default '#4A90D9')
      - `is_from_todo` (boolean, default false)
      - `source_todo_id` (uuid, nullable, references todos)
      - `created_at`, `updated_at` (timestamptz)

    - `routine_templates` - One per user, defines their habit checklist
      - `id` (uuid, primary key)
      - `user_id` (uuid, unique, references auth.users)
      - `updated_at` (timestamptz)

    - `routine_template_items` - Individual habit items in a routine template
      - `id` (uuid, primary key)
      - `template_id` (uuid, references routine_templates)
      - `slot` (routine_slot enum: morning/daytime/evening)
      - `sort_order` (integer, default 0)
      - `title` (text)
      - `short_label` (text, nullable)
      - `is_active` (boolean, default true)
      - `today_only_date` (date, nullable)
      - `created_at`, `updated_at` (timestamptz)

    - `routine_completions` - Daily check-off records for routine items
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `item_id` (uuid, references routine_template_items)
      - `date` (date)
      - `completed_at` (timestamptz)

    - `routine_skips` - Records when a user skips a routine item for a day
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `item_id` (uuid, references routine_template_items)
      - `date` (date)
      - `created_at` (timestamptz)

  2. Enum Types
    - `routine_slot` (morning, daytime, evening)

  3. Security
    - RLS enabled on ALL tables
    - Per-table policies for SELECT, INSERT, UPDATE, DELETE
    - All policies restricted to authenticated users owning the data

  4. Indexes
    - workspaces: (user_id, date) unique
    - todos: (workspace_id), (user_id)
    - schedules: (user_id, date)
    - routine_template_items: (template_id, slot, sort_order)
    - routine_completions: (user_id, item_id, date) unique
    - routine_skips: (user_id, item_id, date) unique
*/

-- ============================================================
-- 1. Enum type
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'routine_slot') THEN
    CREATE TYPE routine_slot AS ENUM ('morning', 'daytime', 'evening');
  END IF;
END $$;

-- ============================================================
-- 2. workspaces
-- ============================================================
CREATE TABLE IF NOT EXISTS workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  title text NOT NULL DEFAULT '',
  type text NOT NULL DEFAULT 'four_grid',
  date date NOT NULL,
  area_titles jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, date)
);

ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own workspaces"
  ON workspaces FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own workspaces"
  ON workspaces FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own workspaces"
  ON workspaces FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own workspaces"
  ON workspaces FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ============================================================
-- 3. todos
-- ============================================================
CREATE TABLE IF NOT EXISTS todos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  content text NOT NULL DEFAULT '',
  is_completed boolean NOT NULL DEFAULT false,
  due_date date,
  grid_area text,
  position_x real,
  position_y real,
  "order" integer NOT NULL DEFAULT 0,
  completed_at timestamptz,
  reminder_at timestamptz,
  notification_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_todos_workspace_id ON todos(workspace_id);
CREATE INDEX IF NOT EXISTS idx_todos_user_id ON todos(user_id);

ALTER TABLE todos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own todos"
  ON todos FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own todos"
  ON todos FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own todos"
  ON todos FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own todos"
  ON todos FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ============================================================
-- 4. user_settings
-- ============================================================
CREATE TABLE IF NOT EXISTS user_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id),
  default_workspace_type text NOT NULL DEFAULT 'four_grid',
  todo_schedule_sync boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own settings"
  ON user_settings FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own settings"
  ON user_settings FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own settings"
  ON user_settings FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own settings"
  ON user_settings FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ============================================================
-- 5. schedules
-- ============================================================
CREATE TABLE IF NOT EXISTS schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  date date NOT NULL,
  start_minutes integer NOT NULL,
  end_minutes integer NOT NULL,
  title text NOT NULL DEFAULT '',
  color text NOT NULL DEFAULT '#4A90D9',
  is_from_todo boolean NOT NULL DEFAULT false,
  source_todo_id uuid REFERENCES todos(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_schedules_user_date ON schedules(user_id, date);

ALTER TABLE schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own schedules"
  ON schedules FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own schedules"
  ON schedules FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own schedules"
  ON schedules FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own schedules"
  ON schedules FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ============================================================
-- 6. routine_templates
-- ============================================================
CREATE TABLE IF NOT EXISTS routine_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE routine_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own routine template"
  ON routine_templates FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own routine template"
  ON routine_templates FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own routine template"
  ON routine_templates FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own routine template"
  ON routine_templates FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ============================================================
-- 7. routine_template_items
-- ============================================================
CREATE TABLE IF NOT EXISTS routine_template_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES routine_templates(id) ON DELETE CASCADE,
  slot routine_slot NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  title text NOT NULL DEFAULT '',
  short_label text,
  is_active boolean NOT NULL DEFAULT true,
  today_only_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_routine_items_template_slot
  ON routine_template_items(template_id, slot, sort_order);

ALTER TABLE routine_template_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own routine items"
  ON routine_template_items FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM routine_templates
      WHERE routine_templates.id = routine_template_items.template_id
      AND routine_templates.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create own routine items"
  ON routine_template_items FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM routine_templates
      WHERE routine_templates.id = routine_template_items.template_id
      AND routine_templates.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own routine items"
  ON routine_template_items FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM routine_templates
      WHERE routine_templates.id = routine_template_items.template_id
      AND routine_templates.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM routine_templates
      WHERE routine_templates.id = routine_template_items.template_id
      AND routine_templates.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own routine items"
  ON routine_template_items FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM routine_templates
      WHERE routine_templates.id = routine_template_items.template_id
      AND routine_templates.user_id = auth.uid()
    )
  );

-- ============================================================
-- 8. routine_completions
-- ============================================================
CREATE TABLE IF NOT EXISTS routine_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  item_id uuid NOT NULL REFERENCES routine_template_items(id) ON DELETE CASCADE,
  date date NOT NULL,
  completed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, item_id, date)
);

CREATE INDEX IF NOT EXISTS idx_routine_completions_user_date
  ON routine_completions(user_id, date);

ALTER TABLE routine_completions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own routine completions"
  ON routine_completions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own routine completions"
  ON routine_completions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own routine completions"
  ON routine_completions FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own routine completions"
  ON routine_completions FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ============================================================
-- 9. routine_skips
-- ============================================================
CREATE TABLE IF NOT EXISTS routine_skips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  item_id uuid NOT NULL REFERENCES routine_template_items(id) ON DELETE CASCADE,
  date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, item_id, date)
);

CREATE INDEX IF NOT EXISTS idx_routine_skips_user_date
  ON routine_skips(user_id, date);

ALTER TABLE routine_skips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own routine skips"
  ON routine_skips FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own routine skips"
  ON routine_skips FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own routine skips"
  ON routine_skips FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own routine skips"
  ON routine_skips FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
