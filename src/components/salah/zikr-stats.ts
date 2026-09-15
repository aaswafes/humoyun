// =========================================================
// Zikr — what a lifetime of counts adds up to.
//
// Everything here is derived from the day logs the store already holds. No
// running total is stored anywhere: a total that is kept twice is a total
// that can disagree with itself, and correcting yesterday's number would
// leave the summed one wrong forever.
// =========================================================

import { addDays, daysBetween, startOfMonth, weekday } from "@/lib/date";
import type { DayLog } from "@/lib/types";
import { zikrCountsOf } from "./zikr-data";

export interface ZikrStats {
  /** Every zikr ever counted, added up. */
  total: number;
  /** Per zikr id, for the whole record. */
  perZikr: Record<string, number>;
  /** Per day, only for days that hold something. */
  perDay: Map<string, number>;
  /** Per day, broken down by zikr — what any windowed question is answered from. */
  perDayZikr: Map<string, Record<string, number>>;
  /** Days with at least one count. */
  activeDays: number;
  firstDate: string | null;
  bestDay: { date: string; count: number } | null;
  /** Consecutive days with a count, counting back from today. */
  streak: number;
  longestStreak: number;
  /** Counted since midnight. */
  today: number;
}

export function buildZikrStats(dayLogs: DayLog[], today: string): ZikrStats {
  const perZikr: Record<string, number> = {};
  const perDay = new Map<string, number>();
  const perDayZikr = new Map<string, Record<string, number>>();
  let total = 0;
  let firstDate: string | null = null;
  let bestDay: { date: string; count: number } | null = null;

  for (const log of dayLogs) {
    const counts = zikrCountsOf(log);
    let dayTotal = 0;
    for (const [id, n] of Object.entries(counts)) {
      perZikr[id] = (perZikr[id] ?? 0) + n;
      dayTotal += n;
    }
    if (dayTotal <= 0) continue;
    perDayZikr.set(log.date, counts);
    perDay.set(log.date, (perDay.get(log.date) ?? 0) + dayTotal);
    total += dayTotal;
    if (!firstDate || log.date < firstDate) firstDate = log.date;
  }

  for (const [date, count] of perDay) {
    if (!bestDay || count > bestDay.count) bestDay = { date, count };
  }

  return {
    total,
    perZikr,
    perDay,
    perDayZikr,
    activeDays: perDay.size,
    firstDate,
    bestDay,
    streak: streakEndingAt(perDay, today),
    longestStreak: longestStreakOf(perDay),
    today: perDay.get(today) ?? 0,
  };
}

/**
 * Days in a row up to today.
 *
 * Today not being counted yet is not a broken streak — the day is still going
 * — so the walk starts at yesterday when today is empty.
 */
export function streakEndingAt(perDay: Map<string, number>, today: string): number {
  let cursor = perDay.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (perDay.has(cursor)) {
    n += 1;
    cursor = addDays(cursor, -1);
  }
  return n;
}

function longestStreakOf(perDay: Map<string, number>): number {
  const dates = [...perDay.keys()].sort();
  let best = 0;
  let run = 0;
  let previous: string | null = null;
  for (const date of dates) {
    run = previous && addDays(previous, 1) === date ? run + 1 : 1;
    if (run > best) best = run;
    previous = date;
  }
  return best;
}

/**
 * The same breakdown as `perZikr`, but for one window of days — what every
 * "last 30 days" question is answered from, so a span switch never has to
 * walk the day logs a second time.
 */
export function perZikrBetween(stats: ZikrStats, from: string, to: string) {
  const out: Record<string, number> = {};
  let total = 0;
  let days = 0;
  for (const [date, counts] of stats.perDayZikr) {
    if (date < from || date > to) continue;
    days += 1;
    for (const [id, n] of Object.entries(counts)) {
      out[id] = (out[id] ?? 0) + n;
      total += n;
    }
  }
  return { perZikr: out, total, days };
}

/** Totals for a stretch of days, zero-filled so a chart keeps its shape. */
export function seriesFor(perDay: Map<string, number>, from: string, to: string) {
  return daysBetween(from, to).map((date) => ({ date, count: perDay.get(date) ?? 0 }));
}

export interface HeatWeek {
  /** Seven cells, Sunday-relative padding included as nulls. */
  days: ({ date: string; count: number } | null)[];
}

/**
 * A year as columns of weeks, the way a contribution graph reads.
 *
 * The grid always ends on `to` and starts on the first day of that week, so
 * the last column is the week in progress rather than a ragged edge.
 */
export function heatGrid(perDay: Map<string, number>, to: string, weeks: number, weekStart = 1): HeatWeek[] {
  const offset = (weekday(to) - weekStart + 7) % 7;
  const lastWeekStart = addDays(to, -offset);
  const first = addDays(lastWeekStart, -(weeks - 1) * 7);

  const grid: HeatWeek[] = [];
  for (let w = 0; w < weeks; w++) {
    const start = addDays(first, w * 7);
    const days: HeatWeek["days"] = [];
    for (let d = 0; d < 7; d++) {
      const date = addDays(start, d);
      days.push(date > to ? null : { date, count: perDay.get(date) ?? 0 });
    }
    grid.push({ days });
  }
  return grid;
}

/** Month buckets, newest last, for the last `count` months including this one. */
export function monthlyTotals(perDay: Map<string, number>, today: string, count: number) {
  const buckets = new Map<string, number>();
  const firstMonth = startOfMonth(today);
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(firstMonth);
    d.setMonth(d.getMonth() - i);
    buckets.set(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`, 0);
  }
  for (const [date, n] of perDay) {
    const key = startOfMonth(date);
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + n);
  }
  return [...buckets.entries()].map(([month, count]) => ({ month, count }));
}

/**
 * The next round number worth reaching.
 *
 * They climb by roughly threes so a milestone is always near enough to mean
 * something and far enough to be worth walking to.
 */
export const MILESTONES = [
  100, 500, 1_000, 5_000, 10_000, 25_000, 50_000, 100_000,
  250_000, 500_000, 1_000_000, 5_000_000, 10_000_000,
];

export function nextMilestone(total: number): number | null {
  return MILESTONES.find((m) => m > total) ?? null;
}

export function passedMilestones(total: number): number[] {
  return MILESTONES.filter((m) => m <= total);
}

/** Days at the current pace before a total is reached. Null when it is idle. */
export function daysToReach(target: number, total: number, perDayAverage: number): number | null {
  if (perDayAverage <= 0 || target <= total) return null;
  return Math.ceil((target - total) / perDayAverage);
}
