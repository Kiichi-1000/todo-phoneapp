/*
  # Consolidate orphan MCP-created workspaces

  ## Context (2026-06-21〜23)

  The MCP server's `create_task` previously created a fresh workspace for
  each task whenever no row matched `(user_id, date)` (without filtering
  by `type`). This produced "orphan" workspaces of `type='four_grid'` on
  dates where the user actually had a different active type (e.g.
  individual/note), so the tasks DID land in DB but were invisible in the
  app's workspace view. See Notion: "🔴最優先 ToSche:【P0】MCPの当日タスク
  追加が「課題一覧」に入りワークスペースに出ない".

  This migration consolidates: for each (user_id, date) pair, if a user
  has multiple workspaces of the SAME type, move all todos to the OLDEST
  one (lowest created_at) and delete the duplicate empty workspaces.

  Safety:
  - Wrapped in a transaction.
  - Only touches workspaces that have NO todos after migration.
  - Idempotent: re-running yields zero changes.
  - Does NOT cross types — a `four_grid` workspace is never merged with
    an `individual` workspace.
*/

DO $$
DECLARE
  total_moved INTEGER := 0;
  total_dropped INTEGER := 0;
BEGIN
  -- 1. For each (user_id, date, type) collision, pick the keeper
  --    (smallest created_at, then smallest id for determinism) and
  --    re-point all todos in dup workspaces to the keeper.
  WITH dup AS (
    SELECT
      user_id,
      date,
      type,
      MIN(created_at::text || id::text) AS keeper_key
    FROM workspaces
    GROUP BY user_id, date, type
    HAVING COUNT(*) > 1
  ),
  keepers AS (
    SELECT w.id AS keeper_id, w.user_id, w.date, w.type
    FROM workspaces w
    JOIN dup d
      ON d.user_id = w.user_id
      AND d.date = w.date
      AND d.type = w.type
      AND (w.created_at::text || w.id::text) = d.keeper_key
  ),
  to_merge AS (
    SELECT w.id AS dup_id, k.keeper_id
    FROM workspaces w
    JOIN keepers k
      ON k.user_id = w.user_id
      AND k.date = w.date
      AND k.type = w.type
    WHERE w.id <> k.keeper_id
  )
  UPDATE todos t
  SET workspace_id = m.keeper_id
  FROM to_merge m
  WHERE t.workspace_id = m.dup_id;

  GET DIAGNOSTICS total_moved = ROW_COUNT;

  -- 2. Delete empty duplicate workspaces (their todos are gone).
  DELETE FROM workspaces w
  WHERE EXISTS (
    SELECT 1 FROM workspaces w2
    WHERE w2.user_id = w.user_id
      AND w2.date = w.date
      AND w2.type = w.type
      AND w2.id <> w.id
      AND w2.created_at < w.created_at
  )
  AND NOT EXISTS (SELECT 1 FROM todos t WHERE t.workspace_id = w.id);

  GET DIAGNOSTICS total_dropped = ROW_COUNT;

  RAISE NOTICE 'consolidate_orphan_mcp_workspaces: moved % todos, dropped % workspaces',
    total_moved, total_dropped;
END $$;
