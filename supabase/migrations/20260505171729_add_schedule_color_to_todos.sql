/*
  # Add schedule_color to todos

  Stores per-todo schedule grid color so users can choose a color when setting
  a schedule via the workspace wheel-picker.

  1. Schema changes
    - `todos.schedule_color` (text, nullable) — hex color string like '#E8654A'
*/

ALTER TABLE todos
  ADD COLUMN IF NOT EXISTS schedule_color text;
