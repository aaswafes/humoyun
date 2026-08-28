// =========================================================
// The ladder's arithmetic: horizons, date ranges, and the
// progress rollup that lets a life goal know how it is doing.
// Pure functions — no React, no store.
// =========================================================

import type { Book, Goal, HabitLog, Horizon, Task, Tint } from "@/lib/types";
import {
  addDays, diffDays, endOfMonth, endOfWeek, formatDate, monthName,
  quarterOf, startOfMonth, startOfWeek, todayISO, weekNumber, yearOf,
} from "@/lib/date";
import {
  checkInDueOn, EMPTY_META, isDefined, milestoneCounts, readMeta,
  type GoalMeta, type ProgressMode,
} from "./goal-meta";

export const HORIZONS: Horizon[] = ["life", "year", "quarter", "month", "week"];

export const HORIZON_LABEL: Record<Horizon, string> = {
  life: "Life", year: "Year", quarter: "Quarter", month: "Month", week: "Week",
};

export const HORIZON_PLURAL: Record<Horizon, string> = {
  life: "life goals", year: "years", quarter: "quarters", month: "months", week: "weeks",
};

export const HORIZON_BLURB: Record<Horizon, string> = {
  life: "The few things a whole life points at.",
  year: "What this year has to produce.",
  quarter: "A thirteen-week push you can actually plan.",
  month: "One concrete outcome, four weeks wide.",
  week: "What has to happen in the next seven days.",
};

export function horizonIndex(h: Horizon): number {
  return HORIZONS.indexOf(h);
}

export function childHorizon(h: Horizon): Horizon | null {
  const i = horizonIndex(h);
  return i < 0 || i === HORIZONS.length - 1 ? null : HORIZONS[i + 1];
}

export function parentHorizon(h: Horizon): Horizon | null {
  const i = horizonIndex(h);
  return i <= 0 ? null : HORIZONS[i - 1];
}

// ---------------------------------------------------------
// Calendar periods
// ---------------------------------------------------------
const pad2 = (n: number) => String(n).padStart(2, "0");

export function yearStart(iso: string) { return `${yearOf(iso)}-01-01`; }
export function yearEnd(iso: string) { return `${yearOf(iso)}-12-31`; }

export function quarterStart(iso: string) {
  return `${yearOf(iso)}-${pad2((quarterOf(iso) - 1) * 3 + 1)}-01`;
}
export function quarterEnd(iso: string) {
  const y = yearOf(iso);
  const lastMonth = (quarterOf(iso) - 1) * 3 + 3;
  return endOfMonth(`${y}-${pad2(lastMonth)}-01`);
}

export interface DateRange { start: string; end: string }

/** The calendar period of `horizon` that contains `anchor`. */
export function periodRange(h: Horizon, anchor: string, weekStart = 1): DateRange {
  switch (h) {
    case "life": return { start: yearStart(anchor), end: `${yearOf(anchor) + 9}-12-31` };
    case "year": return { start: yearStart(anchor), end: yearEnd(anchor) };
    case "quarter": return { start: quarterStart(anchor), end: quarterEnd(anchor) };
    case "month": return { start: startOfMonth(anchor), end: endOfMonth(anchor) };
    case "week": return { start: startOfWeek(anchor, weekStart), end: endOfWeek(anchor, weekStart) };
  }
}

export function periodLabel(h: Horizon, anchor: string): string {
  switch (h) {
    case "life": return `${yearOf(anchor)}–${yearOf(anchor) + 9}`;
    case "year": return String(yearOf(anchor));
    case "quarter": return `Q${quarterOf(anchor)} ${yearOf(anchor)}`;
    case "month": return `${monthName(anchor, true)} ${yearOf(anchor)}`;
    case "week": return `Week ${weekNumber(anchor)}`;
  }
}

// ---------------------------------------------------------
// Break down — one click turns a range into its child periods
// ---------------------------------------------------------
export interface BreakdownPeriod {
  start: string;
  end: string;
  label: string;
  /** true when a child goal already covers this period */
  exists: boolean;
}

export interface BreakdownPlan {
  horizon: Horizon;
  periods: BreakdownPeriod[];
  missing: number;
}

