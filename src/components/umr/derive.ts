import { addDays, dayNameOf, startOfWeek, todayISO, weekday, yearOf } from "@/lib/date";
import {
  MINUTES_IN_DAY, UMR_CATEGORIES, UMR_META, damBalance, sumTotals, totalsOf, ZERO_TOTALS,
  type DamBalance, type UmrCategory, type UmrDay, type UmrEntry, type UmrPrefs, type UmrTotals,
} from "@/lib/umr";

// =========================================================
// Every number on the two Umr surfaces is derived here, from the ledger only.
// Pure functions, no React, no fetching — the same rule the Stats page follows,
// and the reason a figure on the page and a figure in the CSV can never differ.
// =========================================================

export type UmrRangeKey = "7d" | "30d" | "90d" | "year" | "all";

export const UMR_RANGES: { value: UmrRangeKey; label: string; title: string }[] = [
  { value: "7d", label: "7d", title: "The last seven days" },
  { value: "30d", label: "30d", title: "The last thirty days" },
  { value: "90d", label: "90d", title: "The last ninety days" },
  { value: "year", label: "1y", title: "The last year" },
  { value: "all", label: "All", title: "Everything recorded" },
];

const SPAN: Record<Exclude<UmrRangeKey, "all">, number> = {
  "7d": 7, "30d": 30, "90d": 90, year: 365,
};

export function umrRangeDates(key: UmrRangeKey, earliest: string | null, today = todayISO()): string[] {
  const span = key === "all"
    // "All" still has to end somewhere, or an empty ledger would render 50 years
    // of blank days. One day of history is a one-day window.
    ? Math.max(1, Math.min(3650, earliest ? daysInclusive(earliest, today) : 1))
    : SPAN[key];
  const out: string[] = [];
  for (let i = span - 1; i >= 0; i--) out.push(addDays(today, -i));
  return out;
}

function daysInclusive(from: string, to: string): number {
  const a = Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10));
  const b = Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10));
  return Math.floor((b - a) / 86_400_000) + 1;
}

/** The window immediately before this one, same length — for the comparison. */
export function previousWindow(days: string[]): string[] {
  if (!days.length) return [];
  return days.map((_, i) => addDays(days[0], i - days.length));
}

export function changePct(now: number, before: number): number | null {
  if (before === 0) return now === 0 ? 0 : null;
  return ((now - before) / before) * 100;
}

// ---------------------------------------------------------
// Shape of a window
// ---------------------------------------------------------

export interface UmrSummary {
  days: UmrDay[];
  totals: UmrTotals;
  unassigned: number;
  /** every minute in the window that is accounted for at all */
  accounted: number;
  /** 24h × days − accounted; the hours the ledger cannot see */
  unaccounted: number;
  /** minutes per day, over the whole window including empty days */
  perDay: UmrTotals;
  /** each category as a share of the accounted minutes, 0–1 */
  share: Record<UmrCategory, number>;
  /** days with at least one minute recorded */
  daysLogged: number;
  /** accounted ÷ the whole window, 0–1 */
  coverage: number;
}

export function summarise(days: string[], entries: UmrEntry[]): UmrSummary {
  const byDay = buildDayIndex(days, entries);
  const { totals, unassigned } = totalsOf(entries.filter((e) => byDay.has(e.date)));
  const accounted = sumTotals(totals) + unassigned;
  const span = Math.max(1, days.length);

  const perDay = ZERO_TOTALS();
  const share: Record<UmrCategory, number> = { talim: 0, ibodat: 0, xordiq: 0, dam: 0, inson: 0 };
  for (const c of UMR_CATEGORIES) {
    perDay[c] = totals[c] / span;
    share[c] = accounted > 0 ? totals[c] / accounted : 0;
  }

  const dayRows = days.map((date) => {
    const list = byDay.get(date) ?? [];
    const t = totalsOf(list);
    return {
      date,
      totals: t.totals,
      unassigned: t.unassigned,
      accounted: sumTotals(t.totals) + t.unassigned,
    };
  });

  return {
    days: dayRows,
    totals,
    unassigned,
    accounted,
    unaccounted: Math.max(0, span * MINUTES_IN_DAY - accounted),
    perDay,
    share,
    daysLogged: dayRows.filter((d) => d.accounted > 0).length,
    coverage: accounted / (span * MINUTES_IN_DAY),
  };
}

