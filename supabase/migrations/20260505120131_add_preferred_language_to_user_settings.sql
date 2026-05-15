/*
  # Add preferred_language to user_settings

  Stores the user's preferred UI language so it can sync across devices.
  Defaults to 'ja' to match current default behavior.

  1. Schema changes
    - `user_settings.preferred_language` (text, NOT NULL, default 'ja')
    - CHECK constraint to limit to supported languages
*/

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS preferred_language text NOT NULL DEFAULT 'ja';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_settings_preferred_language_check'
  ) THEN
    ALTER TABLE user_settings
      ADD CONSTRAINT user_settings_preferred_language_check
      CHECK (preferred_language IN ('ja', 'en'));
  END IF;
END $$;
