import { diffDays, formatDate, todayISO } from "@/lib/date";
import type { Note, Project, ProjectStatus, Task } from "@/lib/types";

// =========================================================
// What a project knows about itself.
//
// A project owns tasks; everything it reports about progress, dates and health
// is read off those tasks rather than stored twice. Milestones are not a table
// — a task with kind "milestone" inside the project is one, which is why the
// calendar already draws them without knowing projects exist.
// =========================================================

export const PROJECT_STATUSES: ProjectStatus[] = ["idea", "active", "paused", "done", "dropped"];

/** The columns the board draws. Dropped is a shelf, not a stage. */
export const BOARD_STATUSES: ProjectStatus[] = ["idea", "active", "paused", "done"];

export const STATUS_LABEL: Record<ProjectStatus, string> = {
  idea: "Idea",
  active: "Active",
  paused: "Paused",
  done: "Done",
  dropped: "Dropped",
};

/** Empty-column copy — says what the column is for, not that it is empty. */
export const STATUS_BLURB: Record<ProjectStatus, string> = {
  idea: "Things you might build. No commitment, no dates.",
  active: "What you are actually working on right now.",
  paused: "Started, deliberately set down. Nothing is late here.",
  done: "Shipped. Kept so the year has receipts.",
  dropped: "Decided against. Kept so you don't reopen the same argument.",
};

export const STATUS_ORDER: Record<ProjectStatus, number> = {
  active: 0, idea: 1, paused: 2, done: 3, dropped: 4,
};

/** A project stops asking for anything once it is finished or abandoned. */
export function isLive(status: ProjectStatus): boolean {
  return status === "idea" || status === "active" || status === "paused";
}

export function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

// ---------------------------------------------------------
// Stats
// ---------------------------------------------------------
export interface ProjectStats {
  /**
   * Top-level, non-milestone tasks — the work. A subtask inherits the project
   * but never counts twice, and a milestone is a checkpoint rather than a unit
   * of work, so it is counted separately and nowhere in these four numbers.
   */
  total: number;
  done: number;
  open: number;
  /** open tasks dated before today */
  overdue: number;
  /** 0..1 — done over total, or 0 when there is nothing to do yet */
  progress: number;
  tasks: Task[];
  milestones: Task[];
  milestoneTotal: number;
  milestoneDone: number;
  nextMilestone: Task | null;
  /** soonest date on an open task */
  nextDate: string | null;
  /** the day the last thing here was finished */
  lastDone: string | null;
  /** effective window: explicit dates first, task dates as the fallback */
  start: string | null;
  end: string | null;
  notes: number;
}

const EMPTY: ProjectStats = {
  total: 0, done: 0, open: 0, overdue: 0, progress: 0,
  tasks: [], milestones: [], milestoneTotal: 0, milestoneDone: 0,
  nextMilestone: null, nextDate: null, lastDone: null,
  start: null, end: null, notes: 0,
};

export interface ProjectIndex {
  byId: Map<string, Project>;
  stats: (id: string) => ProjectStats;
}

function byDate(a: Task, b: Task): number {
  return (a.date ?? "9999").localeCompare(b.date ?? "9999")
    || a.order_index - b.order_index;
}

/**
 * One pass over tasks and notes, not one pass per card. The board, the list and
 * the timeline all read the same index, so three views can never disagree about
 * how far along a project is.
 */
