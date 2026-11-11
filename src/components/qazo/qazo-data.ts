"use client";

// =========================================================
// Qazo — the lifetime debt of fard prayers missed before one started
// praying regularly, and the record of paying it back.
//
// Two places hold it:
//   · profile.prefs.salah.qazo — the settings: the day salah became fard,
//     the day regular praying began, whether witr is owed, and `prior`,
//     whole days already made up outside the daily record.
//   · day_logs.data.qazo — { fajr: 3, dhuhr: 2, … } for each day something
//     was made up. Every total, pace and streak is summed from these, so
//     nothing stored can drift out of step with what was recorded.
//
// The debt is walked in order: the first day owed is the first day made up.
// That makes "how far have I got" a date — "up to 14 January 2024" — and the
// grid opens on that month by itself, with no tapping back through the years.
// =========================================================

import * as React from "react";
import { useStore } from "@/lib/store";
import { addDays, addMonths, diffDays } from "@/lib/date";
import type { DayLog } from "@/lib/types";

export type QazoPrayer = "fajr" | "dhuhr" | "asr" | "maghrib" | "isha" | "witr";

export const QAZO_FIVE: QazoPrayer[] = ["fajr", "dhuhr", "asr", "maghrib", "isha"];
export const QAZO_LABELS: Record<QazoPrayer, string> = {
  fajr: "Fajr", dhuhr: "Dhuhr", asr: "Asr", maghrib: "Maghrib", isha: "Isha", witr: "Witr",
};

export interface QazoConfig {
  /** First day salah was fard. */
  farz: string;
  /** First day of regular praying — the debt is farz up to the day before. */
  regular: string;
  /** Witr is wajib in the Hanafi madhab, so it is owed alongside the five. */
  witr: boolean;
  /** Whole days made up before or outside the daily record. */
  prior: number;
  /**
   * Per-prayer corrections, negative when a filled dot was tapped back to
   * empty and today's record had nothing left to take it from.
   */
  adjust: Partial<Record<QazoPrayer, number>>;
  /** Kept only so the form can show how farz was worked out. */
  birth: string | null;
  age: number | null;
}

export type QazoCounts = Partial<Record<QazoPrayer, number>>;

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function readConfig(prefs: Record<string, unknown> | undefined): QazoConfig | null {
  const salah = (prefs?.salah ?? {}) as Record<string, unknown>;
  const raw = salah.qazo as Record<string, unknown> | undefined;
  if (!raw || typeof raw.farz !== "string" || !ISO.test(raw.farz)) return null;
  const regular = typeof raw.regular === "string" && ISO.test(raw.regular) ? raw.regular : raw.farz;
  const prior = Number(raw.prior);
  const age = Number(raw.age);
  const adjust: Partial<Record<QazoPrayer, number>> = {};
  const rawAdjust = (raw.adjust ?? {}) as Record<string, unknown>;
  for (const p of [...QAZO_FIVE, "witr"] as QazoPrayer[]) {
    const v = Number(rawAdjust[p]);
    if (Number.isFinite(v) && v !== 0) adjust[p] = Math.round(v);
  }
  return {
    farz: raw.farz,
    regular: regular < raw.farz ? raw.farz : regular,
    witr: raw.witr !== false,
    prior: Number.isFinite(prior) && prior > 0 ? Math.round(prior) : 0,
    adjust,
    birth: typeof raw.birth === "string" && ISO.test(raw.birth) ? raw.birth : null,
    age: Number.isFinite(age) && age > 0 ? Math.round(age) : null,
  };
}

/** The settings, and a writer that leaves every other Salah pref alone. */
export function useQazoConfig(): [QazoConfig | null, (next: QazoConfig) => void] {
  const prefs = useStore((s) => s.profile?.prefs);
  const updateProfile = useStore((s) => s.updateProfile);
  const config = React.useMemo(() => readConfig(prefs), [prefs]);
  const set = React.useCallback(
    (next: QazoConfig) => {
      const root = (useStore.getState().profile?.prefs ?? {}) as Record<string, unknown>;
      const salah = (root.salah ?? {}) as Record<string, unknown>;
      updateProfile({ prefs: { ...root, salah: { ...salah, qazo: next } } });
    },
    [updateProfile],
  );
  return [config, set];
}

/** Birthday plus the age it became fard. 29 Feb lands on 28 Feb when needed. */
export function farzFromBirth(birth: string, age: number): string {
  return addMonths(birth, Math.round(age) * 12);
}

export function prayersOf(config: QazoConfig): QazoPrayer[] {
  return config.witr ? [...QAZO_FIVE, "witr"] : QAZO_FIVE;
}

/** Days owed: farz up to, not including, the first regular day. */
export function owedDays(config: Pick<QazoConfig, "farz" | "regular">): number {
  return Math.max(0, diffDays(config.regular, config.farz));
}

