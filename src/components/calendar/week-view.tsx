"use client";

import * as React from "react";
import { dayNameOf, formatDuration, todayISO, weekDates, weekday } from "@/lib/date";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import { VisuallyHidden } from "@/components/ui/form";
import { TimeGrid } from "./time-grid";
import { bucketByDate, weekSummary, workHoursOf, type DropPreview } from "./calendar-utils";

/**
 * A week is easier to steer when its shape is visible above the grid: how much
 * is booked, how much of the working week is still free, and which day is
 * carrying the most. Each bar selects its day, so it doubles as navigation.
 */
function WeekBar({ dates }: { dates: string[] }) {
  const tasks = useStore((s) => s.tasks);
  const profile = useStore((s) => s.profile);
  const selectedDate = useStore((s) => s.selectedDate);
  const setSelectedDate = useStore((s) => s.setSelectedDate);
  const today = todayISO();

  const summary = React.useMemo(
    () => weekSummary(bucketByDate(tasks), dates[0]),
    [tasks, dates],
  );
  const work = React.useMemo(() => workHoursOf(profile), [profile]);

  const workingDays = dates.filter((d) => weekday(d) !== 0 && weekday(d) !== 6).length;
  const capacity = ((work.end - work.start) / 60) * workingDays;
  const scheduledH = summary.minutes / 60;
  const free = Math.max(0, capacity - scheduledH);
  const peak = Math.max(1, ...summary.perDay.map((d) => d.total));

  const description =
    `Week ${summary.week}: ${summary.done} of ${summary.total} done, ` +
    `${formatDuration(summary.minutes)} scheduled, about ${formatDuration(free * 60)} free ` +
    `inside working hours.`;

  return (
    <div className="flex items-center gap-3 px-1 pb-2" aria-describedby="week-bar-summary">
      <VisuallyHidden id="week-bar-summary">{description}</VisuallyHidden>

      <div className="flex items-end gap-[3px]" role="group" aria-label="Load per day">
        {summary.perDay.map((d) => {
          const isToday = d.date === today;
          const height = 4 + Math.round((d.total / peak) * 14);
          return (
            <button
              key={d.date}
              type="button"
              onClick={() => setSelectedDate(d.date)}
              aria-current={d.date === selectedDate ? "date" : undefined}
              title={`${dayNameOf(weekday(d.date), "long")} — ${d.done}/${d.total} done`}
              aria-label={`${dayNameOf(weekday(d.date), "long")}, ${d.total} ${d.total === 1 ? "item" : "items"}, ${d.done} done`}
              className={cn(
                "group/bar flex h-7 w-5 cursor-pointer flex-col justify-end rounded-[4px] p-[2px]",
                "transition-colors duration-150 hover:bg-hover",
                d.date === selectedDate && "bg-selected",
              )}
            >
              <span
                className={cn(
                  "w-full rounded-[2px] transition-[height] duration-200 ease-[var(--ease-out-apple)]",
                  d.total === 0 ? "bg-line" : isToday ? "bg-accent" : "bg-ink-4",
                )}
                style={{ height }}
              />
            </button>
          );
        })}
      </div>

      <p className="text-[12px] text-ink-3 tnum">
        <span className="font-medium text-ink-2">{formatDuration(summary.minutes)}</span> scheduled
        <span className="mx-1.5 text-ink-4">·</span>
        <span className="font-medium text-ink-2">{formatDuration(free * 60)}</span> free
        {summary.total > 0 && (
          <>
            <span className="mx-1.5 text-ink-4">·</span>
            {summary.done}/{summary.total} done
          </>
        )}
        {summary.busiest && summary.busiest.total > 0 && (
          <>
            <span className="mx-1.5 text-ink-4">·</span>
            busiest {dayNameOf(weekday(summary.busiest.date), "short")}
          </>
        )}
      </p>
    </div>
  );
}

export function WeekView({
  anchor, weekStart, hour12, preview,
}: {
  anchor: string;
  weekStart: number;
  hour12: boolean;
  preview: DropPreview | null;
}) {
  const dates = React.useMemo(() => weekDates(anchor, weekStart), [anchor, weekStart]);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <WeekBar dates={dates} />
      <TimeGrid dates={dates} hour12={hour12} allDay="row" preview={preview} />
    </div>
  );
}
