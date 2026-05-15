// Goal-coach tool subset.
//
// We import the full tool registry from ai-chat and filter down to coaching-
// relevant tools. This keeps definitions single-sourced; if a goal tool's
// description is updated in ai-chat/tools.ts, it propagates here automatically.

import { TOOL_DEFS as ALL_DEFS, TOOL_EXECUTORS as ALL_EXECUTORS } from "../ai-chat/tools.ts";
import type { ToolDefinition, ToolExecutor } from "../ai-chat/types.ts";

// Tools the coach IS allowed to call
const ALLOWED = new Set([
  "get_current_context",
  "request_confirmation",
  // Goals
  "list_goals",
  "create_goal",
  "update_goal",
  "delete_goal",
  // Milestones (roadmap)
  "list_milestones",
  "create_milestones_batch",
  "create_milestone",
  "update_milestone",
  "delete_milestone",
  // Memory
  "remember",
  "forget",
  "list_memory",
]);

export const GOAL_COACH_TOOL_DEFS: ToolDefinition[] = ALL_DEFS.filter((d) =>
  ALLOWED.has(d.name),
);

export const GOAL_COACH_TOOL_EXECUTORS: Record<string, ToolExecutor> = Object.fromEntries(
  Object.entries(ALL_EXECUTORS).filter(([name]) => ALLOWED.has(name)),
);
