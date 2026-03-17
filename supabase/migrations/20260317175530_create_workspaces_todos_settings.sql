/*
  # Create core tables for TodoApp

  1. New Tables
    - `workspaces`
      - `id` (uuid, primary key, auto-generated)
      - `title` (text, not null) - display title like "2026年3月17日 (月)"
      - `type` (text, not null, default 'four_grid') - workspace type: four_grid, individual, note
      - `date` (date, not null, unique) - one workspace per day
      - `area_titles` (jsonb) - labels for 4-grid areas
      - `created_at` (timestamptz, default now())
      - `updated_at` (timestamptz, default now())
    - `todos`
      - `id` (uuid, primary key, auto-generated)
      - `workspace_id` (uuid, FK -> workspaces.id, cascade delete)
      - `content` (text, not null) - task text
      - `is_completed` (boolean, default false)
      - `due_date` (date, nullable) - optional due date
      - `grid_area` (text, nullable) - for four_grid mode: top_left, top_right, bottom_left, bottom_right
      - `position_x` (real, nullable) - for individual mode x position
      - `position_y` (real, nullable) - for individual mode y position
      - `order` (integer, default 0) - sort order within area
      - `created_at` (timestamptz, default now())
      - `completed_at` (timestamptz, nullable) - when task was completed
    - `user_settings`
      - `id` (uuid, primary key, auto-generated)
      - `default_workspace_type` (text, default 'four_grid')
      - `created_at` (timestamptz, default now())
      - `updated_at` (timestamptz, default now())

  2. Indexes
    - workspaces(date) unique index
    - todos(workspace_id) for fast lookup
    - todos(workspace_id, grid_area) for grid filtering

  3. Security
    - RLS enabled on all tables
    - Policies allow anonymous access (no auth required for this app)
    - Policies scoped to anon role
*/

-- Create workspaces table
CREATE TABLE IF NOT EXISTS workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  type text NOT NULL DEFAULT 'four_grid',
  date date NOT NULL,
  area_titles jsonb DEFAULT '{"top_left": "左上エリア", "top_right": "右上エリア", "bottom_left": "左下エリア", "bottom_right": "右下エリア"}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT workspaces_date_unique UNIQUE (date),
  CONSTRAINT workspaces_type_check CHECK (type IN ('four_grid', 'individual', 'note'))
);

-- Create todos table
CREATE TABLE IF NOT EXISTS todos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  content text NOT NULL,
  is_completed boolean NOT NULL DEFAULT false,
  due_date date,
  grid_area text,
  position_x real,
  position_y real,
  "order" integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT todos_grid_area_check CHECK (grid_area IS NULL OR grid_area IN ('top_left', 'top_right', 'bottom_left', 'bottom_right'))
);

-- Create user_settings table
CREATE TABLE IF NOT EXISTS user_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  default_workspace_type text NOT NULL DEFAULT 'four_grid',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT user_settings_type_check CHECK (default_workspace_type IN ('four_grid', 'individual', 'note'))
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_todos_workspace_id ON todos(workspace_id);
CREATE INDEX IF NOT EXISTS idx_todos_workspace_grid ON todos(workspace_id, grid_area);

-- Enable RLS on all tables
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE todos ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

-- RLS policies for workspaces (anon access - no auth in this app)
CREATE POLICY "Allow anon to read workspaces"
  ON workspaces FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Allow anon to insert workspaces"
  ON workspaces FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Allow anon to update workspaces"
  ON workspaces FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow anon to delete workspaces"
  ON workspaces FOR DELETE
  TO anon
  USING (true);

-- RLS policies for todos
CREATE POLICY "Allow anon to read todos"
  ON todos FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Allow anon to insert todos"
  ON todos FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Allow anon to update todos"
  ON todos FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow anon to delete todos"
  ON todos FOR DELETE
  TO anon
  USING (true);

-- RLS policies for user_settings
CREATE POLICY "Allow anon to read user_settings"
  ON user_settings FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Allow anon to insert user_settings"
  ON user_settings FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Allow anon to update user_settings"
  ON user_settings FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow anon to delete user_settings"
  ON user_settings FOR DELETE
  TO anon
  USING (true);