function buildDayIndex(days: string[], entries: UmrEntry[]): Map<string, UmrEntry[]> {
  const inRange = new Set(days);
  const map = new Map<string, UmrEntry[]>(days.map((d) => [d, []]));
  for (const e of entries) {
    if (!inRange.has(e.date)) continue;
    map.get(e.date)?.push(e);
  }
  return map;
}

// ---------------------------------------------------------
// The Dam budget, over a window
// ---------------------------------------------------------

export interface DamDay {
  date: string;
  talim: number;
  budget: number;
  spent: number;
  over: boolean;
  /** true when no dam was spent at all — a clean day, not merely a legal one */
  clean: boolean;
}

export function damDays(days: UmrDay[], prefs: UmrPrefs): DamDay[] {
  return days.map((d) => {
    const budget = Math.floor(d.totals.talim * prefs.damRatio);
    return {
      date: d.date,
      talim: d.totals.talim,
      budget,
      spent: d.totals.dam,
      over: d.totals.dam > budget,
      clean: d.totals.dam === 0,
    };
  });
}

export interface DamDiscipline {
  /** the balance across the whole window */
  overall: DamBalance;
  daysOver: number;
  daysWithin: number;
  /** consecutive days ending today that stayed inside the budget */
  currentStreak: number;
  bestStreak: number;
  /** total minutes spent past the budget */
  debt: number;
  /** dam ÷ taʼlim actually achieved, against the ratio allowed */
  actualRatio: number | null;
  worst: DamDay | null;
}

export function damDiscipline(rows: DamDay[], totals: UmrTotals, prefs: UmrPrefs): DamDiscipline {
  let daysOver = 0;
  let debt = 0;
  let best = 0;
  let run = 0;
  for (const r of rows) {
    if (r.over) {
      daysOver += 1;
      debt += r.spent - r.budget;
      run = 0;
    } else {
      run += 1;
      if (run > best) best = run;
    }
  }

  let current = 0;
  for (let i = rows.length - 1; i >= 0; i--) {
    if (rows[i].over) break;
    current += 1;
  }

  const worst = rows.reduce<DamDay | null>(
    (acc, r) => (r.over && (!acc || r.spent - r.budget > acc.spent - acc.budget) ? r : acc),
    null,
  );

  return {
    overall: damBalance(totals.talim, totals.dam, prefs),
    daysOver,
    daysWithin: rows.length - daysOver,
    currentStreak: current,
    bestStreak: best,
    debt,
    actualRatio: totals.talim > 0 ? totals.dam / totals.talim : null,
    worst,
  };
}

// ---------------------------------------------------------
// Rhythm — when in the week, and when in the day
// ---------------------------------------------------------

export interface WeekdayRow {
  index: number;
  label: string;
  totals: UmrTotals;
  accounted: number;
  days: number;
}

export function weekdayProfile(days: UmrDay[], weekStart: number): WeekdayRow[] {
  const rows: WeekdayRow[] = Array.from({ length: 7 }, (_, i) => {
    const index = (weekStart + i) % 7;
    return { index, label: dayNameOf(index, "short"), totals: ZERO_TOTALS(), accounted: 0, days: 0 };
  });
  const slot = new Map(rows.map((r, i) => [r.index, i]));

  for (const d of days) {
    const i = slot.get(weekday(d.date));
    if (i == null) continue;
    const row = rows[i];
    row.days += 1;
    for (const c of UMR_CATEGORIES) row.totals[c] += d.totals[c];
    row.accounted += d.accounted;
  }
  return rows;
}

export interface HourRow {
  hour: number;
  totals: UmrTotals;
  accounted: number;
}

/**
 * Only entries that know what time they happened can land on an hour — a
 * session, a prayer, a task with a start time, a logged minute with a clock.
 * Sleep and a habit tick contribute to the day and to nothing finer, which is
 * the honest answer rather than spreading them evenly and inventing a shape.
 */
