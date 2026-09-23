"use client";

import * as React from "react";
import { Segmented } from "@/components/ui/primitives";
import type { FocusSession } from "@/lib/types";
import { SessionHistory } from "./session-history";
import { FocusHeatmap } from "./focus-heatmap";
import { TimeOfDay } from "./time-of-day";
import { TagTotals } from "./tag-totals";
import { KindTotals } from "./kind-totals";
import type { DayGroup } from "./focus-data";

export type SessionsTab = "history" | "kinds" | "tags" | "hours" | "months";

export const SESSIONS_TABS: { value: SessionsTab; label: string; title: string }[] = [
  { value: "history", label: "History", title: "Every session, searchable" },
  { value: "kinds", label: "Kinds", title: "Where the hours went, across the kinds of living" },
  { value: "tags", label: "Tags", title: "Where the hours went by subject" },
  { value: "hours", label: "Time of day", title: "Which hours hold your focus" },
  { value: "months", label: "Six months", title: "One square per day" },
];

export const SESSIONS_TAB_VALUES = SESSIONS_TABS.map((t) => t.value);

/**
 * The record, in one place. History, tags, hours and the six-month grid used to
 * be four panels stacked down the page; they are four views of the same thing,
 * so they share one frame and you look at one at a time.
 */
export function SessionsPanel({
  groups, weekStart, dailyGoal, hour12, tab, onTab,
  pickedDay, onPickDay, onResume, onOpen, onTagLast,
}: {
  groups: DayGroup[];
  weekStart: number;
  dailyGoal: number;
  hour12: boolean;
  tab: SessionsTab;
  onTab: (next: SessionsTab) => void;
  pickedDay: string | null;
  onPickDay: (date: string | null) => void;
  onResume: (session: FocusSession) => void;
  onOpen: (sessionId: string) => void;
  onTagLast: (() => void) | null;
}) {
  const current = SESSIONS_TABS.find((t) => t.value === tab) ?? SESSIONS_TABS[0];

  return (
    <div>
      <div className="-mx-1 overflow-x-auto px-1 pb-1">
        <Segmented<SessionsTab> size="sm" value={tab} onChange={onTab} options={SESSIONS_TABS} />
      </div>

      <div role="tabpanel" aria-label={current.label} className="mt-5 min-w-0">
        {tab === "history" && (
          <SessionHistory
            groups={groups}
            onResume={onResume}
            onOpen={onOpen}
            focusDate={pickedDay}
          />
        )}

        {tab === "kinds" && <KindTotals groups={groups} onFixLast={onTagLast} />}

        {tab === "tags" && <TagTotals groups={groups} onTagLast={onTagLast} />}

        {tab === "hours" && <TimeOfDay groups={groups} hour12={hour12} />}

        {tab === "months" && (
          <FocusHeatmap
            groups={groups}
            weekStart={weekStart}
            dailyGoal={dailyGoal}
            selected={pickedDay}
            onSelect={onPickDay}
          />
        )}
      </div>
    </div>
  );
}
