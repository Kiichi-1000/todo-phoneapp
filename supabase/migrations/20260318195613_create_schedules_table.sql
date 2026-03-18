/*
  # Create schedules table for daily scheduling feature

  1. New Tables
    - `schedules`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `date` (date, the date this schedule belongs to)
      - `start_minutes` (integer, start time in minutes from midnight, 0-1439)
      - `end_minutes` (integer, end time in minutes from midnight, 1-1440)
      - `title` (text, schedule item title)
      - `color` (text, color hex code for display)
      - `is_from_todo` (boolean, whether synced from a todo reminder)
      - `source_todo_id` (uuid, nullable, reference to the source todo)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Changes to `user_settings`
    - Add `todo_schedule_sync` (boolean, default true) to control auto-sync of reminded todos

  3. Security
    - Enable RLS on `schedules` table
    - Add policies for authenticated users to manage their own schedules
*/

CREATE TABLE IF NOT EXISTS schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date date NOT NULL,
  start_minutes integer NOT NULL CHECK (start_minutes >= 0 AND start_minutes < 1440),
  end_minutes integer NOT NULL CHECK (end_minutes > 0 AND end_minutes <= 1440),
  title text NOT NULL DEFAULT '',
  color text NOT NULL DEFAULT '#4A90D9',
  is_from_todo boolean NOT NULL DEFAULT false,
  source_todo_id uuid REFERENCES todos(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT valid_time_range CHECK (end_minutes > start_minutes)
);

ALTER TABLE schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own schedules"
  ON schedules FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own schedules"
  ON schedules FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own schedules"
  ON schedules FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own schedules"
  ON schedules FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_schedules_user_date ON schedules(user_id, date);
CREATE INDEX IF NOT EXISTS idx_schedules_source_todo ON schedules(source_todo_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_settings' AND column_name = 'todo_schedule_sync'
  ) THEN
    ALTER TABLE user_settings ADD COLUMN todo_schedule_sync boolean NOT NULL DEFAULT true;
  END IF;
END $$;
