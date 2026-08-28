// =========================================================
// Evidence. The recap says how much; this module says what of.
//
// Everything here is pure and takes the same `days` list the metrics take, so
// the weekly, monthly and yearly review all read from one implementation.
// =========================================================

import { startOfWeek } from "@/lib/date";
import {
  habitScheduledOn, isHabitComplete, weeklyTarget, type HabitCounts,
} from "@/lib/habits";
import { PRAYER_NAMES } from "@/lib/types";
import type {
  Book, FocusSession, Goal, Habit, HabitLog, Prayer, PrayerName, PrayerStatus, Task, Tint,
} from "@/lib/types";
import { COMPLETED_PRAYER, isFocusSession, pagesOf, sessionDate, tasksIn } from "./metrics";

// ---------------------------------------------------------
// Goals advanced
// ---------------------------------------------------------
export interface GoalEvidence {
  goal: Goal;
  closed: number;
  /** Titles of the tasks that moved it, newest first, capped for display. */
  titles: string[];
  progress: number | null;
}

export function goalEvidence(days: string[], tasks: Task[], goals: Goal[]): GoalEvidence[] {
  const inRange = new Set(days);
  const byGoal = new Map<string, Task[]>();

  for (const t of tasks) {
    if (!t.goal_id || t.status !== "done" || !t.date || !inRange.has(t.date)) continue;
    const list = byGoal.get(t.goal_id);
    if (list) list.push(t); else byGoal.set(t.goal_id, [t]);
  }

  const out: GoalEvidence[] = [];
  for (const [goalId, list] of byGoal) {
    const goal = goals.find((g) => g.id === goalId);
    if (!goal) continue;
    list.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
    out.push({
      goal,
      closed: list.length,
      titles: list.slice(0, 4).map((t) => t.title || "Untitled"),
      progress: goal.target ? Math.min(100, Math.round((goal.current / goal.target) * 100)) : null,
    });
  }
  return out.sort((a, b) => b.closed - a.closed);
}

/** Active goals that got nothing at all — the quiet half of the story. */
export function goalsUntouched(days: string[], tasks: Task[], goals: Goal[]): Goal[] {
  const moved = new Set(goalEvidence(days, tasks, goals).map((g) => g.goal.id));
  return goals.filter((g) => g.status === "active" && !moved.has(g.id));
}

// ---------------------------------------------------------
// Books progressed
// ---------------------------------------------------------
export interface BookEvidence {
  book: Book;
  pages: number;
  sessions: number;
  /** Where the bookmark stands now, as a percentage of the book. */
  progress: number;
  finished: boolean;
}

export function bookEvidence(days: string[], tasks: Task[], books: Book[]): BookEvidence[] {
  const inRange = new Set(days);
  const pagesByBook = new Map<string, { pages: number; sessions: number }>();

  for (const t of tasks) {
    if (t.status !== "done" || !t.book_id || !t.date || !inRange.has(t.date)) continue;
    const pages = pagesOf(t);
    const cur = pagesByBook.get(t.book_id) ?? { pages: 0, sessions: 0 };
    cur.pages += pages;
    cur.sessions += 1;
    pagesByBook.set(t.book_id, cur);
  }

  const out: BookEvidence[] = [];
  for (const [bookId, agg] of pagesByBook) {
    const book = books.find((b) => b.id === bookId);
    if (!book) continue;
    out.push({
      book,
      pages: agg.pages,
      sessions: agg.sessions,
      progress: book.total_pages > 0
        ? Math.min(100, Math.round((book.current_page / book.total_pages) * 100))
        : 0,
      finished: book.status === "finished",
    });
  }
  return out.sort((a, b) => b.pages - a.pages || b.sessions - a.sessions);
}

// ---------------------------------------------------------
// Habits, day by day
// ---------------------------------------------------------
export type HabitCellState = "hit" | "missed" | "partial" | "off";

export interface HabitRow {
  habit: Habit;
  cells: { date: string; state: HabitCellState; count: number }[];
  hit: number;
  due: number;
}

