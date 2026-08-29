"use client";

import * as React from "react";
import { Flame } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import { dayName, weekDates } from "@/lib/date";
import {
  buildLogIndex, habitScheduledOn, habitStreakOn, isHabitComplete, weeklyTarget, NO_COUNTS,
  type HabitCounts,
} from "@/lib/habits";
import type { Habit } from "@/lib/types";
import { Checkbox, Progress } from "@/components/ui/primitives";
import { RailCard, RailEmpty, RailItem, RailLink, RailMeta } from "./rail-card";

type DotState = "done" | "partial" | "due" | "ahead" | "off";

function weekOf(habit: Habit, counts: HabitCounts, week: string[], today: string, weekStart: number) {
  return week.map((iso) => {
    const count = counts.get(iso) ?? 0;
    const scheduled = habitScheduledOn(habit, iso, counts, weekStart);
    const state: DotState = isHabitComplete(habit, count)
      ? "done"
      : count > 0
        ? "partial"
        : !scheduled
          ? "off"
          : iso > today
            ? "ahead"
            : "due";
    return { iso, state, today: iso === today };
  });
}

// Shape carries the state as much as colour does: filled, half, ring, hairline.
const DOT_CLASS: Record<DotState, string> = {
  done: "size-[7px] rounded-full",
  partial: "size-[7px] rounded-full border-[1.5px]",
  due: "size-[7px] rounded-full border border-line-strong",
  ahead: "size-[7px] rounded-full bg-hover",
  off: "size-[3px] rounded-full bg-line-strong",
};

export function HabitsCard({ date }: { date: string }) {
  const habits = useStore((s) => s.habits);
  const habitLogs = useStore((s) => s.habitLogs);
  const toggleHabit = useStore((s) => s.toggleHabit);
  const weekStart = useStore((s) => s.profile?.week_start ?? 1);

  const logIndex = React.useMemo(() => buildLogIndex(habitLogs), [habitLogs]);
  const week = React.useMemo(() => weekDates(date, weekStart), [date, weekStart]);

  const live = habits.filter((h) => !h.archived);
  const due = live
    .filter((h) => habitScheduledOn(h, date, logIndex.get(h.id) ?? NO_COUNTS, weekStart))
    .sort((a, b) => a.order_index - b.order_index);

  const countOf = (habitId: string) => logIndex.get(habitId)?.get(date) ?? 0;
  const completed = due.filter((h) => isHabitComplete(h, countOf(h.id))).length;

  // The week behind the day: how many scheduled days have actually landed.
  const weekTotals = live.reduce(
    (acc, habit) => {
      const counts = logIndex.get(habit.id) ?? NO_COUNTS;
      acc.target += weeklyTarget(habit);
      acc.hit += week.filter((iso) => isHabitComplete(habit, counts.get(iso))).length;
      return acc;
    },
    { hit: 0, target: 0 },
  );

  const summary = due.length
    ? `${completed}/${due.length} done${weekTotals.target ? ` · ${weekTotals.hit}/${weekTotals.target} this week` : ""}`
    : habits.length
      ? `none due on ${dayName(date)}`
      : "no habits yet";

  return (
    <RailCard
      icon={Flame}
      title="Habits"
      foldKey="rail.habits"
      summary={summary}
      href="/habits"
      hrefLabel="Open Habits"
      accessory={
        due.length > 0 ? (
          <span className="text-[11.5px] font-medium text-ink-3 tnum">
            {completed}/{due.length}
          </span>
        ) : undefined
      }
      footer={
        live.length > 0 ? (
          <div>
            <RailMeta value={`${weekTotals.hit}/${weekTotals.target}`}>This week</RailMeta>
            <Progress value={weekTotals.hit} max={weekTotals.target || 1} tint="slate" height={3} className="mt-1.5" />
          </div>
        ) : undefined
      }
    >
      {due.length === 0 ? (
        <RailEmpty action={<RailLink href="/habits">{habits.length ? "Open habits" : "Create a habit"}</RailLink>}>
          {habits.length
            ? `None of your habits fall on ${dayName(date)}.`
            : "Habits you keep here appear every morning they are due, with the streak you have going."}
        </RailEmpty>
      ) : (
        due.map((habit) => {
          const counts = logIndex.get(habit.id) ?? NO_COUNTS;
          const count = countOf(habit.id);
          const complete = isHabitComplete(habit, count);
          const streak = habitStreakOn(habit, counts, date, weekStart);
          const dots = weekOf(habit, counts, week, date, weekStart);
          const hitThisWeek = dots.filter((d) => d.state === "done").length;
          const target = weeklyTarget(habit);

          return (
            <RailItem key={habit.id} className={`tint-${habit.color} items-start`}>
              <span className="mt-[3px]">
                <Checkbox
                  checked={complete}
                  indeterminate={!complete && count > 0}
                  tint={habit.color}
                  onChange={() => toggleHabit(habit.id, date)}
                  label={
                    `${habit.name} — ${count} of ${habit.target_count} today, ` +
                    `${hitThisWeek} of ${target} this week` +
                    (streak > 0 ? `, ${streak} day streak` : "") +
                    ". Log one."
                  }
                />
              </span>

              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-1.5">
                  <span className={cn("min-w-0 flex-1 truncate text-[13px]", complete ? "text-ink-3" : "text-ink")}>
                    {habit.name}
                  </span>
                  {habit.target_count > 1 && (
                    <span className="shrink-0 text-[11.5px] text-ink-3 tnum">
                      {count}/{habit.target_count}
                    </span>
                  )}
                  {streak > 0 && (
                    <span className="inline-flex shrink-0 items-center gap-0.5 text-[11.5px] text-ink-3 tnum">
                      <Flame className="size-3 text-ink-4" />
                      {streak}
                    </span>
                  )}
                </span>

                <span className="mt-1 flex items-center gap-1">
                  <span aria-hidden className="flex items-center gap-1">
                    {dots.map((dot) => (
                      <span
                        key={dot.iso}
                        title={dot.iso}
                        className={cn(
                          "block shrink-0",
                          DOT_CLASS[dot.state],
                          dot.today && dot.state !== "done" && "ring-1 ring-offset-1 ring-[var(--tint)] ring-offset-[var(--raised)]",
                        )}
                        style={
                          dot.state === "done"
                            ? { background: "var(--tint)" }
                            : dot.state === "partial"
                              ? { borderColor: "var(--tint)", background: "var(--tint-soft)" }
                              : undefined
                        }
                      />
                    ))}
                  </span>
                  <span className="ml-auto shrink-0 text-[11px] text-ink-4 tnum">
                    {hitThisWeek}/{target}
                  </span>
                </span>
              </span>
            </RailItem>
          );
        })
      )}
    </RailCard>
  );
}
