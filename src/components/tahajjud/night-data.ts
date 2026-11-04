// =========================================================
// Tahajjud — what a night is, and where it is kept.
//
// A night is named by the morning it ends in. Tahajjud is nearly always
// prayed after midnight, so "I prayed at 4 on Tuesday" lands on Tuesday —
// and that is also where the old Sunnah & nafl tick on the Salah card put it,
// so every night recorded there still counts here.
//
// A night lives in `day_logs.data.tahajjud`, one row per day, next to the
// salah and zikr blocks. No table of its own, no stored totals: every streak
// and average below is derived from rows the store already holds.
// =========================================================

import { addDays, weekday } from "@/lib/date";
import type { DayLog } from "@/lib/types";
import { nightWindows, type TimesTriple } from "@/components/salah/windows";

/** The id the Salah card used before Tahajjud had its own page. */
export const LEGACY_SUNNAH_ID = "nafl:tahajjud";

/** One night that was kept. A night that was not kept has no record at all. */
export interface TahajjudNight {
  /** Null when it was prayed but the count was never written down. */
  rakat: number | null;
  /** Minute of the day it was prayed, if known — 215 is 3:35 AM. */
  at: number | null;
}

export const MAX_RAKAT = 40;

function asRakat(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n >= 1 ? Math.min(MAX_RAKAT, Math.round(n)) : null;
}

function asMinute(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n < 1440 ? Math.round(n) : null;
}

function legacyTicked(data: Record<string, unknown>): boolean {
  const salah = data.salah as Record<string, unknown> | undefined;
  return Array.isArray(salah?.sunnah) && salah.sunnah.includes(LEGACY_SUNNAH_ID);
}

/** Reads the night out of a day log, tolerating anything else in there. */
export function tahajjudOf(log: DayLog | undefined): TahajjudNight | null {
  const data = (log?.data ?? {}) as Record<string, unknown>;
  const raw = data.tahajjud;
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    return { rakat: asRakat(obj.rakat), at: asMinute(obj.at) };
  }
  // Ticked on the Salah card before this page existed: kept, nothing more known.
  return legacyTicked(data) ? { rakat: null, at: null } : null;
}

/**
 * Writes the night back into the day log's `data`, leaving every other block
 * alone. A legacy tick is dropped on the way so a night is never recorded in
 * two places — otherwise un-ticking here would leave the old one standing.
 */
export function withTahajjud(log: DayLog | undefined, night: TahajjudNight | null): Record<string, unknown> {
  const next: Record<string, unknown> = { ...(log?.data ?? {}) };
  if (legacyTicked(next)) {
    const salah = next.salah as Record<string, unknown>;
    next.salah = { ...salah, sunnah: (salah.sunnah as unknown[]).filter((id) => id !== LEGACY_SUNNAH_ID) };
  }
  if (night) next.tahajjud = night;
  else delete next.tahajjud;
  return next;
}

/** date -> night, for every night that was kept. */
export function buildNightIndex(dayLogs: DayLog[]): Map<string, TahajjudNight> {
  const map = new Map<string, TahajjudNight>();
  for (const log of dayLogs) {
    const night = tahajjudOf(log);
    if (night) map.set(log.date, night);
  }
  return map;
}

// ---------------------------------------------------------
// The night on the clock
// ---------------------------------------------------------

/**
 * The night as it stands right now. Every minute is anchored to today's
 * midnight, so last night's Maghrib is negative and tomorrow's Fajr is
 * above 1440 — the same convention as the salah windows.
 */
export interface NightClock {
  /** The morning this night ends in — the key it is stored under. */
  key: string;
  /** Before Maghrib the night worth logging is the one that just ended. */
  phase: "evening" | "night" | "lastThird" | "over";
  maghrib: number;
  isha: number;
  midnight: number;
  lastThird: number;
  fajr: number;
}

