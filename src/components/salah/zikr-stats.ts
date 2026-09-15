// =========================================================
// Zikr — what the record adds up to.
//
// Everything here is derived from the day logs the store already holds. No
// running total is stored anywhere: a total kept twice is a total that can
// disagree with itself, and correcting yesterday's number would leave the
// summed one wrong forever.
// =========================================================

import {
  addDays, addMonths, daysBetween, endOfMonth, endOfWeek, formatDate, monthName,
  startOfMonth, startOfWeek, weekday, yearOf,
} from "@/lib/date";
import type { DayLog } from "@/lib/types";
import { zikrCountsOf, type ZikrCounts } from "./zikr-data";

export interface ZikrStats {
  /** Every zikr ever recorded, added up. */
  total: number;
  /** Per zikr id, for the whole record. */
  perZikr: Record<string, number>;
  /** Per day, only for days that hold something. */
  perDay: Map<string, number>;
  /** Per day, broken down by zikr — what every windowed question is answered from. */
  perDayZikr: Map<string, ZikrCounts>;
  /** Days with at least one count. */
  activeDays: number;
  firstDate: string | null;
  bestDay: { date: string; count: number } | null;
  /** Consecutive days with a count, counting back from today. */
  streak: number;
  longestStreak: number;
  /** Recorded since midnight. */
  today: number;
}

export function buildZikrStats(dayLogs: DayLog[], today: string): ZikrStats {
  const perZikr: Record<string, number> = {};
  const perDay = new Map<string, number>();
  const perDayZikr = new Map<string, ZikrCounts>();
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
    perDay.set(log.date, dayTotal);
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
 * Today holding nothing yet is not a broken streak — the day is still going —
 * so the walk starts at yesterday when today is empty.
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
 * The breakdown for one window of days, plus its totals — what every period
 * on the report is answered from, in one pass, so the headline and the table
 * under it can never disagree about which days they counted.
 */
export function perZikrBetween(stats: ZikrStats, from: string, to: string) {
  const perZikr: Record<string, number> = {};
  let total = 0;
  let days = 0;
  for (const [date, counts] of stats.perDayZikr) {
    if (date < from || date > to) continue;
    days += 1;
    for (const [id, n] of Object.entries(counts)) {
      perZikr[id] = (perZikr[id] ?? 0) + n;
      total += n;
    }
  }
  return { perZikr, total, days };
}

/** Totals for a stretch of days, zero-filled so a chart keeps its shape. */
export function seriesFor(perDay: Map<string, number>, from: string, to: string) {
  return daysBetween(from, to).map((date) => ({ date, count: perDay.get(date) ?? 0 }));
}

// ---------------------------------------------------------
// Periods
// ---------------------------------------------------------

export type Period = "week" | "month" | "year" | "all";

export const PERIOD_LABELS: Record<Period, string> = {
  week: "Week",
  month: "Month",
  year: "Year",
  all: "Lifetime",
};

export interface Range {
  from: string;
  to: string;
  /** What the period is called on screen: "12 – 18 Sep", "September 2026". */
  label: string;
  /** Bars underneath: days for a week or a month, months for a year, years for all. */
  buckets: { key: string; label: string; count: number }[];
}

/**
 * One period, `offset` steps back from today, with the bars that describe it.
 *
 * A period always ends no later than today: a week in progress draws four days
 * and stops, rather than drawing three empty ones that read as missed.
 */
export function rangeFor(
  stats: ZikrStats,
  period: Period,
  offset: number,
  today: string,
  weekStart: number,
): Range {
  const { perDay } = stats;

  if (period === "week") {
    const anchor = addDays(today, offset * 7);
    const from = startOfWeek(anchor, weekStart);
    const to = endOfWeek(anchor, weekStart);
    return {
      from,
      to,
      label: `${formatDate(from, { weekday: false })} – ${formatDate(to, { weekday: false })}`,
      buckets: daysBetween(from, to).map((date) => ({
        key: date,
        label: dayInitial(date),
        count: perDay.get(date) ?? 0,
      })),
    };
  }

  if (period === "month") {
    const anchor = addMonths(today, offset);
    const from = startOfMonth(anchor);
    const to = endOfMonth(anchor);
    return {
      from,
      to,
      label: `${monthName(from)} ${yearOf(from)}`,
      buckets: daysBetween(from, to).map((date) => ({
        key: date,
        label: String(Number(date.slice(8, 10))),
        count: perDay.get(date) ?? 0,
      })),
    };
  }

  if (period === "year") {
    const year = Number(today.slice(0, 4)) + offset;
    const from = `${year}-01-01`;
    const to = `${year}-12-31`;
    const buckets = Array.from({ length: 12 }, (_, i) => {
      const month = `${year}-${String(i + 1).padStart(2, "0")}`;
      return { key: month, label: monthName(`${month}-01`, true).slice(0, 3), count: 0 };
    });
    for (const [date, n] of perDay) {
      if (date.slice(0, 4) !== String(year)) continue;
      buckets[Number(date.slice(5, 7)) - 1].count += n;
    }
    return { from, to, label: String(year), buckets };
  }

  // Lifetime: one bar per year, from the first day recorded to this one.
  const firstYear = Number((stats.firstDate ?? today).slice(0, 4));
  const thisYear = Number(today.slice(0, 4));
  const buckets = Array.from({ length: thisYear - firstYear + 1 }, (_, i) => ({
    key: String(firstYear + i),
    label: String(firstYear + i),
    count: 0,
  }));
  for (const [date, n] of perDay) {
    const index = Number(date.slice(0, 4)) - firstYear;
    if (index >= 0 && index < buckets.length) buckets[index].count += n;
  }
  return {
    from: stats.firstDate ?? today,
    to: today,
    label: stats.firstDate ? `Since ${formatDate(stats.firstDate, { year: true })}` : "Lifetime",
    buckets,
  };
}

const DAY_INITIALS = ["S", "M", "T", "W", "T", "F", "S"];

function dayInitial(date: string): string {
  return DAY_INITIALS[weekday(date)];
}

/** Days that hold something, newest first — the history list reads this. */
export function historyRows(stats: ZikrStats, from: string, to: string) {
  const rows: { date: string; total: number; counts: ZikrCounts }[] = [];
  for (const [date, counts] of stats.perDayZikr) {
    if (date < from || date > to) continue;
    rows.push({ date, total: stats.perDay.get(date) ?? 0, counts });
  }
  return rows.sort((a, b) => b.date.localeCompare(a.date));
}

// ---------------------------------------------------------
// The year as squares
// ---------------------------------------------------------

export interface HeatWeek {
  days: ({ date: string; count: number } | null)[];
}

/**
 * A year as columns of weeks, the way a contribution graph reads.
 *
 * The grid always ends on `to` and starts on the first day of that week, so
 * the last column is the week in progress rather than a ragged edge.
 */
export function heatGrid(perDay: Map<string, number>, to: string, weeks: number, weekStart = 1): HeatWeek[] {
  const lastWeekStart = startOfWeek(to, weekStart);
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
