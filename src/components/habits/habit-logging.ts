"use client";

// =========================================================
// Writing to habit_logs.
//
// The store's `logHabit` upserts a count but has no way to say "none", and
// nothing in the store writes a log's note. Both are needed here — partial
// completion has to be able to come back down to zero, and a log without its
// note is half the story — so the three writes live together in one hook.
// =========================================================

import * as React from "react";
import { useStore } from "@/lib/store";
import type { HabitLog } from "@/lib/types";

export interface HabitLogging {
  logAt: (habitId: string, date: string) => HabitLog | undefined;
  setCount: (habitId: string, date: string, next: number) => void;
  setNote: (habitId: string, date: string, note: string | null) => void;
}

export function useHabitLogging(): HabitLogging {
  const logHabit = useStore((s) => s.logHabit);
  const patch = useStore((s) => s.patch);
  const remove = useStore((s) => s.remove);
  const insert = useStore((s) => s.insert);

  // Read through getState so a control never acts on a stale row it captured.
  const logAt = React.useCallback(
    (habitId: string, date: string) =>
      useStore.getState().habitLogs.find((l) => l.habit_id === habitId && l.date === date),
    [],
  );

  const setCount = React.useCallback(
    (habitId: string, date: string, next: number) => {
      const log = logAt(habitId, date);
      if (next <= 0) {
        // No row at all, rather than a zero — a zero would still read as
        // "logged" to the weekly quota in @/lib/habits.
        if (log) remove("habitLogs", log.id);
        return;
      }
      logHabit(habitId, date, next);
    },
    [logAt, logHabit, remove],
  );

  const setNote = React.useCallback(
    (habitId: string, date: string, note: string | null) => {
      const value = note?.trim() ? note.trim() : null;
      const log = logAt(habitId, date);
      if (log) { patch("habitLogs", log.id, { note: value }); return; }
      // Writing a note about a day is a way of logging it.
      if (value) insert("habitLogs", { habit_id: habitId, date, count: 1, note: value });
    },
    [logAt, patch, insert],
  );

  return React.useMemo(() => ({ logAt, setCount, setNote }), [logAt, setCount, setNote]);
}
