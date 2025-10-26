/*
  # Change workspace unique constraint to allow multiple types per date
  
  ## Changes
  
  ### Modify `workspaces` table
  - Remove unique constraint on `date` only
  - Add unique constraint on (`date`, `type`) combination
  - This allows creating multiple workspaces for the same date with different types
  
  ## Purpose
  
  This migration enables the "3 separate notebooks" feature where:
  - Each workspace type (four_grid, individual, note) acts as a separate notebook
  - Users can have different workspaces for the same date in different types
  - The app filters workspaces by type when displaying them
*/

-- Remove existing unique constraint on date
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'workspaces_date_key'
  ) THEN
    ALTER TABLE workspaces DROP CONSTRAINT workspaces_date_key;
  END IF;
END $$;

-- Add unique constraint on (date, type) combination
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'workspaces_date_type_key'
  ) THEN
    ALTER TABLE workspaces ADD CONSTRAINT workspaces_date_type_key UNIQUE (date, type);
  END IF;
END $$;

-- Create index on (date, type) for performance
CREATE INDEX IF NOT EXISTS idx_workspaces_date_type ON workspaces(date, type);