export function hourProfile(entries: UmrEntry[]): { rows: HourRow[]; placed: number; total: number } {
  const rows: HourRow[] = Array.from({ length: 24 }, (_, hour) => ({
    hour, totals: ZERO_TOTALS(), accounted: 0,
  }));
  let placed = 0;
  let total = 0;

  for (const e of entries) {
    total += e.minutes;
    if (e.startMin == null || !e.category) continue;
    const hour = Math.max(0, Math.min(23, Math.floor(e.startMin / 60)));
    rows[hour].totals[e.category] += e.minutes;
    rows[hour].accounted += e.minutes;
    placed += e.minutes;
  }
  return { rows, placed, total };
}

// ---------------------------------------------------------
// Streaks, records and what filled each category
// ---------------------------------------------------------

export interface CategoryStreak {
  category: UmrCategory;
  current: number;
  best: number;
  daysTouched: number;
}

export function categoryStreaks(days: UmrDay[]): CategoryStreak[] {
  return UMR_CATEGORIES.map((category) => {
    let best = 0;
    let run = 0;
    let touched = 0;
    for (const d of days) {
      if (d.totals[category] > 0) {
        run += 1;
        touched += 1;
        if (run > best) best = run;
      } else {
        run = 0;
      }
    }
    let current = 0;
    for (let i = days.length - 1; i >= 0; i--) {
      if (days[i].totals[category] <= 0) break;
      current += 1;
    }
    return { category, current, best, daysTouched: touched };
  });
}

export interface ActivityRow {
  label: string;
  minutes: number;
  entries: number;
  share: number;
}

/** What actually filled a category, biggest first. */
export function activitiesIn(
  entries: UmrEntry[], category: UmrCategory, limit = 8,
): ActivityRow[] {
  const byLabel = new Map<string, { minutes: number; entries: number }>();
  let total = 0;
  for (const e of entries) {
    if (e.category !== category) continue;
    total += e.minutes;
    const key = e.label.trim() || "Untitled";
    const hit = byLabel.get(key);
    if (hit) { hit.minutes += e.minutes; hit.entries += 1; }
    else byLabel.set(key, { minutes: e.minutes, entries: 1 });
  }
  return [...byLabel.entries()]
    .map(([label, v]) => ({ label, ...v, share: total > 0 ? v.minutes / total : 0 }))
    .sort((a, b) => b.minutes - a.minutes)
    .slice(0, limit);
}

export interface SourceRow {
  source: UmrEntry["source"];
  label: string;
  minutes: number;
  entries: number;
  share: number;
}

const SOURCE_LABEL: Record<UmrEntry["source"], string> = {
  session: "Focus sessions",
  task: "Minutes on tasks",
  prayer: "Prayers",
  habit: "Habits",
  sleep: "Sleep",
  manual: "Logged by hand",
};

/** Where the ledger's minutes came from — how measured this window really is. */
export function sourceBreakdown(entries: UmrEntry[]): SourceRow[] {
  const by = new Map<UmrEntry["source"], { minutes: number; entries: number }>();
  let total = 0;
  for (const e of entries) {
    total += e.minutes;
    const hit = by.get(e.source);
    if (hit) { hit.minutes += e.minutes; hit.entries += 1; }
    else by.set(e.source, { minutes: e.minutes, entries: 1 });
  }
  return [...by.entries()]
    .map(([source, v]) => ({
      source, label: SOURCE_LABEL[source], ...v, share: total > 0 ? v.minutes / total : 0,
    }))
    .sort((a, b) => b.minutes - a.minutes);
}

// ---------------------------------------------------------
// Balance — one number for how evenly a life is spread
// ---------------------------------------------------------

/**
 * Normalised Shannon evenness across the five categories: 1 when time is split
 * perfectly evenly, 0 when it all went to one.
 *
 * It is NOT a score of a good life and the page says so. A week of hard study
 * scores low and deserves to; the number is a description, not a verdict.
 */
export function balanceIndex(totals: UmrTotals): number | null {
  const total = sumTotals(totals);
  if (total <= 0) return null;
  let h = 0;
  for (const c of UMR_CATEGORIES) {
    const p = totals[c] / total;
    if (p > 0) h -= p * Math.log(p);
  }
  return h / Math.log(UMR_CATEGORIES.length);
}

export function dominant(totals: UmrTotals): { category: UmrCategory; minutes: number } | null {
  let best: { category: UmrCategory; minutes: number } | null = null;
  for (const c of UMR_CATEGORIES) {
    if (!best || totals[c] > best.minutes) best = { category: c, minutes: totals[c] };
  }
  return best && best.minutes > 0 ? best : null;
}