export function buildProjectIndex(
  projects: Project[],
  tasks: Task[],
  notes: Note[],
  today = todayISO(),
): ProjectIndex {
  const byId = new Map(projects.map((p) => [p.id, p]));
  const grouped = new Map<string, Task[]>();
  const noteCount = new Map<string, number>();

  for (const task of tasks) {
    if (!task.project_id || task.parent_id) continue;
    const list = grouped.get(task.project_id);
    if (list) list.push(task);
    else grouped.set(task.project_id, [task]);
  }
  for (const note of notes) {
    if (!note.project_id) continue;
    noteCount.set(note.project_id, (noteCount.get(note.project_id) ?? 0) + 1);
  }

  const cache = new Map<string, ProjectStats>();

  function compute(id: string): ProjectStats {
    const project = byId.get(id);
    const own = (grouped.get(id) ?? []).slice().sort(byDate);
    if (!project) return EMPTY;

    const milestones = own.filter((t) => t.kind === "milestone");
    // A dropped task is a decision, not a debt — it leaves the denominator.
    // Milestones leave it too: the sheet shows them in their own panel, and a
    // bar that counted them would never match the list printed under it.
    const counted = own.filter((t) => t.kind !== "milestone" && t.status !== "dropped");
    const done = counted.filter((t) => t.status === "done");
    const open = counted.filter((t) => t.status !== "done");

    const dated = own.map((t) => t.date).filter((d): d is string => !!d).sort();
    const completions = done
      .map((t) => t.completed_at)
      .filter((d): d is string => !!d)
      .sort();

    return {
      total: counted.length,
      done: done.length,
      open: open.length,
      overdue: open.filter((t) => t.date && t.date < today).length,
      progress: counted.length ? done.length / counted.length : 0,
      tasks: own,
      milestones,
      milestoneTotal: milestones.length,
      milestoneDone: milestones.filter((m) => m.status === "done").length,
      nextMilestone:
        milestones.find((m) => m.status !== "done" && m.date && m.date >= today)
        ?? milestones.find((m) => m.status !== "done")
        ?? null,
      nextDate: open.find((t) => t.date && t.date >= today)?.date ?? null,
      lastDone: completions.length ? completions[completions.length - 1].slice(0, 10) : null,
      start: project.start_date ?? dated[0] ?? null,
      end: project.due_date ?? dated[dated.length - 1] ?? null,
      notes: noteCount.get(id) ?? 0,
    };
  }

  return {
    byId,
    stats(id) {
      const hit = cache.get(id);
      if (hit) return hit;
      const value = compute(id);
      cache.set(id, value);
      return value;
    },
  };
}

// ---------------------------------------------------------
// Attention
//
// Rule six of the calm pass: a warning colour is for something you must act on
// now. A project with no dates is information; a project a week late is not.
// ---------------------------------------------------------
export type FlagTone = "quiet" | "warn" | "danger";

export interface Flag {
  key: string;
  label: string;
  tone: FlagTone;
}

/** How long without a completion before a live project reads as stalled. */
const STALL_DAYS = 21;

export function projectAttention(
  project: Project,
  stats: ProjectStats,
  today = todayISO(),
): Flag[] {
  if (!isLive(project.status)) return [];
  const flags: Flag[] = [];

  if (project.due_date && project.status === "active") {
    const left = diffDays(project.due_date, today);
    if (left < 0) {
      flags.push({ key: "late", label: `${-left}d past due`, tone: "danger" });
    } else if (left <= 7) {
      flags.push({ key: "soon", label: left === 0 ? "Due today" : `${left}d left`, tone: "warn" });
    }
  }

  // A paused project is deliberately set down — nothing in it is late, and an
  // idea has not started, so neither reports overdue work.
  if (stats.overdue > 0 && project.status === "active") {
    flags.push({
      key: "overdue",
      label: `${stats.overdue} task${stats.overdue === 1 ? "" : "s"} overdue`,
      tone: "quiet",
    });
  }

  if (stats.total === 0) {
    flags.push({ key: "empty", label: "No tasks yet", tone: "quiet" });
  } else if (project.status === "active" && stats.open > 0) {
    const since = stats.lastDone ?? project.created_at.slice(0, 10);
    if (diffDays(today, since) >= STALL_DAYS) {
      flags.push({ key: "stalled", label: `Nothing finished in ${diffDays(today, since)}d`, tone: "quiet" });
    }
  }

  return flags;
}

// ---------------------------------------------------------
// Formatting
// ---------------------------------------------------------
/** "12 Sep — 30 Oct", or one date when only one end is known. */
export function formatRange(start: string | null, end: string | null): string | null {
  if (start && end) {
    return start === end
      ? formatDate(start, { weekday: false })
      : `${formatDate(start, { weekday: false })} — ${formatDate(end, { weekday: false })}`;
  }
  if (end) return `Due ${formatDate(end, { weekday: false })}`;
  if (start) return `From ${formatDate(start, { weekday: false })}`;
  return null;
}

/** The one line a card shows about time. Empty when the project has no clock. */
export function dueLabel(project: Project, today = todayISO()): string | null {
  if (!project.due_date) return null;
  // A finished project's date is history, not a debt — it never reads as late.
  if (!isLive(project.status)) return formatDate(project.due_date, { weekday: false });
  const left = diffDays(project.due_date, today);
  if (left === 0) return "Due today";
  if (left === 1) return "Due tomorrow";
  if (left < 0) return `${-left}d past due`;
  if (left <= 30) return `${left}d left`;
  return `Due ${formatDate(project.due_date, { weekday: false })}`;
}

export function sortProjects(projects: Project[]): Project[] {
  return projects.slice().sort((a, b) =>
    STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
    || (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999")
    || a.order_index - b.order_index
    || a.created_at.localeCompare(b.created_at));
}
