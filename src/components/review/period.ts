// =========================================================
// The review's unit of time.
//
// One shell reviews a week, a month or a year, so every surface asks this
// module what it is looking at instead of assuming seven days. The three
// phases are kept apart on purpose: a finished period is measured whole, a
// running one is measured against the same slice of the periods before it,
// and a period that has not started has nothing to measure at all.
// =========================================================

import {
  addDays, addMonths, daysBetween, diffDays, endOfMonth, formatDate, fromISO,
  monthName, startOfMonth, startOfWeek, todayISO, weekNumber, yearOf,
} from "@/lib/date";

export type ReviewScope = "week" | "month" | "year";
export type Phase = "past" | "current" | "future";

export const SCOPES: ReviewScope[] = ["week", "month", "year"];

export const SCOPE_LABEL: Record<ReviewScope, string> = {
  week: "Weekly",
  month: "Monthly",
  year: "Yearly",
};

/** The noun, for sentences: "the week", "3 months ago". */
export const SCOPE_NOUN: Record<ReviewScope, string> = {
  week: "week",
  month: "month",
  year: "year",
};

export function isScope(v: unknown): v is ReviewScope {
  return v === "week" || v === "month" || v === "year";
}

export interface Period {
  scope: ReviewScope;
  /** First day, and the key the review row is stored under. */
  start: string;
  end: string;
  days: string[];
  /** Days already lived — all of them when past, none when future. */
  elapsed: number;
  phase: Phase;
  /** "Week 35" · "August" · "2026" */
  title: string;
  /** "25 – 31 Aug · 7 days" */
  rangeLabel: string;
  /** Compact form for the nav: "25 – 31 Aug" · "Aug 2026" · "2026" */
  navLabel: string;
  /** "In progress" · "Last week" · "Starts in 2 weeks" */
  relative: string;
}

// ---------------------------------------------------------
// Boundaries
// ---------------------------------------------------------
export function periodStart(scope: ReviewScope, anchor: string, weekStartDay = 1): string {
  if (scope === "week") return startOfWeek(anchor, weekStartDay);
  if (scope === "month") return startOfMonth(anchor);
  return `${yearOf(anchor)}-01-01`;
}

export function periodEnd(scope: ReviewScope, start: string): string {
  if (scope === "week") return addDays(start, 6);
  if (scope === "month") return endOfMonth(start);
  return `${yearOf(start)}-12-31`;
}

/** Move `delta` whole periods from a period start. */
export function shiftPeriod(scope: ReviewScope, start: string, delta: number): string {
  if (scope === "week") return addDays(start, delta * 7);
  if (scope === "month") return addMonths(start, delta);
  return `${yearOf(start) + delta}-01-01`;
}

/**
 * Move a day by one period without snapping to a period boundary — "push this
 * task to next week" should keep its weekday, and next year keeps its date.
 */
export function shiftDateByScope(scope: ReviewScope, iso: string, delta: number): string {
  if (scope === "week") return addDays(iso, delta * 7);
  return addMonths(iso, delta * (scope === "month" ? 1 : 12));
}

/** How many whole periods `start` sits after `from`. Negative means earlier. */
export function periodsBetween(scope: ReviewScope, from: string, start: string): number {
  if (scope === "week") return Math.round(diffDays(start, from) / 7);
  if (scope === "year") return yearOf(start) - yearOf(from);
  const a = fromISO(from);
  const b = fromISO(start);
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
}

// ---------------------------------------------------------
// Labels
// ---------------------------------------------------------

/** "25 – 31 Aug" — the month is only repeated when the week straddles two. */
export function formatWeekRange(weekStart: string): string {
  const end = addDays(weekStart, 6);
  const sameMonth = weekStart.slice(0, 7) === end.slice(0, 7);
  const showYear = yearOf(weekStart) !== yearOf(todayISO());
  const left = sameMonth ? String(fromISO(weekStart).getDate()) : formatDate(weekStart, { weekday: false });
  return `${left} – ${formatDate(end, { weekday: false, year: showYear })}`;
}

