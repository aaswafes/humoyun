"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { addDays, monthName, todayISO } from "@/lib/date";
import type { Habit, Tint } from "@/lib/types";
import { VisuallyHidden } from "@/components/ui/form";
import { Fold, useFold } from "./fold";
import {
  currentStreak, isComplete, perfectDaysThisMonth, scheduledOn, weekTotals,
  type Counts, type Skips, NO_COUNTS,
} from "./habit-utils";

/**
 * How it is going, folded.
 *
 * Today is the page; this is the month behind it, so it rests as one line and
 * opens into the four numbers and the fortnight underneath them.
 */
export function HabitsSummary({
  habits, index, skipsOf, weekStart, className,
}: {
  habits: Habit[];
  index: Map<string, Counts>;
  skipsOf: (habitId: string) => Skips;
  weekStart: number;
  className?: string;
}) {
  const today = todayISO();
  const { open, toggle } = useFold("humoyun.habits.summaryOpen");

  const month = React.useMemo(
    () => perfectDaysThisMonth(habits, index, weekStart, today, skipsOf),
    [habits, index, weekStart, today, skipsOf],
  );

  const week = React.useMemo(
    () => weekTotals(habits, index, today, weekStart, today, skipsOf),
    [habits, index, today, weekStart, skipsOf],
  );

  // Both of these walk every habit's whole history, so neither runs while the
  // section is closed.
  const longest = React.useMemo(() => {
    if (!open) return null;
    let best: { habit: Habit; streak: number } | null = null;
    for (const habit of habits) {
      const streak = currentStreak(habit, index.get(habit.id) ?? NO_COUNTS, skipsOf(habit.id), today, weekStart);
      if (!best || streak > best.streak) best = { habit, streak };
    }
    return best;
  }, [open, habits, index, skipsOf, today, weekStart]);

  const trail = React.useMemo(
    () => (open ? lastDays(habits, index, skipsOf, today, weekStart, 14) : []),
    [open, habits, index, skipsOf, today, weekStart],
  );

  return (
    <Fold
      label="Progress"
      summary={
        `${week.done} of ${week.expected} done this week · ` +
        `${month.perfect} perfect ${month.perfect === 1 ? "day" : "days"} in ${monthName(today)}`
      }
      open={open}
      onToggle={toggle}
      className={className}
    >
      <div className="grid grid-cols-2 gap-x-8 gap-y-5 sm:grid-cols-4">
        <Stat
          label="Active habits"
          value={habits.length}
          caption="Everything you're tracking"
        />
        <Stat
          label="This week"
          value={week.done}
          suffix={`/ ${week.expected}`}
          caption={week.expected ? `${Math.round((week.done / week.expected) * 100)}% of what's due so far` : "Nothing due yet"}
        />
        <Stat
          label="Perfect days"
          value={month.perfect}
          caption={`of ${month.tracked} tracked in ${monthName(today)}`}
        />
        <Stat
          label="Longest streak"
          value={longest?.streak ?? 0}
          suffix={longest?.streak === 1 ? "day" : "days"}
          caption={longest && longest.streak > 0 ? longest.habit.name : "Log a habit to start one"}
          tint={longest && longest.streak > 0 ? longest.habit.color : undefined}
        />
      </div>

      <div className="mt-6 flex items-center gap-2.5">
        <span className="shrink-0 text-[11px] text-ink-4">Last 14 days</span>
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
                style={{ height: 16 }}
              >
                <span
                  className="block w-full rounded-[2px] bg-ink-3 transition-[height] duration-500 ease-[var(--ease-out-apple)]"
                  style={{
                    height: day.scheduled ? Math.max(3, ratio * 16) : 2,
                    opacity: day.scheduled ? 0.3 + 0.7 * ratio : 0.2,
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
    </Fold>
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
  label, value, suffix, caption, tint,
}: {
  label: string;
  value: number;
  suffix?: string;
  caption: string;
  tint?: Tint;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[11.5px] text-ink-3">{label}</p>
      <p className="mt-1 flex items-baseline gap-1.5">
        <span className={cn("display-serif text-[22px] leading-none tnum", tint && `tint-${tint} text-[var(--tint)]`)}>
          {value}
        </span>
        {suffix && <span className="text-[12px] text-ink-4 tnum">{suffix}</span>}
      </p>
      <p className="mt-1 truncate text-[12px] text-ink-4">{caption}</p>
    </div>
  );
}
