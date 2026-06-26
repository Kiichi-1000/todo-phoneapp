// MCP-exposed tool definitions and executors.
//
// Self-contained subset of ai-chat/tools.ts. We duplicate (rather than
// cross-import) so the mcp-server function deploys as a single unit.
// If a tool's behavior diverges from ai-chat, document the divergence
// explicitly. For now they are 1:1.
//
// Exposed tools:
//   Read-only:        list_goals, list_milestones, list_tasks, get_shared_context
//   Safe writes:      create_goal, create_milestones_batch, update_milestone,
//                     create_task, update_task, complete_task, update_shared_context
//   Destructive:      delete_goal, delete_milestone, delete_task
//
// Destructive tools follow a two-phase confirmation protocol — see the
// `confirm` parameter on each. Phase 1 (confirm omitted or false) returns
// a deletion preview; phase 2 (confirm: true) performs the delete. The
// tool descriptions instruct the AI to present the preview to the user
// and obtain explicit consent before passing confirm: true.

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface ToolContext {
  userId: string;
  adminClient: any;
  now: Date;
}

export interface ToolResult {
  ok: boolean;
  data?: unknown;
  error?: string;
}

type WorkspaceType = "four_grid" | "individual" | "note";

/**
 * Resolve the correct workspace for today, matching the user's
 * `default_workspace_type` setting so MCP-created tasks land in
 * the same workspace the app shows.
 *
 * Bug fix (2026-06-21 筑井さん指摘):
 *   Previously this query did NOT filter by type, so it could:
 *     - return another type's workspace (rendering tasks invisible
 *       to the user's selected grid), OR
 *     - silently create a 'four_grid' workspace even when the user
 *       prefers 'individual' or 'note'.
 *   We now respect default_workspace_type. If the caller passes an
 *   explicit target_workspace_id we honor that instead (no implicit
 *   new-workspace creation).
 */
