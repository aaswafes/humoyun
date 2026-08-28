"use client";

import * as React from "react";
import { Check, Flame } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore, habitStreak } from "@/lib/store";
import { dayName } from "@/lib/date";
import { buildLogIndex, habitScheduledOn, NO_COUNTS } from "@/lib/habits";
import { RailCard, RailEmpty, RailLink, RailRow } from "./rail-card";

export function HabitsCard({ date }: { date: string }) {
  const habits = useStore((s) => s.habits);
  const habitLogs = useStore((s) => s.habitLogs);
  const toggleHabit = useStore((s) => s.toggleHabit);

  const weekStart = useStore((s) => s.profile?.week_start ?? 1);
  const logIndex = React.useMemo(() => buildLogIndex(habitLogs), [habitLogs]);
  const due = habits
    .filter((h) => habitScheduledOn(h, date, logIndex.get(h.id) ?? NO_COUNTS, weekStart))
    .sort((a, b) => a.order_index - b.order_index);

  const countOf = (habitId: string) =>
    habitLogs.find((l) => l.habit_id === habitId && l.date === date)?.count ?? 0;
  const completed = due.filter((h) => countOf(h.id) >= h.target_count).length;

  return (
    <RailCard
      icon={Flame}
      title="Habits"
      href="/habits"
      hrefLabel="Open Habits"
      accessory={
        due.length > 0 ? (
          <span className="text-[11.5px] font-medium text-ink-2 tnum">
            {completed}/{due.length}
          </span>
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
          const count = countOf(habit.id);
          const complete = count >= habit.target_count;
          const partial = count > 0 && !complete;
          const streak = habitStreak(habitLogs, habit.id, date);

          return (
            <RailRow
              key={habit.id}
              onClick={() => toggleHabit(habit.id, date)}
              ariaLabel={`${habit.name} — ${count} of ${habit.target_count} logged. Log one.`}
              ariaPressed={complete}
              className={`tint-${habit.color}`}
            >
              <span
                aria-hidden
                className={cn(
                  "grid size-[17px] shrink-0 place-items-center rounded-[5px] border",
                  "transition-[background-color,border-color] duration-150 ease-[var(--ease-out-apple)]",
                  complete ? "border-transparent text-canvas" : partial ? "border-[var(--tint)]" : "border-line-strong",
                )}
                style={complete ? { background: "var(--tint)" } : undefined}
              >
                {complete && <Check className="size-3 stroke-[3.5]" />}
                {partial && <span className="size-[7px] rounded-[2px]" style={{ background: "var(--tint)" }} />}
              </span>

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
                  <Flame className="size-3 text-warn" />
                  {streak}
                </span>
              )}
            </RailRow>
          );
        })
      )}
    </RailCard>
  );
}
