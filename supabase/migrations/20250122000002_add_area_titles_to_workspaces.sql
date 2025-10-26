-- Add area titles JSON column to workspaces table for 4-grid mode
ALTER TABLE workspaces
ADD COLUMN IF NOT EXISTS area_titles jsonb DEFAULT '{"top_left": "左上エリア", "top_right": "右上エリア", "bottom_left": "左下エリア", "bottom_right": "右下エリア"}'::jsonb;