export function breakdownPlan(
  goal: Goal, existingChildren: Goal[], weekStart = 1,
): BreakdownPlan | null {
  const h = childHorizon(goal.horizon);
  if (!h) return null;

  const fallback = periodRange(goal.horizon, goal.start_date ?? goal.end_date ?? todayISO(), weekStart);
  const start = goal.start_date ?? fallback.start;
  const end = goal.end_date ?? fallback.end;
  if (end < start) return null;

  const taken = new Set(existingChildren.filter((c) => c.horizon === h && c.start_date).map((c) => c.start_date));

  const periods: BreakdownPeriod[] = [];
  let cursor = start;
  let guard = 0;
  while (cursor <= end && guard++ < 600) {
    const range = periodRange(h, cursor, weekStart);
    const pStart = range.start < start ? start : range.start;
    const pEnd = range.end > end ? end : range.end;
    periods.push({
      start: pStart,
      end: pEnd,
      label: periodLabel(h, range.start),
      exists: taken.has(pStart) || taken.has(range.start),
    });
    cursor = addDays(range.end, 1);
  }

  return { horizon: h, periods, missing: periods.filter((p) => !p.exists).length };
}

/** Split a parent target across n children so the parts sum back to the whole. */
export function splitTarget(target: number | null, count: number, i: number): number | null {
  if (target == null || count <= 0) return null;
  return Math.round((target * (i + 1)) / count) - Math.round((target * i) / count);
}

// ---------------------------------------------------------
// Progress rollup
// ---------------------------------------------------------
export type Pace = "ahead" | "on track" | "behind";

/** A goal is stalled when nothing underneath it has moved in this many days. */
export const STALL_DAYS = 14;

export type SignalKey = Exclude<ProgressMode, "auto">;

/** One honest input to the progress bar, whether or not it has any data. */
export interface ProgressSignal {
  key: SignalKey;
  label: string;
  /** null when the goal has nothing of this kind — an absent signal never scores 0 */
  pct: number | null;
  detail: string;
}

export interface GoalStats {
  children: Goal[];
  childCount: number;
  childDone: number;
  descendantCount: number;

  directTasks: Task[];
  directDone: number;
  directTotal: number;
  subtreeDone: number;
  subtreeTotal: number;

  targetPct: number | null;
  taskPct: number | null;
  childPct: number | null;
  milestonePct: number | null;
  milestoneDone: number;
  milestoneTotal: number;

  /** the sidecar fields the goals table has no columns for */
  meta: GoalMeta;
  /** which signal the user put in charge of the bar */
  mode: ProgressMode;
  signals: ProgressSignal[];
  /** the blend of every signal that exists — what "Blend" mode uses */
  auto: number;
  /** the chosen driver has no data, so the blend is standing in for it */
  modeFallback: boolean;

  /** 0..1, driven by `mode` */
  overall: number;
  /** what this goal contributes to its parent — a goal you called done counts whole */
  contribution: number;

  elapsed: number | null;
  daysLeft: number | null;
  pace: Pace | null;

  /** the most recent day anything under this goal actually moved */
  lastActivity: string | null;
  daysQuiet: number | null;
  stalled: boolean;
  overdue: boolean;
  checkInDueOn: string | null;
  needsCheckIn: boolean;
  /** has both a why and a definition of done */
  defined: boolean;
  /** nothing points at it: no children, tasks, target or milestones */
  unlinked: boolean;
}

export interface GoalIndex {
  byId: Map<string, Goal>;
  childrenOf: Map<string, Goal[]>;
  byHorizon: Record<Horizon, Goal[]>;
  roots: Goal[];
  stats: (id: string) => GoalStats;
  lineageOf: (id: string) => Set<string>;
  descendantsOf: (id: string) => string[];
}

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

const EMPTY_STATS: GoalStats = {
  children: [], childCount: 0, childDone: 0, descendantCount: 0,
  directTasks: [], directDone: 0, directTotal: 0, subtreeDone: 0, subtreeTotal: 0,
  targetPct: null, taskPct: null, childPct: null, milestonePct: null,
  milestoneDone: 0, milestoneTotal: 0,
  meta: EMPTY_META, mode: "auto", signals: [], auto: 0, modeFallback: false,
  overall: 0, contribution: 0,
  elapsed: null, daysLeft: null, pace: null,
  lastActivity: null, daysQuiet: null, stalled: false, overdue: false,
  checkInDueOn: null, needsCheckIn: false, defined: false, unlinked: true,
};

