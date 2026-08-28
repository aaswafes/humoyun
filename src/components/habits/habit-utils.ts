import {
  addDays, dayNameOf, startOfMonth, startOfWeek, toISO, todayISO, weekday,
} from "@/lib/date";
import type { Habit } from "@/lib/types";
import {
  buildLogIndex, habitScheduledOn, isHabitComplete, loggedThisWeek,
  weeklyTarget, NO_COUNTS, type HabitCounts,
} from "@/lib/habits";

// Scheduling lives in @/lib/habits so Today, Stats and Review cannot drift from
// this page. Re-exported under the names this folder already uses.
export type Counts = HabitCounts;
export { buildLogIndex, loggedThisWeek, weeklyTarget, NO_COUNTS };
export const isComplete = isHabitComplete;
export const isScheduled = habitScheduledOn;

const WEEKDAYS_MON_FRI = "1,2,3,4,5";
const WEEKENDS = "0,6";

export function cadenceLabel(habit: Habit, weekStart = 1): string {
  if (habit.cadence === "custom") return `${weeklyTarget(habit)}× a week`;
  if (habit.cadence === "daily" || habit.weekdays.length === 7) return "Every day";
  if (!habit.weekdays.length) return "No days set";
  const key = [...habit.weekdays].sort((a, b) => a - b).join(",");
  if (key === WEEKDAYS_MON_FRI) return "Weekdays";
  if (key === WEEKENDS) return "Weekends";
  return orderedWeekdays(weekStart)
    .filter((d) => habit.weekdays.includes(d))
    .map((d) => dayNameOf(d, "short"))
    .join(" ");
}

export function targetLabel(habit: Habit): string | null {
  if (habit.target_count <= 1) return habit.unit ? `1 ${habit.unit} a day` : null;
  return `${habit.target_count} ${habit.unit ?? "times"} a day`;
}

export function orderedWeekdays(weekStart = 1): number[] {
  return Array.from({ length: 7 }, (_, i) => (i + weekStart) % 7);
}

/** The first day the habit could possibly have been done. */
export function habitStart(habit: Habit): string {
  return toISO(new Date(habit.created_at));
}

/**
 * Share of expected occurrences actually completed in the trailing window.
 * Days before the habit existed are excluded so a new habit never reads as 6%.
 */
export function completionRate(
  habit: Habit, counts: Counts, upTo = todayISO(), days = 30,
): { done: number; expected: number; pct: number } {
  const born = habitStart(habit);
  let done = 0;
  let expected = 0;
  let span = 0;

  for (let i = days - 1; i >= 0; i--) {
    const day = addDays(upTo, -i);
    if (day < born || day > upTo) continue;
    span++;
    const complete = isComplete(habit, counts.get(day));
    if (habit.cadence === "custom") { if (complete) done++; continue; }
    if (habit.cadence === "weekly" && !habit.weekdays.includes(weekday(day))) continue;
    expected++;
    if (complete) done++;
  }

  if (habit.cadence === "custom") expected = Math.max(1, Math.round((weeklyTarget(habit) * span) / 7));
  const pct = expected ? Math.min(100, Math.round((done / expected) * 100)) : 0;
  return { done, expected, pct };
}

/**
 * Longest run of consecutive logged days ever. Presence-based so it stays
 * comparable with the store's `habitStreak`.
 */
export function bestStreak(counts: Counts): number {
  const days = [...counts.keys()].sort();
  let best = 0;
  let run = 0;
  let prev = "";
  for (const day of days) {
    run = prev && addDays(prev, 1) === day ? run + 1 : 1;
    if (run > best) best = run;
    prev = day;
  }
  return best;
}

/** Days logged inside a calendar year. */
export function daysLoggedIn(counts: Counts, year: number): number {
  const prefix = `${year}-`;
  let n = 0;
  for (const day of counts.keys()) if (day.startsWith(prefix)) n++;
  return n;
}

/** Habits that belong on a given day, in user order. */
export function scheduledOn(
  habits: Habit[], index: Map<string, Counts>, iso: string, weekStart = 1,
): Habit[] {
  return habits.filter((h) => !h.archived && isScheduled(h, iso, index.get(h.id) ?? NO_COUNTS, weekStart));
}

/**
 * A perfect day is one where every habit scheduled that day hit its target.
 * Days with nothing scheduled are not counted either way.
 */
export function perfectDays(
  habits: Habit[], index: Map<string, Counts>, from: string, to: string, weekStart = 1,
): { perfect: number; tracked: number } {
  let perfect = 0;
  let tracked = 0;
  for (let day = from; day <= to; day = addDays(day, 1)) {
    let scheduled = 0;
    let complete = 0;
    for (const habit of habits) {
      if (habit.archived || day < habitStart(habit)) continue;
      const counts = index.get(habit.id) ?? NO_COUNTS;
      if (!isScheduled(habit, day, counts, weekStart)) continue;
      scheduled++;
      if (isComplete(habit, counts.get(day))) complete++;
    }
    if (!scheduled) continue;
    tracked++;
    if (complete === scheduled) perfect++;
  }
  return { perfect, tracked };
}

export function perfectDaysThisMonth(
  habits: Habit[], index: Map<string, Counts>, weekStart = 1, today = todayISO(),
) {
  return perfectDays(habits, index, startOfMonth(today), today, weekStart);
}

/** ISO of the week-start `weeks - 1` weeks before the week containing `end`. */
export function weekWindow(end: string, weeks: number, weekStart = 1): string {
  return addDays(startOfWeek(end, weekStart), -(weeks - 1) * 7);
}
