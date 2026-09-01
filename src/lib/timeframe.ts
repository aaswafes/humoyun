// =========================================================
// A goal's timeframe is derived from when it is due, not chosen from a menu.
//
// You know a goal should be done "by December" long before you know whether
// that makes it a quarter goal or a year goal. So the date is the input and
// the shelf it lands on is the answer.
// =========================================================

import { fromISO, quarterOf, todayISO, yearOf } from "./date";
import type { Horizon } from "./types";

export type Timeframe =
  | "month" | "quarter" | "year" | "nextYear" | "near" | "far" | "someday";

export const TIMEFRAMES: Timeframe[] = [
  "month", "quarter", "year", "nextYear", "near", "far", "someday",
];

export const TIMEFRAME_LABELS: Record<Timeframe, string> = {
  month: "This month",
  quarter: "This quarter",
  year: "This year",
  nextYear: "Next year",
  near: "Near future",
  far: "Far future",
  someday: "Someday",
};

export const TIMEFRAME_BLURB: Record<Timeframe, string> = {
  month: "Due before this month is out.",
  quarter: "Later this quarter.",
  year: "Somewhere in the rest of this year.",
  nextYear: "The year after this one.",
  near: "Two to five years out.",
  far: "Beyond five years — the long arc.",
  someday: "No date yet. Give it one and it files itself.",
};

/**
 * Which shelf a date lands on. Buckets are checked in order and never overlap,
 * so a date due this month is "this month" rather than also "this quarter".
 * A date already past still belongs to this month — an overdue goal is this
 * month's problem, not history.
 */
export function timeframeOf(endDate: string | null | undefined, today = todayISO()): Timeframe {
  if (!endDate) return "someday";

  const now = fromISO(today);
  const due = fromISO(endDate);
  const nowYear = now.getFullYear();
  const dueYear = due.getFullYear();

  if (dueYear < nowYear) return "month";                       // overdue: deal with it now
  if (dueYear === nowYear) {
    if (due.getMonth() === now.getMonth()) return "month";
    if (due.getMonth() < now.getMonth()) return "month";       // earlier this year, still owed
    if (quarterOf(endDate) === quarterOf(today)) return "quarter";
    return "year";
  }
  if (dueYear === nowYear + 1) return "nextYear";
  if (dueYear <= nowYear + 5) return "near";
  return "far";
}

/**
 * The structural horizon a timeframe implies. The ladder still nests by
 * horizon — a week goal under a month goal under a year goal — so setting a
 * date has to answer that question too.
 */
export function horizonForTimeframe(frame: Timeframe): Horizon {
  switch (frame) {
    case "month": return "month";
    case "quarter": return "quarter";
    case "year": return "year";
    case "nextYear": return "year";
    default: return "life";
  }
}

export function horizonForDate(endDate: string | null | undefined, today = todayISO()): Horizon {
  return horizonForTimeframe(timeframeOf(endDate, today));
}

/** "Sep 2026" / "Q3 2026" / "2027" — what the shelf is actually holding. */
export function timeframeRange(frame: Timeframe, today = todayISO()): string {
  const year = yearOf(today);
  switch (frame) {
    case "month": return fromISO(today).toLocaleString("en", { month: "short", year: "numeric" });
    case "quarter": return `Q${quarterOf(today)} ${year}`;
    case "year": return String(year);
    case "nextYear": return String(year + 1);
    case "near": return `${year + 2}–${year + 5}`;
    case "far": return `${year + 6}+`;
    case "someday": return "";
  }
}
