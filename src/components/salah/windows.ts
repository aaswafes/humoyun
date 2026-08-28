// =========================================================
// Prayer windows.
//
// The number that actually matters is not "when does the next one start"
// but "how much of the current one is left". That needs three days of
// times, because Isha runs past midnight into the next morning.
//
// Every minute here is anchored to today's midnight, so a value can be
// negative (yesterday evening) or above 1440 (tomorrow morning).
// =========================================================

import type { DayPrayerTimes } from "@/lib/prayer";
import { PRAYER_NAMES, type PrayerName } from "@/lib/types";

export interface TimesTriple {
  prev: DayPrayerTimes;
  today: DayPrayerTimes;
  next: DayPrayerTimes;
}

export interface Window {
  start: number;
  end: number;
}

export const windowLength = (w: Window) => w.end - w.start;
export const inWindow = (w: Window, min: number) => min >= w.start && min < w.end;

/** Today's five windows. Isha closes at tomorrow's Fajr. */
export function prayerWindows(t: TimesTriple): Record<PrayerName, Window> {
  return {
    fajr: { start: t.today.fajr, end: t.today.sunrise },
    dhuhr: { start: t.today.dhuhr, end: t.today.asr },
    asr: { start: t.today.asr, end: t.today.maghrib },
    maghrib: { start: t.today.maghrib, end: t.today.isha },
    isha: { start: t.today.isha, end: t.next.fajr + 1440 },
  };
}

/** Yesterday's Isha is still open until this morning's Fajr. */
export function carriedIsha(t: TimesTriple): Window {
  return { start: t.prev.isha - 1440, end: t.today.fajr };
}

export interface OpenWindow {
  name: PrayerName;
  /** 0 = today's window, -1 = yesterday's Isha still running. */
  dayOffset: 0 | -1;
  window: Window;
  length: number;
  elapsed: number;
  remaining: number;
  /** 0..1 of the window spent. */
  progress: number;
}

/** The window open right now, or null in the gap between Sunrise and Dhuhr. */
export function openWindow(t: TimesTriple, nowMin: number): OpenWindow | null {
  const today = prayerWindows(t);
  const candidates: { name: PrayerName; dayOffset: 0 | -1; window: Window }[] = [
    { name: "isha", dayOffset: -1, window: carriedIsha(t) },
    ...PRAYER_NAMES.map((name) => ({ name, dayOffset: 0 as const, window: today[name] })),
  ];
  const hit = candidates.find((c) => inWindow(c.window, nowMin));
  if (!hit) return null;
  const length = Math.max(1, windowLength(hit.window));
  const elapsed = nowMin - hit.window.start;
  return {
    name: hit.name,
    dayOffset: hit.dayOffset,
    window: hit.window,
    length,
    elapsed,
    remaining: hit.window.end - nowMin,
    progress: Math.max(0, Math.min(1, elapsed / length)),
  };
}

export interface NextPrayer {
  name: PrayerName;
  /** Anchored to today's midnight, so tomorrow's Fajr reads above 1440. */
  at: number;
  minutesUntil: number;
  /** True when the next one is tomorrow's Fajr. */
  tomorrow: boolean;
}

export function nextPrayer(t: TimesTriple, nowMin: number): NextPrayer {
  for (const name of PRAYER_NAMES) {
    const at = t.today[name];
    if (at > nowMin) return { name, at, minutesUntil: at - nowMin, tomorrow: false };
  }
  const at = t.next.fajr + 1440;
  return { name: "fajr", at, minutesUntil: at - nowMin, tomorrow: true };
}

/**
 * Islamic midnight — the midpoint between Maghrib and the following Fajr.
 * Isha stays valid until dawn, but the preferred time ends here.
 */
export function islamicMidnight(t: TimesTriple): number {
  return t.today.maghrib + (t.next.fajr + 1440 - t.today.maghrib) / 2;
}

/** Duha sits between sunrise settling and the sun reaching its zenith. */
export function duhaWindow(t: TimesTriple): Window {
  return { start: t.today.sunrise + 20, end: t.today.dhuhr - 15 };
}

/**
 * `lastThird` belongs to the night that starts on its own day's Maghrib, so
 * it lands after midnight at most latitudes. Anchoring both nights lets a
 * 3 AM check-in still read as "the last third".
 */
function anchorNight(lastThird: number, maghrib: number, dayOffset: number): number {
  return lastThird + dayOffset * 1440 + (lastThird > maghrib ? 0 : 1440);
}

/** The two night windows that can touch today: last night's and tonight's. */
export function nightWindows(t: TimesTriple): Window[] {
  return [
    { start: anchorNight(t.prev.lastThird, t.prev.maghrib, -1), end: t.today.fajr },
    { start: anchorNight(t.today.lastThird, t.today.maghrib, 0), end: t.next.fajr + 1440 },
  ];
}

export function inLastThird(t: TimesTriple, nowMin: number): boolean {
  return nightWindows(t).some((w) => inWindow(w, nowMin));
}

/**
 * The last third to show on today's timeline: this morning's if the night
 * already turned over, otherwise the one arriving tonight.
 */
export function tahajjudRowMinute(t: TimesTriple): number {
  return t.today.lastThird > t.today.maghrib ? t.today.lastThird : t.prev.lastThird;
}

/** Where a window sits in the day, in plain words — used by the insights. */
export function partOfDay(min: number): string {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  if (m < 300) return "the small hours";
  if (m < 420) return "before dawn";
  if (m < 660) return "the morning";
  if (m < 840) return "the middle of the day";
  if (m < 1020) return "the working afternoon";
  if (m < 1200) return "the evening";
  return "late evening";
}
