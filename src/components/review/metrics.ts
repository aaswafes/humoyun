import { startOfWeek, toISO } from "@/lib/date";
import {
  habitScheduledOn, isHabitComplete, weeklyTarget, type HabitCounts,
} from "@/lib/habits";
import type {
  Book, DayLog, FocusSession, Goal, Habit, HabitLog, Note, Prayer, PrayerStatus, Task,
} from "@/lib/types";
import type { ReadingSession } from "@/components/books/library-prefs";
import { buildReadingHistory, EMPTY_HISTORY, type ReadingHistory } from "@/components/books/reading-history";

// =========================================================
// The recap numbers. Pure functions over the store's collections so the same
// maths drives the stat, the sparkline, the delta and the plain-text summary.
//
// Everything takes a list of days rather than a week start — that is what lets
// one implementation serve the weekly, monthly and yearly review.
// =========================================================

export interface MetricSource {
  tasks: Task[];
  habits: Habit[];
  habitLogs: HabitLog[];
  prayers: Prayer[];
  focusSessions: FocusSession[];
  goals: Goal[];
  books: Book[];
  /** Logged sittings. They live in `profile.prefs.books`, not in a table. */
  sessions: ReadingSession[];
  dayLogs: DayLog[];
  notes: Note[];
}

export interface Metrics {
  days: string[];
  tasksDone: number;
  tasksPlanned: number;
  tasksOpen: number;
  focusMinutes: number;
  sessionCount: number;
  habitsHit: number;
  habitsDue: number;
  salahDone: number;
  salahDue: number;
  salahJamaah: number;
  pagesRead: number;
  /** Books whose last page was read inside the period. */
  booksFinished: number;
  readingMinutes: number;
  /** How much of `pagesRead` no dated record accounted for. */
  pagesSettled: number;
  quranPages: number;
  reading: ReadingHistory;
  notesWritten: number;
  /** Averages across the days that were actually logged, null when none were. */
  mood: number | null;
  energy: number | null;
  sleepHours: number | null;
  daysLogged: number;
  goalsAdvanced: number;
  goalsActive: number;
}

export const EMPTY_METRICS: Metrics = {
  days: [],
  tasksDone: 0, tasksPlanned: 0, tasksOpen: 0,
  focusMinutes: 0, sessionCount: 0,
  habitsHit: 0, habitsDue: 0,
  salahDone: 0, salahDue: 0, salahJamaah: 0,
  pagesRead: 0, booksFinished: 0, readingMinutes: 0, pagesSettled: 0, quranPages: 0,
  reading: EMPTY_HISTORY,
  notesWritten: 0, mood: null, energy: null, sleepHours: null, daysLogged: 0,
  goalsAdvanced: 0, goalsActive: 0,
};

/** Matches `prayerStreak` in the store so the review never contradicts the streak. */
export const COMPLETED_PRAYER = new Set<PrayerStatus>(["prayed", "jamaah", "late"]);

/** A break is rest, not focus — counting it would flatter every stat that uses it. */
export const isFocusSession = (s: FocusSession) => s.mode !== "break";

export const sessionDate = (s: FocusSession) => toISO(new Date(s.started_at));

/** Tasks that belong to the period and are worth counting. */
export function tasksIn(tasks: Task[], inRange: Set<string>): Task[] {
  return tasks.filter((t) => !!t.date && inRange.has(t.date) && !t.parent_id && t.status !== "dropped");
}

export function pagesOf(t: Task): number {
  if (t.page_from == null || t.page_to == null) return 0;
  return Math.max(0, t.page_to - t.page_from + 1);
}

// ---------------------------------------------------------
// Habits
// ---------------------------------------------------------

/**
 * A "custom" habit owes its week a quota rather than a set of days, so it is
 * charged week by week. A part-finished week can only owe the days it has
 * actually had — otherwise Monday morning shows a 4× habit already 3 behind.
 */
