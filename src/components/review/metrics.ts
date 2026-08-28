import {
  addDays, dayNumber, diffDays, formatDate, startOfWeek, toISO, todayISO, weekday, yearOf,
} from "@/lib/date";
import {
  habitScheduledOn, isHabitComplete, weeklyTarget, type HabitCounts,
} from "@/lib/habits";
import type {
  FocusSession, Goal, Habit, HabitLog, Prayer, PrayerStatus, Task,
} from "@/lib/types";

// =========================================================
// The recap numbers. Pure functions over the store's collections
// so the same maths drives the stat, the sparkline and the delta.
// =========================================================

export interface MetricSource {
  tasks: Task[];
  habits: Habit[];
  habitLogs: HabitLog[];
  prayers: Prayer[];
  focusSessions: FocusSession[];
  goals: Goal[];
}

export interface WeekMetrics {
  days: string[];
  tasksDone: number;
  tasksPlanned: number;
  focusMinutes: number;
  sessionCount: number;
  habitsHit: number;
  habitsDue: number;
  salahDone: number;
  salahDue: number;
  pagesRead: number;
  booksRead: number;
  goalsAdvanced: number;
  goalsActive: number;
}

/** Matches `prayerStreak` in the store so the review never contradicts the streak. */
const COMPLETED_PRAYER = new Set<PrayerStatus>(["prayed", "jamaah", "late"]);

/**
 * `dayCount` lets a half-finished week be measured against the same slice of
 * the weeks before it — three days of salah versus a full seven would read as
 * a collapse when nothing is wrong.
 */
export function weekMetrics(weekStart: string, src: MetricSource, dayCount = 7): WeekMetrics {
  const span = Math.max(1, Math.min(7, dayCount));
  const days = Array.from({ length: span }, (_, i) => addDays(weekStart, i));
  const inWeek = new Set(days);

  const weekTasks = src.tasks.filter(
    (t) => !!t.date && inWeek.has(t.date) && !t.parent_id && t.status !== "dropped",
  );
  const doneTasks = weekTasks.filter((t) => t.status === "done");

  const sessions = src.focusSessions.filter((s) => inWeek.has(toISO(new Date(s.started_at))));
  const focusMinutes = Math.round(sessions.reduce((sum, s) => sum + s.seconds, 0) / 60);

  let habitsDue = 0;
  let habitsHit = 0;
  for (const habit of src.habits) {
    if (habit.archived) continue;
    const logs = src.habitLogs.filter((l) => l.habit_id === habit.id && inWeek.has(l.date));

    const counts: HabitCounts = new Map(logs.map((l) => [l.date, l.count]));

    // A "custom" habit owes the week a quota, not a set of days.
    if (habit.cadence === "custom") {
      const target = weeklyTarget(habit);
      habitsDue += target;
      habitsHit += Math.min(
        target,
        days.filter((day) => isHabitComplete(habit, counts.get(day))).length,
      );
      continue;
    }
    for (const day of days) {
      if (!habitScheduledOn(habit, day, counts, weekday(weekStart))) continue;
      habitsDue += 1;
      if (isHabitComplete(habit, counts.get(day))) habitsHit += 1;
    }
  }

  const salahDone = src.prayers.filter(
    (p) => inWeek.has(p.date) && COMPLETED_PRAYER.has(p.status),
  ).length;

  const readingDone = doneTasks.filter((t) => t.page_from != null && t.page_to != null);
  const pagesRead = readingDone.reduce(
    (sum, t) => sum + Math.max(0, (t.page_to as number) - (t.page_from as number) + 1),
    0,
  );

  const advanced = new Set<string>();
  doneTasks.forEach((t) => { if (t.goal_id) advanced.add(t.goal_id); });

  return {
    days,
    tasksDone: doneTasks.length,
    tasksPlanned: weekTasks.length,
    focusMinutes,
    sessionCount: sessions.length,
    habitsHit,
    habitsDue,
    salahDone,
    salahDue: span * 5,
    pagesRead,
    booksRead: new Set(readingDone.map((t) => t.book_id).filter(Boolean)).size,
    goalsAdvanced: advanced.size,
    goalsActive: src.goals.filter((g) => g.status === "active").length,
  };
}

// ---------------------------------------------------------
// Week labelling
// ---------------------------------------------------------

/** "25 – 31 Aug" — the month is only repeated when the week straddles two. */
export function formatWeekRange(weekStart: string): string {
  const end = addDays(weekStart, 6);
  const sameMonth = weekStart.slice(0, 7) === end.slice(0, 7);
  const showYear = yearOf(weekStart) !== yearOf(todayISO());
  const left = sameMonth ? String(dayNumber(weekStart)) : formatDate(weekStart, { weekday: false });
  return `${left} – ${formatDate(end, { weekday: false, year: showYear })}`;
}

export function relativeWeek(weekStart: string, weekStartDay: number): string {
  const current = startOfWeek(todayISO(), weekStartDay);
  const delta = Math.round(diffDays(current, weekStart) / 7);
  if (delta === 0) return "In progress";
  if (delta === 1) return "Last week";
  if (delta < 0) return `${-delta} weeks ahead`;
  return `${delta} weeks ago`;
}

export function formatHours(minutes: number): string {
  if (minutes <= 0) return "0h";
  if (minutes < 60) return `${minutes}m`;
  const hours = minutes / 60;
  return `${hours % 1 === 0 ? hours.toFixed(0) : hours.toFixed(1)}h`;
}

export const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many);