async function resolveTodayWorkspace(
  adminClient: any,
  userId: string,
  today: string,
  override?: { targetWorkspaceId?: string | null; targetType?: WorkspaceType | null },
): Promise<{ ok: true; workspaceId: string } | { ok: false; error: string }> {
  // 1. Explicit target wins.
  if (override?.targetWorkspaceId) {
    const { data: ws, error } = await adminClient
      .from("workspaces")
      .select("id")
      .eq("id", override.targetWorkspaceId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (!ws) {
      return {
        ok: false,
        error: `target_workspace_id ${override.targetWorkspaceId} not found or not owned by user`,
      };
    }
    return { ok: true, workspaceId: ws.id };
  }

  // 2. Resolve type from user_settings or override.
  let type: WorkspaceType = override?.targetType ?? "four_grid";
  if (!override?.targetType) {
    const { data: settings } = await adminClient
      .from("user_settings")
      .select("default_workspace_type")
      .eq("user_id", userId)
      .maybeSingle();
    if (settings?.default_workspace_type) {
      type = settings.default_workspace_type as WorkspaceType;
    }
  }

  // 3. Find existing workspace for (user, today, type). Unique constraint
  //    is on (date, type), so at most one row per user/date/type.
  const { data: existing, error: selErr } = await adminClient
    .from("workspaces")
    .select("id")
    .eq("user_id", userId)
    .eq("date", today)
    .eq("type", type)
    .maybeSingle();
  if (selErr) return { ok: false, error: selErr.message };
  if (existing?.id) return { ok: true, workspaceId: existing.id };

  // 4. Create the missing workspace with the correct type.
  const { data: created, error: insErr } = await adminClient
    .from("workspaces")
    .insert({ user_id: userId, date: today, title: "", type })
    .select("id")
    .single();
  if (insErr) return { ok: false, error: insErr.message };
  return { ok: true, workspaceId: created.id };
}

// ── Workspace / schedule / routine helpers ──────────────────────────────────
// Ported 1:1 from ai-chat/tools.ts so MCP-created items behave IDENTICALLY to
// the in-app AI. The goal: a task created by Claude/ChatGPT lands in exactly
// the same place (workspace grid / deadlines / schedule / routine) the user
// would see if ToSche's own AI created it. Keep these in sync with ai-chat.

function fmtTime(minutes: number): string {
  const h = Math.floor(minutes / 60).toString().padStart(2, "0");
  const m = (minutes % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

const GRID_AREAS = ["top_left", "top_right", "bottom_left", "bottom_right"] as const;
type GridArea = typeof GRID_AREAS[number];

// Schedule color palette — MUST stay in sync with lib/scheduleUtils.ts
// SCHEDULE_COLORS and ai-chat/tools.ts SCHEDULE_PALETTE so AI-created entries
// blend with manually-created ones. 20 distinct colors → richer pie variety.
const SCHEDULE_PALETTE = [
  // Original 10
  "#4A90D9", "#E8654A", "#50B86C", "#F5A623", "#9B59B6",
  "#1ABC9C", "#E74C8B", "#34495E", "#F39C12", "#2ECC71",
  // Extended 10
  "#6C5CE7", "#00B894", "#FDCB6E", "#74B9FF", "#A29BFE",
  "#FF7675", "#55EFC4", "#FAB1A0", "#FF6B9D", "#7DA0FA",
] as const;

// Variety-aware schedule color picker (matches ai-chat exactly):
//   1. count palette-color usage across the day,
//   2. find colors used by overlapping/neighboring events (within bufferMin),
//   3. among non-conflicting colors pick the least-used (spread variety),
//   4. if everything conflicts, fall back to least-used overall.
function pickScheduleColor(
  start: number,
  end: number,
  existing: { start_minutes: number; end_minutes: number; color: string }[],
  bufferMin = 60,
): string {
  const useCount = new Map<string, number>();
  for (const c of SCHEDULE_PALETTE) useCount.set(c.toUpperCase(), 0);
  for (const s of existing) {
    const u = (s.color || "").toUpperCase();
    useCount.set(u, (useCount.get(u) ?? 0) + 1);
  }
  const conflicting = new Set<string>();
  for (const s of existing) {
    const overlaps = s.start_minutes < end && s.end_minutes > start;
    const within = s.end_minutes >= start - bufferMin && s.start_minutes <= end + bufferMin;
    if (overlaps || within) conflicting.add((s.color || "").toUpperCase());
  }
  const pickLeastUsed = (pool: readonly string[]): string => {
    let best = pool[0];
    let bestCount = useCount.get(best.toUpperCase()) ?? 0;
    for (const c of pool) {
      const n = useCount.get(c.toUpperCase()) ?? 0;
      if (n < bestCount) { best = c; bestCount = n; }
    }
    return best;
  };
  const nonConflicting = SCHEDULE_PALETTE.filter((c) => !conflicting.has(c.toUpperCase()));
  if (nonConflicting.length > 0) return pickLeastUsed(nonConflicting);
  return pickLeastUsed(SCHEDULE_PALETTE);
}

// Best-effort fuzzy match of a user-spoken area name → physical grid position.
function resolveGridAreaByName(
  name: string,
  areaTitles: Record<string, string> | null | undefined,
): GridArea | null {
  if (!areaTitles) return null;
  const target = name.trim().toLowerCase();
  if (!target) return null;
  for (const area of GRID_AREAS) {
    const title = (areaTitles[area] ?? "").toString().trim().toLowerCase();
    if (!title) continue;
    if (title === target) return area;
  }
  for (const area of GRID_AREAS) {
    const title = (areaTitles[area] ?? "").toString().trim().toLowerCase();
    if (!title) continue;
    if (title.includes(target) || target.includes(title)) return area;
  }
  return null;
}

// Like resolveTodayWorkspace, but inherits the latest area_titles when it has
// to create a four_grid workspace — so workspace TASKS render under the right
// area names instead of blank areas. Used by the workspace-task tools.
async function ensureWorkspaceForDate(
  client: any,
  userId: string,
  dateStr: string,
): Promise<{ id: string } | null> {
  const { data: settings } = await client
    .from("user_settings")
    .select("default_workspace_type")
    .eq("user_id", userId)
    .maybeSingle();
  const wsType =
    (settings?.default_workspace_type as WorkspaceType | undefined) ?? "four_grid";

  const { data: existing } = await client
    .from("workspaces")
    .select("id")
    .eq("user_id", userId)
    .eq("date", dateStr)
    .eq("type", wsType)
    .maybeSingle();
  if (existing) return existing;

  const { data: latestWs } = await client
    .from("workspaces")
    .select("area_titles, type")
    .eq("user_id", userId)
    .eq("type", wsType)
    .not("area_titles", "is", null)
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle();
  const inheritedTitles = latestWs?.area_titles ?? {
    top_left: "左上エリア",
    top_right: "右上エリア",
    bottom_left: "左下エリア",
    bottom_right: "右下エリア",
  };

  const { data: created } = await client
    .from("workspaces")
    .insert({
      user_id: userId,
      title: dateStr,
      type: wsType,
      date: dateStr,
      area_titles: wsType === "four_grid" ? inheritedTitles : null,
    })
    .select("id")
    .single();
  return created;
}

async function ensureRoutineTemplate(
  client: any,
  userId: string,
): Promise<{ id: string } | null> {
  const { data: existing } = await client
    .from("routine_templates")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  if (existing?.id) return existing;
  const { data: created } = await client
    .from("routine_templates")
    .insert({ user_id: userId })
    .select("id")
    .single();
  return created;
}

// ── Cross-session memory (shared with the in-app AI via the user_memory table).
// Inlined (not imported from ai-chat) so mcp-server stays a single deploy unit.
const MEMORY_LIMIT = 30;

async function upsertMemoryEntry(
  client: any,
  userId: string,
  key: string,
  value: string,
): Promise<{ ok: boolean; error?: string; pruned?: string }> {
  const trimmedKey = key.trim().slice(0, 60);
  const trimmedValue = value.trim().slice(0, 300);
  if (!trimmedKey || !trimmedValue) return { ok: false, error: "key and value are required" };

  const { data: existing } = await client
    .from("user_memory")
    .select("key")
    .eq("user_id", userId)
    .eq("key", trimmedKey)
    .maybeSingle();

  let prunedKey: string | undefined;
  if (!existing) {
    const { count } = await client
      .from("user_memory")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId);
    if ((count ?? 0) >= MEMORY_LIMIT) {
      const { data: oldest } = await client
        .from("user_memory")
        .select("key")
        .eq("user_id", userId)
        .order("updated_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (oldest?.key) {
        await client.from("user_memory").delete().eq("user_id", userId).eq("key", oldest.key);
        prunedKey = oldest.key;
      }
    }
  }

  const { error } = await client
    .from("user_memory")
    .upsert({
      user_id: userId,
      key: trimmedKey,
      value: trimmedValue,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,key" });
  if (error) return { ok: false, error: error.message };
  return { ok: true, pruned: prunedKey };
}

export type ToolExecutor = (
  input: Record<string, unknown>,
  ctx: ToolContext,
) => Promise<ToolResult>;

function ok(data: unknown): ToolResult { return { ok: true, data }; }
function fail(error: string): ToolResult { return { ok: false, error }; }

// YYYY-MM-DD or YYYY-MM-DDTHH:MM (time-aware deadlines)
const DUE_DATE_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/;

const VALID_NOTIFICATION_OFFSETS = new Set(["2d", "1d", "2h", "1h"]);

function todayStringInTZ(now: Date, tz: string): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz || "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(now);
  const y = parts.find((p) => p.type === "year")?.value ?? "1970";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const d = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${y}-${m}-${d}`;
}

export const MCP_TOOL_DEFS: ToolDefinition[] = [
  {
    name: "list_goals",
    description:
      "List the user's goals. By default returns only goals whose period currently overlaps today (active goals). " +
      "Use this when the user asks about their goals or before breaking down a goal into roadmap steps.",
    inputSchema: {
      type: "object",
      properties: {
        level: {
          type: "string",
          enum: ["long_term", "yearly", "half_year", "monthly"],
          description: "Filter by level. Omit to get all levels.",
        },
        active_only: {
          type: "boolean",
          description:
            "If true (default), only return goals where today is within period_start..period_end. Set false to see all goals.",
        },
        include_completed: {
          type: "boolean",
          description: "Default false — completed goals are hidden unless this is true.",
        },
      },
    },
  },
  {
    name: "create_goal",
    description:
      "Create a new goal at the specified level. Levels and typical periods:\n" +
      "  - long_term: 5-year goal\n" +
      "  - yearly: 1-year goal (Jan 1 to Dec 31)\n" +
      "  - half_year: 6-month goal (H1=Jan-Jun, H2=Jul-Dec)\n" +
      "  - monthly: 1-month goal\n" +
      "If the user doesn't specify dates, derive sensible defaults from level and today's date. " +
      "Use parent_goal_id to link a goal to its parent (e.g. monthly goal under a half-year goal).",
    inputSchema: {
      type: "object",
      properties: {
        level: { type: "string", enum: ["long_term", "yearly", "half_year", "monthly"] },
        title: { type: "string", description: "Goal title." },
        description: { type: "string", description: "Optional detail / why / how." },
        period_start: { type: "string", description: "YYYY-MM-DD" },
        period_end: { type: "string", description: "YYYY-MM-DD" },
        parent_goal_id: { type: "string", description: "Optional id of parent goal (for hierarchy)." },
      },
      required: ["level", "title", "period_start", "period_end"],
    },
  },
  {
    name: "list_milestones",
    description:
      "List the ordered roadmap steps (milestones) for a goal. " +
      "Call this before proposing new steps to avoid duplicates.",
    inputSchema: {
      type: "object",
      properties: { goal_id: { type: "string" } },
      required: ["goal_id"],
    },
  },
  {
    name: "create_milestones_batch",
    description:
      "Create a FULL roadmap (multiple ordered steps) for a goal in one call. " +
      "Items are inserted in the order given (first item = STEP 1). " +
      "Aim for 4-7 milestones — fewer feels too sparse, more feels overwhelming. " +
      "Each milestone should be a concrete checkpoint (not a vague aspiration). " +
      "If the goal already has milestones (check list_milestones first), this APPENDS to the existing list rather than overwriting.",
    inputSchema: {
      type: "object",
      properties: {
        goal_id: { type: "string" },
        milestones: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string", description: "Concrete step." },
              description: { type: "string" },
              target_date: { type: "string", description: "YYYY-MM-DD. Optional but recommended." },
            },
            required: ["title"],
          },
        },
      },
      required: ["goal_id", "milestones"],
    },
  },
  {
    name: "update_milestone",
    description:
      "Edit a milestone. Pass any subset of fields. " +
      "Use is_completed=true to mark the step done.",
    inputSchema: {
      type: "object",
      properties: {
        milestone_id: { type: "string" },
        title: { type: "string" },
        description: { type: "string" },
        target_date: { type: "string", description: "YYYY-MM-DD, or empty string to clear." },
        is_completed: { type: "boolean" },
        sort_order: { type: "integer" },
      },
      required: ["milestone_id"],
    },
  },
  {
    name: "delete_goal",
    description:
      "DESTRUCTIVE. Permanently delete a goal. " +
      "USE A TWO-PHASE PROTOCOL: " +
      "(1) FIRST call with confirm omitted or false — this returns a preview " +
      "listing what will be deleted (the goal itself, all of its milestones, " +
      "and side-effects: child goals become orphans / linked tasks become " +
      "unlinked but NEITHER is deleted). Show the preview to the user in " +
      "natural language and explicitly ask whether to proceed. " +
      "(2) ONLY after the user has unambiguously approved in the conversation, " +
      "call again with confirm: true to actually perform the deletion. " +
      "NEVER pass confirm: true on the first invocation. NEVER pass " +
      "confirm: true based on inferred consent — the user must have said " +
      "yes (or equivalent) to deletion of THIS specific goal in the chat. " +
      "If the user is ambiguous, default to the preview phase and ask again.",
    inputSchema: {
      type: "object",
      properties: {
        goal_id: { type: "string", description: "ID of the goal to delete." },
        confirm: {
          type: "boolean",
          description:
            "Omit or pass false to get the deletion preview (default). Pass true " +
            "ONLY after the user has explicitly approved deletion of this exact " +
            "goal in the chat. Default: false.",
        },
      },
      required: ["goal_id"],
    },
  },
  {
    name: "delete_milestone",
    description:
      "DESTRUCTIVE. Permanently delete a single milestone (roadmap step). " +
      "USE A TWO-PHASE PROTOCOL: " +
      "(1) FIRST call with confirm omitted or false — this returns a preview " +
      "of the milestone that would be deleted. Show it to the user and ask " +
      "whether to proceed. " +
      "(2) ONLY after the user has unambiguously approved, call again with " +
      "confirm: true to actually delete. " +
      "NEVER pass confirm: true on the first invocation. The user must have " +
      "explicitly said yes to deleting THIS specific milestone in the chat.",
    inputSchema: {
      type: "object",
      properties: {
        milestone_id: { type: "string", description: "ID of the milestone to delete." },
        confirm: {
          type: "boolean",
          description:
            "Omit or pass false to get the deletion preview (default). Pass true " +
            "ONLY after the user has explicitly approved deletion of this exact " +
            "milestone in the chat. Default: false.",
        },
      },
      required: ["milestone_id"],
    },
  },
  // ── 課題(deadline assignments) / 共有メモ ──────────────────────────
  // IMPORTANT distinction (read get_app_guide for full rules):
  //   • ASSIGNMENT / 課題  = has a DEADLINE → shown in the app's 課題一覧
  //     (deadlines) list. Managed by list_tasks/create_task/update_task/
  //     complete_task/delete_task below.
  //   • TODAY TASK / 今日やること = no deadline → shown on the WORKSPACE grid.
  //     Managed by the *_workspace_task tools.
  {
    name: "list_tasks",
    description:
      "List the user's ASSIGNMENTS (課題) — todos that have a DUE DATE — sorted by nearest deadline. " +
      "These are the items shown in the app's 課題一覧 (deadlines) screen, grouped by deadline. " +
      "Returns course_name, repeat_rule, notification_offsets. " +
      "This does NOT return workspace 'today tasks' (those have no deadline — use list_workspace_tasks). " +
      "NOTE: day-by-day time-blocking is ToSche's own in-app AI feature — use create_schedule for explicit timed events.",
    inputSchema: {
      type: "object",
      properties: {
        include_completed: { type: "boolean", description: "Default false — completed tasks hidden unless true." },
        within_days: { type: "number", description: "Optional: only tasks due within this many days from today." },
        course_name: { type: "string", description: "Optional: filter by course/subject name (exact match)." },
      },
    },
  },
  {
    name: "create_task",
    description:
      "Create an ASSIGNMENT (課題) — a todo WITH A DEADLINE. It appears in the app's 課題一覧 (deadlines) screen. " +
      "A due_date is REQUIRED: an assignment without a deadline is rejected. " +
      "USE THIS when the user gives a 締切/deadline/期日 (e.g. '金曜までにレポート', '6/30 民法の課題'). " +
      "DO NOT use this for 'things to do today' with no deadline — for those use create_workspace_task (they belong on the workspace grid). " +
      "If it is genuinely unclear whether the user means a deadline assignment (課題) or a today task (今日やること), ASK them which before creating — do not guess. " +
      "Do NOT time-block or distribute across days here; use create_schedule for explicitly timed events.",
    inputSchema: {
      type: "object",
      properties: {
        content: { type: "string", description: "The assignment text." },
        due_date: { type: "string", description: "REQUIRED deadline. YYYY-MM-DD for date-only, or YYYY-MM-DDTHH:MM for date+time." },
        course_name: { type: "string", description: "Optional course/subject name (e.g. '数学', 'English 101')." },
        repeat_rule: { type: "string", enum: ["weekly"], description: "Optional: set to 'weekly' to auto-generate next week's instance on completion." },
        notification_offsets: { type: "string", description: "Optional: comma-separated reminder offsets. Valid values: 2d, 1d, 2h, 1h. Example: '1d,2h'." },
        target_workspace_id: { type: "string", description: "Optional: place the task in this specific workspace id (must belong to the user). Overrides default. Use list_workspaces to discover ids." },
        target_workspace_type: { type: "string", enum: ["four_grid", "individual", "note"], description: "Optional: pick today's workspace by type. Ignored if target_workspace_id is set. Defaults to user_settings.default_workspace_type." },
      },
      required: ["content"],
    },
  },
  {
    name: "list_workspaces",
    description:
      "List the user's workspaces (grids) for a given date range (default: today only). Use this to discover workspace ids and types before calling create_task with an explicit target_workspace_id. Also returns the user's default_workspace_type so the AI knows which grid the app is currently showing.",
    inputSchema: {
      type: "object",
      properties: {
        from_date: { type: "string", description: "Optional ISO date (YYYY-MM-DD). Default today." },
        to_date: { type: "string", description: "Optional ISO date (YYYY-MM-DD). Default = from_date (today only)." },
      },
    },
  },
  {
    name: "update_task",
    description:
      "Edit an existing task. Pass any subset of fields to update. " +
      "Use this to change a task's content, due date, course name, or notification settings.",
    inputSchema: {
      type: "object",
      properties: {
        task_id: { type: "string", description: "ID of the task to update." },
        content: { type: "string", description: "New task text." },
        due_date: { type: "string", description: "New deadline. YYYY-MM-DD or YYYY-MM-DDTHH:MM. Empty string to clear." },
        course_name: { type: "string", description: "Course/subject name. Empty string to clear." },
        repeat_rule: { type: "string", enum: ["weekly", ""], description: "'weekly' to enable, empty string to clear." },
        notification_offsets: { type: "string", description: "Comma-separated offsets (2d,1d,2h,1h). Empty string to clear." },
      },
      required: ["task_id"],
    },
  },
  {
    name: "complete_task",
    description:
      "Mark a task as completed (or uncomplete it). " +
      "If the task has repeat_rule='weekly' and is being completed, a new task for next week is automatically created. " +
      "Use is_completed=false to undo a completion.",
    inputSchema: {
      type: "object",
      properties: {
        task_id: { type: "string", description: "ID of the task." },
        is_completed: { type: "boolean", description: "True to complete, false to uncomplete. Default: true." },
      },
      required: ["task_id"],
    },
  },
  {
    name: "delete_task",
    description:
      "DESTRUCTIVE. Permanently delete a task. " +
      "USE A TWO-PHASE PROTOCOL: " +
      "(1) FIRST call with confirm omitted or false — this returns a preview " +
      "of the task that would be deleted. Show it to the user and ask " +
      "whether to proceed. " +
      "(2) ONLY after the user has unambiguously approved, call again with " +
      "confirm: true to actually delete. " +
      "NEVER pass confirm: true on the first invocation. The user must have " +
      "explicitly said yes to deleting THIS specific task in the chat.",
    inputSchema: {
      type: "object",
      properties: {
        task_id: { type: "string", description: "ID of the task to delete." },
        confirm: {
          type: "boolean",
          description:
            "Omit or pass false to get the deletion preview (default). Pass true " +
            "ONLY after the user has explicitly approved deletion of this exact " +
            "task in the chat. Default: false.",
        },
      },
      required: ["task_id"],
    },
  },
  {
    name: "get_shared_context",
    description:
      "Read the user's shared AI memo (the 'AI連携メモ' written in ToSche). It holds the user's prerequisites, preferences and rules. " +
      "Call this early so your goals/tasks/suggestions align with what the user wants. This memo is shared with ToSche's own AI too.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "update_shared_context",
    description:
      "Update the user's shared AI memo. Use mode 'append' (default) to add a line while preserving existing notes, or 'replace' to overwrite. " +
      "Keep it concise. Never store secrets/passwords. This memo is also read by ToSche's own AI.",
    inputSchema: {
      type: "object",
      properties: {
        content: { type: "string", description: "Text to add (append) or the full new content (replace)." },
        mode: { type: "string", enum: ["append", "replace"], description: "append (default) or replace." },
      },
      required: ["content"],
    },
  },

  // ── ワークスペース（今日やること / TODAY tasks on the grid）──────────
  {
    name: "list_workspace_areas",
    description:
      "[WORKSPACE] Get the four grid-area titles (top_left/top_right/bottom_left/bottom_right) the user named for a date. " +
      "On a four_grid workspace each area has a free-form title like '仕事'/'勉強'/'家事'/'趣味'. " +
      "Call this BEFORE create_workspace_task when the user names a category, so you map the name to the right position.",
    inputSchema: {
      type: "object",
      properties: { date: { type: "string", description: "YYYY-MM-DD. Defaults to today." } },
    },
  },
  {
    name: "list_workspace_tasks",
    description:
      "[WORKSPACE] List today's WORKSPACE tasks — the sticky-note cards on the grid the user opens in the app. " +
      "These are 'things to do today' (今日やること) and have NO deadline. Also returns area_titles. " +
      "Use this (NOT list_tasks) to see what is on the user's workspace grid.",
    inputSchema: {
      type: "object",
      properties: {
        date: { type: "string", description: "YYYY-MM-DD. Defaults to today." },
        only_incomplete: { type: "boolean", description: "If true, return only incomplete tasks." },
      },
    },
  },
  {
    name: "create_workspace_task",
    description:
      "[WORKSPACE] Create a TODAY task (今日やること) on the user's workspace grid — a sticky note with NO deadline. " +
      "USE THIS when the user wants something on their workspace / today's board, e.g. 'ワークスペースに追加', '今日やることに〜', 'add to my board'. " +
      "This is DIFFERENT from an ASSIGNMENT (課題): if the user gives a DUE DATE / 締切, use create_task instead. " +
      "If it is genuinely unclear whether they mean a today task or a deadline assignment, ASK them which — do not guess.\n\n" +
      "GRID AREA: the grid has 4 named areas. If the user names one (e.g. '仕事のエリアに', '勉強欄'), pass it as area_name and the server maps it to the right position. " +
      "If you are unsure which area, either omit area_name/grid_area (server auto-places in the emptiest area) or ask the user.",
    inputSchema: {
      type: "object",
      properties: {
        content: { type: "string", description: "What to do, e.g. '部屋の掃除'." },
        date: { type: "string", description: "YYYY-MM-DD. Defaults to today." },
        area_name: { type: "string", description: "Free-form area name as the user said it (e.g. '仕事'). Server resolves against area_titles." },
        grid_area: { type: "string", enum: ["top_left", "top_right", "bottom_left", "bottom_right"], description: "Physical position. Use only when you are SURE which the user meant." },
        reminder_at: { type: "string", description: "Optional ISO datetime for a reminder." },
        goal_id: { type: "string", description: "Optional. Link to a goal so it counts toward progress." },
      },
      required: ["content"],
    },
  },
  {
    name: "update_workspace_task",
    description:
      "[WORKSPACE] Update a workspace task. Pass any subset. To check it off as done pass is_completed=true (false to uncheck). " +
      "Pass grid_area to move it to a different area (call list_workspace_areas first if you only know the area name).",
    inputSchema: {
      type: "object",
      properties: {
        todo_id: { type: "string" },
        content: { type: "string" },
        is_completed: { type: "boolean", description: "true = checked, false = unchecked." },
        reminder_at: { type: "string", description: "ISO datetime, or empty string to clear." },
        grid_area: { type: "string", enum: ["top_left", "top_right", "bottom_left", "bottom_right"], description: "Move to this physical area." },
      },
      required: ["todo_id"],
    },
  },
  {
    name: "delete_workspace_task",
    description:
      "DESTRUCTIVE. Permanently delete a workspace task. TWO-PHASE PROTOCOL: " +
      "(1) call with confirm omitted/false to get a preview; (2) only after the user explicitly approves in chat, call again with confirm: true. " +
      "Never pass confirm: true on the first call or on inferred consent.",
    inputSchema: {
      type: "object",
      properties: {
        todo_id: { type: "string" },
        confirm: { type: "boolean", description: "Default false (preview). true only after explicit user approval." },
      },
      required: ["todo_id"],
    },
  },

  // ── スケジュール（円グラフ / 時間ブロック）──────────────────────────
  {
    name: "list_schedules",
    description:
      "[SCHEDULE] List time-blocked schedule entries for a date — the daily 0:00–24:00 timeline shown as the pie-chart schedule.",
    inputSchema: {
      type: "object",
      properties: { date: { type: "string", description: "YYYY-MM-DD. Defaults to today." } },
    },
  },
  {
    name: "create_schedule",
    description:
      "[SCHEDULE] Create a TIME-BLOCKED event on the schedule timeline / pie chart. " +
      "USE THIS ONLY when the user gives a start AND end time (or a duration), e.g. '13時から1時間', '14:00〜15:30'. " +
      "Do NOT use it for tasks without times (use create_workspace_task) and do NOT invent times the user didn't give.\n\n" +
      "COLOR (matches the in-app AI's pie-chart coloring): OMIT `color` and the server auto-picks a high-contrast color that avoids the colors of overlapping/neighboring events and spreads variety across the day. Pass a hex color only when the user requests a specific one.\n\n" +
      "CONFLICT: by default this checks for overlaps. On conflict it returns ok=true with data.conflict=true and data.choices (4 options). When that happens, present the 4 options to the user and WAIT — do not call other tools. After they choose, call create_schedule again with force=true, or delete_schedule the existing entry first, per their choice.",
    inputSchema: {
      type: "object",
      properties: {
        date: { type: "string", description: "YYYY-MM-DD. Defaults to today." },
        title: { type: "string", description: "Event title, e.g. 'ジム'." },
        start_minutes: { type: "integer", description: "Minutes from midnight. 0–1439 (13:00 = 780). INTEGER." },
        end_minutes: { type: "integer", description: "Minutes from midnight. 1–1440 (1440 = 24:00). Must be > start_minutes. Split midnight-crossing events into two." },
        color: { type: "string", description: "Optional hex like '#E8654A'. OMIT to auto-color (recommended)." },
        force: { type: "boolean", description: "Skip conflict detection. Use only after the user explicitly chose to allow the overlap." },
      },
      required: ["title", "start_minutes", "end_minutes"],
    },
  },
  {
    name: "update_schedule",
    description:
      "[SCHEDULE] Edit a schedule entry (move / retitle / recolor). Pass any subset; pass new start_minutes/end_minutes to move it.",
    inputSchema: {
      type: "object",
      properties: {
        schedule_id: { type: "string" },
        title: { type: "string" },
        start_minutes: { type: "integer" },
        end_minutes: { type: "integer" },
        color: { type: "string" },
        date: { type: "string", description: "YYYY-MM-DD to move to another day." },
      },
      required: ["schedule_id"],
    },
  },
  {
    name: "delete_schedule",
    description:
      "DESTRUCTIVE. Permanently delete a schedule entry. TWO-PHASE PROTOCOL: " +
      "(1) confirm omitted/false → preview; (2) confirm: true only after the user explicitly approves. " +
      "Exception: when executing option (a) of a create_schedule conflict (replace the existing entry), you may delete then create with force=true.",
    inputSchema: {
      type: "object",
      properties: {
        schedule_id: { type: "string" },
        confirm: { type: "boolean", description: "Default false (preview). true only after explicit user approval." },
      },
      required: ["schedule_id"],
    },
  },

  // ── ルーティン（朝/昼/夜の習慣チェックリスト）──────────────────────
  {
    name: "list_routine_for_date",
    description:
      "[ROUTINE] List the user's routine items for a date, grouped by slot (morning/daytime/evening). " +
      "Includes permanent template items + today-only items, each with is_completed for that date.",
    inputSchema: {
      type: "object",
      properties: { date: { type: "string", description: "YYYY-MM-DD. Defaults to today." } },
    },
  },
  {
    name: "list_routine_template",
    description:
      "[ROUTINE] List the PERMANENT routine template items (the ones that recur every day). Excludes today-only items.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "add_routine_item",
    description:
      "[ROUTINE] Add a routine item. OMIT today_only_date for a PERMANENT item that recurs every day; " +
      "SET today_only_date=YYYY-MM-DD for a one-off that appears only on that date ('今日だけ'/'明日だけ'). " +
      "slot must be one of morning / daytime / evening.",
    inputSchema: {
      type: "object",
      properties: {
        slot: { type: "string", enum: ["morning", "daytime", "evening"] },
        title: { type: "string", description: "What the routine is, e.g. '英単語15分'." },
        short_label: { type: "string", description: "Optional short label." },
        today_only_date: { type: "string", description: "YYYY-MM-DD for a one-off; omit for a permanent template item." },
      },
      required: ["slot", "title"],
    },
  },
  {
    name: "update_routine_item",
    description:
      "[ROUTINE] Update a routine item. Pass any subset. Use is_active=false to soft-disable without deleting.",
    inputSchema: {
      type: "object",
      properties: {
        item_id: { type: "string" },
        title: { type: "string" },
        short_label: { type: "string" },
        slot: { type: "string", enum: ["morning", "daytime", "evening"] },
        is_active: { type: "boolean" },
      },
      required: ["item_id"],
    },
  },
  {
    name: "delete_routine_item",
    description:
      "DESTRUCTIVE. Permanently delete a routine item (template OR today-only). TWO-PHASE PROTOCOL: " +
      "(1) confirm omitted/false → preview; (2) confirm: true only after the user explicitly approves.",
    inputSchema: {
      type: "object",
      properties: {
        item_id: { type: "string" },
        confirm: { type: "boolean", description: "Default false (preview). true only after explicit user approval." },
      },
      required: ["item_id"],
    },
  },
  {
    name: "toggle_routine_completion",
    description:
      "[ROUTINE] Check (completed=true) or uncheck (completed=false) a routine item for a specific date.",
    inputSchema: {
      type: "object",
      properties: {
        item_id: { type: "string" },
        date: { type: "string", description: "YYYY-MM-DD. Defaults to today." },
        completed: { type: "boolean", description: "true = check, false = uncheck." },
      },
      required: ["item_id", "completed"],
    },
  },

  // ── メタ（接続情報 / 機能ガイド / 永続メモ）──────────────────────────
  {
    name: "whoami",
    description:
      "Return the connected ToSche account context: email (if available), preferred_language, default_workspace_type, " +
      "today's workspaces (grids) with their ids and types, and the active workspace id. " +
      "Call this to confirm which account/grid you are operating on, or to discover workspace ids.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_app_guide",
    description:
      "Return a structured guide to ALL ToSche features (workspace tasks, deadline assignments/課題, schedule pie-chart, routines, goals) " +
      "and exactly how to operate each via these MCP tools — including the decision rule for TASK (workspace) vs 課題 (deadline). " +
      "Call this when the user asks how ToSche works, how to use a feature (e.g. 'ルーティンってどう作るの？'), or whenever you need to explain ToSche's capabilities accurately.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "remember",
    description:
      "Save a small, durable fact about the user that should affect FUTURE conversations (cross-session memory). " +
      "This memory is SHARED with ToSche's own in-app AI. Use it for genuinely persistent preferences/habits, NOT transient request details. " +
      "GOOD: color preferences (key 'color:gym' value '#F5A623'), '平日午前は会議を入れない', '簡潔な日本語を好む'. " +
      "BAD: '今日タスクを追加した' (transient), a one-off 13:00 meeting (that's a schedule). " +
      "Limit: " + String(MEMORY_LIMIT) + " entries (oldest evicted). Reuse the same key to UPDATE. key: snake_case ≤60 chars. value: ≤300 chars.",
    inputSchema: {
      type: "object",
      properties: {
        key: { type: "string", description: "Stable snake_case identifier, e.g. 'study_focus', 'color:meeting'." },
        value: { type: "string", description: "The fact, in the user's language, ≤300 chars." },
      },
      required: ["key", "value"],
    },
  },
  {
    name: "forget",
    description: "Remove a previously remembered fact by key. Use when the user says it's no longer accurate.",
    inputSchema: {
      type: "object",
      properties: { key: { type: "string" } },
      required: ["key"],
    },
  },
  {
    name: "list_memory",
    description: "List currently remembered facts (key/value/updated_at). Useful before forgetting or to confirm what is stored.",
    inputSchema: { type: "object", properties: {} },
  },
];

export const MCP_TOOL_EXECUTORS: Record<string, ToolExecutor> = {
  list_tasks: async (input, ctx) => {
    const today = todayStringInTZ(ctx.now, "Asia/Tokyo");
    const includeCompleted = (input.include_completed as boolean) === true;
    let q = ctx.adminClient
      .from("todos")
      .select("id, content, due_date, is_completed, completed_at, workspace_id, course_name, repeat_rule, notification_offsets, goal_id")
      .eq("user_id", ctx.userId)
      .not("due_date", "is", null)
      .order("due_date", { ascending: true });
    if (!includeCompleted) q = q.eq("is_completed", false);
    if (typeof input.within_days === "number" && input.within_days >= 0) {
      const end = new Date(ctx.now.getTime() + input.within_days * 86400000);
      q = q.lte("due_date", todayStringInTZ(end, "Asia/Tokyo"));
    }
    if (typeof input.course_name === "string" && input.course_name) {
      q = q.eq("course_name", input.course_name);
    }
    const { data, error } = await q;
    if (error) return fail(error.message);
    return ok({ today, tasks: data });
  },

  list_workspaces: async (input, ctx) => {
    const today = todayStringInTZ(ctx.now, "Asia/Tokyo");
    const fromDate = (input.from_date as string | undefined) || today;
    const toDate = (input.to_date as string | undefined) || fromDate;
    if (!DUE_DATE_RE.test(fromDate)) return fail("from_date must be YYYY-MM-DD");
    if (!DUE_DATE_RE.test(toDate)) return fail("to_date must be YYYY-MM-DD");
    const { data: wsList, error: wErr } = await ctx.adminClient
      .from("workspaces")
      .select("id, date, type, title")
      .eq("user_id", ctx.userId)
      .gte("date", fromDate)
      .lte("date", toDate)
      .order("date", { ascending: true });
    if (wErr) return fail(wErr.message);
    const { data: settings } = await ctx.adminClient
      .from("user_settings")
      .select("default_workspace_type")
      .eq("user_id", ctx.userId)
      .maybeSingle();
    const defaultType = settings?.default_workspace_type ?? "four_grid";
    // Mark which workspace is the "active" one for today.
    const active = (wsList ?? []).find(
      (w: any) => w.date === today && w.type === defaultType,
    );
    return ok({
      today,
      default_workspace_type: defaultType,
      active_workspace_id: active?.id ?? null,
      workspaces: wsList ?? [],
    });
  },

  create_task: async (input, ctx) => {
    const content = (input.content as string)?.trim();
    if (!content) return fail("content is required");
    const dueDate = (input.due_date as string | undefined) || null;
    if (!dueDate) {
      // An assignment (課題) is defined by its deadline. Without one it would
      // be invisible in 課題一覧 AND (lacking a grid_area) on the workspace —
      // the exact orphan bug we are fixing. Steer the caller instead.
      return fail(
        "create_task is for ASSIGNMENTS (課題) and requires a due_date. " +
        "If the user gave no deadline and this is a 'today task', call create_workspace_task instead. " +
        "If it should be an assignment, ask the user for the deadline and pass due_date.",
      );
    }
    if (!DUE_DATE_RE.test(dueDate)) {
      return fail("due_date must be YYYY-MM-DD or YYYY-MM-DDTHH:MM");
    }
    const courseName = (input.course_name as string | undefined)?.trim() || null;
    const repeatRule = (input.repeat_rule as string | undefined) || null;
    if (repeatRule && repeatRule !== "weekly") {
      return fail("repeat_rule must be 'weekly' or omitted");
    }
    const rawOffsets = (input.notification_offsets as string | undefined)?.trim() || null;
    if (rawOffsets) {
      const parts = rawOffsets.split(",").map((s) => s.trim());
      if (parts.some((p) => !VALID_NOTIFICATION_OFFSETS.has(p))) {
        return fail("notification_offsets values must be from: 2d, 1d, 2h, 1h");
      }
    }
    const today = todayStringInTZ(ctx.now, "Asia/Tokyo");
    // Fix (2026-06-21): resolve workspace by user's default_workspace_type
    // so MCP-created tasks appear in the same grid the app is showing.
    const targetWorkspaceId =
      (input.target_workspace_id as string | undefined) || null;
    const targetType =
      (input.target_workspace_type as WorkspaceType | undefined) || null;
    const wsResult = await resolveTodayWorkspace(
      ctx.adminClient,
      ctx.userId,
      today,
      { targetWorkspaceId, targetType },
    );
    if (wsResult.ok === false) return fail(wsResult.error);
    const row: Record<string, unknown> = {
      user_id: ctx.userId,
      workspace_id: wsResult.workspaceId,
      content,
      due_date: dueDate,
      is_completed: false,
      course_name: courseName,
      repeat_rule: repeatRule,
      notification_offsets: rawOffsets,
    };
    const { data, error } = await ctx.adminClient
      .from("todos")
      .insert(row)
      .select("id, content, due_date, workspace_id, course_name, repeat_rule, notification_offsets")
      .single();
    if (error) return fail(error.message);
    return ok({ task: data });
  },

  update_task: async (input, ctx) => {
    const taskId = input.task_id as string;
    if (!taskId) return fail("task_id is required");

    const patch: Record<string, unknown> = {};
    if (typeof input.content === "string") {
      const c = (input.content as string).trim();
      if (!c) return fail("content cannot be empty");
      patch.content = c;
    }
    if (typeof input.due_date === "string") {
      if (input.due_date === "") {
        patch.due_date = null;
      } else {
        if (!DUE_DATE_RE.test(input.due_date as string)) {
          return fail("due_date must be YYYY-MM-DD or YYYY-MM-DDTHH:MM");
        }
        patch.due_date = input.due_date;
      }
    }
    if (typeof input.course_name === "string") {
      patch.course_name = (input.course_name as string).trim() === "" ? null : (input.course_name as string).trim();
    }
    if (typeof input.repeat_rule === "string") {
      if (input.repeat_rule === "") {
        patch.repeat_rule = null;
      } else if (input.repeat_rule === "weekly") {
        patch.repeat_rule = "weekly";
      } else {
        return fail("repeat_rule must be 'weekly' or empty string to clear");
      }
    }
    if (typeof input.notification_offsets === "string") {
      if ((input.notification_offsets as string).trim() === "") {
        patch.notification_offsets = null;
      } else {
        const parts = (input.notification_offsets as string).split(",").map((s) => s.trim());
        if (parts.some((p) => !VALID_NOTIFICATION_OFFSETS.has(p))) {
          return fail("notification_offsets values must be from: 2d, 1d, 2h, 1h");
        }
        patch.notification_offsets = parts.join(",");
      }
    }
    if (Object.keys(patch).length === 0) return fail("Nothing to update");

    const { data, error } = await ctx.adminClient
      .from("todos")
      .update(patch)
      .eq("id", taskId)
      .eq("user_id", ctx.userId)
      .select("id, content, due_date, is_completed, course_name, repeat_rule, notification_offsets")
      .maybeSingle();
    if (error) return fail(error.message);
    if (!data) return fail("Task not found or not owned by you");
    return ok({ task: data });
  },

  complete_task: async (input, ctx) => {
    const taskId = input.task_id as string;
    if (!taskId) return fail("task_id is required");
    const shouldComplete = (input.is_completed as boolean) !== false;

    const { data: task, error: fetchErr } = await ctx.adminClient
      .from("todos")
      .select("id, content, due_date, is_completed, workspace_id, course_name, repeat_rule, notification_offsets")
      .eq("id", taskId)
      .eq("user_id", ctx.userId)
      .maybeSingle();
    if (fetchErr) return fail(fetchErr.message);
    if (!task) return fail("Task not found or not owned by you");

    const updatePatch: Record<string, unknown> = {
      is_completed: shouldComplete,
      completed_at: shouldComplete ? new Date().toISOString() : null,
    };
    const { error: updateErr } = await ctx.adminClient
      .from("todos")
      .update(updatePatch)
      .eq("id", taskId)
      .eq("user_id", ctx.userId);
    if (updateErr) return fail(updateErr.message);

    let nextTask = null;
    if (shouldComplete && task.repeat_rule === "weekly" && task.due_date) {
      const dateOnly = String(task.due_date).slice(0, 10);
      const timePart = String(task.due_date).length > 10 ? String(task.due_date).slice(10) : "";
      const d = new Date(dateOnly + "T00:00:00");
      d.setDate(d.getDate() + 7);
      const nextDate = d.toISOString().slice(0, 10) + timePart;

      const today = todayStringInTZ(ctx.now, "Asia/Tokyo");
      // Use shared helper so the weekly-recurring task lands in the same
      // grid the user sees (Fix 2026-06-21).
      const wsResult = await resolveTodayWorkspace(
        ctx.adminClient,
        ctx.userId,
        today,
      );
      if (wsResult.ok === false) return fail(wsResult.error);
      const { data: newTask, error: createErr } = await ctx.adminClient
        .from("todos")
        .insert({
          user_id: ctx.userId,
          workspace_id: wsResult.workspaceId,
          content: task.content,
          due_date: nextDate,
          is_completed: false,
          course_name: task.course_name,
          repeat_rule: task.repeat_rule,
          notification_offsets: task.notification_offsets,
        })
        .select("id, content, due_date, course_name, repeat_rule")
        .single();
      if (!createErr && newTask) nextTask = newTask;
    }

    return ok({
      task: { id: task.id, content: task.content, is_completed: shouldComplete },
      ...(nextTask ? { next_weekly_task: nextTask } : {}),
    });
  },

  delete_task: async (input, ctx) => {
    const taskId = input.task_id as string;
    if (!taskId) return fail("task_id is required");
    const confirmed = input.confirm === true;

    const { data: task, error: fetchErr } = await ctx.adminClient
      .from("todos")
      .select("id, content, due_date, is_completed, course_name, repeat_rule, notification_offsets, workspace_id")
      .eq("id", taskId)
      .eq("user_id", ctx.userId)
      .maybeSingle();
    if (fetchErr) return fail(fetchErr.message);
    if (!task) return fail("Task not found or not owned by you");

    const preview = {
      task: {
        id: task.id,
        content: task.content,
        due_date: task.due_date,
        is_completed: task.is_completed,
        course_name: task.course_name,
        repeat_rule: task.repeat_rule,
      },
    };

    if (!confirmed) {
      return ok({
        phase: "preview",
        preview,
        next_step:
          "Show this task to the user and ask whether to delete it. " +
          "Only call delete_task again with confirm: true after they approve.",
      });
    }

    const { error: delErr } = await ctx.adminClient
      .from("todos")
      .delete()
      .eq("id", taskId)
      .eq("user_id", ctx.userId);
    if (delErr) return fail(delErr.message);

    return ok({
      phase: "deleted",
      deleted_task: preview.task,
    });
  },

  get_shared_context: async (_input, ctx) => {
    const { data, error } = await ctx.adminClient
      .from("ai_shared_context")
      .select("content, updated_at")
      .eq("user_id", ctx.userId)
      .maybeSingle();
    if (error) return fail(error.message);
    return ok({ content: data?.content ?? "", updated_at: data?.updated_at ?? null });
  },

  update_shared_context: async (input, ctx) => {
    const text = ((input.content as string) ?? "").trim();
    if (!text) return fail("content is required");
    const mode = (input.mode as string) === "replace" ? "replace" : "append";
    const existing = (await ctx.adminClient
      .from("ai_shared_context")
      .select("content")
      .eq("user_id", ctx.userId)
      .maybeSingle()).data;
    const prev = ((existing?.content as string) ?? "").trim();
    let next = mode === "replace" ? text : (prev ? `${prev}\n${text}` : text);
    if (next.length > 4000) next = next.slice(0, 4000);
    const { error } = await ctx.adminClient
      .from("ai_shared_context")
      .upsert({ user_id: ctx.userId, content: next, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    if (error) return fail(error.message);
    return ok({ ok: true, content: next });
  },

  list_goals: async (input, ctx) => {
    const today = todayStringInTZ(ctx.now, "Asia/Tokyo");
    const level = input.level as string | undefined;
    const activeOnly = (input.active_only as boolean) !== false;
    const includeCompleted = (input.include_completed as boolean) === true;

    let q = ctx.adminClient
      .from("goals")
      .select("id, level, parent_id, title, description, period_start, period_end, is_completed, sort_order")
      .eq("user_id", ctx.userId)
      .order("level", { ascending: true })
      .order("period_start", { ascending: true })
      .order("sort_order", { ascending: true });

    if (level) q = q.eq("level", level);
    if (activeOnly) q = q.lte("period_start", today).gte("period_end", today);
    if (!includeCompleted) q = q.eq("is_completed", false);

    const { data, error } = await q;
    if (error) return fail(error.message);
    return ok({ goals: data, today });
  },

  create_goal: async (input, ctx) => {
    const level = input.level as string;
    const title = (input.title as string)?.trim();
    const periodStart = input.period_start as string;
    const periodEnd = input.period_end as string;
    if (!["long_term", "yearly", "half_year", "monthly"].includes(level)) {
      return fail("level must be one of long_term/yearly/half_year/monthly");
    }
    if (!title) return fail("title is required");
    if (!periodStart || !periodEnd) {
      return fail("period_start and period_end are required (YYYY-MM-DD)");
    }
    if (periodEnd < periodStart) return fail("period_end must be >= period_start");

    const description = (input.description as string | undefined) || null;
    const parentGoalId = (input.parent_goal_id as string | undefined) || null;

    const { data, error } = await ctx.adminClient
      .from("goals")
      .insert({
        user_id: ctx.userId,
        level,
        parent_id: parentGoalId,
        title,
        description,
        period_start: periodStart,
        period_end: periodEnd,
      })
      .select("id, level, title, period_start, period_end, parent_id")
      .single();
    if (error) return fail(error.message);
    return ok({ goal: data });
  },

  list_milestones: async (input, ctx) => {
    const goalId = input.goal_id as string;
    if (!goalId) return fail("goal_id is required");
    const { data, error } = await ctx.adminClient
      .from("goal_milestones")
      .select("id, title, description, sort_order, target_date, is_completed")
      .eq("goal_id", goalId)
      .eq("user_id", ctx.userId)
      .order("sort_order", { ascending: true });
    if (error) return fail(error.message);
    return ok({ goal_id: goalId, milestones: data });
  },

  create_milestones_batch: async (input, ctx) => {
    const goalId = input.goal_id as string;
    if (!goalId) return fail("goal_id is required");

    const { data: ownerCheck } = await ctx.adminClient
      .from("goals")
      .select("id")
      .eq("id", goalId)
      .eq("user_id", ctx.userId)
      .maybeSingle();
    if (!ownerCheck) return fail("Goal not found or not owned by you");

    const raw = input.milestones;
    if (!Array.isArray(raw) || raw.length === 0) {
      return fail("milestones must be a non-empty array");
    }
    if (raw.length > 15) return fail("Too many milestones in one batch (max 15)");

    const { data: last } = await ctx.adminClient
      .from("goal_milestones")
      .select("sort_order")
      .eq("goal_id", goalId)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    const baseOrder = ((last?.sort_order as number) ?? -1) + 1;

    const rows = raw.map((m: any, idx: number) => {
      const title = String(m?.title ?? "").trim();
      if (!title) return null;
      return {
        user_id: ctx.userId,
        goal_id: goalId,
        title,
        description: m?.description ? String(m.description).trim() : null,
        target_date: m?.target_date ? String(m.target_date) : null,
        sort_order: baseOrder + idx,
      };
    }).filter(Boolean);

    if (rows.length === 0) return fail("No valid milestones provided");

    const { data, error } = await ctx.adminClient
      .from("goal_milestones")
      .insert(rows)
      .select("id, title, sort_order, target_date");
    if (error) return fail(error.message);
    return ok({ goal_id: goalId, created: data, count: rows.length });
  },

  update_milestone: async (input, ctx) => {
    const id = input.milestone_id as string;
    if (!id) return fail("milestone_id is required");

    const patch: Record<string, unknown> = {};
    if (typeof input.title === "string") patch.title = input.title.trim();
    if (typeof input.description === "string") {
      patch.description = input.description.trim() === "" ? null : input.description.trim();
    }
    if (typeof input.target_date === "string") {
      patch.target_date = input.target_date === "" ? null : input.target_date;
    }
    if (typeof input.is_completed === "boolean") {
      patch.is_completed = input.is_completed;
      patch.completed_at = input.is_completed ? new Date().toISOString() : null;
    }
    if (typeof input.sort_order === "number") patch.sort_order = input.sort_order;
    if (Object.keys(patch).length === 0) return fail("Nothing to update");
    patch.updated_at = new Date().toISOString();

    const { data, error } = await ctx.adminClient
      .from("goal_milestones")
      .update(patch)
      .eq("id", id)
      .eq("user_id", ctx.userId)
      .select("id, title, is_completed, target_date, sort_order")
      .maybeSingle();
    if (error) return fail(error.message);
    if (!data) return fail("Milestone not found");
    return ok({ milestone: data });
  },

  delete_goal: async (input, ctx) => {
    const goalId = input.goal_id as string;
    if (!goalId) return fail("goal_id is required");
    const confirmed = input.confirm === true;

    // Fetch the goal + its impact footprint in one round-trip pattern.
    // RLS: scope every query to ctx.userId so a delete preview never leaks
    // info about someone else's data even if a wrong id is passed.
    const { data: goal, error: goalErr } = await ctx.adminClient
      .from("goals")
      .select("id, level, title, period_start, period_end, parent_id, is_completed")
      .eq("id", goalId)
      .eq("user_id", ctx.userId)
      .maybeSingle();
    if (goalErr) return fail(goalErr.message);
    if (!goal) return fail("Goal not found or not owned by you");

    // Count related rows so the preview can describe the blast radius.
    const [milestonesRes, childrenRes, todosRes] = await Promise.all([
      ctx.adminClient
        .from("goal_milestones")
        .select("id, title", { count: "exact" })
        .eq("goal_id", goalId)
        .eq("user_id", ctx.userId),
      ctx.adminClient
        .from("goals")
        .select("id, level, title", { count: "exact" })
        .eq("parent_id", goalId)
        .eq("user_id", ctx.userId),
      ctx.adminClient
        .from("todos")
        .select("id", { count: "exact", head: true })
        .eq("goal_id", goalId)
        .eq("user_id", ctx.userId),
    ]);

    const milestones = (milestonesRes.data ?? []) as { id: string; title: string }[];
    const children = (childrenRes.data ?? []) as { id: string; level: string; title: string }[];
    const milestonesCount = milestonesRes.count ?? milestones.length;
    const childrenCount = childrenRes.count ?? children.length;
    const todosCount = todosRes.count ?? 0;

    const preview = {
      goal: {
        id: goal.id,
        level: goal.level,
        title: goal.title,
        period_start: goal.period_start,
        period_end: goal.period_end,
        is_completed: goal.is_completed,
      },
      will_delete: {
        // Cascaded by foreign key (goal_milestones.goal_id ON DELETE CASCADE).
        milestones_count: milestonesCount,
        milestones_sample: milestones.slice(0, 5).map((m) => ({ id: m.id, title: m.title })),
      },
      will_unlink_but_keep: {
        // goals.parent_id ON DELETE SET NULL — child goals survive as orphans.
        child_goals_count: childrenCount,
        child_goals_sample: children
          .slice(0, 5)
          .map((c) => ({ id: c.id, level: c.level, title: c.title })),
        // todos.goal_id ON DELETE SET NULL — tasks survive, just lose the link.
        linked_todos_count: todosCount,
      },
    };

    if (!confirmed) {
      return ok({
        phase: "preview",
        preview,
        next_step:
          "Show the preview to the user in natural language and ask whether to proceed. " +
          "Only call delete_goal again with confirm: true after they explicitly approve " +
          "deletion of this specific goal.",
      });
    }

    // Phase 2: actually delete. Milestones cascade automatically.
    const { error: delErr } = await ctx.adminClient
      .from("goals")
      .delete()
      .eq("id", goalId)
      .eq("user_id", ctx.userId);
    if (delErr) return fail(delErr.message);

    return ok({
      phase: "deleted",
      deleted_goal: preview.goal,
      cascaded: {
        milestones_deleted: milestonesCount,
      },
      side_effects: {
        child_goals_orphaned: childrenCount,
        todos_unlinked: todosCount,
      },
    });
  },

  delete_milestone: async (input, ctx) => {
    const milestoneId = input.milestone_id as string;
    if (!milestoneId) return fail("milestone_id is required");
    const confirmed = input.confirm === true;

    const { data: milestone, error: msErr } = await ctx.adminClient
      .from("goal_milestones")
      .select("id, goal_id, title, target_date, is_completed, sort_order")
      .eq("id", milestoneId)
      .eq("user_id", ctx.userId)
      .maybeSingle();
    if (msErr) return fail(msErr.message);
    if (!milestone) return fail("Milestone not found or not owned by you");

    const preview = {
      milestone: {
        id: milestone.id,
        goal_id: milestone.goal_id,
        title: milestone.title,
        target_date: milestone.target_date,
        is_completed: milestone.is_completed,
        sort_order: milestone.sort_order,
      },
    };

    if (!confirmed) {
      return ok({
        phase: "preview",
        preview,
        next_step:
          "Show this milestone to the user and ask whether to delete it. " +
          "Only call delete_milestone again with confirm: true after they approve.",
      });
    }

    const { error: delErr } = await ctx.adminClient
      .from("goal_milestones")
      .delete()
      .eq("id", milestoneId)
      .eq("user_id", ctx.userId);
    if (delErr) return fail(delErr.message);

    return ok({
      phase: "deleted",
      deleted_milestone: preview.milestone,
    });
  },

  // ── ワークスペース（今日やること）─────────────────────────────────
  list_workspace_areas: async (input, ctx) => {
    const tz = "Asia/Tokyo";
    const date = (input.date as string) || todayStringInTZ(ctx.now, tz);
    const ws = await ensureWorkspaceForDate(ctx.adminClient, ctx.userId, date);
    if (!ws) return fail("Failed to ensure workspace for date " + date);
    const { data: meta } = await ctx.adminClient
      .from("workspaces")
      .select("id, type, area_titles")
      .eq("id", ws.id)
      .maybeSingle();
    return ok({
      date,
      workspace_id: meta?.id,
      type: meta?.type,
      area_titles: meta?.area_titles ?? null,
    });
  },

  list_workspace_tasks: async (input, ctx) => {
    const tz = "Asia/Tokyo";
    const date = (input.date as string) || todayStringInTZ(ctx.now, tz);
    const onlyIncomplete = (input.only_incomplete as boolean) === true;

    const { data: settings } = await ctx.adminClient
      .from("user_settings")
      .select("default_workspace_type")
      .eq("user_id", ctx.userId)
      .maybeSingle();
    const wsType =
      (settings?.default_workspace_type as WorkspaceType | undefined) ?? "four_grid";

    const { data: ws } = await ctx.adminClient
      .from("workspaces")
      .select("id, type, area_titles")
      .eq("user_id", ctx.userId)
      .eq("date", date)
      .eq("type", wsType)
      .maybeSingle();
    if (!ws) return ok({ date, tasks: [], workspace_type: wsType, area_titles: null });

    let q = ctx.adminClient
      .from("todos")
      .select("id, content, is_completed, grid_area, reminder_at, due_date")
      .eq("user_id", ctx.userId)
      .eq("workspace_id", ws.id)
      .order("order", { ascending: true });
    if (onlyIncomplete) q = q.eq("is_completed", false);

    const { data: todos, error } = await q;
    if (error) return fail(error.message);
    return ok({
      date,
      tasks: todos,
      workspace_type: ws.type,
      area_titles: ws.area_titles ?? null,
    });
  },

  create_workspace_task: async (input, ctx) => {
    const tz = "Asia/Tokyo";
    const content = (input.content as string)?.trim();
    if (!content) return fail("content is required");

    const date = (input.date as string) || todayStringInTZ(ctx.now, tz);
    let gridArea = input.grid_area as GridArea | undefined;
    const areaName = (input.area_name as string | undefined)?.trim();
    const reminderAt = input.reminder_at as string | undefined;

    const ws = await ensureWorkspaceForDate(ctx.adminClient, ctx.userId, date);
    if (!ws) return fail("Failed to ensure workspace for date " + date);

    const { data: workspaceMeta } = await ctx.adminClient
      .from("workspaces")
      .select("type, area_titles")
      .eq("id", ws.id)
      .maybeSingle();
    const areaTitles = workspaceMeta?.area_titles ?? null;

    // Map a user-spoken area name → physical grid position.
    if (workspaceMeta?.type === "four_grid" && areaName && !gridArea) {
      const matched = resolveGridAreaByName(areaName, areaTitles);
      if (!matched) {
        const titlesDesc = areaTitles
          ? Object.entries(areaTitles).map(([k, v]) => `${k}=「${v}」`).join(", ")
          : "(area_titles unset)";
        return fail(
          `area_name "${areaName}" did not match any workspace area title. Current titles: ${titlesDesc}. ` +
          "Ask the user which area they meant, or pass grid_area directly.",
        );
      }
      gridArea = matched;
    }

    // four_grid renders todos by grid_area — a null grid_area is invisible.
    // Auto-assign the emptiest area so AI-created tasks always show up.
    if (workspaceMeta?.type === "four_grid" && !gridArea) {
      const { data: allTodos } = await ctx.adminClient
        .from("todos")
        .select("grid_area")
        .eq("workspace_id", ws.id);
      const counts: Record<GridArea, number> = {
        top_left: 0, top_right: 0, bottom_left: 0, bottom_right: 0,
      };
      for (const t of allTodos ?? []) {
        if (t.grid_area && counts[t.grid_area as GridArea] !== undefined) {
          counts[t.grid_area as GridArea]++;
        }
      }
      gridArea = GRID_AREAS.reduce((a, b) => (counts[a] <= counts[b] ? a : b));
    }

    const { data: existing } = await ctx.adminClient
      .from("todos")
      .select("\"order\"")
      .eq("workspace_id", ws.id)
      .order("order", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextOrder = ((existing?.order as number) ?? -1) + 1;
    const goalId = (input.goal_id as string | undefined) || null;

    const { data: created, error } = await ctx.adminClient
      .from("todos")
      .insert({
        user_id: ctx.userId,
        workspace_id: ws.id,
        content,
        grid_area: gridArea ?? null,
        order: nextOrder,
        reminder_at: reminderAt || null,
        goal_id: goalId,
      })
      .select("id, content, grid_area, reminder_at, goal_id")
      .single();
    if (error) return fail(error.message);
    const areaTitleUsed = gridArea && areaTitles ? (areaTitles as any)[gridArea] ?? null : null;
    return ok({ task: created, date, where: "workspace", area_title_used: areaTitleUsed });
  },

  update_workspace_task: async (input, ctx) => {
    const todoId = input.todo_id as string;
    if (!todoId) return fail("todo_id is required");

    const patch: Record<string, unknown> = {};
    if (typeof input.content === "string") {
      const c = (input.content as string).trim();
      if (!c) return fail("content cannot be empty");
      patch.content = c;
    }
    if (typeof input.is_completed === "boolean") {
      patch.is_completed = input.is_completed;
      patch.completed_at = input.is_completed ? new Date().toISOString() : null;
    }
    if (typeof input.reminder_at === "string") {
      patch.reminder_at = input.reminder_at === "" ? null : input.reminder_at;
    }
    if (typeof input.grid_area === "string") {
      if (!(GRID_AREAS as readonly string[]).includes(input.grid_area)) {
        return fail("grid_area must be one of top_left/top_right/bottom_left/bottom_right");
      }
      patch.grid_area = input.grid_area;
    }
    if (Object.keys(patch).length === 0) return fail("Nothing to update");

    const { data, error } = await ctx.adminClient
      .from("todos")
      .update(patch)
      .eq("id", todoId)
      .eq("user_id", ctx.userId)
      .select("id, content, is_completed, reminder_at, grid_area")
      .maybeSingle();
    if (error) return fail(error.message);
    if (!data) return fail("Workspace task not found or not owned by you");
    return ok({ task: data });
  },

  delete_workspace_task: async (input, ctx) => {
    const todoId = input.todo_id as string;
    if (!todoId) return fail("todo_id is required");
    const confirmed = input.confirm === true;

    const { data: task, error: fetchErr } = await ctx.adminClient
      .from("todos")
      .select("id, content, grid_area, is_completed, due_date")
      .eq("id", todoId)
      .eq("user_id", ctx.userId)
      .maybeSingle();
    if (fetchErr) return fail(fetchErr.message);
    if (!task) return fail("Workspace task not found or not owned by you");

    const preview = { task };
    if (!confirmed) {
      return ok({
        phase: "preview",
        preview,
        next_step:
          "Show this task to the user and ask whether to delete it. " +
          "Only call delete_workspace_task again with confirm: true after they approve.",
      });
    }
    const { error: delErr } = await ctx.adminClient
      .from("todos")
      .delete()
      .eq("id", todoId)
      .eq("user_id", ctx.userId);
    if (delErr) return fail(delErr.message);
    return ok({ phase: "deleted", deleted_task: task });
  },

  // ── スケジュール（円グラフ / 時間ブロック）──────────────────────────
  list_schedules: async (input, ctx) => {
    const tz = "Asia/Tokyo";
    const date = (input.date as string) || todayStringInTZ(ctx.now, tz);
    const { data, error } = await ctx.adminClient
      .from("schedules")
      .select("id, title, start_minutes, end_minutes, color")
      .eq("user_id", ctx.userId)
      .eq("date", date)
      .order("start_minutes", { ascending: true });
    if (error) return fail(error.message);
    return ok({ date, schedules: data });
  },

  create_schedule: async (input, ctx) => {
    const tz = "Asia/Tokyo";
    const date = (input.date as string) || todayStringInTZ(ctx.now, tz);
    const title = (input.title as string)?.trim() || "(無題)";
    const start = Number(input.start_minutes);
    const end = Number(input.end_minutes);

    if (!Number.isFinite(start) || !Number.isFinite(end)) {
      return fail("start_minutes / end_minutes must be numbers");
    }
    if (!Number.isInteger(start) || !Number.isInteger(end)) {
      return fail("start_minutes / end_minutes must be integers (minutes from midnight)");
    }
    if (start < 0 || start >= 1440) {
      return fail(`start_minutes (${start}) out of range. Must be 0–1439 (1439=23:59). Split midnight-crossing events.`);
    }
    if (end <= 0 || end > 1440) {
      return fail(`end_minutes (${end}) out of range. Must be 1–1440 (1440 = 24:00 / midnight).`);
    }
    if (end <= start) {
      return fail(`end_minutes (${end}) must be greater than start_minutes (${start}). Split midnight-crossing events into two.`);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return fail(`date must be YYYY-MM-DD format (got: ${date})`);
    }
    const userColor = input.color as string | undefined;
    const force = (input.force as boolean) === true;

    const { data: sameDay } = await ctx.adminClient
      .from("schedules")
      .select("id, title, start_minutes, end_minutes, color")
      .eq("user_id", ctx.userId)
      .eq("date", date)
      .order("start_minutes", { ascending: true });

    const overlapping = (sameDay ?? []).filter(
      (s: any) => s.start_minutes < end && s.end_minutes > start,
    );

    if (!force && overlapping.length > 0) {
      const pendingDesc = `${title} ${fmtTime(start)}–${fmtTime(end)}`;
      const existingDesc = overlapping
        .map((s: any) => `${s.title} ${fmtTime(s.start_minutes)}–${fmtTime(s.end_minutes)}`)
        .join(" / ");
      const choices = [
        {
          id: "a",
          label: `(a) 既存の予定（${existingDesc}）を削除して、${pendingDesc} を入れる`,
          prompt: `(a) 既存の予定を新しい予定に置き換えて。具体的には、既存の予定（${overlapping
            .map((s: any) => `id=${s.id}「${s.title}」`)
            .join(", ")}）を delete_schedule で削除してから、「${title}」を ${fmtTime(start)}〜${fmtTime(end)} (${date}) で force=true で create_schedule して。`,
        },
        {
          id: "b",
          label: `(b) 重複させたまま ${pendingDesc} を追加する`,
          prompt: `(b) 重複させたままで構わないので、「${title}」を ${fmtTime(start)}〜${fmtTime(end)} (${date}) で force=true で追加して。`,
        },
        { id: "c", label: "(c) 別の時間帯に変更する", prompt: "(c) 別の時間帯にしたい。空いている時間を提案するか、何時にしたいか聞いて。" },
        { id: "d", label: "(d) 追加するのをやめる", prompt: "(d) やはり追加するのをやめます。何もしないでください。" },
      ];
      return ok({
        conflict: true,
        message:
          `指定した時間帯（${fmtTime(start)}〜${fmtTime(end)}）に既存の予定があります：${existingDesc}。どうしますか？`,
        pending: { date, title, start_minutes: start, end_minutes: end, color: userColor ?? null },
        existing: overlapping,
        choices,
      });
    }

    const finalColor = userColor || pickScheduleColor(start, end, sameDay ?? []);
    const { data, error } = await ctx.adminClient
      .from("schedules")
      .insert({
        user_id: ctx.userId,
        date,
        title,
        start_minutes: start,
        end_minutes: end,
        color: finalColor,
        is_from_todo: false,
        source_todo_id: null,
      })
      .select("id, title, start_minutes, end_minutes, color, date")
      .single();
    if (error) return fail(error.message);
    return ok({ schedule: data });
  },

  update_schedule: async (input, ctx) => {
    const id = input.schedule_id as string;
    if (!id) return fail("schedule_id is required");

    const patch: Record<string, unknown> = {};
    if (typeof input.title === "string") patch.title = input.title;
    if (typeof input.color === "string") patch.color = input.color;
    if (typeof input.date === "string") patch.date = input.date;
    if (input.start_minutes !== undefined) patch.start_minutes = Number(input.start_minutes);
    if (input.end_minutes !== undefined) patch.end_minutes = Number(input.end_minutes);
    if (
      patch.start_minutes !== undefined &&
      patch.end_minutes !== undefined &&
      Number(patch.end_minutes) <= Number(patch.start_minutes)
    ) {
      return fail("end_minutes must be greater than start_minutes");
    }
    if (Object.keys(patch).length === 0) return fail("Nothing to update");
    patch.updated_at = new Date().toISOString();

    const { data, error } = await ctx.adminClient
      .from("schedules")
      .update(patch)
      .eq("id", id)
      .eq("user_id", ctx.userId)
      .select("id, title, start_minutes, end_minutes, color, date")
      .maybeSingle();
    if (error) return fail(error.message);
    if (!data) return fail("Schedule not found or not owned by you");
    return ok({ schedule: data });
  },

  delete_schedule: async (input, ctx) => {
    const scheduleId = input.schedule_id as string;
    if (!scheduleId) return fail("schedule_id is required");
    const confirmed = input.confirm === true;

    const { data: sched, error: fetchErr } = await ctx.adminClient
      .from("schedules")
      .select("id, title, start_minutes, end_minutes, color, date")
      .eq("id", scheduleId)
      .eq("user_id", ctx.userId)
      .maybeSingle();
    if (fetchErr) return fail(fetchErr.message);
    if (!sched) return fail("Schedule not found or not owned by you");

    if (!confirmed) {
      return ok({
        phase: "preview",
        preview: { schedule: sched },
        next_step:
          "Show this schedule entry to the user and ask whether to delete it. " +
          "Only call delete_schedule again with confirm: true after they approve.",
      });
    }
    const { error: delErr } = await ctx.adminClient
      .from("schedules")
      .delete()
      .eq("id", scheduleId)
      .eq("user_id", ctx.userId);
    if (delErr) return fail(delErr.message);
    return ok({ phase: "deleted", deleted_schedule: sched });
  },

  // ── ルーティン（朝/昼/夜）────────────────────────────────────────
  list_routine_for_date: async (input, ctx) => {
    const tz = "Asia/Tokyo";
    const date = (input.date as string) || todayStringInTZ(ctx.now, tz);
    const tpl = await ensureRoutineTemplate(ctx.adminClient, ctx.userId);
    if (!tpl) return ok({ date, slots: { morning: [], daytime: [], evening: [] } });

    const { data: items, error } = await ctx.adminClient
      .from("routine_template_items")
      .select("id, slot, sort_order, title, short_label, is_active, today_only_date")
      .eq("template_id", tpl.id)
      .order("slot", { ascending: true })
      .order("sort_order", { ascending: true });
    if (error) return fail(error.message);

    const visible = (items ?? []).filter((it: any) =>
      it.is_active && (!it.today_only_date || it.today_only_date === date)
    );
    const itemIds = visible.map((it: any) => it.id);

    let completed = new Set<string>();
    let skipped = new Set<string>();
    if (itemIds.length > 0) {
      const { data: comps } = await ctx.adminClient
        .from("routine_completions")
        .select("item_id")
        .eq("user_id", ctx.userId)
        .eq("date", date)
        .in("item_id", itemIds);
      completed = new Set((comps ?? []).map((c: any) => c.item_id));
      const { data: skips } = await ctx.adminClient
        .from("routine_skips")
        .select("item_id")
        .eq("user_id", ctx.userId)
        .eq("date", date)
        .in("item_id", itemIds);
      skipped = new Set((skips ?? []).map((s: any) => s.item_id));
    }

    const slots: Record<string, any[]> = { morning: [], daytime: [], evening: [] };
    for (const it of visible) {
      slots[it.slot]?.push({
        ...it,
        is_completed: completed.has(it.id),
        is_skipped: skipped.has(it.id),
      });
    }
    return ok({ date, slots });
  },

  list_routine_template: async (_input, ctx) => {
    const tpl = await ensureRoutineTemplate(ctx.adminClient, ctx.userId);
    if (!tpl) return ok({ items: [] });
    const { data, error } = await ctx.adminClient
      .from("routine_template_items")
      .select("id, slot, sort_order, title, short_label, is_active")
      .eq("template_id", tpl.id)
      .is("today_only_date", null)
      .order("slot", { ascending: true })
      .order("sort_order", { ascending: true });
    if (error) return fail(error.message);
    return ok({ items: data });
  },

  add_routine_item: async (input, ctx) => {
    const slot = input.slot as string;
    if (!["morning", "daytime", "evening"].includes(slot)) {
      return fail("slot must be morning / daytime / evening");
    }
    const title = (input.title as string)?.trim();
    if (!title) return fail("title is required");
    const todayOnlyDate = (input.today_only_date as string) || null;
    if (todayOnlyDate && !/^\d{4}-\d{2}-\d{2}$/.test(todayOnlyDate)) {
      return fail("today_only_date must be YYYY-MM-DD");
    }
    const shortLabel = (input.short_label as string) || null;

    const tpl = await ensureRoutineTemplate(ctx.adminClient, ctx.userId);
    if (!tpl) return fail("Failed to ensure routine template");

    const { data: last } = await ctx.adminClient
      .from("routine_template_items")
      .select("sort_order")
      .eq("template_id", tpl.id)
      .eq("slot", slot)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextOrder = ((last?.sort_order as number) ?? -1) + 1;

    const { data, error } = await ctx.adminClient
      .from("routine_template_items")
      .insert({
        template_id: tpl.id,
        slot,
        title,
        short_label: shortLabel,
        sort_order: nextOrder,
        is_active: true,
        today_only_date: todayOnlyDate,
      })
      .select("id, slot, title, short_label, today_only_date, is_active, sort_order")
      .single();
    if (error) return fail(error.message);
    return ok({ item: data });
  },

  update_routine_item: async (input, ctx) => {
    const id = input.item_id as string;
    if (!id) return fail("item_id is required");
    const tpl = await ensureRoutineTemplate(ctx.adminClient, ctx.userId);
    if (!tpl) return fail("Routine template not found");

    const patch: Record<string, unknown> = {};
    if (typeof input.title === "string") patch.title = input.title;
    if (typeof input.short_label === "string") {
      patch.short_label = input.short_label === "" ? null : input.short_label;
    }
    if (typeof input.slot === "string") {
      if (!["morning", "daytime", "evening"].includes(input.slot)) {
        return fail("slot must be morning / daytime / evening");
      }
      patch.slot = input.slot;
    }
    if (typeof input.is_active === "boolean") patch.is_active = input.is_active;
    if (Object.keys(patch).length === 0) return fail("Nothing to update");
    patch.updated_at = new Date().toISOString();

    const { data, error } = await ctx.adminClient
      .from("routine_template_items")
      .update(patch)
      .eq("id", id)
      .eq("template_id", tpl.id)
      .select("id, slot, title, short_label, today_only_date, is_active")
      .maybeSingle();
    if (error) return fail(error.message);
    if (!data) return fail("Item not found");
    return ok({ item: data });
  },

  delete_routine_item: async (input, ctx) => {
    const id = input.item_id as string;
    if (!id) return fail("item_id is required");
    const confirmed = input.confirm === true;
    const tpl = await ensureRoutineTemplate(ctx.adminClient, ctx.userId);
    if (!tpl) return fail("Routine template not found");

    const { data: item, error: fetchErr } = await ctx.adminClient
      .from("routine_template_items")
      .select("id, slot, title, short_label, today_only_date, is_active")
      .eq("id", id)
      .eq("template_id", tpl.id)
      .maybeSingle();
    if (fetchErr) return fail(fetchErr.message);
    if (!item) return fail("Item not found");

    if (!confirmed) {
      return ok({
        phase: "preview",
        preview: { item },
        next_step:
          "Show this routine item to the user and ask whether to delete it. " +
          "Only call delete_routine_item again with confirm: true after they approve.",
      });
    }
    const { error: delErr } = await ctx.adminClient
      .from("routine_template_items")
      .delete()
      .eq("id", id)
      .eq("template_id", tpl.id);
    if (delErr) return fail(delErr.message);
    return ok({ phase: "deleted", deleted_item: item });
  },

  toggle_routine_completion: async (input, ctx) => {
    const tz = "Asia/Tokyo";
    const itemId = input.item_id as string;
    const completed = input.completed as boolean;
    if (!itemId) return fail("item_id is required");
    if (typeof completed !== "boolean") return fail("completed must be boolean");
    const date = (input.date as string) || todayStringInTZ(ctx.now, tz);

    if (completed) {
      const { error } = await ctx.adminClient
        .from("routine_completions")
        .upsert({
          user_id: ctx.userId,
          item_id: itemId,
          date,
          completed_at: new Date().toISOString(),
        }, { onConflict: "user_id,item_id,date" });
      if (error) return fail(error.message);
    } else {
      const { error } = await ctx.adminClient
        .from("routine_completions")
        .delete()
        .eq("user_id", ctx.userId)
        .eq("item_id", itemId)
        .eq("date", date);
      if (error) return fail(error.message);
    }
    return ok({ item_id: itemId, date, completed });
  },

  // ── メタ（接続情報 / 機能ガイド / メモ）──────────────────────────────
  whoami: async (_input, ctx) => {
    const today = todayStringInTZ(ctx.now, "Asia/Tokyo");
    let email: string | null = null;
    try {
      const { data: u } = await ctx.adminClient.auth.admin.getUserById(ctx.userId);
      email = u?.user?.email ?? null;
    } catch (_e) { /* best effort — admin lookup may be unavailable */ }

    const { data: settings } = await ctx.adminClient
      .from("user_settings")
      .select("default_workspace_type, preferred_language")
      .eq("user_id", ctx.userId)
      .maybeSingle();
    const defaultType = settings?.default_workspace_type ?? "four_grid";

    const { data: wsList } = await ctx.adminClient
      .from("workspaces")
      .select("id, date, type, title")
      .eq("user_id", ctx.userId)
      .eq("date", today)
      .order("type", { ascending: true });
    const active = (wsList ?? []).find((w: any) => w.type === defaultType) ?? null;

    return ok({
      user_id: ctx.userId,
      email,
      today,
      preferred_language: settings?.preferred_language ?? "ja",
      default_workspace_type: defaultType,
      active_workspace_id: active?.id ?? null,
      todays_workspaces: wsList ?? [],
    });
  },

  get_app_guide: async (_input, _ctx) => {
    return ok({
      app: "ToSche",
      summary:
        "ToSche は『目標→課題→今日やること→1日のスケジュール→毎日のルーティン』を一気通貫で管理する個人向けタスク管理アプリ。" +
        "これらのMCPツールで、アプリ内AIと同等に全機能を操作できる。",
      core_decision:
        "【最重要】ユーザーが何かを『追加して』と言ったら、まず種別を見分ける。" +
        "(1) 締切/期日がある → ASSIGNMENT(課題) = create_task（課題一覧に出る）。" +
        "(2) 今日中にやる・締切なし → TODAY task = create_workspace_task（ワークスペースのグリッドに出る）。" +
        "(3) 開始/終了時刻が明示された予定 → create_schedule（円グラフに出る）。" +
        "(4) 毎日/朝昼夜の習慣 → add_routine_item（ルーティン）。" +
        "種別が曖昧なときは独断せず、ユーザーに『今日やること(ワークスペース)ですか？それとも締切のある課題ですか？』と必ず聞き返すこと。",
      features: {
        workspace: {
          what: "今日やること。付箋スタイルのカードを最大4分割(four_grid)のグリッドに配置。締切なし。",
          areas: "four_gridは top_left/top_right/bottom_left/bottom_right の4エリアにユーザーが名前(例:仕事/勉強/家事/趣味)を付ける。",
          tools: ["list_workspace_areas", "list_workspace_tasks", "create_workspace_task", "update_workspace_task(is_completed=trueでチェック)", "delete_workspace_task"],
          tips: "エリア名を言われたら area_name に渡す（サーバが位置を解決）。不明なら省略で最も空いたエリアに自動配置、または聞き返す。",
        },
        assignments: {
          what: "課題(期日付き)。締切までにやるもの。アプリの『課題一覧』に期限の近い順・締切バケツで表示。",
          tools: ["list_tasks", "create_task(due_date必須)", "update_task", "complete_task(weeklyなら翌週分を自動生成)", "delete_task"],
          fields: "course_name(授業/科目名), repeat_rule='weekly'(毎週繰り返し), notification_offsets='2d,1d,2h,1h'(通知タイミング)。",
        },
        schedule: {
          what: "1日(0:00–24:00)の時間ブロック。円グラフで可視化。",
          time_unit: "分(minutes from midnight)。13:00=780。end>start。日跨ぎは2件に分割。",
          color: "colorを省略すると、隣接/重複予定の色を避けて最も使われていない色を自動選択（円グラフが見やすく多彩になる）。ユーザー指定時のみ色を渡す。",
          tools: ["list_schedules", "create_schedule(重複時はchoicesを提示して待つ)", "update_schedule", "delete_schedule"],
        },
        routine: {
          what: "毎日の習慣チェックリスト。morning/daytime/evening の3スロット。",
          how_to_create: "add_routine_item({slot, title}) で永続(毎日)アイテムを追加。today_only_date を付けるとその日だけの一回限り。",
          tools: ["list_routine_for_date", "list_routine_template", "add_routine_item", "update_routine_item(is_active=falseで無効化)", "delete_routine_item", "toggle_routine_completion(チェックON/OFF)"],
        },
        goals: {
          what: "目標(long_term/yearly/half_year/monthly)とロードマップ(milestones)。",
          tools: ["list_goals", "create_goal", "list_milestones", "create_milestones_batch", "update_milestone"],
          note: "新しい課題やタスクを既存の目標に紐づけるのは goal_id で可能。",
        },
        memory_and_context: {
          what: "次回以降に効く永続メモ(remember/forget/list_memory)と、アプリ内AIと共有する連携メモ(get_shared_context/update_shared_context)。",
          tips: "色の好み(例 key='color:gym', value='#F5A623')やスケジュール傾向を remember しておくと、以後の提案が個人化される。",
        },
      },
      destructive_protocol:
        "delete_* 系は2フェーズ。まず confirm 無し(プレビュー)→ユーザーが明示承認→confirm:true で実行。勝手に confirm:true にしない。",
    });
  },

  remember: async (input, ctx) => {
    const key = input.key as string;
    const value = input.value as string;
    if (!key || !value) return fail("key and value are required");
    const r = await upsertMemoryEntry(ctx.adminClient, ctx.userId, key, value);
    if (!r.ok) return fail(r.error ?? "Failed to save memory");
    return ok({ key, value, pruned_oldest: r.pruned ?? null });
  },

  forget: async (input, ctx) => {
    const key = (input.key as string)?.trim();
    if (!key) return fail("key is required");
    const { data, error } = await ctx.adminClient
      .from("user_memory")
      .delete()
      .eq("user_id", ctx.userId)
      .eq("key", key)
      .select("key")
      .maybeSingle();
    if (error) return fail(error.message);
    return ok({ key, deleted: !!data });
  },

  list_memory: async (_input, ctx) => {
    const { data, error } = await ctx.adminClient
      .from("user_memory")
      .select("key, value, updated_at")
      .eq("user_id", ctx.userId)
      .order("updated_at", { ascending: false })
      .limit(MEMORY_LIMIT);
    if (error) return fail(error.message);
    return ok({ entries: data ?? [], limit: MEMORY_LIMIT });
  },
};
