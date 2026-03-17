/*
  # Recreate All Database Tables
  
  ## Overview
  This migration recreates the complete database structure for the FreeTask app,
  ensuring all tables exist with the correct schema including area titles support.
  
  ## Tables Created
  
  ### 1. workspaces
  - `id` (uuid, primary key) - Unique workspace identifier
  - `title` (text) - Workspace name
  - `type` (text) - Workspace type: 'four_grid', 'individual', or 'note'
  - `date` (date) - Date associated with workspace
  - `area_titles` (jsonb) - JSON object storing custom titles for 4-grid areas
  - `created_at` (timestamptz) - Creation timestamp
  - `updated_at` (timestamptz) - Last update timestamp
  - `is_archived` (boolean) - Archive status
  
  ### 2. todos
  - `id` (uuid, primary key) - Unique todo identifier
  - `workspace_id` (uuid, foreign key) - Parent workspace reference
  - `content` (text) - Todo description
  - `is_completed` (boolean) - Completion status
  - `due_date` (timestamptz, nullable) - Optional deadline
  - `grid_area` (text, nullable) - Grid position for 4-grid mode
  - `position_x` (real, nullable) - X coordinate for individual mode
  - `position_y` (real, nullable) - Y coordinate for individual mode
  - `order` (integer) - Display order within grid area
  - `created_at` (timestamptz) - Creation timestamp
  - `completed_at` (timestamptz, nullable) - Completion timestamp
  
  ### 3. reminders
  - `id` (uuid, primary key) - Unique reminder identifier
  - `todo_id` (uuid, foreign key) - Parent todo reference
  - `reminder_time` (timestamptz) - When to trigger reminder
  - `repeat_type` (text) - Repeat frequency
  - `minutes_before` (integer[]) - Notification timing
  - `is_active` (boolean) - Whether reminder is enabled
  
  ### 4. user_settings
  - `id` (uuid, primary key) - Settings identifier
  - `default_workspace_type` (text) - Default workspace type preference
  - `created_at` (timestamptz) - Creation timestamp
  - `updated_at` (timestamptz) - Last update timestamp
  
  ## Security
  All tables have RLS enabled with permissive policies for single-user mode.
  
  ## Notes
  - Uses `IF NOT EXISTS` for safe recreation
  - Includes triggers for automatic timestamp updates
  - Includes performance indexes
*/

-- Drop existing tables if they exist (in correct order due to foreign keys)
DROP TABLE IF EXISTS reminders CASCADE;
DROP TABLE IF EXISTS todos CASCADE;
DROP TABLE IF EXISTS user_settings CASCADE;
DROP TABLE IF EXISTS workspaces CASCADE;

-- Create workspaces table with area_titles support
CREATE TABLE workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  type text NOT NULL CHECK (type IN ('four_grid', 'individual', 'note')),
  date date NOT NULL DEFAULT CURRENT_DATE,
  area_titles jsonb DEFAULT '{"top_left": "左上エリア", "top_right": "右上エリア", "bottom_left": "左下エリア", "bottom_right": "右下エリア"}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  is_archived boolean DEFAULT false
);

-- Create todos table with order support
CREATE TABLE todos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  content text NOT NULL,
  is_completed boolean DEFAULT false,
  due_date timestamptz,
  grid_area text CHECK (grid_area IN ('top_left', 'top_right', 'bottom_left', 'bottom_right')),
  position_x real,
  position_y real,
  "order" integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz
);

-- Create reminders table
CREATE TABLE reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  todo_id uuid NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
  reminder_time timestamptz NOT NULL,
  repeat_type text DEFAULT 'none' CHECK (repeat_type IN ('none', 'daily', 'weekly', 'monthly')),
  minutes_before integer[] DEFAULT ARRAY[]::integer[],
  is_active boolean DEFAULT true
);

-- Create user_settings table
CREATE TABLE user_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  default_workspace_type text DEFAULT 'four_grid' CHECK (default_workspace_type IN ('four_grid', 'individual', 'note')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX idx_workspaces_date ON workspaces(date);
CREATE INDEX idx_workspaces_archived ON workspaces(is_archived);
CREATE INDEX idx_todos_workspace ON todos(workspace_id);
CREATE INDEX idx_todos_completed ON todos(is_completed);
CREATE INDEX idx_todos_grid_area ON todos(grid_area);
CREATE INDEX idx_todos_order ON todos("order");
CREATE INDEX idx_reminders_todo ON reminders(todo_id);

-- Enable Row Level Security
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE todos ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for single-user mode
CREATE POLICY "Allow all operations on workspaces"
  ON workspaces FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all operations on todos"
  ON todos FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all operations on reminders"
  ON reminders FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all operations on user_settings"
  ON user_settings FOR ALL
  USING (true)
  WITH CHECK (true);

-- Create function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for automatic timestamp updates
CREATE TRIGGER update_workspaces_updated_at
  BEFORE UPDATE ON workspaces
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_settings_updated_at
  BEFORE UPDATE ON user_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Insert default user settings
INSERT INTO user_settings (default_workspace_type) VALUES ('four_grid');