// ---------------------------------------------------------
// Buckets, for a window too long to draw one bar per day
// ---------------------------------------------------------

export interface UmrBucket {
  key: string;
  label: string;
  dates: string[];
  totals: UmrTotals;
  unassigned: number;
  accounted: number;
}

export function bucketise(days: UmrDay[], grain: "day" | "week" | "month", weekStart: number): UmrBucket[] {
  if (grain === "day") {
    return days.map((d) => ({
      key: d.date,
      label: d.date.slice(5),
      dates: [d.date],
      totals: d.totals,
      unassigned: d.unassigned,
      accounted: d.accounted,
    }));
  }

  const buckets = new Map<string, UmrBucket>();
  for (const d of days) {
    const key = grain === "week" ? startOfWeek(d.date, weekStart) : d.date.slice(0, 7);
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        key,
        label: grain === "week" ? key.slice(5) : key,
        dates: [],
        totals: ZERO_TOTALS(),
        unassigned: 0,
        accounted: 0,
      };
      buckets.set(key, bucket);
    }
    bucket.dates.push(d.date);
    for (const c of UMR_CATEGORIES) bucket.totals[c] += d.totals[c];
    bucket.unassigned += d.unassigned;
    bucket.accounted += d.accounted;
  }
  return [...buckets.values()];
}

export function grainFor(dayCount: number): "day" | "week" | "month" {
  if (dayCount <= 31) return "day";
  if (dayCount <= 200) return "week";
  return "month";
}

// ---------------------------------------------------------
// Trailing average — the trend under a noisy daily series
// ---------------------------------------------------------

export function trailing(values: number[], window: number): number[] {
  const out: number[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= window) sum -= values[i - window];
    out.push(sum / Math.min(window, i + 1));
  }
  return out;
}

// ---------------------------------------------------------
// Projection
// ---------------------------------------------------------

export interface Projection {
  perDay: number;
  perWeek: number;
  perYear: number;
  /** the same in days of wall-clock time, which is the point of the section */
  daysOfLifePerYear: number;
}

export function project(totals: UmrTotals, category: UmrCategory, span: number): Projection {
  const perDay = span > 0 ? totals[category] / span : 0;
  const perYear = perDay * 365;
  return {
    perDay,
    perWeek: perDay * 7,
    perYear,
    daysOfLifePerYear: perYear / MINUTES_IN_DAY,
  };
}

// ---------------------------------------------------------
// Insights — plain sentences, only where the sample supports one
// ---------------------------------------------------------

export interface UmrInsight {
  id: string;
  text: string;
  tone: "neutral" | "good" | "warn";
}

