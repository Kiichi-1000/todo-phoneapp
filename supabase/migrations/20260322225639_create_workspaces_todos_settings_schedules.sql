/*
  # Create workspaces, todos, user_settings, and schedules tables

  1. New Tables
    - `workspaces`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `title` (text)
      - `type` (text, default 'four_grid')
      - `date` (date)
      - `area_titles` (jsonb, nullable)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
    - `todos`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `workspace_id` (uuid, references workspaces)
      - `content` (text)
      - `is_completed` (boolean, default false)
      - `due_date` (date, nullable)
      - `grid_area` (text, nullable)
      - `position_x` (real, nullable)
      - `position_y` (real, nullable)
      - `order` (integer, default 0)
      - `completed_at` (timestamptz, nullable)
      - `reminder_at` (timestamptz, nullable)
      - `notification_id` (text, nullable)
      - `created_at` (timestamptz)
    - `user_settings`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users, unique)
      - `default_workspace_type` (text, default 'four_grid')
      - `todo_schedule_sync` (boolean, default true)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
    - `schedules`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `date` (date)
      - `start_minutes` (integer)
      - `end_minutes` (integer)
      - `title` (text)
      - `color` (text, default '#4A90D9')
      - `is_from_todo` (boolean, default false)
      - `source_todo_id` (uuid, nullable, references todos)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on all tables
    - Add per-user access policies for select, insert, update, delete

  3. Indexes
    - workspaces: unique on (user_id, date)
    - todos: index on workspace_id
    - schedules: index on (user_id, date)
*/

-- workspaces
CREATE TABLE IF NOT EXISTS workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  title text NOT NULL DEFAULT '',
  type text NOT NULL DEFAULT 'four_grid',
  date date NOT NULL,
  area_titles jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS workspaces_user_date_idx ON workspaces(user_id, date);

ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select own workspaces"
  ON workspaces FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own workspaces"
  ON workspaces FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own workspaces"
  ON workspaces FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own workspaces"
  ON workspaces FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- todos
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

CREATE INDEX IF NOT EXISTS todos_workspace_id_idx ON todos(workspace_id);

ALTER TABLE todos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select own todos"
  ON todos FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own todos"
  ON todos FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own todos"
  ON todos FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own todos"
  ON todos FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- user_settings
CREATE TABLE IF NOT EXISTS user_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  default_workspace_type text NOT NULL DEFAULT 'four_grid',
  todo_schedule_sync boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_settings_user_id_unique UNIQUE (user_id)
);

ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select own settings"
  ON user_settings FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own settings"
  ON user_settings FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own settings"
  ON user_settings FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own settings"
  ON user_settings FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- schedules
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

CREATE INDEX IF NOT EXISTS schedules_user_date_idx ON schedules(user_id, date);

ALTER TABLE schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select own schedules"
  ON schedules FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own schedules"
  ON schedules FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own schedules"
  ON schedules FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own schedules"
  ON schedules FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