export function nightClock(today: string, t: TimesTriple, nowMin: number): NightClock {
  const [lastNight, tonight] = nightWindows(t);

  // From Maghrib on, tonight is the night in play; before that it is the one
  // that ended (or is still ending) this morning.
  const tonightInPlay = nowMin >= t.today.maghrib;
  const base = tonightInPlay
    ? { key: addDays(today, 1), day: t.today, offset: 0, window: tonight }
    : { key: today, day: t.prev, offset: -1440, window: lastNight };

  const maghrib = base.day.maghrib + base.offset;
  // At high latitudes Isha can fall after midnight; keep it after Maghrib.
  const isha = base.day.isha + base.offset + (base.day.isha < base.day.maghrib ? 1440 : 0);
  const fajr = base.window.end;
  const lastThird = base.window.start;

  const phase: NightClock["phase"] =
    nowMin >= fajr ? "over"
    : nowMin >= lastThird ? "lastThird"
    : nowMin >= isha ? "night"
    : "evening";

  return { key: base.key, phase, maghrib, isha, midnight: (maghrib + fajr) / 2, lastThird, fajr };
}

// ---------------------------------------------------------
// Reading the pattern
// ---------------------------------------------------------

/**
 * Nights in a row, ending at the most recent one. The night in play is still
 * open, so not having logged it yet never breaks the run.
 */
export function currentStreak(index: Map<string, TahajjudNight>, key: string): number {
  let cursor = index.has(key) ? key : addDays(key, -1);
  let streak = 0;
  while (index.has(cursor) && streak < 3650) {
    streak++;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

export function longestStreak(dates: string[]): number {
  const sorted = [...dates].sort();
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const date of sorted) {
    run = prev && addDays(prev, 1) === date ? run + 1 : 1;
    best = Math.max(best, run);
    prev = date;
  }
  return best;
}

/**
 * The middle of the times, read around noon rather than midnight — so 11:50 PM
 * and 12:20 AM sit ten minutes apart and not a whole day.
 */
export function medianMinute(minutes: number[]): number | null {
  if (!minutes.length) return null;
  const shifted = minutes.map((m) => (m - 720 + 1440) % 1440).sort((a, b) => a - b);
  const mid = Math.floor(shifted.length / 2);
  const median = shifted.length % 2 ? shifted[mid] : (shifted[mid - 1] + shifted[mid]) / 2;
  return Math.round(median + 720) % 1440;
}

export interface NightSummary {
  nights: number;
  /** Nights in the stretch, so a rate always has its denominator beside it. */
  of: number;
  rakat: number;
  /** Nights whose count is known — the average is over these, not over all. */
  counted: number;
  avgRakat: number | null;
  longest: number;
  typical: number | null;
  timed: number;
  /** Kept nights by the weekday of the morning they end in, Sunday first. */
  byWeekday: number[];
}

/** Everything the stats say about a stretch of nights, from one pass. */
export function summarize(index: Map<string, TahajjudNight>, dates: string[]): NightSummary {
  const kept = dates.filter((d) => index.has(d));
  const byWeekday = Array.from({ length: 7 }, () => 0);
  let rakat = 0;
  let counted = 0;
  const times: number[] = [];

  for (const date of kept) {
    const night = index.get(date) as TahajjudNight;
    byWeekday[weekday(date)] += 1;
    if (night.rakat != null) {
      rakat += night.rakat;
      counted += 1;
    }
    if (night.at != null) times.push(night.at);
  }

  return {
    nights: kept.length,
    of: dates.length,
    rakat,
    counted,
    avgRakat: counted ? rakat / counted : null,
    longest: longestStreak(kept),
    typical: medianMinute(times),
    timed: times.length,
    byWeekday,
  };
}

/** The count to offer when a night is ticked: whatever the last counted one was. */
export function usualRakat(index: Map<string, TahajjudNight>): number {
  let latest: string | null = null;
  let rakat = 2;
  for (const [date, night] of index) {
    if (night.rakat != null && (!latest || date > latest)) {
      latest = date;
      rakat = night.rakat;
    }
  }
  return rakat;
}

/**
 * The record a tick writes, from the card or the month alike. A time is only
 * filled in when the tick is happening inside that night; anything else would
 * be a guess written down as a fact.
 */
export function freshNight(
  index: Map<string, TahajjudNight>, clock: NightClock, date: string, nowMin: number,
): TahajjudNight {
  const during = date === clock.key && clock.phase !== "over" && nowMin >= clock.isha;
  return { rakat: usualRakat(index), at: during ? ((nowMin % 1440) + 1440) % 1440 : null };
}