/** Reads one day's made-up counts, ignoring anything malformed. */
export function qazoOf(log: DayLog | undefined): QazoCounts {
  const raw = ((log?.data ?? {}) as Record<string, unknown>).qazo;
  if (!raw || typeof raw !== "object") return {};
  const out: QazoCounts = {};
  for (const p of [...QAZO_FIVE, "witr"] as QazoPrayer[]) {
    const n = Number((raw as Record<string, unknown>)[p]);
    if (Number.isFinite(n) && n > 0) out[p] = Math.round(n);
  }
  return out;
}

/** The day log's data with this day's counts swapped in; zeros are dropped. */
export function withQazo(log: DayLog | undefined, counts: QazoCounts): Record<string, unknown> {
  const next: Record<string, unknown> = { ...(log?.data ?? {}) };
  const clean: QazoCounts = {};
  for (const [p, n] of Object.entries(counts) as [QazoPrayer, number][]) if (n > 0) clean[p] = n;
  if (Object.keys(clean).length) next.qazo = clean;
  else delete next.qazo;
  return next;
}

const sumOf = (c: QazoCounts) => Object.values(c).reduce((a, n) => a + (n ?? 0), 0);

export interface QazoSummary {
  prayers: QazoPrayer[];
  owedDays: number;
  /** Per prayer: made up so far, prior days included, capped at what is owed. */
  done: Record<QazoPrayer, number>;
  owedTotal: number;
  doneTotal: number;
  remaining: number;
  /** Whole days fully made up (every prayer) — the walk through the debt. */
  wholeDays: number;
  /** The next owed day still to make up, or null once it is all paid. */
  nextDay: string | null;
  /** date -> prayers made up that day, every day that has any. */
  byDate: Map<string, number>;
  today: QazoCounts;
  last30: number;
  /** Prayers a day over the last 30 days, or since the first record if newer. */
  pace: number;
  /** When it is all paid at that pace. */
  eta: string | null;
  streak: number;
  bestDay: { date: string; count: number } | null;
}

export function summarize(config: QazoConfig, dayLogs: DayLog[], today: string): QazoSummary {
  const prayers = prayersOf(config);
  const days = owedDays(config);
  const raw = Object.fromEntries(
    prayers.map((p) => [p, config.prior + (config.adjust[p] ?? 0)]),
  ) as Record<QazoPrayer, number>;
  const byDate = new Map<string, number>();
  let todayCounts: QazoCounts = {};

  for (const log of dayLogs) {
    const c = qazoOf(log);
    const n = sumOf(c);
    if (!n) continue;
    byDate.set(log.date, n);
    if (log.date === today) todayCounts = c;
    for (const p of prayers) raw[p] += c[p] ?? 0;
  }

  const done = Object.fromEntries(prayers.map((p) => [p, Math.max(0, Math.min(days, raw[p]))])) as Record<QazoPrayer, number>;
  const owedTotal = days * prayers.length;
  const doneTotal = prayers.reduce((a, p) => a + done[p], 0);
  const remaining = owedTotal - doneTotal;
  const wholeDays = Math.min(...prayers.map((p) => done[p]));

  const dates = [...byDate.keys()].sort();
  const first = dates[0] ?? null;
  let last30 = 0;
  const from30 = addDays(today, -29);
  for (const [d, n] of byDate) if (d >= from30 && d <= today) last30 += n;
  const span = first ? Math.min(30, Math.max(1, diffDays(today, first) + 1)) : 30;
  const pace = last30 / span;
  const eta = remaining > 0 && pace > 0 ? addDays(today, Math.ceil(remaining / pace)) : null;

  // A run is still alive if today has nothing yet but yesterday did.
  let streak = 0;
  let cursor = byDate.has(today) ? today : addDays(today, -1);
  while (byDate.has(cursor)) { streak += 1; cursor = addDays(cursor, -1); }

  let bestDay: QazoSummary["bestDay"] = null;
  for (const [date, count] of byDate) if (!bestDay || count > bestDay.count) bestDay = { date, count };

  return {
    prayers, owedDays: days, done, owedTotal, doneTotal, remaining, wholeDays,
    nextDay: wholeDays < days ? addDays(config.farz, wholeDays) : null,
    byDate, today: todayCounts, last30, pace, eta, streak, bestDay,
  };
}

/** Rough years/months/days for a span of days, for the headline. */
export function spanLabel(days: number): string {
  if (days <= 0) return "nothing";
  const years = Math.floor(days / 365.2425);
  const months = Math.floor((days - years * 365.2425) / 30.44);
  const parts: string[] = [];
  if (years) parts.push(`${years} ${years === 1 ? "year" : "years"}`);
  if (months) parts.push(`${months} ${months === 1 ? "month" : "months"}`);
  if (!parts.length) parts.push(`${days} ${days === 1 ? "day" : "days"}`);
  return parts.join(" ");
}
