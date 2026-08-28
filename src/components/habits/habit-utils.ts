import {
  addDays, dayNameOf, diffDays, startOfMonth, startOfWeek, toISO, todayISO, weekday,
} from "@/lib/date";
import type { Habit } from "@/lib/types";
import {
  buildLogIndex, habitScheduledOn, habitStreakOn, isHabitComplete, loggedThisWeek,
  weeklyTarget, NO_COUNTS, type HabitCounts,
} from "@/lib/habits";

// Scheduling lives in @/lib/habits so Today, Stats and Review cannot drift from
// this page. Re-exported under the names this folder already uses.
export type Counts = HabitCounts;
export { buildLogIndex, loggedThisWeek, weeklyTarget, NO_COUNTS };
export const isComplete = isHabitComplete;
export const isScheduled = habitScheduledOn;

/** Days the user has deliberately rested. Empty is the common case. */
export type Skips = ReadonlySet<string>;
export const NO_SKIPS: Skips = new Set<string>();

const WEEKDAYS_MON_FRI = "1,2,3,4,5";
const WEEKENDS = "0,6";

/** Three years back is as far as any of these walks will ever go. */
const WALK_GUARD = 1100;

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

/** "2 of 3 glasses" — the sentence a count needs to mean something. */
export function countLabel(habit: Habit, count: number): string {
  const target = Math.max(1, habit.target_count);
  if (target > 1) return `${count} of ${target}${habit.unit ? ` ${habit.unit}` : ""}`;
  if (count > 0) return habit.unit ? `1 ${habit.unit}` : "Done";
  return "Not logged";
}

export function orderedWeekdays(weekStart = 1): number[] {
  return Array.from({ length: 7 }, (_, i) => (i + weekStart) % 7);
}

/** The first day the habit could possibly have been done. */
export function habitStart(habit: Habit): string {
  return toISO(new Date(habit.created_at));
}

// ---------------------------------------------------------
// Day state — one answer every surface renders from, so the heatmap,
// the week dots and the row control can never disagree.
// ---------------------------------------------------------
export type DayState = "done" | "partial" | "skipped" | "due" | "missed" | "rest" | "future";

export function dayState(
  habit: Habit, counts: Counts, skips: Skips, date: string,
  today = todayISO(), weekStart = 1,
): DayState {
  const count = counts.get(date) ?? 0;
  if (count > 0) return isComplete(habit, count) ? "done" : "partial";
  if (skips.has(date)) return "skipped";
  if (date > today) return "future";
  if (!isScheduled(habit, date, counts, weekStart)) return "rest";
  return date === today ? "due" : "missed";
}

export const DAY_STATE_LABEL: Record<DayState, string> = {
  done: "Done",
  partial: "Partly done",
  skipped: "Rested",
  due: "Due today",
  missed: "Missed",
  rest: "Not scheduled",
  future: "Upcoming",
};

/** One sentence for what happened on a day — "2 of 3 glasses", "Rested". */
export function dayHeadline(
  habit: Habit, counts: Counts, skips: Skips, date: string,
  today = todayISO(), weekStart = 1,
): string {
  const state = dayState(habit, counts, skips, date, today, weekStart);
  if (state === "done" || state === "partial") return countLabel(habit, counts.get(date) ?? 0);
  return DAY_STATE_LABEL[state];
}

// ---------------------------------------------------------
// Streaks
// ---------------------------------------------------------
/**
 * Current streak, with rest days treated as neutral rather than as breaks.
 * With no skips this is exactly `habitStreakOn`, so it delegates — the walk
 * below only exists to add the one extra clause.
 */
