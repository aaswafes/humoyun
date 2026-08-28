// =========================================================
// The ladder's arithmetic: horizons, date ranges, and the
// progress rollup that lets a life goal know how it is doing.
// Pure functions — no React, no store.
// =========================================================

import type { Goal, Horizon, Task, Tint } from "@/lib/types";
import {
  addDays, diffDays, endOfMonth, endOfWeek, formatDate, monthName,
  quarterOf, startOfMonth, startOfWeek, todayISO, weekNumber, yearOf,
} from "@/lib/date";

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
  /** blend of whichever signals exist, 0..1 */
  overall: number;
  /** what this goal contributes to its parent — a goal you called done counts whole */
  contribution: number;

  elapsed: number | null;
  daysLeft: number | null;
  pace: Pace | null;
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
  targetPct: null, taskPct: null, childPct: null, overall: 0, contribution: 0,
  elapsed: null, daysLeft: null, pace: null,
};

function compareGoals(a: Goal, b: Goal): number {
  if (a.order_index !== b.order_index) return a.order_index - b.order_index;
  const as = a.start_date ?? "9999";
  const bs = b.start_date ?? "9999";
  if (as !== bs) return as < bs ? -1 : 1;
  return a.title.localeCompare(b.title);
}

export function buildGoalIndex(goals: Goal[], tasks: Task[], today = todayISO()): GoalIndex {
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

    const targetPct = goal.target != null && goal.target > 0 ? clamp01(goal.current / goal.target) : null;
    const taskPct = direct.length ? directDone / direct.length : null;
    const childPct = counted.length
      ? childStats.filter(([c]) => c.status !== "dropped")
          .reduce((sum, [, cs]) => sum + cs.contribution, 0) / counted.length
      : null;

    const parts = [targetPct, childPct, taskPct].filter((p): p is number => p != null);
    const overall = parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : 0;

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
      overall,
      contribution: goal.status === "done" ? 1 : goal.status === "dropped" ? 0 : overall,
      elapsed,
      daysLeft: goal.end_date ? diffDays(goal.end_date, today) : null,
      pace,
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
