/*
  # Add reminder timestamp to todos

  1. Modified Tables
    - `todos`
      - `reminder_at` (timestamptz, nullable) - When the reminder should fire

  2. Notes
    - Simple approach: one reminder time per todo
    - Nullable so most todos won't have reminders
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'todos' AND column_name = 'reminder_at'
  ) THEN
    ALTER TABLE todos ADD COLUMN reminder_at timestamptz;
  END IF;
END $$;