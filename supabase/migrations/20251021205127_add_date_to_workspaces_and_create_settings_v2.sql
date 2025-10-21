/*
  # Add date field to workspaces and create settings table
  
  ## Changes
  
  ### 1. Modify `workspaces` table
  - Add `date` (date) - The date this workspace is for (defaults to today)
  - Add unique constraint on date to ensure one workspace per day
  - Remove `is_archived` field (no longer needed with date-based system)
  
  ### 2. Create `user_settings` table
  - `id` (uuid, primary key) - Unique identifier
  - `default_workspace_type` (text) - User's preferred workspace type
  - `created_at` (timestamptz) - Creation timestamp
  - `updated_at` (timestamptz) - Last modification timestamp
  
  ## Security
  
  Row Level Security is enabled on the new settings table.
*/

-- Add date column to workspaces
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'workspaces' AND column_name = 'date'
  ) THEN
    ALTER TABLE workspaces ADD COLUMN date date DEFAULT CURRENT_DATE;
  END IF;
END $$;

-- Add unique constraint on date
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'workspaces_date_key'
  ) THEN
    ALTER TABLE workspaces ADD CONSTRAINT workspaces_date_key UNIQUE (date);
  END IF;
END $$;

-- Remove is_archived column if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'workspaces' AND column_name = 'is_archived'
  ) THEN
    ALTER TABLE workspaces DROP COLUMN is_archived;
  END IF;
END $$;

-- Create user_settings table
CREATE TABLE IF NOT EXISTS user_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  default_workspace_type text NOT NULL DEFAULT 'four_grid' CHECK (default_workspace_type IN ('four_grid', 'individual', 'note')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create index on date for workspaces
CREATE INDEX IF NOT EXISTS idx_workspaces_date ON workspaces(date);

-- Enable Row Level Security
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for user_settings
DROP POLICY IF EXISTS "Allow all operations on user_settings" ON user_settings;
CREATE POLICY "Allow all operations on user_settings"
  ON user_settings FOR ALL
  USING (true)
  WITH CHECK (true);

-- Create trigger for user_settings updated_at
DROP TRIGGER IF EXISTS update_user_settings_updated_at ON user_settings;
CREATE TRIGGER update_user_settings_updated_at
  BEFORE UPDATE ON user_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Insert default settings if not exists
INSERT INTO user_settings (default_workspace_type)
SELECT 'four_grid'
WHERE NOT EXISTS (SELECT 1 FROM user_settings LIMIT 1);