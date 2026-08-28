"use client";

import * as React from "react";
import { useStore } from "@/lib/store";
import { QURAN_TAG, isQuranReading, type PlanEntry } from "./quran";

/**
 * Writing a reading plan onto the calendar. Both the planner modal and the
 * catch-up button go through here so a scheduled reading always looks the
 * same wherever it came from.
 */
export function useQuranPlan() {
  const addTask = useStore((s) => s.addTask);
  const removeWhere = useStore((s) => s.removeWhere);

  /** Drop the readings that have not been done yet, from `from` onwards. */
  const clearFrom = React.useCallback(
    (from: string | null) => {
      removeWhere("tasks", (t) =>
        isQuranReading(t) && t.status !== "done" && !!t.date && (from === null || t.date >= from));
    },
    [removeWhere],
  );

  const schedule = React.useCallback(
    (entries: PlanEntry[]) => {
      entries.forEach((entry) => {
        addTask({
          title: `Quran — p.${entry.from}–${entry.to}`,
          kind: "reading",
          date: entry.date,
          tags: [QURAN_TAG],
          color: "emerald",
          page_from: entry.from,
          page_to: entry.to,
          duration_min: Math.max(10, Math.round((entry.to - entry.from + 1) * 1.5)),
        });
      });
    },
    [addTask],
  );

  return { clearFrom, schedule };
}
