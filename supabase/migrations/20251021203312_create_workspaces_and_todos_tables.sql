/*
  # Create FreeTask Database Schema
  
  ## Overview
  This migration creates the core database structure for the FreeTask todo application,
  implementing workspace-based task management with support for multiple workspace types.
  
  ## New Tables
  
  ### 1. `workspaces`
  Stores workspace containers that hold todos. Each workspace represents a different
  organizational view (4-grid, individual sticky notes, or freeform notes).
  
  - `id` (uuid, primary key) - Unique identifier
  - `title` (text) - Workspace name set by user
  - `type` (text) - Workspace type: 'four_grid', 'individual', or 'note'
  - `created_at` (timestamptz) - Creation timestamp
  - `updated_at` (timestamptz) - Last modification timestamp
  - `is_archived` (boolean) - Archive status for completed workspaces
  
  ### 2. `todos`
  Stores individual todo items within workspaces.
  
  - `id` (uuid, primary key) - Unique identifier
  - `workspace_id` (uuid, foreign key) - Reference to parent workspace
  - `content` (text) - Todo description/text
  - `is_completed` (boolean) - Completion status
  - `due_date` (timestamptz, nullable) - Optional deadline
  - `grid_area` (text, nullable) - For 4-grid mode: 'top_left', 'top_right', 'bottom_left', 'bottom_right'
  - `position_x` (real, nullable) - For individual mode: X coordinate
  - `position_y` (real, nullable) - For individual mode: Y coordinate
  - `created_at` (timestamptz) - Creation timestamp
  - `completed_at` (timestamptz, nullable) - Completion timestamp
  
  ### 3. `reminders`
  Stores reminder configurations for todos.
  
  - `id` (uuid, primary key) - Unique identifier
  - `todo_id` (uuid, foreign key) - Reference to parent todo
  - `reminder_time` (timestamptz) - When to trigger reminder
  - `repeat_type` (text) - 'none', 'daily', 'weekly', 'monthly'
  - `minutes_before` (integer[]) - Array of minutes before due date to notify
  - `is_active` (boolean) - Whether reminder is enabled
  
  ## Security
  
  All tables have Row Level Security (RLS) enabled. Since Phase 1 is single-user,
  policies allow all operations. Future phases will add authentication-based policies.
  
  ## Indexes
  
  Performance indexes are created for:
  - Workspace lookups by archive status
  - Todo lookups by workspace and completion status
  - Reminder lookups by todo
*/

-- Create workspaces table
CREATE TABLE IF NOT EXISTS workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  type text NOT NULL CHECK (type IN ('four_grid', 'individual', 'note')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  is_archived boolean DEFAULT false
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

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_workspaces_archived ON workspaces(is_archived);
CREATE INDEX IF NOT EXISTS idx_todos_workspace ON todos(workspace_id);
CREATE INDEX IF NOT EXISTS idx_todos_completed ON todos(is_completed);
CREATE INDEX IF NOT EXISTS idx_reminders_todo ON reminders(todo_id);

-- Enable Row Level Security
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE todos ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;

-- Create RLS policies (Phase 1: Allow all operations for single-user MVP)
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

-- Create function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for workspaces updated_at
DROP TRIGGER IF EXISTS update_workspaces_updated_at ON workspaces;
CREATE TRIGGER update_workspaces_updated_at
  BEFORE UPDATE ON workspaces
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();