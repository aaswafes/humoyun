"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { habitStreak } from "@/lib/store";
import { monthName, todayISO } from "@/lib/date";
import type { Habit, HabitLog, Tint } from "@/lib/types";
import { perfectDaysThisMonth, type Counts } from "./habit-utils";

/**
 * Three numbers that answer "how is this going" before you read a single row.
 */
export function HabitsSummary({
  habits, archivedCount, logs, index, weekStart, className,
}: {
  habits: Habit[];
  archivedCount: number;
  logs: HabitLog[];
  index: Map<string, Counts>;
  weekStart: number;
  className?: string;
}) {
  const today = todayISO();

  const month = React.useMemo(
    () => perfectDaysThisMonth(habits, index, weekStart, today),
    [habits, index, weekStart, today],
  );

  const longest = React.useMemo(() => {
    let best: { habit: Habit; streak: number } | null = null;
    for (const habit of habits) {
      const streak = habitStreak(logs, habit.id, today);
      if (!best || streak > best.streak) best = { habit, streak };
    }
    return best;
  }, [habits, logs, today]);

  const divider = "border-t border-line sm:border-t-0 sm:border-l";

  return (
    <div className={cn("surface grid grid-cols-1 sm:grid-cols-3", className)}>
      <Stat
        label="Active habits"
        value={habits.length}
        caption={archivedCount ? `${archivedCount} archived` : "Everything you're tracking"}
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
  );
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
        {suffix && <span className="text-[12.5px] text-ink-3">{suffix}</span>}
      </p>
      <p className="mt-1.5 truncate text-[12.5px] text-ink-3">{caption}</p>
    </div>
  );
}
