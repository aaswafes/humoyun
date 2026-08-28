// =========================================================
// Reading the pattern out of the prayer log.
//
// Nothing here produces a grade. It answers two questions: what does the
// mix of jamaah / alone / qadha look like over a stretch of days, and
// which prayer is the one that tends to slip.
// =========================================================

import { prayerTimesFor, type PrayerConfig } from "@/lib/prayer";
import { addDays, toISO } from "@/lib/date";
import { PRAYER_NAMES, type Prayer, type PrayerName, type PrayerStatus } from "@/lib/types";

/** Recorded as dealt with. Qadha counts — it was made up, not skipped. */
export const HANDLED: PrayerStatus[] = ["prayed", "jamaah", "late", "qadha"];

/** Prayed inside the window, one way or another. */
export const ON_TIME: PrayerStatus[] = ["prayed", "jamaah", "late"];

/** The order the composition bars stack in. */
export const COMPOSITION: PrayerStatus[] = ["jamaah", "prayed", "late", "qadha", "missed", "none"];

export type Counts = Record<PrayerStatus, number>;

export const emptyCounts = (): Counts => ({
  jamaah: 0, prayed: 0, late: 0, qadha: 0, missed: 0, none: 0,
});

export const countsTotal = (c: Counts) => COMPOSITION.reduce((sum, k) => sum + c[k], 0);
export const handledOf = (c: Counts) => HANDLED.reduce((sum, k) => sum + c[k], 0);

/** date|name -> status, built once per render pass. */
export function statusIndex(prayers: Prayer[]): Map<string, PrayerStatus> {
  const map = new Map<string, PrayerStatus>();
  prayers.forEach((p) => map.set(`${p.date}|${p.name}`, p.status));
  return map;
}

export function statusAt(index: Map<string, PrayerStatus>, date: string, name: PrayerName): PrayerStatus {
  return index.get(`${date}|${name}`) ?? "none";
}

export function countsFor(
  index: Map<string, PrayerStatus>,
  dates: string[],
  names: PrayerName[] = PRAYER_NAMES,
): Counts {
  const counts = emptyCounts();
  dates.forEach((date) => names.forEach((name) => { counts[statusAt(index, date, name)] += 1; }));
  return counts;
}

export function perPrayerCounts(
  index: Map<string, PrayerStatus>,
  dates: string[],
): Record<PrayerName, Counts> {
  return Object.fromEntries(
    PRAYER_NAMES.map((name) => [name, countsFor(index, dates, [name])]),
  ) as Record<PrayerName, Counts>;
}

/** Handled count per day — the shape of the stretch, one bar per day. */
export function dailyHandled(
  index: Map<string, PrayerStatus>,
  dates: string[],
): { date: string; handled: number; jamaah: number }[] {
  return dates.map((date) => {
    let handled = 0;
    let jamaah = 0;
    PRAYER_NAMES.forEach((name) => {
      const status = statusAt(index, date, name);
      if (HANDLED.includes(status)) handled += 1;
      if (status === "jamaah") jamaah += 1;
    });
    return { date, handled, jamaah };
  });
}

// ---------------------------------------------------------
// When inside the window it actually gets marked
// ---------------------------------------------------------
export interface LagStat {
  /** Records marked on their own day, inside the window. */
  samples: number;
  /** Median minutes between the adhan and the mark. */
  median: number | null;
  /** Marks that landed in the last quarter of the window. */
  lateInWindow: number;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/**
 * How long after the adhan the prayer got marked. Only records logged on
 * their own day and inside the window are counted — a mark added days later
 * says nothing about the time of day, so it is left out rather than guessed.
 */
export function lagStats(
  prayers: Prayer[],
  dates: Set<string>,
  config: PrayerConfig,
): Record<PrayerName, LagStat> {
  const buckets: Record<PrayerName, number[]> = { fajr: [], dhuhr: [], asr: [], maghrib: [], isha: [] };
  const lateIn: Record<PrayerName, number> = { fajr: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0 };
  const cache = new Map<string, ReturnType<typeof prayerTimesFor>>();

  prayers.forEach((p) => {
    if (!dates.has(p.date) || !ON_TIME.includes(p.status)) return;
    const stamp = new Date(p.logged_at);
    if (Number.isNaN(stamp.getTime()) || toISO(stamp) !== p.date) return;

    const timesFor = (iso: string) => {
      let value = cache.get(iso);
      if (!value) { value = prayerTimesFor(iso, config); cache.set(iso, value); }
      return value;
    };
    const times = timesFor(p.date);

    // Isha stays valid until dawn, but its preferred time ends at Islamic
    // midnight — that is the boundary worth measuring against.
    const nextFajr = timesFor(addDays(p.date, 1)).fajr + 1440;
    const ends: Record<PrayerName, number> = {
      fajr: times.sunrise, dhuhr: times.asr, asr: times.maghrib,
      maghrib: times.isha, isha: times.maghrib + (nextFajr - times.maghrib) / 2,
    };
    const start = times[p.name];
    const length = Math.max(1, ends[p.name] - start);
    const lag = stamp.getHours() * 60 + stamp.getMinutes() - start;
    if (lag < 0 || lag > length) return;

    buckets[p.name].push(lag);
    if (lag > length * 0.75) lateIn[p.name] += 1;
  });

  return Object.fromEntries(
    PRAYER_NAMES.map((name) => [
      name,
      { samples: buckets[name].length, median: median(buckets[name]), lateInWindow: lateIn[name] },
    ]),
  ) as Record<PrayerName, LagStat>;
}

// ---------------------------------------------------------
// One prayer, summarised
// ---------------------------------------------------------
export interface PrayerInsight {
  name: PrayerName;
  counts: Counts;
  total: number;
  handled: number;
  jamaahRate: number;
  handledRate: number;
  /** Made up afterwards or never recorded — slippage, not a verdict. */
  slipped: number;
  lag: LagStat;
}

export function buildInsights(
  index: Map<string, PrayerStatus>,
  dates: string[],
  lag: Record<PrayerName, LagStat>,
): PrayerInsight[] {
  const per = perPrayerCounts(index, dates);
  return PRAYER_NAMES.map((name) => {
    const counts = per[name];
    const total = countsTotal(counts);
    const safe = Math.max(1, total);
    const handled = handledOf(counts);
    return {
      name,
      counts,
      total,
      handled,
      jamaahRate: counts.jamaah / safe,
      handledRate: handled / safe,
      slipped: counts.qadha + counts.missed + counts.none,
      lag: lag[name],
    };
  });
}

/** The prayer that slips most, and the one that holds. */
export function extremes(insights: PrayerInsight[]): { weakest: PrayerInsight; strongest: PrayerInsight } {
  const slipping = [...insights].sort((a, b) => b.slipped - a.slipped);
  const holding = [...insights].sort((a, b) => b.jamaahRate - a.jamaahRate || b.handledRate - a.handledRate);
  return { weakest: slipping[0], strongest: holding[0] };
}
