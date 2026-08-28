"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { useStore, type CalendarView } from "@/lib/store";
import { formatDuration, formatTime, weekdayHeaders } from "@/lib/date";
import { Segmented } from "@/components/ui/primitives";
import { Pane, Row, TimeField } from "./ui";

const DEFAULT_WORK_START = 9 * 60;
const DEFAULT_WORK_END = 18 * 60;

/** Reads a minute count out of the loosely-typed prefs bag. */
function minutePref(prefs: Record<string, unknown> | undefined, key: string, fallback: number) {
  const raw = prefs?.[key];
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) && n >= 0 && n <= 1440 ? n : fallback;
}

function DayBar({ start, end, hour12 }: { start: number; end: number; hour12: boolean }) {
  const ticks = [0, 6, 12, 18, 24];
  return (
    <div className="w-[300px]">
      <div className="relative h-7 w-full overflow-hidden rounded-md bg-hover">
        {[3, 6, 9, 12, 15, 18, 21].map((h) => (
          <div key={h} className="absolute inset-y-0 w-px bg-line" style={{ left: `${(h / 24) * 100}%` }} />
        ))}
        <div
          className="absolute inset-y-0 rounded-md border border-accent-line bg-accent-soft transition-[left,width] duration-200 ease-[var(--ease-out-apple)]"
          style={{ left: `${(start / 1440) * 100}%`, width: `${((end - start) / 1440) * 100}%` }}
        />
      </div>
      <div className="mt-1.5 flex justify-between text-[10.5px] text-ink-4 tnum">
        {ticks.map((h) => (
          <span key={h}>{formatTime((h % 24) * 60, hour12)}</span>
        ))}
      </div>
    </div>
  );
}

export function CalendarSection() {
  const profile = useStore((s) => s.profile);
  const hour12 = useStore((s) => s.hour12);
  const calendarView = useStore((s) => s.calendarView);
  const setCalendarView = useStore((s) => s.setCalendarView);
  const updateProfile = useStore((s) => s.updateProfile);

  const weekStart = profile?.week_start ?? 1;
  const prefs = profile?.prefs;
  const workStart = minutePref(prefs, "work_start", DEFAULT_WORK_START);
  const workEnd = minutePref(prefs, "work_end", DEFAULT_WORK_END);

  function writePref(changes: Record<string, unknown>) {
    updateProfile({ prefs: { ...(prefs ?? {}), ...changes } });
  }

  function setStart(next: number) {
    // A window has to have a shape: keep at least an hour of daylight in it.
    const end = next >= workEnd ? Math.min(1440, next + 60) : workEnd;
    writePref({ work_start: next, work_end: end });
  }

  function setEnd(next: number) {
    const start = next <= workStart ? Math.max(0, next - 60) : workStart;
    writePref({ work_start: start, work_end: next });
  }

  return (
    <Pane
      title="Calendar"
      description="Where the week begins, what the calendar opens to, and the hours you actually work."
    >
      <Row
        label="Week starts on"
        hint="Every week grid, mini calendar and weekly review follows this."
        stacked
      >
        <div className="flex flex-wrap items-center gap-4">
          <Segmented
            value={String(weekStart)}
            onChange={(v) => updateProfile({ week_start: Number(v) })}
            options={[
              { value: "0", label: "Sunday" },
              { value: "1", label: "Monday" },
            ]}
          />
          <div className="flex items-center gap-1">
            {weekdayHeaders(weekStart, "short").map((d, i) => (
              <span
                key={`${d}-${i}`}
                className={cn(
                  "grid h-6 w-8 place-items-center rounded-md text-[11px] font-medium",
                  i === 0 ? "bg-accent-soft text-accent" : "text-ink-3",
                )}
              >
                {d}
              </span>
            ))}
          </div>
        </div>
      </Row>

      <Row label="Default view" hint="What the Calendar page shows when you land on it.">
        <Segmented
          value={calendarView}
          onChange={(v) => {
            setCalendarView(v as CalendarView);
            writePref({ default_view: v });
          }}
          options={[
            { value: "day", label: "Day" },
            { value: "week", label: "Week" },
            { value: "month", label: "Month" },
            { value: "agenda", label: "Agenda" },
          ]}
        />
      </Row>

      <Row
        label="Working hours"
        hint={`The stretch of the day the calendar treats as yours to spend — ${formatDuration(workEnd - workStart)} right now.`}
        stacked
      >
        <div className="flex flex-wrap items-end gap-6">
          <div className="flex items-center gap-2">
            {/* Keyed so each field re-seeds when the other one nudges it. */}
            <TimeField
              key={`start-${workStart}-${hour12}`}
              value={workStart} onChange={setStart} hour12={hour12} label="Working hours start"
            />
            <span className="text-[13px] text-ink-4">to</span>
            <TimeField
              key={`end-${workEnd}-${hour12}`}
              value={workEnd} onChange={setEnd} hour12={hour12} label="Working hours end"
            />
          </div>
          <DayBar start={workStart} end={workEnd} hour12={hour12} />
        </div>
      </Row>
    </Pane>
  );
}
