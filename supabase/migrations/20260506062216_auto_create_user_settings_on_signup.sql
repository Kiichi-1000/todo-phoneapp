/*
  # Auto-create user_settings on user signup

  Bug fix: TestFlight users authenticated via Google OAuth sometimes failed
  to create their `user_settings` row from the client (race / network /
  silent error in `loadSettings`'s fallback UPSERT path). Without that row,
  the workspace tab effectively cannot render — `loadWorkspaceDates` is
  gated on `settings`, so the page stays blank forever.

  Fix: create the user_settings row server-side via a trigger on
  `auth.users` INSERT. This guarantees every authenticated user has a
  settings row with all the latest defaults, regardless of client behaviour.

  1. Schema changes
    - Function `public.handle_new_user()` (SECURITY DEFINER) — inserts a
      user_settings row for the newly created auth user.
    - Trigger `on_auth_user_created` on `auth.users` AFTER INSERT — fires
      the function for every new sign-up.

  2. Backfill
    - Insert user_settings rows for any existing auth.users without one.
*/

-- ============================================================
-- 1. Function: create default user_settings for a new auth user
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_settings (user_id, default_workspace_type)
  VALUES (NEW.id, 'four_grid')
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Never block sign-up if settings creation fails for any reason
    RETURN NEW;
END;
$$;

-- ============================================================
-- 2. Trigger on auth.users INSERT
-- ============================================================
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- 3. Backfill: insert settings for users that don't have one yet
-- ============================================================
INSERT INTO public.user_settings (user_id, default_workspace_type)
SELECT u.id, 'four_grid'
FROM auth.users u
LEFT JOIN public.user_settings us ON us.user_id = u.id
WHERE us.id IS NULL
ON CONFLICT (user_id) DO NOTHING;
