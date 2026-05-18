// MCP-exposed tool definitions and executors.
//
// Self-contained subset of ai-chat/tools.ts. We duplicate (rather than
// cross-import) so the mcp-server function deploys as a single unit.
// If a tool's behavior diverges from ai-chat, document the divergence
// explicitly. For now they are 1:1.
//
// Exposed tools (v1.4 launch — read + safe writes only, no destructive):
//   - list_goals
//   - list_milestones
//   - create_goal
//   - create_milestones_batch
//   - update_milestone

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

export type ToolExecutor = (
  input: Record<string, unknown>,
  ctx: ToolContext,
) => Promise<ToolResult>;

function ok(data: unknown): ToolResult { return { ok: true, data }; }
function fail(error: string): ToolResult { return { ok: false, error }; }

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
];

export const MCP_TOOL_EXECUTORS: Record<string, ToolExecutor> = {
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
};
