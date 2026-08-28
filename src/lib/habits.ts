// =========================================================
// One implementation of "is this habit due today?".
//
// Four surfaces used to answer this question independently and two of them got it
// wrong, so the rule lives here now and every caller imports it.
//
//   daily   — every day. `weekdays` is ignored.
//   weekly  — only on the weekday indices listed in `weekdays` (0 = Sunday).
//   custom  — `times_per_week` days out of each week, the user picks which.
//             A day stays on the list until that week's quota is filled.
// =========================================================

import { addDays, startOfWeek, weekday } from "./date";
import type { Habit, HabitLog } from "./types";

/** date -> count, for one habit. */
export type HabitCounts = Map<string, number>;
export const NO_COUNTS: HabitCounts = new Map();

/** habit_id -> (date -> count). Build once per render, not once per row. */
export function buildLogIndex(logs: HabitLog[]): Map<string, HabitCounts> {
  const index = new Map<string, HabitCounts>();
  for (const log of logs) {
    let counts = index.get(log.habit_id);
    if (!counts) { counts = new Map(); index.set(log.habit_id, counts); }
    counts.set(log.date, log.count);
  }
  return index;
}

export function weeklyTarget(habit: Habit): number {
  if (habit.cadence === "daily") return 7;
  if (habit.cadence === "weekly") return habit.weekdays.length || 7;
  return Math.min(7, Math.max(1, habit.times_per_week || 3));
}

/** A day is done once its log reaches the habit's per-day target. */
export function isHabitComplete(habit: Habit, count: number | undefined): boolean {
  return (count ?? 0) >= Math.max(1, habit.target_count);
}

/** Distinct days logged inside the week containing `iso`. */
export function loggedThisWeek(counts: HabitCounts, iso: string, weekStart = 1): number {
  const start = startOfWeek(iso, weekStart);
  let n = 0;
  for (let i = 0; i < 7; i++) if (counts.has(addDays(start, i))) n++;
  return n;
}

/**
 * Is the habit meant to be done on this date?
 * `counts` is only consulted for custom cadence, where the quota decides.
 */
export function habitScheduledOn(
  habit: Habit,
  iso: string,
  counts: HabitCounts = NO_COUNTS,
  weekStart = 1,
): boolean {
  if (habit.archived) return false;
  if (habit.cadence === "daily") return true;
  if (habit.cadence === "weekly") {
    return habit.weekdays.length ? habit.weekdays.includes(weekday(iso)) : true;
  }
  if (counts.has(iso)) return true;
  const start = startOfWeek(iso, weekStart);
  let elsewhere = 0;
  for (let i = 0; i < 7; i++) {
    const day = addDays(start, i);
    if (day !== iso && counts.has(day)) elsewhere++;
  }
  return elsewhere < weeklyTarget(habit);
}

/**
 * Consecutive scheduled days completed, counting back from `upTo`.
 * Days the habit was never due do not break the chain.
 */
export function habitStreakOn(
  habit: Habit,
  counts: HabitCounts,
  upTo: string,
  weekStart = 1,
): number {
  let streak = 0;
  let cursor = upTo;
  // Today being unlogged is "not yet", not a break.
  if (!isHabitComplete(habit, counts.get(cursor))) cursor = addDays(cursor, -1);
  for (let guard = 0; guard < 1100; guard++) {
    if (!habitScheduledOn(habit, cursor, counts, weekStart)) { cursor = addDays(cursor, -1); continue; }
    if (!isHabitComplete(habit, counts.get(cursor))) break;
    streak++;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

/** Human description of the cadence, for cards and menus. */
export function cadenceLabel(habit: Habit, dayName: (i: number) => string): string {
  if (habit.cadence === "daily") return "Every day";
  if (habit.cadence === "weekly") {
    if (!habit.weekdays.length) return "Every day";
    if (habit.weekdays.length === 7) return "Every day";
    const set = [...habit.weekdays].sort();
    if (set.join(",") === "1,2,3,4,5") return "Weekdays";
    if (set.join(",") === "0,6") return "Weekends";
    return set.map(dayName).join(" · ");
  }
  const n = weeklyTarget(habit);
  return `${n}× a week`;
}
