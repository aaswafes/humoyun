"use client";

import * as React from "react";
import { Check, Plus } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import { formatDate } from "@/lib/date";
import type { Habit } from "@/lib/types";
import { SectionLabel } from "@/components/ui/primitives";
import { HabitIcon } from "./habit-icons";
import { isComplete, scheduledOn, type Counts, NO_COUNTS } from "./habit-utils";

/**
 * Everything due today as one tappable row of pills. Tapping cycles the count
 * up and, once the target is met, back to nothing — the same gesture undoes.
 */
export function TodayStrip({
  habits, index, date, weekStart, onCreate,
}: {
  habits: Habit[];
  index: Map<string, Counts>;
  date: string;
  weekStart: number;
  onCreate: () => void;
}) {
  const toggleHabit = useStore((s) => s.toggleHabit);
  const due = scheduledOn(habits, index, date, weekStart);
  const done = due.filter((h) => isComplete(h, (index.get(h.id) ?? NO_COUNTS).get(date))).length;

  return (
    <section className="mb-8">
      <div className="mb-2.5 flex items-baseline gap-2">
        <SectionLabel>Due today</SectionLabel>
        <span className="text-[11.5px] text-ink-4">{formatDate(date)}</span>
        <div className="flex-1" />
        {due.length > 0 && (
          <span className="text-[12px] text-ink-3 tnum">
            {done}<span className="text-ink-4"> / {due.length}</span>
          </span>
        )}
      </div>

      {due.length === 0 ? (
        <button
          onClick={onCreate}
          className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] text-ink-3 hover:bg-hover hover:text-ink-2 cursor-pointer transition-colors"
        >
          <Plus className="size-4" />
          {habits.length
            ? "Nothing is scheduled today — add a habit that runs daily."
            : "Add your first habit."}
        </button>
      ) : (
        <div className="flex flex-wrap gap-2">
          {due.map((habit) => (
            <HabitPill
              key={habit.id}
              habit={habit}
              count={(index.get(habit.id) ?? NO_COUNTS).get(date) ?? 0}
              onToggle={() => toggleHabit(habit.id, date)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function HabitPill({ habit, count, onToggle }: { habit: Habit; count: number; onToggle: () => void }) {
  const target = Math.max(1, habit.target_count);
  const complete = count >= target;
  const pct = Math.min(100, (count / target) * 100);

  return (
    <button
      onClick={onToggle}
      aria-label={`${habit.name}, ${count} of ${target} today`}
      style={{ borderColor: complete ? "var(--tint)" : undefined }}
      className={cn(
        `tint-${habit.color}`,
        "group relative h-9 overflow-hidden rounded-full border border-line pl-2.5 pr-3 cursor-pointer",
        "transition-[border-color,transform] duration-200 ease-[var(--ease-out-apple)] active:scale-[0.97]",
        "hover:border-[var(--tint)]",
      )}
    >
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 transition-[width] duration-[260ms] ease-[var(--ease-out-apple)]"
        style={{ width: `${pct}%`, background: "var(--tint-soft)" }}
      />
      <span className="relative flex h-full items-center gap-1.5">
        <HabitIcon
          name={habit.icon}
          className={cn("size-4 shrink-0 transition-colors duration-150", count > 0 ? "text-[var(--tint)]" : "text-ink-3")}
        />
        <span className={cn("text-[13px] font-medium", complete ? "text-[var(--tint-ink)]" : "text-ink")}>
          {habit.name}
        </span>
        {target > 1 && (
          <span className="text-[11.5px] text-ink-3 tnum">{count}/{target}</span>
        )}
        {complete && <Check className="size-3.5 shrink-0 stroke-[2.5] text-[var(--tint)] anim-pop" />}
      </span>
    </button>
  );
}
