"use client";

import * as React from "react";
import { Check, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/cn";
import { dayName, formatDuration, isToday } from "@/lib/date";
import { Button, Progress, Ring, SectionLabel } from "@/components/ui/primitives";
import { VisuallyHidden } from "@/components/ui/form";
import { goalProgress, type DayGroup } from "./focus-data";

/**
 * The two numbers that decide whether the week went the way you wanted: today
 * against the daily target, and the week against the weekly one.
 */
export const FocusGoals = React.memo(function FocusGoals({
  groups, weekStart, dailyGoal, weeklyGoal, onEdit,
}: {
  groups: DayGroup[];
  weekStart: number;
  dailyGoal: number;
  weeklyGoal: number;
  onEdit: () => void;
}) {
  const summaryId = React.useId();
  const g = React.useMemo(
    () => goalProgress(groups, weekStart, dailyGoal, weeklyGoal),
    [groups, weekStart, dailyGoal, weeklyGoal],
  );

  const peak = Math.max(dailyGoal * 1.2, ...g.days.map((d) => d.minutes), 1);
  const dailyDone = g.todayMinutes >= dailyGoal;

  return (
    <section aria-labelledby={`${summaryId}-label`}>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <SectionLabel className="shrink-0">
          <span id={`${summaryId}-label`}>Targets</span>
        </SectionLabel>
        <Button variant="ghost" size="xs" onClick={onEdit}>
          <SlidersHorizontal className="size-3" />
          Adjust
        </Button>
      </div>

      <div className="grid gap-6 rounded-lg border border-line p-4 sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-8">
        {/* today */}
        <div className="flex items-center gap-3.5">
          <Ring value={g.dailyPct} max={1} size={68} stroke={5}>
            {dailyDone ? (
              <Check className="size-5 text-success" aria-hidden />
            ) : (
              <span className="text-[12.5px] font-medium text-ink-2 tnum">
                {Math.round(g.dailyPct * 100)}%
              </span>
            )}
          </Ring>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">Today</p>
            <p className="display-serif tnum mt-1 text-[22px] leading-none text-ink">
              {formatDuration(g.todayMinutes)}
            </p>
            <p className="mt-1.5 text-[11.5px] text-ink-4 tnum">
              {dailyDone
                ? `Target of ${formatDuration(dailyGoal)} met`
                : `${formatDuration(Math.max(0, dailyGoal - g.todayMinutes))} to go`}
            </p>
          </div>
        </div>

        {/* this week */}
        <div className="min-w-0">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">This week</p>
            <p className="text-[11.5px] text-ink-3 tnum">
              <span className="text-ink-2">{formatDuration(g.weekMinutes)}</span> of {formatDuration(weeklyGoal)}
            </p>
          </div>

          <div className="mt-2.5 flex h-[54px] items-end gap-1.5" aria-describedby={summaryId}>
            {g.days.map((day) => {
              const pct = Math.min(100, (day.minutes / peak) * 100);
              return (
                <div key={day.date} className="group/day flex min-w-0 flex-1 flex-col items-center gap-1">
                  <div className="relative flex h-10 w-full items-end justify-center">
                    {/* the target, drawn once across the whole week */}
                    <span
                      aria-hidden
                      className="absolute inset-x-0 border-t border-dashed border-line-strong"
                      style={{ bottom: `${Math.min(100, (dailyGoal / peak) * 100)}%` }}
                    />
                    <span
                      title={`${formatDuration(day.minutes)} on ${dayName(day.date, "long")}`}
                      className={cn(
                        "relative w-full max-w-[22px] rounded-xs transition-[height] duration-500 ease-[var(--ease-out-apple)]",
                        day.hit ? "bg-accent" : day.minutes ? "bg-accent-line" : "bg-hover",
                        day.future && "opacity-40",
                      )}
                      style={{ height: `max(3px, ${pct}%)` }}
                    />
                  </div>
                  <span
                    className={cn(
                      "text-[10.5px] tnum",
                      isToday(day.date) ? "font-semibold text-ink-2" : "text-ink-4",
                    )}
                  >
                    {dayName(day.date, "min")}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="mt-3">
            <Progress value={g.weeklyPct} max={1} height={4} />
            <p className="mt-1.5 text-[11.5px] text-ink-4 tnum">
              {g.daysHit} {g.daysHit === 1 ? "day" : "days"} at target
              {g.pacePerDay != null
                ? ` · ${formatDuration(g.pacePerDay)} a day to land it`
                : " · weekly target met"}
            </p>
          </div>

          <VisuallyHidden id={summaryId}>
            {`This week: ${formatDuration(g.weekMinutes)} of a ${formatDuration(weeklyGoal)} target, ` +
              g.days
                .map((d) => `${dayName(d.date, "long")} ${formatDuration(d.minutes)}`)
                .join(", ")}
          </VisuallyHidden>
        </div>
      </div>
    </section>
  );
});
