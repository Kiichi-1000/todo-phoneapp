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
  // ── 課題(todo) / 共有メモ ─────────────────────────────────────
  {
    name: "list_tasks",
    description:
      "List the user's tasks (todos) that have a due date, sorted by nearest deadline. " +
      "Returns full task details including course_name, repeat_rule, and notification_offsets. " +
      "Use this to see what assignments/tasks are due soon. " +
      "NOTE: deciding the day-by-day schedule / time-blocking of tasks is ToSche's own in-app AI feature — do not attempt that here.",
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
      "Create a task (todo) for the user, with an optional due date (deadline). The task is added to today's workspace matching the user's default_workspace_type, so it appears in the same grid the user sees in the app. " +
      "Use this to capture an assignment/task. Do NOT time-block or distribute it across days — that is ToSche's own AI feature. " +
      "If the user has multiple workspace types (four_grid/individual/note) and wants to target a specific one, pass target_workspace_id (preferred) or target_workspace_type.",
    inputSchema: {
      type: "object",
      properties: {
        content: { type: "string", description: "The task text." },
        due_date: { type: "string", description: "Optional deadline. YYYY-MM-DD for date-only, or YYYY-MM-DDTHH:MM for date+time." },
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
    if (dueDate && !DUE_DATE_RE.test(dueDate)) {
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
};
