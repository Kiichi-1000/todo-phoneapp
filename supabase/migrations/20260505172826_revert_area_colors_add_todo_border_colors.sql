/*
  # Revert area background colors, add per-area todo border colors

  Per user request, the 4-grid area background-color customization was
  reverted. Replace it with a per-area accent color applied to the LEFT EDGE
  of each task in that grid (the postit accent stripe), shared across both
  postit and whiteboard skins.

  1. Schema changes
    - Drop `user_settings.four_grid_area_colors`
    - Add `user_settings.four_grid_todo_border_colors` (jsonb, NOT NULL)
      Defaults: red / yellow / blue / green for top_left / top_right /
      bottom_left / bottom_right respectively.
*/

ALTER TABLE user_settings
  DROP COLUMN IF EXISTS four_grid_area_colors;

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS four_grid_todo_border_colors jsonb NOT NULL DEFAULT
    jsonb_build_object(
      'top_left',     '#FF6B6B',
      'top_right',    '#FFD93D',
      'bottom_left',  '#4D96FF',
      'bottom_right', '#6BCB77'
    );
