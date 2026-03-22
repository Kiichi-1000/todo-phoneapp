/*
  # Add today_only_date to routine_template_items

  1. Modified Tables
    - `routine_template_items`
      - Added `today_only_date` (date, nullable) - when set, item only appears on this specific date
  
  2. Purpose
    - Allows "today-only" tasks to be stored as active items that appear only on their specific date
    - Template items have today_only_date = NULL and appear every day
    - Today-only items have a specific date and only appear on that date
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'routine_template_items' AND column_name = 'today_only_date'
  ) THEN
    ALTER TABLE routine_template_items ADD COLUMN today_only_date date;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_routine_template_items_today_only_date
  ON routine_template_items(today_only_date)
  WHERE today_only_date IS NOT NULL;