export function buildUmrInsights(input: {
  summary: UmrSummary;
  discipline: DamDiscipline;
  previous: UmrSummary | null;
  prefs: UmrPrefs;
  weekdays: WeekdayRow[];
  streaks: CategoryStreak[];
}): UmrInsight[] {
  const { summary, discipline, previous, weekdays, streaks } = input;
  const out: UmrInsight[] = [];
  const span = Math.max(1, summary.days.length);

  if (summary.accounted === 0) return out;

  // ---- the rule the section exists for ----
  if (discipline.overall.over) {
    out.push({
      id: "dam-over",
      tone: "warn",
      text: `Dam is ${fmtMin(-discipline.overall.left)} past what Taʼlim earned across this window — ${fmtMin(discipline.overall.spent)} spent against a budget of ${fmtMin(discipline.overall.budget)}.`,
    });
  } else if (discipline.overall.budget > 0) {
    out.push({
      id: "dam-within",
      tone: "good",
      text: `Dam has stayed inside its budget: ${fmtMin(discipline.overall.spent)} spent of ${fmtMin(discipline.overall.budget)} earned, ${fmtMin(discipline.overall.left)} still owed to you.`,
    });
  }

  if (discipline.daysOver > 0) {
    out.push({
      id: "dam-days",
      tone: discipline.daysOver > span / 3 ? "warn" : "neutral",
      text: `${discipline.daysOver} of ${span} days went over the cap; the longest clean run was ${discipline.bestStreak} ${discipline.bestStreak === 1 ? "day" : "days"}.`,
    });
  }

  // ---- what the window was actually for ----
  const top = dominant(summary.totals);
  if (top) {
    out.push({
      id: "dominant",
      tone: "neutral",
      text: `${UMR_META[top.category].label} took the largest share — ${Math.round(summary.share[top.category] * 100)}% of every minute recorded, about ${fmtMin(summary.perDay[top.category])} a day.`,
    });
  }

  // ---- a category that fell out of the window entirely ----
  for (const s of streaks) {
    if (s.daysTouched === 0 && span >= 7) {
      out.push({
        id: `absent-${s.category}`,
        tone: "warn",
        text: `${UMR_META[s.category].label} has no recorded minutes at all in these ${span} days.`,
      });
    }
  }

  // ---- direction of travel ----
  if (previous && previous.accounted > 0) {
    const d = changePct(summary.totals.talim, previous.totals.talim);
    if (d != null && Math.abs(d) >= 10) {
      out.push({
        id: "talim-trend",
        tone: d > 0 ? "good" : "warn",
        text: `Taʼlim is ${Math.abs(Math.round(d))}% ${d > 0 ? "up on" : "down on"} the previous ${span} days.`,
      });
    }
  }

  // ---- the strongest and weakest day of the week ----
  const rated = weekdays.filter((w) => w.days > 0);
  if (rated.length >= 4) {
    const byTalim = [...rated].sort((a, b) => b.totals.talim / b.days - a.totals.talim / a.days);
    const bestDay = byTalim[0];
    const worstDay = byTalim[byTalim.length - 1];
    if (bestDay.totals.talim > 0 && bestDay !== worstDay) {
      out.push({
        id: "weekday",
        tone: "neutral",
        text: `${bestDay.label} is your strongest day for Taʼlim (${fmtMin(bestDay.totals.talim / bestDay.days)} on average) and ${worstDay.label} the weakest (${fmtMin(worstDay.totals.talim / worstDay.days)}).`,
      });
    }
  }

  // ---- how much of the day the ledger can actually see ----
  if (summary.coverage < 0.5) {
    out.push({
      id: "coverage",
      tone: "neutral",
      text: `Only ${Math.round(summary.coverage * 100)}% of the clock is accounted for. The rest is not idle time — it is time nothing recorded, so treat every share above as a share of what was counted.`,
    });
  }

  if (summary.unassigned > 0) {
    out.push({
      id: "unassigned",
      tone: "neutral",
      text: `${fmtMin(summary.unassigned)} is recorded but uncategorised. Assigning it is the fastest way to make these numbers true.`,
    });
  }

  return out;
}

// ---------------------------------------------------------
// Formatting — one implementation, so a figure reads the same everywhere
// ---------------------------------------------------------

export function fmtMin(minutes: number): string {
  const m = Math.round(Math.abs(minutes));
  const sign = minutes < 0 ? "−" : "";
  if (m < 60) return `${sign}${m}m`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h < 24) return rest ? `${sign}${h}h ${rest}m` : `${sign}${h}h`;
  const d = Math.floor(h / 24);
  const hr = h % 24;
  return hr ? `${sign}${d}d ${hr}h` : `${sign}${d}d`;
}

/**
 * The axis form. A y-axis label is right-anchored six pixels inside a 38px
 * gutter, so "2h 20m" loses its first character — an axis wants one unit, not
 * a precise duration, and the tooltip and the data table carry the exact
 * figure anyway.
 */
export function fmtAxis(minutes: number): string {
  const m = Math.round(Math.abs(minutes));
  if (m === 0) return "0";
  if (m < 60) return `${m}m`;
  const h = m / 60;
  if (h < 24) return h < 10 && m % 60 !== 0 ? `${h.toFixed(1)}h` : `${Math.round(h)}h`;
  const d = h / 24;
  return d < 10 ? `${d.toFixed(1)}d` : `${Math.round(d)}d`;
}

export function fmtHours(minutes: number, decimals = 1): string {
  return (minutes / 60).toFixed(decimals);
}

export const pct = (v: number) => `${Math.round(v * 100)}%`;

/** The year a window belongs to, when it is all in one — used in the title. */
export function windowYear(days: string[]): number | null {
  if (!days.length) return null;
  const first = yearOf(days[0]);
  return yearOf(days[days.length - 1]) === first ? first : null;
}