export function habitRows(
  days: string[], habits: Habit[], logs: HabitLog[], weekStartDay = 1,
): HabitRow[] {
  if (!days.length) return [];
  const inRange = new Set(days);

  return habits
    .filter((h) => !h.archived)
    .map((habit) => {
      const counts: HabitCounts = new Map(
        logs.filter((l) => l.habit_id === habit.id && inRange.has(l.date)).map((l) => [l.date, l.count]),
      );

      // For a quota habit the week decides which days were owed, so the row is
      // built week by week: the earliest unlogged days carry the remaining debt.
      const owed = new Set<string>();
      if (habit.cadence === "custom") {
        const weeks = new Map<string, string[]>();
        for (const day of days) {
          const key = startOfWeek(day, weekStartDay);
          const list = weeks.get(key);
          if (list) list.push(day); else weeks.set(key, [day]);
        }
        for (const slice of weeks.values()) {
          const target = Math.min(weeklyTarget(habit), slice.length);
          const doneDays = slice.filter((d) => isHabitComplete(habit, counts.get(d)));
          // Only the quota counts as owed — a fifth run of a 4x habit is a
          // bonus, not a sixth obligation, and the tally must agree with the
          // recap's number down to the digit.
          doneDays.slice(0, target).forEach((d) => owed.add(d));
          let debt = target - Math.min(target, doneDays.length);
          for (const d of slice) {
            if (debt <= 0) break;
            if (owed.has(d) || isHabitComplete(habit, counts.get(d))) continue;
            owed.add(d);
            debt--;
          }
        }
      }

      let hit = 0;
      let due = 0;
      const cells = days.map((date) => {
        const count = counts.get(date) ?? 0;
        const scheduled = habit.cadence === "custom"
          ? owed.has(date)
          : habitScheduledOn(habit, date, counts, weekStartDay);
        const complete = isHabitComplete(habit, count);
        if (scheduled) {
          due += 1;
          if (complete) hit += 1;
        }
        const state: HabitCellState = complete ? "hit"
          : count > 0 ? "partial"
            : scheduled ? "missed" : "off";
        return { date, state, count };
      });

      return { habit, cells, hit, due };
    })
    .filter((row) => row.due > 0 || row.hit > 0)
    .sort((a, b) => (b.due ? b.hit / b.due : 0) - (a.due ? a.hit / a.due : 0));
}

// ---------------------------------------------------------
// Salah, day by day
// ---------------------------------------------------------
export interface SalahDay {
  date: string;
  statuses: Record<PrayerName, PrayerStatus>;
  done: number;
}

export function salahDays(days: string[], prayers: Prayer[]): SalahDay[] {
  const byDate = new Map<string, Partial<Record<PrayerName, PrayerStatus>>>();
  const inRange = new Set(days);
  for (const p of prayers) {
    if (!inRange.has(p.date)) continue;
    const day = byDate.get(p.date) ?? {};
    day[p.name] = p.status;
    byDate.set(p.date, day);
  }

  return days.map((date) => {
    const raw = byDate.get(date) ?? {};
    const statuses = Object.fromEntries(
      PRAYER_NAMES.map((n) => [n, raw[n] ?? "none"]),
    ) as Record<PrayerName, PrayerStatus>;
    return {
      date,
      statuses,
      done: PRAYER_NAMES.filter((n) => COMPLETED_PRAYER.has(statuses[n])).length,
    };
  });
}

export function salahByPrayer(rows: SalahDay[]): { name: PrayerName; done: number; jamaah: number }[] {
  return PRAYER_NAMES.map((name) => ({
    name,
    done: rows.filter((r) => COMPLETED_PRAYER.has(r.statuses[name])).length,
    jamaah: rows.filter((r) => r.statuses[name] === "jamaah").length,
  }));
}

// ---------------------------------------------------------
// Where the time went
// ---------------------------------------------------------
export interface TimeSlice {
  key: string;
  label: string;
  minutes: number;
  share: number;
  tint: Tint | null;
}

/**
 * A session carries its own tags when the timer was started freehand; when it
 * was started from a task it inherits the task's. Untagged time is still time,
 * so it gets a bucket rather than being dropped.
 */
export function focusByTag(days: string[], sessions: FocusSession[], tasks: Task[]): TimeSlice[] {
  const inRange = new Set(days);
  const byTask = new Map(tasks.map((t) => [t.id, t]));
  const totals = new Map<string, number>();
  let total = 0;

  for (const s of sessions) {
    if (!isFocusSession(s) || !inRange.has(sessionDate(s))) continue;
    const minutes = s.seconds / 60;
    total += minutes;
    const task = s.task_id ? byTask.get(s.task_id) : undefined;
    const tags = s.tags.length ? s.tags : (task?.tags ?? []);
    if (!tags.length) {
      totals.set("—", (totals.get("—") ?? 0) + minutes);
      continue;
    }
    // Split evenly across a session's tags so the shares still sum to the hour.
    for (const tag of tags) {
      totals.set(tag, (totals.get(tag) ?? 0) + minutes / tags.length);
    }
  }

  return [...totals.entries()]
    .map(([key, minutes]) => ({
      key,
      label: key === "—" ? "Untagged" : key,
      minutes: Math.round(minutes),
      share: total > 0 ? minutes / total : 0,
      tint: null,
    }))
    .filter((s) => s.minutes > 0)
    .sort((a, b) => b.minutes - a.minutes);
}

