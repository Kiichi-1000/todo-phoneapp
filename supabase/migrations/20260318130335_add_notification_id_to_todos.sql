/*
  # Add notification_id to todos

  1. Modified Tables
    - `todos`
      - `notification_id` (text, nullable) - Local notification identifier for cancellation

  2. Notes
    - Stores the device-local notification ID so it can be cancelled when the reminder is removed
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'todos' AND column_name = 'notification_id'
  ) THEN
    ALTER TABLE todos ADD COLUMN notification_id text;
  END IF;
END $$;