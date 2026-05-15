// AI tool definitions and executors.
//
// Tools are grouped by feature area:
//   - context (1)
//   - workspace todos (5)
//   - schedules (5, incl. conflict-aware create)
//   - routines (6)
//   - stats (1)

import type { ToolContext, ToolDefinition, ToolExecutor, ToolResult } from "./types.ts";
import { upsertMemoryEntry, deleteMemoryEntry, loadUserMemory, MEMORY_LIMIT } from "./memory.ts";

// ---------- Helpers ----------

function ok(data: unknown): ToolResult {
  return { ok: true, data };
}
function fail(error: string): ToolResult {
  return { ok: false, error };
}

function todayStringInTZ(now: Date, _tz: string): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: _tz || "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(now);
  const y = parts.find(p => p.type === "year")?.value ?? "1970";
  const m = parts.find(p => p.type === "month")?.value ?? "01";
  const d = parts.find(p => p.type === "day")?.value ?? "01";
  return `${y}-${m}-${d}`;
}

function fmtTime(minutes: number): string {
  const h = Math.floor(minutes / 60).toString().padStart(2, "0");
  const m = (minutes % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

const GRID_AREAS = ["top_left", "top_right", "bottom_left", "bottom_right"] as const;
type GridArea = typeof GRID_AREAS[number];

// Schedule color palette — MUST stay in sync with lib/scheduleUtils.ts
// SCHEDULE_COLORS so AI-created entries blend with manually-created ones.
// 20 distinct colors → richer pie-chart variety across the day.
const SCHEDULE_PALETTE = [
  // Original 10
  "#4A90D9", "#E8654A", "#50B86C", "#F5A623", "#9B59B6",
  "#1ABC9C", "#E74C8B", "#34495E", "#F39C12", "#2ECC71",
  // Extended 10
  "#6C5CE7", "#00B894", "#FDCB6E", "#74B9FF", "#A29BFE",
  "#FF7675", "#55EFC4", "#FAB1A0", "#FF6B9D", "#7DA0FA",
] as const;

// Variety-aware schedule color picker.
//
// Picking strategy:
//   1. Compute a "use count" per palette color across ALL of today's events.
//   2. Compute the set of "conflicting" colors — those used by events that
//      overlap the new range OR sit within `bufferMin` of it (neighbors).
//   3. Among non-conflicting palette colors, pick the LEAST-USED in the day.
//      This breaks ties toward variety across the pie chart, not toward the
//      first slot in the palette.
//   4. If every palette color is conflicting (very busy day), fall back to
//      the least-used overall, accepting the conflict.
function pickScheduleColor(
  start: number,
  end: number,
  existing: { start_minutes: number; end_minutes: number; color: string }[],
  bufferMin = 60,
): string {
  // Initialise counts at 0 for every palette color so unused ones win ties.
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

  const nonConflicting = SCHEDULE_PALETTE.filter(
    (c) => !conflicting.has(c.toUpperCase()),
  );
  if (nonConflicting.length > 0) return pickLeastUsed(nonConflicting);
  return pickLeastUsed(SCHEDULE_PALETTE);
}

// Best-effort fuzzy match: case-insensitive substring match either direction.
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

async function ensureWorkspaceForDate(
  client: any,
  userId: string,
  dateStr: string,
): Promise<{ id: string } | null> {
  const { data: existing } = await client
    .from("workspaces")
    .select("id")
    .eq("user_id", userId)
    .eq("date", dateStr)
    .maybeSingle();

  if (existing) return existing;

  const { data: latestWs } = await client
    .from("workspaces")
    .select("area_titles, type")
    .eq("user_id", userId)
    .eq("type", "four_grid")
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
      type: "four_grid",
      date: dateStr,
      area_titles: inheritedTitles,
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

// ---------- Tool definitions (schemas) ----------

export const TOOL_DEFS: ToolDefinition[] = [
  {
    name: "get_current_context",
    description:
      "Get the user's current context: today's date (YYYY-MM-DD), current time (HH:MM), and language preference. Call this once at the start of a conversation if you need to resolve relative dates like '明日' / 'tomorrow'.",
    input_schema: { type: "object", properties: {} },
  },

  // ---------- Goals (4-level hierarchy: long_term / yearly / half_year / monthly) ----------
  {
    name: "list_goals",
    description:
      "[GOAL VIEW] List the user's goals. By default returns only goals whose period currently overlaps today (active goals). " +
      "Use this when the user asks 'what are my goals', '今月の目標は？', or before breaking down a goal into todos.",
    input_schema: {
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
      "[GOAL VIEW] Create a new goal at the specified level. " +
      "Levels and typical periods:\n" +
      "  - long_term: 5-year goal (e.g. period_start=今年1/1, period_end=5年後12/31)\n" +
      "  - yearly: 1-year goal (e.g. 2026/1/1 〜 2026/12/31)\n" +
      "  - half_year: 6-month goal (H1=1-6月, H2=7-12月)\n" +
      "  - monthly: 1-month goal (e.g. 2026/5/1 〜 2026/5/31)\n" +
      "If the user doesn't specify dates, derive sensible defaults based on level and today's date. " +
      "Use parent_goal_id to link a goal to its parent (e.g. monthly goal under a half-year goal).",
    input_schema: {
      type: "object",
      properties: {
        level: { type: "string", enum: ["long_term", "yearly", "half_year", "monthly"] },
        title: { type: "string", description: "Goal title, e.g. '司法試験合格'." },
        description: { type: "string", description: "Optional detail / why / how." },
        period_start: { type: "string", description: "YYYY-MM-DD" },
        period_end: { type: "string", description: "YYYY-MM-DD" },
        parent_goal_id: { type: "string", description: "Optional id of parent goal (for hierarchy)." },
      },
      required: ["level", "title", "period_start", "period_end"],
    },
  },
  {
    name: "update_goal",
    description: "[GOAL VIEW] Update fields of an existing goal. Pass any subset.",
    input_schema: {
      type: "object",
      properties: {
        goal_id: { type: "string" },
        title: { type: "string" },
        description: { type: "string" },
        period_start: { type: "string" },
        period_end: { type: "string" },
        is_completed: { type: "boolean", description: "Mark goal as achieved (true) or reopen (false)." },
        parent_goal_id: { type: "string", description: "Reassign parent (or empty string to detach)." },
      },
      required: ["goal_id"],
    },
  },
  {
    name: "delete_goal",
    description:
      "[GOAL VIEW] Delete a goal. Linked todos retain their content but lose the goal reference (goal_id set to null). " +
      "You MUST call request_confirmation BEFORE this tool.",
    input_schema: {
      type: "object",
      properties: { goal_id: { type: "string" } },
      required: ["goal_id"],
    },
  },

  // ---------- Goal milestones (ROADMAP steps) ----------
  {
    name: "list_milestones",
    description:
      "[GOAL ROADMAP] List the ordered roadmap steps (milestones) for a goal. " +
      "Returns each milestone with title, description, target_date, is_completed, sort_order. " +
      "Call this before proposing new steps to avoid duplicates.",
    input_schema: {
      type: "object",
      properties: { goal_id: { type: "string" } },
      required: ["goal_id"],
    },
  },
  {
    name: "create_milestones_batch",
    description:
      "[GOAL ROADMAP] Create a FULL roadmap (multiple ordered steps) for a goal in one call. " +
      "Use this when the user agrees to a roadmap you've proposed in text. " +
      "Items are inserted in the order given (first item = STEP 1). " +
      "Aim for 4-7 milestones — fewer feels too sparse, more feels overwhelming. " +
      "Each milestone should be a concrete checkpoint (not a vague aspiration). " +
      "If the goal already has milestones (check list_milestones first), prefer create_milestone for additions or update_milestone for edits, not a full batch overwrite.",
    input_schema: {
      type: "object",
      properties: {
        goal_id: { type: "string" },
        milestones: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string", description: "Concrete step, e.g. '民法基本書1周'" },
              description: { type: "string", description: "Optional details" },
              target_date: { type: "string", description: "YYYY-MM-DD. Optional but recommended — spread across the goal's period." },
            },
            required: ["title"],
          },
        },
      },
      required: ["goal_id", "milestones"],
    },
  },
  {
    name: "create_milestone",
    description:
      "[GOAL ROADMAP] Add a single roadmap step to a goal. " +
      "For multiple steps at once, use create_milestones_batch instead. " +
      "If sort_order is omitted, the new step appends to the end.",
    input_schema: {
      type: "object",
      properties: {
        goal_id: { type: "string" },
        title: { type: "string" },
        description: { type: "string" },
        target_date: { type: "string", description: "YYYY-MM-DD, optional." },
        sort_order: { type: "integer", description: "0-based position. Omit to append." },
      },
      required: ["goal_id", "title"],
    },
  },
  {
    name: "update_milestone",
    description:
      "[GOAL ROADMAP] Edit a milestone. Pass any subset of fields. " +
      "Use is_completed=true to mark the step done (the 'current position' indicator auto-advances to the next).",
    input_schema: {
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
    name: "delete_milestone",
    description: "[GOAL ROADMAP] Delete a single milestone. Use request_confirmation first.",
    input_schema: {
      type: "object",
      properties: { milestone_id: { type: "string" } },
      required: ["milestone_id"],
    },
  },

  // ---------- Redirect to Goal-Coach (general AI only — exposed in ai-chat/index.ts filter) ----------
  {
    name: "redirect_to_goal_coach",
    description:
      "When the user asks to SET UP, DEFINE, MODIFY, or REVIEW their long-term/yearly/half-year/monthly GOALS, " +
      "do NOT attempt the action yourself — call this tool. It returns a card with a button that takes the user " +
      "to the dedicated Goal-Coach AI page (a separate AI focused on goal-setting with full conversation memory).\n\n" +
      "Trigger phrases include: '目標を立てたい', '今月の目標を決めたい', '半期目標を変更したい', '中長期目標を見直したい', " +
      "'set up my goals', 'change my yearly goal', etc. After calling this tool, briefly tell the user that goal " +
      "management has its own dedicated AI and to use the button to navigate there. " +
      "Note: Linking a NEW todo to an EXISTING goal via create_todo's goal_id is fine — that's task management, not goal management.",
    input_schema: {
      type: "object",
      properties: {
        reason: {
          type: "string",
          description:
            "Short Japanese phrase summarizing what the user is trying to do, e.g. '今月の目標を立てる', '半期目標の振り返り'. Shown on the redirect card.",
        },
      },
      required: ["reason"],
    },
  },

  // ---------- Memory ----------
  {
    name: "remember",
    description:
      "Save a small, durable fact about the user that should affect FUTURE conversations (cross-session memory). " +
      "Only use this for genuinely persistent facts — NOT for transient request details. " +
      "Examples of GOOD memory: '司法試験の独学で民法に注力中', '朝7時にジムへ行く（月水金）', '簡潔な日本語を好む', '仕事のグリッド名は実際には『リサーチ』として使う'. " +
      "Examples of BAD memory: '今日のタスクに〜を追加した' (transient), '13時にミーティング' (one-off event — that's a schedule). " +
      "Limit: " + String(MEMORY_LIMIT) + " entries per user. New entries beyond this evict the oldest. " +
      "Each value: max 300 chars. Reuse the same `key` to UPDATE an existing fact.",
    input_schema: {
      type: "object",
      properties: {
        key: {
          type: "string",
          description:
            "Short stable identifier in snake_case English, e.g. 'study_focus', 'morning_routine', 'preferred_tone'. Reuse the same key to overwrite.",
        },
        value: {
          type: "string",
          description: "The fact itself, in the user's language, ≤300 chars.",
        },
      },
      required: ["key", "value"],
    },
  },
  {
    name: "forget",
    description: "Remove a previously remembered fact by key. Use when the user says it's no longer accurate or asks to forget.",
    input_schema: {
      type: "object",
      properties: { key: { type: "string" } },
      required: ["key"],
    },
  },
  {
    name: "list_memory",
    description:
      "List currently remembered facts. Usually unnecessary — the active memory is already in your system prompt. " +
      "Call this only when the user explicitly asks 'what do you remember about me?' or you need to verify before forgetting.",
    input_schema: { type: "object", properties: {} },
  },

  {
    name: "request_confirmation",
    description:
      "Ask the user for explicit Yes/No confirmation before doing something destructive or irreversible. " +
      "Returns choice buttons that the user can tap. ALWAYS call this before delete_*/bulk-update tools — never delete in one shot.\n\n" +
      "Flow: you call request_confirmation(summary, confirmed_action_prompt). The user sees はい/いいえ buttons. " +
      "If they tap はい, the `confirmed_action_prompt` text is sent back to you and you then execute the actual destructive tool. " +
      "If they tap いいえ, you'll receive a cancel message and you should reply gracefully.\n\n" +
      "Examples of `confirmed_action_prompt`:\n" +
      "- 'CONFIRMED: 予定 id=abc123 を削除して。'\n" +
      "- 'CONFIRMED: ルーティン id=xyz「英単語15分」を削除して。'",
    input_schema: {
      type: "object",
      properties: {
        summary: {
          type: "string",
          description:
            "User-facing description of what will happen. Be specific. e.g., '予定『民法の読書』(13:00–14:00) を削除します。よろしいですか？'",
        },
        confirmed_action_prompt: {
          type: "string",
          description:
            "The text that will be sent back as the user's next message if they tap はい. Include any IDs or parameters you need to actually execute the action. Prefix with 'CONFIRMED: '.",
        },
        destructive: {
          type: "boolean",
          description: "If true, the はい button is styled as destructive (red). Default true for delete operations.",
        },
      },
      required: ["summary", "confirmed_action_prompt"],
    },
  },

  // ---------- Workspace todos ----------
  {
    name: "list_workspace_areas",
    description:
      "[WORKSPACE PAGE] Get the four grid-area titles (top_left / top_right / bottom_left / bottom_right) that the user has named for a given date. " +
      "Each area on a four_grid workspace has a free-form Japanese/English title set by the user, e.g. '仕事' / '勉強' / '家事' / '趣味'. " +
      "ALWAYS call this BEFORE create_todo when the user mentions a category by name (e.g. '仕事のグリッドに〜追加', '勉強欄に', 'work area') so you know which physical position that name maps to.",
    input_schema: {
      type: "object",
      properties: {
        date: { type: "string", description: "YYYY-MM-DD. Defaults to today." },
      },
    },
  },
  {
    name: "list_todos",
    description:
      "[WORKSPACE PAGE] List the user's TODO/TASK items (sticky-note style cards on the workspace page; these have NO time information). " +
      "The response also includes area_titles (the four grid-area names the user has set).",
    input_schema: {
      type: "object",
      properties: {
        date: { type: "string", description: "YYYY-MM-DD. Defaults to today if omitted." },
        only_incomplete: { type: "boolean", description: "If true, return only is_completed=false." },
      },
    },
  },
  {
    name: "create_todo",
    description:
      "[WORKSPACE PAGE] Create a TASK (TODO) on the workspace. This is a sticky-note style item with NO time information. " +
      "USE THIS when the user says 'add a task', 'タスク追加', 'やること追加' etc. without specifying a start/end time. " +
      "DO NOT use this for time-blocked events (use create_schedule for those).\n\n" +
      "GRID AREA SELECTION (CRITICAL):\n" +
      "- The workspace is divided into 4 areas, each with a user-named title (e.g. '仕事' / '勉強' / '家事' / '趣味'). The 4 physical positions are top_left, top_right, bottom_left, bottom_right.\n" +
      "- If the user mentions an area by NAME (e.g. '仕事のグリッドに追加', '勉強欄に', 'work area'), pass that name as `area_name`. The server will look up the workspace's area_titles and pick the matching position. DO NOT guess `grid_area` yourself.\n" +
      "- If you already called list_workspace_areas (or list_todos which returns area_titles) and KNOW the correct position, you may pass `grid_area` directly.\n" +
      "- If the user does not specify any category, omit both `grid_area` and `area_name` — the server auto-assigns to the area with the fewest items.",
    input_schema: {
      type: "object",
      properties: {
        content: { type: "string", description: "What to do, e.g. '民法の読書'." },
        date: { type: "string", description: "YYYY-MM-DD. Defaults to today." },
        area_name: {
          type: "string",
          description:
            "Free-form area name as the user said it (e.g. '仕事', '勉強', 'work'). The server resolves this against the workspace's area_titles.",
        },
        grid_area: {
          type: "string",
          enum: ["top_left", "top_right", "bottom_left", "bottom_right"],
          description: "Physical position. Use this only when you are SURE which position the user meant.",
        },
        reminder_at: {
          type: "string",
          description: "ISO datetime string for a reminder. Optional.",
        },
        goal_id: {
          type: "string",
          description:
            "Optional. Link this todo to a goal so it counts toward goal progress. Pass when breaking a goal into actionable tasks.",
        },
      },
      required: ["content"],
    },
  },
  {
    name: "update_todo",
    description:
      "[WORKSPACE PAGE] Update a TASK (TODO). Pass any subset of fields. " +
      "To CHECK OFF a task as done, pass is_completed=true. To uncheck it, pass is_completed=false.",
    input_schema: {
      type: "object",
      properties: {
        todo_id: { type: "string" },
        content: { type: "string" },
        is_completed: { type: "boolean", description: "true = checked, false = unchecked." },
        reminder_at: { type: "string", description: "ISO datetime, or empty string to clear." },
      },
      required: ["todo_id"],
    },
  },
  {
    name: "delete_todo",
    description:
      "[WORKSPACE PAGE] Delete a TASK (TODO). " +
      "You MUST call request_confirmation BEFORE this tool. Only call this when the user's next message starts with 'CONFIRMED: '.",
    input_schema: {
      type: "object",
      properties: { todo_id: { type: "string" } },
      required: ["todo_id"],
    },
  },

  // ---------- Schedules ----------
  {
    name: "list_schedules",
    description:
      "[SCHEDULE PAGE] List SCHEDULE entries (time-blocked events on the daily 0:00–24:00 timeline).",
    input_schema: {
      type: "object",
      properties: {
        date: { type: "string", description: "YYYY-MM-DD. Defaults to today." },
      },
    },
  },
  {
    name: "create_schedule",
    description:
      "[SCHEDULE PAGE] Create a TIME-BLOCKED event on the schedule timeline. " +
      "USE THIS ONLY when the user explicitly states a start time AND end time (or duration), e.g. '13時から1時間', '14:00〜15:30'. " +
      "DO NOT use this for tasks/todos without time information (use create_todo for those). " +
      "DO NOT invent times if the user didn't give any. " +
      "DO NOT call this tool more than once for a single user message — produce exactly one schedule entry per requested event.\n\n" +
      "CONFLICT HANDLING: by default this tool checks for time overlaps with existing schedules. " +
      "If a conflict is found, the tool returns ok=true but with data.conflict=true and data.choices listing 4 options. " +
      "When this happens, DO NOT call any other tools — instead, present the 4 options to the user as a question and wait for their reply. " +
      "After the user picks an option, you may call create_schedule again with force=true to insert anyway, " +
      "or call delete_schedule on the existing entry first and then create_schedule, depending on the user's choice.",
    input_schema: {
      type: "object",
      properties: {
        date: { type: "string", description: "YYYY-MM-DD. Defaults to today." },
        title: { type: "string", description: "What the event is, e.g. 'ジム'." },
        start_minutes: { type: "integer", description: "Start time as minutes from midnight. Range: 0 (00:00) to 1439 (23:59). 13:00 = 780. INTEGER only." },
        end_minutes: { type: "integer", description: "End time as minutes from midnight. Range: 1 to 1440 (1440 = 24:00 / midnight). Must be > start_minutes. INTEGER only. For events crossing midnight (e.g. 23:00-01:00), split into two entries (23:00-24:00 + 00:00-01:00)." },
        color: { type: "string", description: "Hex color like '#E8654A'. Optional." },
        force: {
          type: "boolean",
          description:
            "If true, skip conflict detection and create the schedule even if it overlaps. Use this only when the user has explicitly chosen to allow the duplication.",
        },
      },
      required: ["title", "start_minutes", "end_minutes"],
    },
  },
  {
    name: "update_schedule",
    description:
      "[SCHEDULE PAGE] Edit an existing SCHEDULE entry. Pass any subset of fields to change. " +
      "Use this when the user wants to move, retitle, or recolor a schedule entry. " +
      "If the user wants to MOVE the time, pass new start_minutes / end_minutes.",
    input_schema: {
      type: "object",
      properties: {
        schedule_id: { type: "string" },
        title: { type: "string" },
        start_minutes: { type: "integer" },
        end_minutes: { type: "integer" },
        color: { type: "string" },
        date: { type: "string", description: "YYYY-MM-DD if moving to a different day." },
      },
      required: ["schedule_id"],
    },
  },
  {
    name: "delete_schedule",
    description:
      "[SCHEDULE PAGE] Delete a SCHEDULE entry. " +
      "You MUST call request_confirmation BEFORE this tool, EXCEPT when handling option (a) of a create_schedule conflict (replacement workflow). " +
      "For user-initiated deletions, only call this when the user's next message starts with 'CONFIRMED: '.",
    input_schema: {
      type: "object",
      properties: { schedule_id: { type: "string" } },
      required: ["schedule_id"],
    },
  },

  // ---------- Routines ----------
  {
    name: "list_routine_for_date",
    description:
      "[ROUTINE PAGE] List the user's routine items for a specific date, grouped by slot (morning/daytime/evening). " +
      "Includes both permanent template items and today-only items for that date. " +
      "Each item has id, title, slot, sort_order, today_only_date, is_active, is_completed (whether checked off for that date), is_skipped.",
    input_schema: {
      type: "object",
      properties: {
        date: { type: "string", description: "YYYY-MM-DD. Defaults to today." },
      },
    },
  },
  {
    name: "list_routine_template",
    description:
      "[ROUTINE PAGE] List the PERMANENT routine template items (the items that recur every day). " +
      "Excludes today-only items. Use list_routine_for_date if you need today-only items too.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "add_routine_item",
    description:
      "[ROUTINE PAGE] Add a routine item. " +
      "If today_only_date is OMITTED, the item becomes a PERMANENT template item that recurs every day. " +
      "If today_only_date is SET to a specific YYYY-MM-DD, the item only appears on that single date " +
      "(use this when the user says 「今日だけ」 / 「明日だけ」 etc.). " +
      "slot must be one of: morning / daytime / evening.",
    input_schema: {
      type: "object",
      properties: {
        slot: { type: "string", enum: ["morning", "daytime", "evening"] },
        title: { type: "string", description: "What the routine is, e.g. '英単語15分'." },
        short_label: { type: "string", description: "Optional short label." },
        today_only_date: {
          type: "string",
          description: "YYYY-MM-DD. If set, item appears only on this date (one-off). Omit for permanent template.",
        },
      },
      required: ["slot", "title"],
    },
  },
  {
    name: "update_routine_item",
    description:
      "[ROUTINE PAGE] Update a routine template item. Pass any subset of fields. " +
      "Use is_active=false to soft-disable an item without deleting it.",
    input_schema: {
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
      "[ROUTINE PAGE] Permanently delete a routine item (template OR today-only). " +
      "You MUST call request_confirmation BEFORE this tool. Only call this when the user's next message starts with 'CONFIRMED: '.",
    input_schema: {
      type: "object",
      properties: { item_id: { type: "string" } },
      required: ["item_id"],
    },
  },
  {
    name: "toggle_routine_completion",
    description:
      "[ROUTINE PAGE] Mark a routine item as completed or uncompleted for a specific date. " +
      "Use this when the user says 'X にチェックを入れて' / 'X を完了に' / 'check off X'.",
    input_schema: {
      type: "object",
      properties: {
        item_id: { type: "string" },
        date: { type: "string", description: "YYYY-MM-DD. Defaults to today." },
        completed: { type: "boolean", description: "true = check, false = uncheck." },
      },
      required: ["item_id", "completed"],
    },
  },

  // ---------- Stats ----------
  {
    name: "get_stats",
    description:
      "Return completion-rate statistics across todos and routines for the last N days. " +
      "Default range is 7 days. Use this when the user asks '達成率は？', 'どれくらいやれてる？', 'show me stats' etc.",
    input_schema: {
      type: "object",
      properties: {
        days_back: { type: "integer", description: "How many days back to include (default 7, max 90)." },
      },
    },
  },
];

// ---------- Tool executors ----------

export const TOOL_EXECUTORS: Record<string, ToolExecutor> = {
  // ---------- Goals ----------
  list_goals: async (input, ctx) => {
    const tz = "Asia/Tokyo";
    const today = todayStringInTZ(ctx.now, tz);
    const level = input.level as string | undefined;
    const activeOnly = (input.active_only as boolean) !== false; // default true
    const includeCompleted = (input.include_completed as boolean) === true;

    let q = ctx.adminClient
      .from("goals")
      .select("id, level, parent_id, title, description, period_start, period_end, is_completed, sort_order")
      .eq("user_id", ctx.userId)
      .order("level", { ascending: true })
      .order("period_start", { ascending: true })
      .order("sort_order", { ascending: true });

    if (level) q = q.eq("level", level);
    if (activeOnly) {
      q = q.lte("period_start", today).gte("period_end", today);
    }
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
    if (!periodStart || !periodEnd) return fail("period_start and period_end are required (YYYY-MM-DD)");
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

  update_goal: async (input, ctx) => {
    const id = input.goal_id as string;
    if (!id) return fail("goal_id is required");

    const patch: Record<string, unknown> = {};
    if (typeof input.title === "string") patch.title = input.title;
    if (typeof input.description === "string") {
      patch.description = input.description === "" ? null : input.description;
    }
    if (typeof input.period_start === "string") patch.period_start = input.period_start;
    if (typeof input.period_end === "string") patch.period_end = input.period_end;
    if (typeof input.is_completed === "boolean") {
      patch.is_completed = input.is_completed;
      patch.completed_at = input.is_completed ? new Date().toISOString() : null;
    }
    if (typeof input.parent_goal_id === "string") {
      patch.parent_id = input.parent_goal_id === "" ? null : input.parent_goal_id;
    }
    if (Object.keys(patch).length === 0) return fail("Nothing to update");
    patch.updated_at = new Date().toISOString();

    const { data, error } = await ctx.adminClient
      .from("goals")
      .update(patch)
      .eq("id", id)
      .eq("user_id", ctx.userId)
      .select("id, level, title, period_start, period_end, is_completed")
      .maybeSingle();
    if (error) return fail(error.message);
    if (!data) return fail("Goal not found or not owned by you");
    return ok({ goal: data });
  },

  redirect_to_goal_coach: async (input, _ctx): Promise<ToolResult> => {
    const reason = (input.reason as string) || '目標設定';
    return ok({
      redirect: true,
      message:
        `目標設定（${reason}）は専用のAIで行います。下のボタンから「目標設定AI」を開いてください。\n` +
        `専用AIは過去のすべての会話を覚えており、あなただけのコーチとして伴走します。`,
      choices: [
        {
          id: 'open_coach',
          variant: 'primary',
          label: '目標設定AIを開く',
          nav: '/goal-coach',
        },
      ],
    });
  },

  delete_goal: async (input, ctx) => {
    const id = input.goal_id as string;
    if (!id) return fail("goal_id is required");
    const { data, error } = await ctx.adminClient
      .from("goals")
      .delete()
      .eq("id", id)
      .eq("user_id", ctx.userId)
      .select("id")
      .maybeSingle();
    if (error) return fail(error.message);
    if (!data) return fail("Goal not found");
    return ok({ deleted_id: data.id });
  },

  // ---------- Milestones ----------
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

    // Verify the goal belongs to the user before bulk-inserting
    const { data: ownerCheck } = await ctx.adminClient
      .from("goals")
      .select("id")
      .eq("id", goalId)
      .eq("user_id", ctx.userId)
      .maybeSingle();
    if (!ownerCheck) return fail("Goal not found or not owned by you");

    const raw = input.milestones;
    if (!Array.isArray(raw) || raw.length === 0) return fail("milestones must be a non-empty array");
    if (raw.length > 15) return fail("Too many milestones in one batch (max 15)");

    // Determine starting sort_order = current_max + 1
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

  create_milestone: async (input, ctx) => {
    const goalId = input.goal_id as string;
    const title = (input.title as string)?.trim();
    if (!goalId) return fail("goal_id is required");
    if (!title) return fail("title is required");

    const { data: ownerCheck } = await ctx.adminClient
      .from("goals")
      .select("id")
      .eq("id", goalId)
      .eq("user_id", ctx.userId)
      .maybeSingle();
    if (!ownerCheck) return fail("Goal not found or not owned by you");

    let sortOrder = input.sort_order as number | undefined;
    if (sortOrder === undefined) {
      const { data: last } = await ctx.adminClient
        .from("goal_milestones")
        .select("sort_order")
        .eq("goal_id", goalId)
        .order("sort_order", { ascending: false })
        .limit(1)
        .maybeSingle();
      sortOrder = ((last?.sort_order as number) ?? -1) + 1;
    }

    const { data, error } = await ctx.adminClient
      .from("goal_milestones")
      .insert({
        user_id: ctx.userId,
        goal_id: goalId,
        title,
        description: (input.description as string)?.trim() || null,
        target_date: (input.target_date as string) || null,
        sort_order: sortOrder,
      })
      .select("id, title, sort_order, target_date")
      .single();
    if (error) return fail(error.message);
    return ok({ milestone: data });
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

  delete_milestone: async (input, ctx) => {
    const id = input.milestone_id as string;
    if (!id) return fail("milestone_id is required");
    const { data, error } = await ctx.adminClient
      .from("goal_milestones")
      .delete()
      .eq("id", id)
      .eq("user_id", ctx.userId)
      .select("id")
      .maybeSingle();
    if (error) return fail(error.message);
    if (!data) return fail("Milestone not found");
    return ok({ deleted_id: data.id });
  },

  remember: async (input, ctx): Promise<ToolResult> => {
    const key = input.key as string;
    const value = input.value as string;
    if (!key || !value) return fail("key and value are required");
    const r = await upsertMemoryEntry(ctx.adminClient, ctx.userId, key, value);
    if (!r.ok) return fail(r.error ?? "Failed to save memory");
    return ok({ key, value, pruned_oldest: r.pruned ?? null });
  },

  forget: async (input, ctx): Promise<ToolResult> => {
    const key = input.key as string;
    if (!key) return fail("key is required");
    const r = await deleteMemoryEntry(ctx.adminClient, ctx.userId, key);
    return ok({ key, deleted: r.deleted });
  },

  list_memory: async (_input, ctx): Promise<ToolResult> => {
    const entries = await loadUserMemory(ctx.adminClient, ctx.userId);
    return ok({ entries, limit: MEMORY_LIMIT });
  },

  request_confirmation: async (input, _ctx: ToolContext): Promise<ToolResult> => {
    const summary = (input.summary as string) || "この操作を実行してよろしいですか？";
    const confirmedPrompt = (input.confirmed_action_prompt as string) || "CONFIRMED: 続行してください。";
    const destructive = (input.destructive as boolean) !== false;
    return ok({
      confirmation: true,
      destructive,
      summary,
      choices: [
        {
          id: "yes",
          variant: destructive ? "destructive" : "primary",
          label: destructive ? "はい、削除する" : "はい、実行する",
          prompt: confirmedPrompt,
        },
        {
          id: "no",
          variant: "secondary",
          label: "キャンセル",
          prompt: "CANCELLED: ユーザーは操作をキャンセルしました。何もせず、その旨を簡潔に伝えてください。",
        },
      ],
    });
  },

  get_current_context: async (_input, ctx: ToolContext): Promise<ToolResult> => {
    const tz = "Asia/Tokyo";
    const today = todayStringInTZ(ctx.now, tz);
    const hour = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false,
    }).format(ctx.now);
    return ok({
      today_date: today,
      current_time: hour,
      language: ctx.language,
      timezone: tz,
    });
  },

  // ---------- Workspace todos ----------
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

  list_todos: async (input, ctx) => {
    const tz = "Asia/Tokyo";
    const date = (input.date as string) || todayStringInTZ(ctx.now, tz);
    const onlyIncomplete = (input.only_incomplete as boolean) ?? false;

    const { data: ws } = await ctx.adminClient
      .from("workspaces")
      .select("id, type, area_titles")
      .eq("user_id", ctx.userId)
      .eq("date", date)
      .maybeSingle();

    if (!ws) return ok({ date, todos: [], area_titles: null });

    let q = ctx.adminClient
      .from("todos")
      .select("id, content, is_completed, grid_area, reminder_at, schedule_start_minutes, schedule_end_minutes")
      .eq("user_id", ctx.userId)
      .eq("workspace_id", ws.id)
      .order("order", { ascending: true });

    if (onlyIncomplete) q = q.eq("is_completed", false);

    const { data: todos, error } = await q;
    if (error) return fail(error.message);
    return ok({
      date,
      todos,
      workspace_type: ws.type,
      area_titles: ws.area_titles ?? null,
    });
  },

  create_todo: async (input, ctx) => {
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

    // Resolve area_name to a physical grid_area position using the workspace's
    // area_titles. This is the path the AI should use when the user mentions
    // a category by name.
    if (workspaceMeta?.type === "four_grid" && areaName && !gridArea) {
      const matched = resolveGridAreaByName(areaName, areaTitles);
      if (!matched) {
        const titlesDesc = areaTitles
          ? Object.entries(areaTitles)
              .map(([k, v]) => `${k}=「${v}」`)
              .join(", ")
          : "(area_titles unset)";
        return fail(
          `area_name "${areaName}" did not match any workspace area title. Current titles: ${titlesDesc}. ` +
          "Ask the user to clarify which area they meant, or pass grid_area directly.",
        );
      }
      gridArea = matched;
    }

    // Workspace renders todos by grid_area for four_grid layout — todos with
    // grid_area=null are filtered out of the UI. Auto-assign the area with
    // the fewest items so AI-created tasks always appear somewhere.
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
    return ok({ todo: created, date, area_title_used: areaTitleUsed });
  },

  update_todo: async (input, ctx) => {
    const todoId = input.todo_id as string;
    if (!todoId) return fail("todo_id is required");

    const patch: Record<string, unknown> = {};
    if (typeof input.content === "string") patch.content = input.content;
    if (typeof input.is_completed === "boolean") {
      patch.is_completed = input.is_completed;
      patch.completed_at = input.is_completed ? new Date().toISOString() : null;
    }
    if (typeof input.reminder_at === "string") {
      patch.reminder_at = input.reminder_at === "" ? null : input.reminder_at;
    }
    if (Object.keys(patch).length === 0) return fail("Nothing to update");

    const { data, error } = await ctx.adminClient
      .from("todos")
      .update(patch)
      .eq("id", todoId)
      .eq("user_id", ctx.userId)
      .select("id, content, is_completed, reminder_at")
      .maybeSingle();

    if (error) return fail(error.message);
    if (!data) return fail("Todo not found or not owned by you");
    return ok({ todo: data });
  },

  delete_todo: async (input, ctx) => {
    const todoId = input.todo_id as string;
    if (!todoId) return fail("todo_id is required");

    const { data, error } = await ctx.adminClient
      .from("todos")
      .delete()
      .eq("id", todoId)
      .eq("user_id", ctx.userId)
      .select("id")
      .maybeSingle();

    if (error) return fail(error.message);
    if (!data) return fail("Todo not found or already deleted");
    return ok({ deleted_id: data.id });
  },

  // ---------- Schedules ----------
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

    // ----- Defensive validation (matches DB CHECK constraints exactly) -----
    if (!Number.isFinite(start) || !Number.isFinite(end)) {
      return fail("start_minutes / end_minutes must be numbers");
    }
    if (!Number.isInteger(start) || !Number.isInteger(end)) {
      return fail("start_minutes / end_minutes must be integers (minutes from midnight)");
    }
    // DB: start_minutes >= 0 AND start_minutes < 1440
    if (start < 0 || start >= 1440) {
      return fail(
        `start_minutes (${start}) is out of range. Must be 0–1439 (0=00:00, 1439=23:59). ` +
        `For midnight-crossing events, split into two entries.`,
      );
    }
    // DB: end_minutes > 0 AND end_minutes <= 1440 (1440 = midnight of next day)
    if (end <= 0 || end > 1440) {
      return fail(
        `end_minutes (${end}) is out of range. Must be 1–1440 (1440 = 24:00 / midnight).`,
      );
    }
    // DB: end_minutes > start_minutes
    if (end <= start) {
      return fail(
        `end_minutes (${end}) must be greater than start_minutes (${start}). ` +
        `For events that cross midnight (e.g. 23:00–01:00), split into two entries.`,
      );
    }
    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return fail(`date must be YYYY-MM-DD format (got: ${date})`);
    }
    const userColor = input.color as string | undefined;
    const force = (input.force as boolean) === true;

    // Pull all schedules on this date once — used both for conflict detection
    // and neighbor-aware color picking.
    const { data: sameDay } = await ctx.adminClient
      .from("schedules")
      .select("id, title, start_minutes, end_minutes, color")
      .eq("user_id", ctx.userId)
      .eq("date", date)
      .order("start_minutes", { ascending: true });

    const overlapping = (sameDay ?? []).filter(
      (s: any) => s.start_minutes < end && s.end_minutes > start,
    );

    if (!force) {
      if (overlapping.length > 0) {
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
              .join(", ")}）を削除してから、「${title}」を ${fmtTime(start)}〜${fmtTime(end)} (${date}) で force=true で追加して。`,
          },
          {
            id: "b",
            label: `(b) 重複させたまま ${pendingDesc} を追加する`,
            prompt: `(b) 重複させたままで構わないので、「${title}」を ${fmtTime(start)}〜${fmtTime(end)} (${date}) で force=true で追加して。`,
          },
          {
            id: "c",
            label: "(c) 別の時間帯に変更する",
            prompt: "(c) 別の時間帯にしたい。空いている時間を提案するか、何時にしたいか聞いて。",
          },
          {
            id: "d",
            label: "(d) 追加するのをやめる",
            prompt: "(d) やはり追加するのをやめます。何もしないでください。",
          },
        ];

        return ok({
          conflict: true,
          message:
            `指定した時間帯（${fmtTime(start)}〜${fmtTime(end)}）に既存の予定があります：${existingDesc}。` +
            "どうしますか？",
          pending: { date, title, start_minutes: start, end_minutes: end, color },
          existing: overlapping,
          choices,
        });
      }
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

    const { data, error } = await ctx.adminClient
      .from("schedules")
      .delete()
      .eq("id", scheduleId)
      .eq("user_id", ctx.userId)
      .select("id")
      .maybeSingle();

    if (error) return fail(error.message);
    if (!data) return fail("Schedule not found");
    return ok({ deleted_id: data.id });
  },

  // ---------- Routines ----------
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
    const tpl = await ensureRoutineTemplate(ctx.adminClient, ctx.userId);
    if (!tpl) return fail("Routine template not found");

    const { data, error } = await ctx.adminClient
      .from("routine_template_items")
      .delete()
      .eq("id", id)
      .eq("template_id", tpl.id)
      .select("id")
      .maybeSingle();
    if (error) return fail(error.message);
    if (!data) return fail("Item not found");
    return ok({ deleted_id: data.id });
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

  // ---------- Stats ----------
  get_stats: async (input, ctx) => {
    const tz = "Asia/Tokyo";
    const today = todayStringInTZ(ctx.now, tz);
    const daysBack = Math.min(Math.max(Number(input.days_back) || 7, 1), 90);

    const start = new Date(ctx.now);
    start.setDate(start.getDate() - (daysBack - 1));
    const startDate = todayStringInTZ(start, tz);

    // Todos
    const { data: workspaces } = await ctx.adminClient
      .from("workspaces")
      .select("id, date")
      .eq("user_id", ctx.userId)
      .gte("date", startDate)
      .lte("date", today);
    const wsIds = (workspaces ?? []).map((w: any) => w.id);

    let totalTodos = 0, completedTodos = 0;
    if (wsIds.length > 0) {
      const { data: todos } = await ctx.adminClient
        .from("todos")
        .select("is_completed")
        .eq("user_id", ctx.userId)
        .in("workspace_id", wsIds);
      totalTodos = todos?.length ?? 0;
      completedTodos = (todos ?? []).filter((t: any) => t.is_completed).length;
    }

    // Routines
    const tpl = await ensureRoutineTemplate(ctx.adminClient, ctx.userId);
    let totalRoutineSlots = 0, completedRoutines = 0;
    if (tpl) {
      const { data: items } = await ctx.adminClient
        .from("routine_template_items")
        .select("id, today_only_date, is_active")
        .eq("template_id", tpl.id)
        .eq("is_active", true);
      const permanentIds = (items ?? []).filter((i: any) => !i.today_only_date).map((i: any) => i.id);
      const todayOnlyByDate = new Map<string, string[]>();
      for (const it of items ?? []) {
        if (it.today_only_date) {
          const arr = todayOnlyByDate.get(it.today_only_date) ?? [];
          arr.push(it.id);
          todayOnlyByDate.set(it.today_only_date, arr);
        }
      }

      // For each day in range, count active items: permanent + today_only matching
      const cur = new Date(start);
      const end = new Date(ctx.now);
      while (cur <= end) {
        const ds = todayStringInTZ(cur, tz);
        const todayOnlyOnThis = todayOnlyByDate.get(ds) ?? [];
        totalRoutineSlots += permanentIds.length + todayOnlyOnThis.length;
        cur.setDate(cur.getDate() + 1);
      }

      const { data: comps } = await ctx.adminClient
        .from("routine_completions")
        .select("item_id, date")
        .eq("user_id", ctx.userId)
        .gte("date", startDate)
        .lte("date", today);
      completedRoutines = comps?.length ?? 0;
    }

    return ok({
      range: { start: startDate, end: today, days: daysBack },
      todos: {
        total: totalTodos,
        completed: completedTodos,
        rate: totalTodos > 0 ? Math.round((completedTodos / totalTodos) * 1000) / 10 : 0,
      },
      routines: {
        total: totalRoutineSlots,
        completed: completedRoutines,
        rate: totalRoutineSlots > 0 ? Math.round((completedRoutines / totalRoutineSlots) * 1000) / 10 : 0,
      },
    });
  },
};
