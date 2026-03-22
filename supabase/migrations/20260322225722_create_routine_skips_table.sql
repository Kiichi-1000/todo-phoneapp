/*
  # Create routine_skips table for per-day item hiding

  1. New Tables
    - `routine_skips`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `item_id` (uuid, references routine_template_items)
      - `date` (date, the date to skip)
      - `created_at` (timestamptz)
      - Unique constraint on (user_id, item_id, date)

  2. Security
    - Enable RLS on routine_skips
    - Per-user select, insert, delete policies
*/

CREATE TABLE IF NOT EXISTS routine_skips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  item_id uuid NOT NULL REFERENCES routine_template_items(id) ON DELETE CASCADE,
  date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT routine_skips_unique UNIQUE (user_id, item_id, date)
);

ALTER TABLE routine_skips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select own skips"
  ON routine_skips FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own skips"
  ON routine_skips FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own skips"
  ON routine_skips FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
