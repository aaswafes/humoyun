"use client";

import * as React from "react";
import { Check, Minus, Moon, Plus } from "lucide-react";
import { cn } from "@/lib/cn";
import { dayNameOf, formatDate, isToday } from "@/lib/date";
import type { Habit } from "@/lib/types";
import { countLabel, DAY_STATE_LABEL, type DayState, type WeekDay } from "./habit-utils";

/**
 * Logging one day of one habit.
 *
 * A habit with a target of 1 is a tick. A habit with a target above 1 is a
 * stepper, because "2 of 3 glasses" is a real state that a toggle throws away.
 * A rested day is neither — it says so, and one press takes it back.
 */
export function DayControl({
  habit, date, count, skipped, onCount, onUnskip, size = "md", className,
}: {
  habit: Habit;
  date: string;
  count: number;
  skipped: boolean;
  onCount: (next: number) => void;
  onUnskip: () => void;
  size?: "sm" | "md";
  className?: string;
}) {
  const target = Math.max(1, habit.target_count);
  const complete = count >= target;
  const when = isToday(date) ? "today" : formatDate(date, { weekday: false });
  const box = size === "sm" ? "h-7" : "h-8";

  if (skipped) {
    return (
      <button
        type="button"
        onClick={onUnskip}
        aria-label={`${habit.name} is a rest day ${when}. Undo the rest day.`}
        className={cn(
          box,
          "inline-flex items-center gap-1.5 rounded-full border border-dashed border-line-strong px-2.5",
          "text-[12px] font-medium text-ink-3 cursor-pointer transition-colors duration-150",
          "hover:border-ink-3 hover:text-ink-2 active:scale-[0.97]",
          className,
        )}
      >
        <Moon className="size-3.5" />
        Rested
      </button>
    );
  }

  if (target === 1) {
    return (
      <button
        type="button"
        role="checkbox"
        aria-checked={complete}
        aria-label={`${habit.name} ${when}: ${complete ? "done" : "not logged"}`}
        onClick={() => onCount(complete ? 0 : 1)}
        className={cn(
          box,
          "inline-flex items-center gap-1.5 rounded-full border px-2.5 cursor-pointer",
          "text-[12px] font-medium transition-[background-color,border-color,color,transform] duration-150 ease-[var(--ease-out-apple)]",
          "active:scale-[0.97]",
          complete
            ? "border-transparent text-[var(--tint-ink)]"
            : "border-line text-ink-3 hover:border-line-strong hover:text-ink-2",
          className,
        )}
        style={complete ? { background: "var(--tint-soft)", borderColor: "var(--tint)" } : undefined}
      >
        <span
          aria-hidden
          className={cn(
            "grid size-[15px] place-items-center rounded-[5px] border transition-colors duration-150",
            complete ? "border-transparent text-white" : "border-line-strong",
          )}
          style={complete ? { background: "var(--tint)" } : undefined}
        >
          {complete && <Check className="size-2.5 stroke-[3.5]" />}
        </span>
        {complete ? "Done" : "Log"}
      </button>
    );
  }

  return (
    <div
      className={cn(
        box,
        "inline-flex items-center rounded-full border",
        complete ? "border-[var(--tint)]" : "border-line",
        className,
      )}
      style={complete ? { background: "var(--tint-soft)" } : undefined}
    >
      <StepButton
        label={`Remove one from ${habit.name} ${when}`}
        disabled={count <= 0}
        onClick={() => onCount(count - 1)}
        side="left"
      >
        <Minus className="size-3.5" />
      </StepButton>
      <span
        aria-live="polite"
        aria-label={`${habit.name} ${when}: ${countLabel(habit, count)}`}
        className={cn(
          "min-w-[38px] text-center text-[12px] font-medium leading-none tnum",
          complete ? "text-[var(--tint-ink)]" : "text-ink-2",
        )}
      >
        {count}<span className="text-ink-4">/{target}</span>
      </span>
      <StepButton
        label={`Add one to ${habit.name} ${when}`}
        disabled={count >= target * 3}
        onClick={() => onCount(count + 1)}
        side="right"
      >
        {complete ? <Check className="size-3.5" /> : <Plus className="size-3.5" />}
      </StepButton>
    </div>
  );
}

function StepButton({
  label, onClick, disabled, side, children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  side: "left" | "right";
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "grid h-full w-7 shrink-0 place-items-center text-ink-3 cursor-pointer",
        "transition-colors duration-150 hover:bg-hover hover:text-ink",
        "disabled:pointer-events-none disabled:opacity-30",
        side === "left" ? "rounded-l-full" : "rounded-r-full",
      )}
    >
      {children}
    </button>
  );
}

function dotStyle(state: DayState, ratio: number): React.CSSProperties {
  switch (state) {
    case "done":
      return { background: "var(--tint)" };
    case "partial":
      return { background: "var(--tint)", opacity: 0.3 + 0.5 * ratio };
    case "skipped":
      return { background: "transparent", boxShadow: "inset 0 0 0 1.5px var(--line-strong)" };
    case "missed":
      return { background: "transparent", boxShadow: "inset 0 0 0 1.5px var(--line)" };
    case "due":
      return { background: "transparent", boxShadow: "inset 0 0 0 1.5px var(--accent-line)" };
    default:
      return { background: "var(--active)" };
  }
}

/**
 * The week at a glance: seven dots, one per day. Read as a single image with a
 * spoken summary rather than seven unlabelled shapes.
 */
export function WeekDots({
  habit, days, weekStart = 1, size = 7, className,
}: {
  habit: Habit;
  days: WeekDay[];
  weekStart?: number;
  size?: number;
  className?: string;
}) {
  const spoken = days
    .map((day, i) => `${dayNameOf((weekStart + i) % 7, "short")} ${DAY_STATE_LABEL[day.state].toLowerCase()}`)
    .join(", ");

  return (
    <span
      role="img"
      aria-label={`This week: ${spoken}.`}
      className={cn(`tint-${habit.color}`, "inline-flex items-center gap-[3px]", className)}
    >
      {days.map((day) => (
        <span
          key={day.date}
          aria-hidden
          title={`${formatDate(day.date, { weekday: true })} · ${DAY_STATE_LABEL[day.state]}`}
          className="rounded-full"
          style={{
            width: size,
            height: size,
            ...dotStyle(day.state, Math.min(1, day.count / Math.max(1, habit.target_count))),
          }}
        />
      ))}
    </span>
  );
}
