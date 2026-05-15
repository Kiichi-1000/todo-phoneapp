/*
  # Add per-todo schedule fields

  Stores schedule (start/end times, notify-before) directly on the todo row,
  so a workspace todo can carry its own time slot without going through the
  separate `schedules` table.

  1. Schema changes
    - `todos.schedule_start_minutes` (integer, nullable) — minutes from midnight
    - `todos.schedule_end_minutes` (integer, nullable) — minutes from midnight
    - `todos.schedule_notify_before` (integer, nullable) — minutes before start to notify
*/

ALTER TABLE todos
  ADD COLUMN IF NOT EXISTS schedule_start_minutes integer,
  ADD COLUMN IF NOT EXISTS schedule_end_minutes integer,
  ADD COLUMN IF NOT EXISTS schedule_notify_before integer;
