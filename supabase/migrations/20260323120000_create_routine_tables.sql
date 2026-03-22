/*
  # Routine (habits) feature — templates, items, daily completions

  1. Enum `routine_slot`: morning | daytime | evening
  2. Tables: routine_templates (1 row per user), routine_template_items, routine_completions
  3. RLS: authenticated users scoped to auth.uid() = user_id
*/

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'routine_slot') THEN
    CREATE TYPE routine_slot AS ENUM ('morning', 'daytime', 'evening');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS routine_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT routine_templates_user_id_unique UNIQUE (user_id)
);

CREATE TABLE IF NOT EXISTS routine_template_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES routine_templates(id) ON DELETE CASCADE,
  slot routine_slot NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  title text NOT NULL DEFAULT '',
  short_label text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_routine_template_items_template_slot_order
  ON routine_template_items(template_id, slot, sort_order);

CREATE TABLE IF NOT EXISTS routine_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES routine_template_items(id) ON DELETE CASCADE,
  date date NOT NULL,
  completed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT routine_completions_user_item_date_unique UNIQUE (user_id, item_id, date)
);

CREATE INDEX IF NOT EXISTS idx_routine_completions_user_date ON routine_completions(user_id, date);

ALTER TABLE routine_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE routine_template_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE routine_completions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own routine_templates"
  ON routine_templates FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own routine_templates"
  ON routine_templates FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own routine_templates"
  ON routine_templates FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own routine_templates"
  ON routine_templates FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view own routine_template_items"
  ON routine_template_items FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM routine_templates t
      WHERE t.id = routine_template_items.template_id AND t.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own routine_template_items"
  ON routine_template_items FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM routine_templates t
      WHERE t.id = routine_template_items.template_id AND t.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own routine_template_items"
  ON routine_template_items FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM routine_templates t
      WHERE t.id = routine_template_items.template_id AND t.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM routine_templates t
      WHERE t.id = routine_template_items.template_id AND t.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own routine_template_items"
  ON routine_template_items FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM routine_templates t
      WHERE t.id = routine_template_items.template_id AND t.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can view own routine_completions"
  ON routine_completions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own routine_completions"
  ON routine_completions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own routine_completions"
  ON routine_completions FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own routine_completions"
  ON routine_completions FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
