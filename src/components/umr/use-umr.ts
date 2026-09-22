"use client";

import * as React from "react";
import { useStore } from "@/lib/store";
import { startOfWeek, todayISO } from "@/lib/date";
import {
  buildLedger, buildUmrIndex, damBalance, parseUmrPrefs, totalsOf, writeUmrPrefs,
  type DamBalance, type UmrEntry, type UmrIndex, type UmrPrefs,
} from "@/lib/umr";

// =========================================================
// One hook, two pages.
//
// The Umr page and its stats page must never disagree about a minute, so
// neither builds a ledger of its own — both call this, and this calls
// `@/lib/umr` and nothing else.
// =========================================================

export interface UmrLedger {
  entries: UmrEntry[];
  index: UmrIndex;
  prefs: UmrPrefs;
  /** the oldest day anything was recorded, or null on an empty ledger */
  earliest: string | null;
  ready: boolean;
}

/** The ledger across a given set of days. */
export function useUmrLedger(days: string[]): UmrLedger {
  const ready = useStore((s) => s.ready);
  const tasks = useStore((s) => s.tasks);
  const sessions = useStore((s) => s.focusSessions);
  const prayers = useStore((s) => s.prayers);
  const habits = useStore((s) => s.habits);
  const habitLogs = useStore((s) => s.habitLogs);
  const umrLogs = useStore((s) => s.umrLogs);
  const dayLogs = useStore((s) => s.dayLogs);
  const books = useStore((s) => s.books);
  const media = useStore((s) => s.media);
  const rawPrefs = useStore((s) => s.profile?.prefs);

  const prefs = React.useMemo(() => parseUmrPrefs(rawPrefs), [rawPrefs]);

  const index = React.useMemo(
    () => buildUmrIndex(prefs, books, media, habits, tasks),
    [prefs, books, media, habits, tasks],
  );

  const sleepHoursByDate = React.useMemo(() => {
    const map = new Map<string, number>();
    for (const d of dayLogs) if (d.sleep_hours != null) map.set(d.date, d.sleep_hours);
    return map;
  }, [dayLogs]);

  const entries = React.useMemo(
    () => buildLedger({
      days, tasks, sessions, prayers, habits, habitLogs, umrLogs, sleepHoursByDate, index,
    }),
    [days, tasks, sessions, prayers, habits, habitLogs, umrLogs, sleepHoursByDate, index],
  );

  // The first day anything was recorded, which is what "All" has to span.
  const earliest = React.useMemo(() => {
    let best: string | null = null;
    const take = (d: string | null | undefined) => {
      if (d && (!best || d < best)) best = d;
    };
    for (const l of umrLogs) take(l.date);
    for (const p of prayers) take(p.date);
    for (const l of habitLogs) take(l.date);
    for (const s of sessions) take(s.started_at.slice(0, 10));
    for (const t of tasks) if (t.actual_min > 0) take(t.date);
    return best;
  }, [umrLogs, prayers, habitLogs, sessions, tasks]);

  return { entries, index, prefs, earliest, ready };
}

/**
 * The Dam balance right now, over whichever window the settings name.
 *
 * This is the one the meters read — Today, the Umr page, the warning before a
 * Dam timer starts. It deliberately does not take a range: "how much amusement
 * have I earned" is always a question about now.
 */
export function useDamBalance(): { balance: DamBalance; days: string[]; prefs: UmrPrefs } {
  const weekStart = useStore((s) => s.profile?.week_start ?? 1);
  const rawPrefs = useStore((s) => s.profile?.prefs);
  const prefs = React.useMemo(() => parseUmrPrefs(rawPrefs), [rawPrefs]);

  const days = React.useMemo(() => {
    const today = todayISO();
    if (prefs.damWindow === "day") return [today];
    const from = startOfWeek(today, weekStart);
    const out: string[] = [];
    for (let d = from; d <= today; d = nextDay(d)) out.push(d);
    return out;
  }, [prefs.damWindow, weekStart]);

  const { entries } = useUmrLedger(days);
  const { totals } = React.useMemo(() => totalsOf(entries), [entries]);

  return {
    balance: damBalance(totals.talim, totals.dam, prefs),
    days,
    prefs,
  };
}

function nextDay(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Writing a setting back, without the caller having to know the prefs shape. */
export function useSetUmrPrefs(): (changes: Partial<UmrPrefs>) => void {
  const updateProfile = useStore((s) => s.updateProfile);
  const rawPrefs = useStore((s) => s.profile?.prefs);
  return React.useCallback(
    (changes) => { updateProfile({ prefs: writeUmrPrefs(rawPrefs, changes) }); },
    [updateProfile, rawPrefs],
  );
}
