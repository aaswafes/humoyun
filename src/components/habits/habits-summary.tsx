"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { addDays, monthName, todayISO } from "@/lib/date";
import type { Habit, Tint } from "@/lib/types";
import { VisuallyHidden } from "@/components/ui/form";
import {
  currentStreak, isComplete, perfectDaysThisMonth, scheduledOn, weekTotals,
  type Counts, type Skips, NO_COUNTS,
} from "./habit-utils";

/**
 * Four numbers that answer "how is this going" before you read a single row,
 * plus the fortnight underneath them so the trend is visible, not inferred.
 */
export function HabitsSummary({
  habits, archivedCount, index, skipsOf, weekStart, className,
}: {
  habits: Habit[];
  archivedCount: number;
  index: Map<string, Counts>;
  skipsOf: (habitId: string) => Skips;
  weekStart: number;
  className?: string;
}) {
  const today = todayISO();

  const month = React.useMemo(
    () => perfectDaysThisMonth(habits, index, weekStart, today, skipsOf),
    [habits, index, weekStart, today, skipsOf],
  );

  const week = React.useMemo(
    () => weekTotals(habits, index, today, weekStart, today, skipsOf),
    [habits, index, today, weekStart, skipsOf],
  );

  const longest = React.useMemo(() => {
    let best: { habit: Habit; streak: number } | null = null;
    for (const habit of habits) {
      const streak = currentStreak(habit, index.get(habit.id) ?? NO_COUNTS, skipsOf(habit.id), today, weekStart);
      if (!best || streak > best.streak) best = { habit, streak };
    }
    return best;
  }, [habits, index, skipsOf, today, weekStart]);

  const trail = React.useMemo(
    () => lastDays(habits, index, skipsOf, today, weekStart, 14),
    [habits, index, skipsOf, today, weekStart],
  );

  const divider = "border-t border-line sm:border-t-0 sm:border-l";

  return (
    <div className={cn("surface", className)}>
      <div className="grid grid-cols-1 sm:grid-cols-4">
        <Stat
          label="Active habits"
          value={habits.length}
          caption={archivedCount ? `${archivedCount} archived` : "Everything you're tracking"}
        />
        <Stat
          label="This week"
          value={week.done}
          suffix={`/ ${week.expected}`}
          caption={week.expected ? `${Math.round((week.done / week.expected) * 100)}% of what's due so far` : "Nothing due yet"}
          className={divider}
        />
        <Stat
          label="Perfect days"
          value={month.perfect}
          caption={`of ${month.tracked} tracked in ${monthName(today)}`}
          className={divider}
        />
        <Stat
          label="Longest streak"
          value={longest?.streak ?? 0}
          suffix={longest?.streak === 1 ? "day" : "days"}
          caption={longest && longest.streak > 0 ? longest.habit.name : "Log a habit to start one"}
          tint={longest && longest.streak > 0 ? longest.habit.color : undefined}
          className={divider}
        />
      </div>

      <div className="flex items-center gap-2 border-t border-line px-5 py-2.5">
        <span className="text-[11px] font-medium text-ink-4">Last 14 days</span>
        <div
          role="img"
          aria-describedby="habits-trail-summary"
          className="flex flex-1 items-end gap-[3px]"
        >
          {trail.map((day) => {
            const ratio = day.scheduled ? day.done / day.scheduled : 0;
            return (
              <span
                key={day.date}
                title={`${day.date} · ${day.done} of ${day.scheduled} done`}
                className="flex min-w-0 flex-1 items-end rounded-[2px] bg-hover"
                style={{ height: 18 }}
              >
                <span
                  className="block w-full rounded-[2px] bg-accent transition-[height] duration-500 ease-[var(--ease-out-apple)]"
                  style={{
                    height: day.scheduled ? Math.max(3, ratio * 18) : 2,
                    opacity: day.scheduled ? 0.35 + 0.65 * ratio : 0.25,
                  }}
                />
              </span>
            );
          })}
        </div>
        <VisuallyHidden id="habits-trail-summary">
          {trail.map((d) => `${d.date}: ${d.done} of ${d.scheduled} done`).join(". ")}
        </VisuallyHidden>
      </div>
    </div>
  );
}

/** Scheduled-vs-done for each of the last `n` days, oldest first. */
function lastDays(
  habits: Habit[],
  index: Map<string, Counts>,
  skipsOf: (habitId: string) => Skips,
  today: string,
  weekStart: number,
  n: number,
) {
  const out: { date: string; done: number; scheduled: number }[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const date = addDays(today, -i);
    const due = scheduledOn(habits, index, date, weekStart).filter((h) => !skipsOf(h.id).has(date));
    const done = due.filter((h) => isComplete(h, (index.get(h.id) ?? NO_COUNTS).get(date))).length;
    out.push({ date, done, scheduled: due.length });
  }
  return out;
}

function Stat({
  label, value, suffix, caption, tint, className,
}: {
  label: string;
  value: number;
  suffix?: string;
  caption: string;
  tint?: Tint;
  className?: string;
}) {
  return (
    <div className={cn("px-5 py-4", className)}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">{label}</p>
      <p className="mt-1.5 flex items-baseline gap-1.5">
        <span className={cn("display-serif text-[32px] leading-none tnum", tint && `tint-${tint} text-[var(--tint)]`)}>
          {value}
        </span>
        {suffix && <span className="text-[12.5px] text-ink-3 tnum">{suffix}</span>}
      </p>
      <p className="mt-1.5 truncate text-[12.5px] text-ink-3">{caption}</p>
    </div>
  );
}
