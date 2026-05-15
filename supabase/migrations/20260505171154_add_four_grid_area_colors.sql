/*
  # Add per-area postit colors for the four_grid workspace mode

  Stores a user-level color for each of the four grid areas. Same colors are
  applied across all the user's four_grid workspaces so the UI feels consistent.

  Defaults: red / yellow / blue / green (pastel) for top-left / top-right /
  bottom-left / bottom-right respectively.

  1. Schema changes
    - `user_settings.four_grid_area_colors` (jsonb, NOT NULL)
*/

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS four_grid_area_colors jsonb NOT NULL DEFAULT
    jsonb_build_object(
      'top_left',     '#FFCDD2',
      'top_right',    '#FFF9C4',
      'bottom_left',  '#BBDEFB',
      'bottom_right', '#C8E6C9'
    );
