/*
  # Auto-create routine_templates row on user signup

  Same root cause as user_settings: client-side `ensureTemplate()` in
  routine.tsx sometimes fails silently after Google OAuth, leaving the
  user with no routine_template row. Routine tab then cannot load any
  items.

  Fix: extend the existing `handle_new_user()` trigger function to also
  insert into `routine_templates`. Backfill existing users.

  1. Function `public.handle_new_user()` updated to insert into both
     `user_settings` and `routine_templates`.
  2. Backfill: insert routine_templates rows for any existing user
     without one.
*/

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  BEGIN
    INSERT INTO public.user_settings (user_id, default_workspace_type)
    VALUES (NEW.id, 'four_grid')
    ON CONFLICT (user_id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    -- Never block sign-up if settings creation fails
    NULL;
  END;

  BEGIN
    INSERT INTO public.routine_templates (user_id)
    VALUES (NEW.id)
    ON CONFLICT (user_id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN NEW;
END;
$$;

-- Backfill: ensure every existing user has a routine_templates row
INSERT INTO public.routine_templates (user_id)
SELECT u.id
FROM auth.users u
LEFT JOIN public.routine_templates rt ON rt.user_id = u.id
WHERE rt.id IS NULL
ON CONFLICT (user_id) DO NOTHING;
