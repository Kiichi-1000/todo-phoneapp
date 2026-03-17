-- Add order field to todos table for drag and drop functionality
ALTER TABLE todos ADD COLUMN IF NOT EXISTS "order" integer DEFAULT 0;

-- Create index for better performance when ordering todos
CREATE INDEX IF NOT EXISTS idx_todos_order ON todos(workspace_id, grid_area, "order");

-- Update existing todos to have their order based on created_at
UPDATE todos SET "order" = (
  SELECT COUNT(*) 
  FROM todos t2 
  WHERE t2.workspace_id = todos.workspace_id 
    AND t2.grid_area = todos.grid_area 
    AND t2.created_at <= todos.created_at
) - 1;