function titleFor(scope: ReviewScope, start: string): string {
  if (scope === "week") return `Week ${weekNumber(start)}`;
  if (scope === "month") return monthName(start);
  return String(yearOf(start));
}

function navLabelFor(scope: ReviewScope, start: string): string {
  if (scope === "week") return formatWeekRange(start);
  if (scope === "month") return `${monthName(start, true)} ${yearOf(start)}`;
  return String(yearOf(start));
}

function rangeLabelFor(scope: ReviewScope, start: string, end: string, dayCount: number): string {
  if (scope === "week") return `${formatWeekRange(start)} · 7 days`;
  const showYear = yearOf(start) !== yearOf(todayISO());
  const left = formatDate(start, { weekday: false, year: scope === "year" ? false : showYear });
  const right = formatDate(end, { weekday: false, year: showYear });
  return `${left} – ${right} · ${dayCount} days`;
}

function relativeFor(scope: ReviewScope, delta: number, phase: Phase): string {
  const noun = SCOPE_NOUN[scope];
  if (delta === 0) return phase === "past" ? "Just finished" : "In progress";
  if (delta === -1) return `Last ${noun}`;
  if (delta === 1) return `Next ${noun} — not started`;
  if (delta < 0) return `${-delta} ${noun}s ago`;
  return `Starts in ${delta} ${noun}s`;
}

// ---------------------------------------------------------
// Build
// ---------------------------------------------------------
export function buildPeriod(
  scope: ReviewScope,
  anchor: string,
  weekStartDay = 1,
  today = todayISO(),
): Period {
  const start = periodStart(scope, anchor, weekStartDay);
  const end = periodEnd(scope, start);
  const days = daysBetween(start, end);

  const phase: Phase = today < start ? "future" : today > end ? "past" : "current";
  // A running period is only as long as it has actually been lived; a future
  // one has no days to measure, which is why nothing here can go negative.
  const elapsed =
    phase === "past" ? days.length
      : phase === "future" ? 0
        : Math.max(1, Math.min(days.length, diffDays(today, start) + 1));

  const delta = periodsBetween(scope, periodStart(scope, today, weekStartDay), start);

  return {
    scope,
    start,
    end,
    days,
    elapsed,
    phase,
    title: titleFor(scope, start),
    rangeLabel: rangeLabelFor(scope, start, end, days.length),
    navLabel: navLabelFor(scope, start),
    relative: relativeFor(scope, delta, phase),
  };
}

/**
 * The `count` periods ending with this one, oldest first — the series behind
 * every sparkline. Each is trimmed to the same number of days as the period
 * under review so a three-day-old week is never compared against seven.
 */
export function historySeries(
  period: Period, count: number,
): { start: string; days: string[]; label: string }[] {
  const span = period.elapsed || period.days.length;
  const out: { start: string; days: string[]; label: string }[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const start = shiftPeriod(period.scope, period.start, -i);
    const all = daysBetween(start, periodEnd(period.scope, start));
    out.push({
      start,
      days: all.slice(0, Math.min(span, all.length)),
      label: navLabelFor(period.scope, start),
    });
  }
  return out;
}

/** The days actually under review — the whole period, or the part lived so far. */
export function measuredDays(period: Period): string[] {
  if (period.phase === "future") return [];
  return period.days.slice(0, period.elapsed || period.days.length);
}

/** What the recap is honestly measuring, said out loud. */
export function measurementNote(period: Period): string {
  if (period.phase === "future") return "Nothing has happened yet — this is what is already booked";
  if (period.phase === "past") return `Measured against the ${SCOPE_NOUN[period.scope]} before`;
  const n = period.elapsed;
  return `First ${n} ${n === 1 ? "day" : "days"} — measured against the same days of past ${SCOPE_NOUN[period.scope]}s`;
}
