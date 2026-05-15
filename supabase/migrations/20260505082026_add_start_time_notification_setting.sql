/*
  # Add start_time_notification_enabled to user_settings

  Adds a per-user toggle controlling whether a push notification is scheduled
  at a todo's reminder/start time. Defaults to true so existing users keep
  receiving notifications.

  1. Schema changes
    - `user_settings.start_time_notification_enabled` (boolean, NOT NULL, default true)

  2. Backfill
    - Existing rows are populated with `true` via the column default.
*/

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS start_time_notification_enabled boolean NOT NULL DEFAULT true;