export function currentStreak(
  habit: Habit, counts: Counts, skips: Skips, upTo = todayISO(), weekStart = 1,
): number {
  if (!skips.size) return habitStreakOn(habit, counts, upTo, weekStart);

  let streak = 0;
  let cursor = upTo;
  if (!isComplete(habit, counts.get(cursor))) cursor = addDays(cursor, -1); // today is "not yet"
  for (let guard = 0; guard < WALK_GUARD; guard++) {
    if (skips.has(cursor) || !isScheduled(habit, cursor, counts, weekStart)) {
      cursor = addDays(cursor, -1);
      continue;
    }
    if (!isComplete(habit, counts.get(cursor))) break;
    streak++;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

export interface StreakRun {
  start: string;
  end: string;
  length: number;
  /** Still running as of `upTo`. */
  live: boolean;
}

/**
 * Every completed run the habit has ever had, newest first. A run is counted in
 * scheduled days: rest days and days the habit was not due never break it.
 */
export function streakRuns(
  habit: Habit, counts: Counts, skips: Skips, upTo = todayISO(), weekStart = 1,
): StreakRun[] {
  const from = earliestDay(habit, counts);
  const runs: StreakRun[] = [];
  let start: string | null = null;
  let end = "";
  let length = 0;

  const close = () => {
    if (start && length > 0) runs.push({ start, end, length, live: false });
    start = null;
    length = 0;
  };

  let day = from;
  for (let guard = 0; day <= upTo && guard < WALK_GUARD; guard++, day = addDays(day, 1)) {
    if (skips.has(day) || !isScheduled(habit, day, counts, weekStart)) continue;
    if (isComplete(habit, counts.get(day))) {
      if (!start) start = day;
      end = day;
      length++;
    } else if (day !== upTo) {
      close();
    }
  }
  // Reaching here with a run still open means nothing has broken it yet.
  if (start && length > 0) runs.push({ start, end, length, live: true });
  return runs.reverse();
}

/** Longest run the habit has ever had. */
export function bestStreak(
  habit: Habit, counts: Counts, skips: Skips, upTo = todayISO(), weekStart = 1,
): number {
  let best = 0;
  for (const run of streakRuns(habit, counts, skips, upTo, weekStart)) {
    if (run.length > best) best = run.length;
  }
  return best;
}

/** The habit's own first day, or its first log if that predates it. */
export function earliestDay(habit: Habit, counts: Counts): string {
  let first = habitStart(habit);
  for (const day of counts.keys()) if (day < first) first = day;
  return first;
}

// ---------------------------------------------------------
// Rates
// ---------------------------------------------------------
/**
 * Share of expected occurrences actually completed in the trailing window.
 * Days before the habit existed, and days rested on purpose, are excluded so a
 * new habit never reads as 6% and a planned week off never looks like failure.
 */
export function completionRate(
  habit: Habit, counts: Counts, upTo = todayISO(), days = 30, skips: Skips = NO_SKIPS,
): { done: number; expected: number; pct: number } {
  const born = habitStart(habit);
  let done = 0;
  let expected = 0;
  let span = 0;

  for (let i = days - 1; i >= 0; i--) {
    const day = addDays(upTo, -i);
    if (day < born || day > upTo) continue;
    if (skips.has(day)) continue;
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

export interface WeekdayStat {
  weekday: number;
  scheduled: number;
  done: number;
  skipped: number;
  pct: number;
}

/**
 * Which day of the week you actually fail on. Counts only days the habit was
 * due, was not rested, and has already passed.
 */
export function weekdayStats(
  habit: Habit, counts: Counts, skips: Skips, upTo = todayISO(), weekStart = 1,
): WeekdayStat[] {
  const stats: WeekdayStat[] = Array.from({ length: 7 }, (_, index) => ({
    weekday: index, scheduled: 0, done: 0, skipped: 0, pct: 0,
  }));

  let day = earliestDay(habit, counts);
  for (let guard = 0; day <= upTo && guard < WALK_GUARD; guard++, day = addDays(day, 1)) {
    const row = stats[weekday(day)];
    if (skips.has(day)) { row.skipped++; continue; }
    if (!isScheduled(habit, day, counts, weekStart)) continue;
    row.scheduled++;
    if (isComplete(habit, counts.get(day))) row.done++;
  }

  for (const row of stats) row.pct = row.scheduled ? Math.round((row.done / row.scheduled) * 100) : 0;
  return orderedWeekdays(weekStart).map((d) => stats[d]);
}

/** The weekday you miss most — only worth naming once there is evidence. */
export function weakestWeekday(stats: WeekdayStat[]): WeekdayStat | null {
  const eligible = stats.filter((s) => s.scheduled >= 3);
  if (eligible.length < 2) return null;
  const worst = eligible.reduce((a, b) => (b.pct < a.pct ? b : a));
  const best = eligible.reduce((a, b) => (b.pct > a.pct ? b : a));
  if (worst.pct >= 90 || best.pct - worst.pct < 20) return null;
  return worst;
}

// ---------------------------------------------------------
// Weeks
// ---------------------------------------------------------
export interface WeekDay {
  date: string;
  state: DayState;
  count: number;
}

/** The seven days of the week containing `iso`, in the user's week order. */
export function weekDays(
  habit: Habit, counts: Counts, skips: Skips, iso: string,
  today = todayISO(), weekStart = 1,
): WeekDay[] {
  const start = startOfWeek(iso, weekStart);
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(start, i);
    return { date, state: dayState(habit, counts, skips, date, today, weekStart), count: counts.get(date) ?? 0 };
  });
}

/** "3 of 4 this week" for a custom-cadence habit. */
export function weekQuota(
  habit: Habit, counts: Counts, iso: string, weekStart = 1,
): { done: number; target: number } {
  const start = startOfWeek(iso, weekStart);
  let done = 0;
  for (let i = 0; i < 7; i++) if (isComplete(habit, counts.get(addDays(start, i)))) done++;
  return { done, target: weeklyTarget(habit) };
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
 * Days with nothing scheduled are not counted either way, and a habit rested on
 * purpose does not spoil the day.
 */
export function perfectDays(
  habits: Habit[], index: Map<string, Counts>, from: string, to: string,
  weekStart = 1, skipsOf?: (habitId: string) => Skips,
): { perfect: number; tracked: number } {
  let perfect = 0;
  let tracked = 0;
  for (let day = from; day <= to; day = addDays(day, 1)) {
    let scheduled = 0;
    let complete = 0;
    for (const habit of habits) {
      if (habit.archived || day < habitStart(habit)) continue;
      const counts = index.get(habit.id) ?? NO_COUNTS;
      if (skipsOf?.(habit.id).has(day)) continue;
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
  skipsOf?: (habitId: string) => Skips,
) {
  return perfectDays(habits, index, startOfMonth(today), today, weekStart, skipsOf);
}

/**
 * Completions across every habit inside the week containing `iso`, against what
 * the week has asked for *so far* — a Tuesday should not read as 2 of 21.
 */
export function weekTotals(
  habits: Habit[], index: Map<string, Counts>, iso: string,
  weekStart = 1, today = todayISO(), skipsOf?: (habitId: string) => Skips,
): { done: number; expected: number } {
  const start = startOfWeek(iso, weekStart);
  let done = 0;
  let expected = 0;

  for (const habit of habits) {
    const counts = index.get(habit.id) ?? NO_COUNTS;
    const skips = skipsOf?.(habit.id) ?? NO_SKIPS;
    let elapsed = 0;
    let due = 0;

    for (let i = 0; i < 7; i++) {
      const day = addDays(start, i);
      if (day > today || day < habitStart(habit)) continue;
      if (isComplete(habit, counts.get(day))) done++;
      if (skips.has(day)) continue;
      elapsed++;
      if (habit.cadence !== "custom" && isScheduled(habit, day, counts, weekStart)) due++;
    }

    // Custom cadence has no fixed days, so the quota is prorated by the days gone.
    expected += habit.cadence === "custom"
      ? Math.min(weeklyTarget(habit), elapsed)
      : due;
  }
  return { done, expected };
}

/** ISO of the week-start `weeks - 1` weeks before the week containing `end`. */
export function weekWindow(end: string, weeks: number, weekStart = 1): string {
  return addDays(startOfWeek(end, weekStart), -(weeks - 1) * 7);
}

/** Whole weeks spanned by two dates, inclusive of both ends. */
export function weeksBetween(from: string, to: string, weekStart = 1): number {
  return Math.round(diffDays(startOfWeek(to, weekStart), startOfWeek(from, weekStart)) / 7) + 1;
}
