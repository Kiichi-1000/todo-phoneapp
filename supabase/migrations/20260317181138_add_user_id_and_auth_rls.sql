/*
  # Add user authentication support

  1. Modified Tables
    - `workspaces`
      - Add `user_id` (uuid, FK -> auth.users.id, not null with default)
    - `todos`
      - Add `user_id` (uuid, FK -> auth.users.id, not null with default)
    - `user_settings`
      - Add `user_id` (uuid, FK -> auth.users.id, not null with default, unique)

  2. Indexes
    - workspaces(user_id) for fast user-scoped queries
    - workspaces(user_id, date) unique constraint per user per day
    - todos(user_id) for fast user-scoped queries
    - user_settings(user_id) unique index

  3. Security
    - Drop all existing anon policies
    - Add new authenticated policies scoped to auth.uid()
    - Users can only read/write their own data

  4. Important Notes
    - The old date-only unique constraint on workspaces is replaced with (user_id, date)
    - All existing anon policies are removed and replaced with auth-scoped policies
*/

-- Add user_id to workspaces
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'workspaces' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE workspaces ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Add user_id to todos
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'todos' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE todos ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Add user_id to user_settings
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_settings' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE user_settings ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Drop old date-only unique constraint and add user_id+date unique constraint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'workspaces_date_unique' AND table_name = 'workspaces'
  ) THEN
    ALTER TABLE workspaces DROP CONSTRAINT workspaces_date_unique;
  END IF;
END $$;

-- Add unique constraint on (user_id, date) so each user has one workspace per day
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'workspaces_user_date_unique' AND table_name = 'workspaces'
  ) THEN
    ALTER TABLE workspaces ADD CONSTRAINT workspaces_user_date_unique UNIQUE (user_id, date);
  END IF;
END $$;

-- Add unique constraint on user_settings(user_id)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'user_settings_user_id_unique' AND table_name = 'user_settings'
  ) THEN
    ALTER TABLE user_settings ADD CONSTRAINT user_settings_user_id_unique UNIQUE (user_id);
  END IF;
END $$;

-- Create indexes for user_id
CREATE INDEX IF NOT EXISTS idx_workspaces_user_id ON workspaces(user_id);
CREATE INDEX IF NOT EXISTS idx_todos_user_id ON todos(user_id);
CREATE INDEX IF NOT EXISTS idx_user_settings_user_id ON user_settings(user_id);

-- Drop all existing anon policies on workspaces
DROP POLICY IF EXISTS "Allow anon to read workspaces" ON workspaces;
DROP POLICY IF EXISTS "Allow anon to insert workspaces" ON workspaces;
DROP POLICY IF EXISTS "Allow anon to update workspaces" ON workspaces;
DROP POLICY IF EXISTS "Allow anon to delete workspaces" ON workspaces;

-- Drop all existing anon policies on todos
DROP POLICY IF EXISTS "Allow anon to read todos" ON todos;
DROP POLICY IF EXISTS "Allow anon to insert todos" ON todos;
DROP POLICY IF EXISTS "Allow anon to update todos" ON todos;
DROP POLICY IF EXISTS "Allow anon to delete todos" ON todos;

-- Drop all existing anon policies on user_settings
DROP POLICY IF EXISTS "Allow anon to read user_settings" ON user_settings;
DROP POLICY IF EXISTS "Allow anon to insert user_settings" ON user_settings;
DROP POLICY IF EXISTS "Allow anon to update user_settings" ON user_settings;
DROP POLICY IF EXISTS "Allow anon to delete user_settings" ON user_settings;

-- Create authenticated policies for workspaces
CREATE POLICY "Users can read own workspaces"
  ON workspaces FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own workspaces"
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

-- Create authenticated policies for todos
CREATE POLICY "Users can read own todos"
  ON todos FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own todos"
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

-- Create authenticated policies for user_settings
CREATE POLICY "Users can read own settings"
  ON user_settings FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own settings"
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