export interface TimeSinks {
  /** Tracked time is real timer runs; booked time is what the calendar promised. */
  basis: "tracked" | "booked";
  total: number;
  slices: TimeSlice[];
}

/** Planned minutes: an explicit duration, else the length of the booked slot. */
export function plannedMinutes(t: Task): number {
  if (t.duration_min != null) return Math.max(0, t.duration_min);
  if (t.start_min != null && t.end_min != null && t.end_min > t.start_min) return t.end_min - t.start_min;
  return 0;
}

/**
 * The biggest consumers of the period. Tracked timer runs are the honest
 * answer; with no timer runs at all the calendar's own blocks stand in, clearly
 * labelled, rather than showing an empty panel.
 */
export function timeSinks(days: string[], sessions: FocusSession[], tasks: Task[]): TimeSinks {
  const inRange = new Set(days);
  const byTask = new Map(tasks.map((t) => [t.id, t]));
  const totals = new Map<string, { label: string; minutes: number; tint: Tint | null }>();
  let total = 0;

  for (const s of sessions) {
    if (!isFocusSession(s) || !inRange.has(sessionDate(s))) continue;
    const task = s.task_id ? byTask.get(s.task_id) : undefined;
    const label = task?.title || s.label || "Untitled session";
    const key = task?.id ?? `label:${label.toLowerCase()}`;
    const minutes = s.seconds / 60;
    total += minutes;
    const cur = totals.get(key) ?? { label, minutes: 0, tint: task?.color ?? null };
    cur.minutes += minutes;
    totals.set(key, cur);
  }

  let basis: TimeSinks["basis"] = "tracked";
  if (total === 0) {
    basis = "booked";
    for (const t of tasksIn(tasks, inRange)) {
      const minutes = plannedMinutes(t);
      if (!minutes) continue;
      total += minutes;
      const key = `task:${t.id}`;
      totals.set(key, { label: t.title || "Untitled", minutes, tint: t.color });
    }
  }

  const slices = [...totals.entries()]
    .map(([key, v]) => ({
      key,
      label: v.label,
      minutes: Math.round(v.minutes),
      share: total > 0 ? v.minutes / total : 0,
      tint: v.tint,
    }))
    .filter((s) => s.minutes > 0)
    .sort((a, b) => b.minutes - a.minutes);

  return { basis, total: Math.round(total), slices };
}

// ---------------------------------------------------------
// The day-by-day spine of "what actually happened"
// ---------------------------------------------------------
export interface DayEntry {
  date: string;
  done: Task[];
  open: Task[];
  focusMinutes: number;
}

export function dayEntries(days: string[], tasks: Task[], sessions: FocusSession[]): DayEntry[] {
  const inRange = new Set(days);
  const scoped = tasksIn(tasks, inRange);

  const focus = new Map<string, number>();
  for (const s of sessions) {
    if (!isFocusSession(s)) continue;
    const d = sessionDate(s);
    if (!inRange.has(d)) continue;
    focus.set(d, (focus.get(d) ?? 0) + s.seconds / 60);
  }

  const byDay = new Map<string, { done: Task[]; open: Task[] }>();
  for (const t of scoped) {
    const bucket = byDay.get(t.date as string) ?? { done: [], open: [] };
    (t.status === "done" ? bucket.done : bucket.open).push(t);
    byDay.set(t.date as string, bucket);
  }

  const order = (a: Task, b: Task) =>
    (a.start_min ?? 1e4) - (b.start_min ?? 1e4) || a.order_index - b.order_index;

  return days.map((date) => {
    const bucket = byDay.get(date) ?? { done: [], open: [] };
    return {
      date,
      done: [...bucket.done].sort(order),
      open: [...bucket.open].sort(order),
      focusMinutes: Math.round(focus.get(date) ?? 0),
    };
  });
}