export function habitTally(
  days: string[], habits: Habit[], logs: HabitLog[], weekStartDay = 1,
): { due: number; hit: number } {
  if (!days.length) return { due: 0, hit: 0 };
  const inRange = new Set(days);
  let due = 0;
  let hit = 0;

  // Day lists per calendar week, so the custom cadence can be settled per week.
  const weeks = new Map<string, string[]>();
  for (const day of days) {
    const key = startOfWeek(day, weekStartDay);
    const list = weeks.get(key);
    if (list) list.push(day); else weeks.set(key, [day]);
  }

  for (const habit of habits) {
    if (habit.archived) continue;
    const counts: HabitCounts = new Map(
      logs.filter((l) => l.habit_id === habit.id && inRange.has(l.date)).map((l) => [l.date, l.count]),
    );

    if (habit.cadence === "custom") {
      for (const slice of weeks.values()) {
        const target = Math.min(weeklyTarget(habit), slice.length);
        due += target;
        hit += Math.min(target, slice.filter((d) => isHabitComplete(habit, counts.get(d))).length);
      }
      continue;
    }

    for (const day of days) {
      if (!habitScheduledOn(habit, day, counts, weekStartDay)) continue;
      due += 1;
      if (isHabitComplete(habit, counts.get(day))) hit += 1;
    }
  }

  return { due, hit };
}

// ---------------------------------------------------------
// The stat block
// ---------------------------------------------------------
export function metricsFor(days: string[], src: MetricSource, weekStartDay = 1): Metrics {
  if (!days.length) return { ...EMPTY_METRICS, goalsActive: src.goals.filter((g) => g.status === "active").length };

  const inRange = new Set(days);
  const scoped = tasksIn(src.tasks, inRange);
  const done = scoped.filter((t) => t.status === "done");

  const sessions = src.focusSessions.filter((s) => isFocusSession(s) && inRange.has(sessionDate(s)));
  const habits = habitTally(days, src.habits, src.habitLogs, weekStartDay);

  const prayers = src.prayers.filter((p) => inRange.has(p.date));

  // Reading is answered by the one model the shelf already uses, so the review,
  // the stats page and the book's own card can never disagree about a week.
  const reading = buildReadingHistory(days, {
    sessions: src.sessions, tasks: src.tasks, books: src.books, dayLogs: src.dayLogs,
  });

  const logs = src.dayLogs.filter((d) => inRange.has(d.date));
  const mean = (pick: (d: DayLog) => number | null): number | null => {
    const values = logs.map(pick).filter((v): v is number => v != null);
    if (!values.length) return null;
    return Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 10) / 10;
  };

  const advanced = new Set<string>();
  done.forEach((t) => { if (t.goal_id) advanced.add(t.goal_id); });

  return {
    days,
    tasksDone: done.length,
    tasksPlanned: scoped.length,
    tasksOpen: scoped.length - done.length,
    focusMinutes: Math.round(sessions.reduce((sum, s) => sum + s.seconds, 0) / 60),
    sessionCount: sessions.length,
    habitsHit: habits.hit,
    habitsDue: habits.due,
    salahDone: prayers.filter((p) => COMPLETED_PRAYER.has(p.status)).length,
    salahDue: days.length * 5,
    salahJamaah: prayers.filter((p) => p.status === "jamaah").length,
    pagesRead: reading.pages,
    booksFinished: reading.booksFinished,
    readingMinutes: reading.minutes,
    pagesSettled: reading.settledPages,
    quranPages: reading.quranPages,
    reading,
    notesWritten: src.notes.filter((n) => {
      const day = n.date ?? n.created_at.slice(0, 10);
      return inRange.has(day);
    }).length,
    mood: mean((d) => d.mood),
    energy: mean((d) => d.energy),
    sleepHours: mean((d) => d.sleep_hours),
    daysLogged: logs.length,
    goalsAdvanced: advanced.size,
    goalsActive: src.goals.filter((g) => g.status === "active").length,
  };
}

// ---------------------------------------------------------
// Formatting
// ---------------------------------------------------------
export function formatHours(minutes: number): string {
  if (minutes <= 0) return "0h";
  if (minutes < 60) return `${minutes}m`;
  const hours = minutes / 60;
  return `${hours % 1 === 0 ? hours.toFixed(0) : hours.toFixed(1)}h`;
}

export const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many);

export function pct(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}