/** The later of two ISO days, either of which may be missing. */
function laterDay(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

const dayOf = (timestamp: string | null | undefined): string | null =>
  timestamp && timestamp.length >= 10 ? timestamp.slice(0, 10) : null;

function compareGoals(a: Goal, b: Goal): number {
  if (a.order_index !== b.order_index) return a.order_index - b.order_index;
  const as = a.start_date ?? "9999";
  const bs = b.start_date ?? "9999";
  if (as !== bs) return as < bs ? -1 : 1;
  return a.title.localeCompare(b.title);
}

export interface GoalIndexInput {
  today?: string;
  /** logs for the habits a goal links to — a habit ticked is the goal moving */
  habitLogs?: HabitLog[];
  /** books a goal links to — a page turned is the goal moving */
  books?: Book[];
}

export function buildGoalIndex(
  goals: Goal[], tasks: Task[], input: GoalIndexInput = {},
): GoalIndex {
  const today = input.today ?? todayISO();

  const habitActivity = new Map<string, string>();
  for (const log of input.habitLogs ?? []) {
    const seen = habitActivity.get(log.habit_id);
    if (!seen || log.date > seen) habitActivity.set(log.habit_id, log.date);
  }
  const bookActivity = new Map<string, string>();
  for (const book of input.books ?? []) {
    const day = dayOf(book.updated_at);
    if (day) bookActivity.set(book.id, day);
  }

  const byId = new Map(goals.map((g) => [g.id, g]));
  const childrenOf = new Map<string, Goal[]>();
  const roots: Goal[] = [];
  const byHorizon: Record<Horizon, Goal[]> = { life: [], year: [], quarter: [], month: [], week: [] };

  for (const g of [...goals].sort(compareGoals)) {
    byHorizon[g.horizon]?.push(g);
    const parent = g.parent_id && byId.has(g.parent_id) && g.parent_id !== g.id ? g.parent_id : null;
    if (!parent) { roots.push(g); continue; }
    const list = childrenOf.get(parent);
    if (list) list.push(g); else childrenOf.set(parent, [g]);
  }

  const tasksOf = new Map<string, Task[]>();
  for (const t of tasks) {
    if (!t.goal_id) continue;
    const list = tasksOf.get(t.goal_id);
    if (list) list.push(t); else tasksOf.set(t.goal_id, [t]);
  }

  const cache = new Map<string, GoalStats>();
  const visiting = new Set<string>();

  function compute(goal: Goal): GoalStats {
    const hit = cache.get(goal.id);
    if (hit) return hit;
    // A goal re-parented under its own descendant would recurse forever.
    if (visiting.has(goal.id)) return EMPTY_STATS;
    visiting.add(goal.id);

    const children = childrenOf.get(goal.id) ?? [];
    const counted = children.filter((c) => c.status !== "dropped");
    const childStats = children.map((c) => [c, compute(c)] as const);

    const direct = (tasksOf.get(goal.id) ?? [])
      .filter((t) => t.status !== "dropped")
      .sort((a, b) => {
        if ((a.status === "done") !== (b.status === "done")) return a.status === "done" ? 1 : -1;
        const ad = a.date ?? "9999";
        const bd = b.date ?? "9999";
        if (ad !== bd) return ad < bd ? -1 : 1;
        return a.order_index - b.order_index;
      });
    const directDone = direct.filter((t) => t.status === "done").length;

    let subtreeDone = directDone;
    let subtreeTotal = direct.length;
    let descendantCount = children.length;
    for (const [, cs] of childStats) {
      subtreeDone += cs.subtreeDone;
      subtreeTotal += cs.subtreeTotal;
      descendantCount += cs.descendantCount;
    }

    const meta = readMeta(goal);
    const milestones = milestoneCounts(meta);

    const targetPct = goal.target != null && goal.target > 0 ? clamp01(goal.current / goal.target) : null;
    const taskPct = direct.length ? directDone / direct.length : null;
    const childPct = counted.length
      ? childStats.filter(([c]) => c.status !== "dropped")
          .reduce((sum, [, cs]) => sum + cs.contribution, 0) / counted.length
      : null;
    const milestonePct = milestones.total ? milestones.done / milestones.total : null;

    // Every signal is listed whether or not it has data, so the sheet can show
    // the whole formula instead of a number with no visible working.
    const signals: ProgressSignal[] = [
      {
        key: "target",
        label: "Target",
        pct: targetPct,
        detail: formatTarget(goal) ?? "No target set",
      },
      {
        key: "children",
        label: "Child goals",
        pct: childPct,
        detail: counted.length
          ? `${children.filter((c) => c.status === "done").length}/${counted.length} done`
          : "No child goals",
      },
      {
        key: "tasks",
        label: "Linked tasks",
        pct: taskPct,
        detail: direct.length ? `${directDone}/${direct.length} done` : "No linked tasks",
      },
      {
        key: "milestones",
        label: "Milestones",
        pct: milestonePct,
        detail: milestones.total ? `${milestones.done}/${milestones.total} reached` : "No milestones",
      },
    ];

    const present = signals.filter((s) => s.pct != null);
    const auto = present.length
      ? present.reduce((sum, s) => sum + (s.pct as number), 0) / present.length
      : 0;

    const chosen = meta.mode === "auto" ? null : signals.find((s) => s.key === meta.mode) ?? null;
    const modeFallback = meta.mode !== "auto" && chosen?.pct == null;
    const overall = chosen?.pct ?? auto;

    // "Has anything under this actually moved lately" — the question a stalled
    // goal fails. Editing the goal itself deliberately does not count.
    let lastActivity: string | null = null;
    for (const t of direct) {
      if (t.status === "done") {
        lastActivity = laterDay(lastActivity, dayOf(t.completed_at) ?? dayOf(t.updated_at));
      }
    }
    const latestCheckIn = meta.checkins.length ? meta.checkins[meta.checkins.length - 1].date : null;
    lastActivity = laterDay(lastActivity, latestCheckIn);
    for (const m of meta.milestones) if (m.done) lastActivity = laterDay(lastActivity, m.done_on);
    for (const id of meta.habit_ids) lastActivity = laterDay(lastActivity, habitActivity.get(id) ?? null);
    for (const id of meta.book_ids) lastActivity = laterDay(lastActivity, bookActivity.get(id) ?? null);
    if (goal.status === "done") lastActivity = laterDay(lastActivity, dayOf(goal.updated_at));
    for (const [, cs] of childStats) lastActivity = laterDay(lastActivity, cs.lastActivity);

    const since = lastActivity ?? dayOf(goal.created_at);
    const daysQuiet = since ? Math.max(0, diffDays(today, since)) : null;
    const trackable =
      direct.length > 0 || counted.length > 0 || meta.checkins.length > 0 ||
      milestones.total > 0 || goal.target != null;

    const dueOn = checkInDueOn(goal, meta);

    let elapsed: number | null = null;
    if (goal.start_date && goal.end_date && goal.end_date >= goal.start_date) {
      const span = diffDays(goal.end_date, goal.start_date) + 1;
      elapsed = clamp01((diffDays(today, goal.start_date) + 1) / span);
    }

    let pace: Pace | null = null;
    if (elapsed != null && goal.status === "active" && elapsed > 0.05 && elapsed < 1) {
      const drift = overall - elapsed;
      pace = drift > 0.1 ? "ahead" : drift < -0.1 ? "behind" : "on track";
    }

    const stats: GoalStats = {
      children,
      childCount: children.length,
      childDone: children.filter((c) => c.status === "done").length,
      descendantCount,
      directTasks: direct,
      directDone,
      directTotal: direct.length,
      subtreeDone,
      subtreeTotal,
      targetPct,
      taskPct,
      childPct,
      milestonePct,
      milestoneDone: milestones.done,
      milestoneTotal: milestones.total,
      meta,
      mode: meta.mode,
      signals,
      auto,
      modeFallback,
      overall,
      contribution: goal.status === "done" ? 1 : goal.status === "dropped" ? 0 : overall,
      elapsed,
      daysLeft: goal.end_date ? diffDays(goal.end_date, today) : null,
      pace,
      lastActivity,
      daysQuiet,
      stalled: goal.status === "active" && trackable && (daysQuiet ?? 0) >= STALL_DAYS,
      overdue: goal.status === "active" && !!goal.end_date && goal.end_date < today,
      checkInDueOn: dueOn,
      needsCheckIn: goal.status === "active" && dueOn != null && dueOn <= today,
      defined: isDefined(goal, meta),
      unlinked:
        direct.length === 0 && children.length === 0 &&
        goal.target == null && milestones.total === 0,
    };

    visiting.delete(goal.id);
    cache.set(goal.id, stats);
    return stats;
  }

  goals.forEach(compute);

  function descendantsOf(id: string): string[] {
    const out: string[] = [];
    const stack = [id];
    let guard = 0;
    while (stack.length && guard++ < 5000) {
      const next = stack.pop() as string;
      for (const child of childrenOf.get(next) ?? []) {
        out.push(child.id);
        stack.push(child.id);
      }
    }
    return out;
  }

  function ancestorsOf(id: string): string[] {
    const out: string[] = [];
    let cur = byId.get(id)?.parent_id ?? null;
    let guard = 0;
    while (cur && guard++ < 50) {
      out.push(cur);
      cur = byId.get(cur)?.parent_id ?? null;
    }
    return out;
  }

  return {
    byId,
    childrenOf,
    byHorizon,
    roots,
    stats: (id) => cache.get(id) ?? EMPTY_STATS,
    descendantsOf,
    lineageOf: (id) => new Set([id, ...ancestorsOf(id), ...descendantsOf(id)]),
  };
}

// ---------------------------------------------------------
// Formatting
// ---------------------------------------------------------

/** Grouped by hand rather than Intl so server and client always agree. */
export function fmtNum(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  const [int, frac] = String(Math.abs(rounded)).split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${rounded < 0 ? "-" : ""}${grouped}${frac ? `.${frac}` : ""}`;
}

export function pct(fraction: number): string {
  return `${Math.round(clamp01(fraction) * 100)}%`;
}

export function formatGoalRange(goal: Goal, today = todayISO()): string {
  const { start_date: s, end_date: e } = goal;
  const thisYear = yearOf(today);
  if (s && e) {
    const spansYears = yearOf(s) !== yearOf(e);
    const offYear = yearOf(s) !== thisYear || yearOf(e) !== thisYear;
    return `${formatDate(s, { weekday: false, year: spansYears })} – ${formatDate(e, { weekday: false, year: offYear })}`;
  }
  if (s) return `From ${formatDate(s, { weekday: false, year: yearOf(s) !== thisYear })}`;
  if (e) return `By ${formatDate(e, { weekday: false, year: yearOf(e) !== thisYear })}`;
  return "No dates";
}

export function formatTarget(goal: Goal): string | null {
  if (goal.target == null) return null;
  const unit = goal.unit ? ` ${goal.unit}` : "";
  return `${fmtNum(goal.current)}/${fmtNum(goal.target)}${unit}`;
}

/** The date a finished goal actually landed on. */
export function finishedOn(goal: Goal): string {
  if (goal.end_date) return goal.end_date;
  const d = new Date(goal.updated_at);
  if (Number.isNaN(d.getTime())) return todayISO();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export const STATUS_LABEL: Record<Goal["status"], string> = {
  active: "Active", done: "Done", paused: "Paused", dropped: "Dropped",
};

/** A sensible tint for a new child so a branch reads as one family. */
export function inheritTint(parent: Goal | null | undefined): Tint {
  return parent?.color ?? "blue";
}

/** One line explaining where the number on the bar came from. */
export function explainProgress(stats: GoalStats): string {
  const present = stats.signals.filter((s) => s.pct != null);
  if (stats.mode !== "auto") {
    const chosen = stats.signals.find((s) => s.key === stats.mode);
    if (stats.modeFallback) {
      return `${chosen?.label ?? "That signal"} has nothing to measure yet, so the blend is standing in.`;
    }
    return `${chosen?.label} alone drives this bar — ${chosen?.detail.toLowerCase()}.`;
  }
  if (!present.length) return "Nothing measurable yet: no target, tasks, children or milestones.";
  if (present.length === 1) return `Only one signal exists: ${present[0].label.toLowerCase()}.`;
  return `The average of ${present.map((s) => s.label.toLowerCase()).join(", ")}.`;
}

// ---------------------------------------------------------
// Review state — what needs a human this week
// ---------------------------------------------------------
export type AttentionKind =
  | "overdue" | "checkin" | "stalled" | "behind" | "undated" | "undefined" | "unlinked";

export interface AttentionFlag {
  kind: AttentionKind;
  label: string;
  detail: string;
  tone: "danger" | "warn" | "muted";
}

export const ATTENTION_ORDER: AttentionKind[] = [
  "overdue", "checkin", "stalled", "behind", "undated", "undefined", "unlinked",
];

export const ATTENTION_TITLE: Record<AttentionKind, string> = {
  overdue: "Past their end date",
  checkin: "Waiting on a check-in",
  stalled: "Nothing has moved",
  behind: "Behind their own pace",
  undated: "No dates to be judged by",
  undefined: "Still reads as a wish",
  unlinked: "Nothing points at them",
};

export const ATTENTION_BLURB: Record<AttentionKind, string> = {
  overdue: "The date passed and the goal is still open. Finish it, extend it, or drop it.",
  checkin: "You asked to be prompted. Log where the number actually stands.",
  stalled: `No task, check-in or milestone under these in ${STALL_DAYS} days.`,
  behind: "Less progress than time elapsed. Cut the scope or make room.",
  undated: "Without a start and an end there is no pace, no timeline, no urgency.",
  undefined: "A goal needs a why and a picture of done. Otherwise it is a wish.",
  unlinked: "No child goals, no tasks, no target, no milestones. Nothing can move it.",
};

/** Everything wrong with one goal, worst first. Only active goals qualify. */
export function goalAttention(goal: Goal, stats: GoalStats, today = todayISO()): AttentionFlag[] {
  if (goal.status !== "active") return [];
  const flags: AttentionFlag[] = [];

  if (stats.overdue) {
    const over = goal.end_date ? diffDays(today, goal.end_date) : 0;
    flags.push({
      kind: "overdue", label: "Overdue", tone: "danger",
      detail: `${over} ${over === 1 ? "day" : "days"} past ${formatDate(goal.end_date as string, { weekday: false })}`,
    });
  }
  if (stats.needsCheckIn) {
    const late = stats.checkInDueOn ? diffDays(today, stats.checkInDueOn) : 0;
    flags.push({
      kind: "checkin", label: "Check in", tone: "warn",
      detail: late <= 0 ? "Due today" : `Asked ${late} ${late === 1 ? "day" : "days"} ago`,
    });
  }
  if (stats.stalled) {
    flags.push({
      kind: "stalled", label: "Stalled", tone: "warn",
      detail: `Quiet for ${stats.daysQuiet} days`,
    });
  }
  if (stats.pace === "behind" && !stats.overdue) {
    flags.push({
      kind: "behind", label: "Behind", tone: "warn",
      detail: `${pct(stats.overall)} done, ${pct(stats.elapsed ?? 0)} of the time gone`,
    });
  }
  if (!goal.start_date || !goal.end_date) {
    flags.push({ kind: "undated", label: "No dates", tone: "muted", detail: formatGoalRange(goal) });
  }
  if (!stats.defined) {
    flags.push({
      kind: "undefined", label: "Undefined", tone: "muted",
      detail: stats.meta.done_looks_like.trim() ? "No why written" : "No picture of done",
    });
  }
  if (stats.unlinked) {
    flags.push({ kind: "unlinked", label: "Nothing linked", tone: "muted", detail: "No tasks, children or target" });
  }

  return flags;
}

/** Sort key: how loudly a goal is asking for attention. */
export function attentionScore(flags: AttentionFlag[]): number {
  return flags.reduce(
    (sum, f) => sum + (f.tone === "danger" ? 100 : f.tone === "warn" ? 10 : 1),
    0,
  );
}
