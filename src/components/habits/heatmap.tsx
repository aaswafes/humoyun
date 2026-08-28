"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { addDays, dayNameOf, formatDate, fromISO, monthNameOf, todayISO } from "@/lib/date";
import type { Habit } from "@/lib/types";
import { VisuallyHidden } from "@/components/ui/form";
import {
  countLabel, dayState, isComplete, NO_SKIPS, type Counts, type DayState, type Skips,
} from "./habit-utils";

interface HeatmapProps {
  habit: Habit;
  counts: Counts;
  /** Days rested on purpose — drawn hollow, never as a miss. */
  skips?: Skips;
  /** ISO of the first column's week-start day. */
  startWeek: string;
  weeks: number;
  weekStart?: number;
  cellSize?: number;
  gap?: number;
  showMonths?: boolean;
  showWeekdays?: boolean;
  onToggle: (date: string) => void;
  className?: string;
}

/** Fill and shape for one cell. Shape carries the state as well as colour. */
function paint(state: DayState, ratio: number): React.CSSProperties {
  switch (state) {
    case "done":
    case "partial":
      return { background: "var(--tint)", opacity: 0.32 + 0.68 * ratio };
    case "skipped":
      // Hollow ring — a rest day is a decision, not an empty square.
      return { background: "transparent", boxShadow: "inset 0 0 0 1.5px var(--line-strong)" };
    case "future":
      return { background: "transparent", border: "1px dashed var(--line)" };
    case "rest":
      return { background: "var(--active)", opacity: 0.4 };
    case "due":
      return { background: "var(--active)", boxShadow: "inset 0 0 0 1px var(--accent-line)" };
    default:
      return { background: "var(--active)" };
  }
}

/**
 * A contribution grid: one row per weekday, one column per week.
 *
 * The whole grid is a single tab stop with arrow-key navigation — 140 tab stops
 * per habit would bury the rest of the page — and each weekday is a real
 * `role="row"`, because `role="grid"` may only own rows.
 */
export function Heatmap({
  habit, counts, skips = NO_SKIPS, startWeek, weeks, weekStart = 1,
  cellSize = 11, gap = 3, showMonths, showWeekdays, onToggle, className,
}: HeatmapProps) {
  const uid = React.useId();
  const summaryId = `${uid}-summary`;
  const today = todayISO();
  const total = weeks * 7;

  const [cursor, setCursor] = React.useState(total - 1);
  const [focused, setFocused] = React.useState(false);
  const [hover, setHover] = React.useState<number | null>(null);

  const pitch = cellSize + gap;
  const gridW = weeks * cellSize + (weeks - 1) * gap;
  const gridH = 7 * cellSize + 6 * gap;

  // Cell index is the day offset from `startWeek`: column * 7 + row.
  const dateAt = React.useCallback((i: number) => addDays(startWeek, i), [startWeek]);

  // Clamp the cursor when the range changes underneath it (year navigation).
  const safeCursor = Math.min(cursor, total - 1);

  const months = React.useMemo(() => {
    if (!showMonths) return [];
    const out: { col: number; text: string }[] = [];
    let lastMonth = -1;
    for (let col = 0; col < weeks; col++) {
      const month = fromISO(addDays(startWeek, col * 7)).getMonth();
      if (month === lastMonth) continue;
      const prev = out[out.length - 1];
      if (!prev || col - prev.col >= 3) out.push({ col, text: monthNameOf(month, true) });
      lastMonth = month;
    }
    return out;
  }, [showMonths, startWeek, weeks]);

  const tally = React.useMemo(() => {
    let done = 0;
    let missed = 0;
    let rested = 0;
    for (let i = 0; i < total; i++) {
      const date = dateAt(i);
      const state = dayState(habit, counts, skips, date, today, weekStart);
      if (state === "done") done++;
      else if (state === "missed") missed++;
      else if (state === "skipped") rested++;
    }
    return { done, missed, rested };
  }, [counts, dateAt, habit, skips, today, total, weekStart]);

  function describe(date: string) {
    const state = dayState(habit, counts, skips, date, today, weekStart);
    if (state === "done" || state === "partial") return countLabel(habit, counts.get(date) ?? 0);
    if (state === "skipped") return "Rest day";
    if (state === "future") return "Upcoming";
    if (state === "rest") return "Not scheduled";
    if (state === "due") return "Due today";
    return "Missed";
  }

  function onKeyDown(e: React.KeyboardEvent) {
    const moves: Record<string, number> = {
      ArrowLeft: -7, ArrowRight: 7, ArrowUp: -1, ArrowDown: 1,
    };
    if (e.key in moves) {
      e.preventDefault();
      setCursor(Math.max(0, Math.min(total - 1, safeCursor + moves[e.key])));
      return;
    }
    if (e.key === "Home") { e.preventDefault(); setCursor(0); return; }
    if (e.key === "End") { e.preventDefault(); setCursor(total - 1); return; }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const date = dateAt(safeCursor);
      if (date <= today) onToggle(date);
    }
  }

  const tipIndex = hover ?? (focused ? safeCursor : null);

  return (
    <div className={cn(`tint-${habit.color}`, "relative inline-block", className)}>
      <VisuallyHidden id={summaryId}>
        {`${tally.done} days done, ${tally.missed} missed and ${tally.rested} rested between `}
        {`${formatDate(dateAt(0), { year: true })} and ${formatDate(dateAt(total - 1), { year: true })}. `}
        Use the arrow keys to move between days and Enter to log one.
      </VisuallyHidden>

      {showMonths && (
        <div className="relative mb-1 h-[13px]" style={{ width: gridW, marginLeft: showWeekdays ? 26 : 0 }}>
          {months.map((m) => (
            <span
              key={m.col}
              className="absolute top-0 text-[10.5px] font-medium leading-none text-ink-3"
              style={{ left: m.col * pitch }}
            >
              {m.text}
            </span>
          ))}
        </div>
      )}

      <div className="flex items-start gap-1.5">
        {showWeekdays && (
          <div className="grid shrink-0" style={{ gridTemplateRows: `repeat(7, ${cellSize}px)`, gap, width: 20 }}>
            {Array.from({ length: 7 }, (_, row) => (
              <span
                key={row}
                aria-hidden
                className="text-[10.5px] leading-none text-ink-4"
                style={{ lineHeight: `${cellSize}px` }}
              >
                {row % 2 === 1 ? dayNameOf((weekStart + row) % 7, "min") : ""}
              </span>
            ))}
          </div>
        )}

        <div className="relative" style={{ width: gridW, height: gridH }}>
          <div
            role="grid"
            tabIndex={0}
            aria-label={`${habit.name} activity, ${weeks} weeks`}
            aria-describedby={summaryId}
            aria-activedescendant={`${uid}-${safeCursor}`}
            onKeyDown={onKeyDown}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onMouseLeave={() => setHover(null)}
            className="flex flex-col rounded-[5px]"
            style={{ gap }}
          >
            {Array.from({ length: 7 }, (_, row) => (
              <div
                key={row}
                role="row"
                aria-label={dayNameOf((weekStart + row) % 7, "long")}
                className="grid"
                style={{ gridTemplateColumns: `repeat(${weeks}, ${cellSize}px)`, gap }}
              >
                {Array.from({ length: weeks }, (_, col) => {
                  const i = col * 7 + row;
                  const date = dateAt(i);
                  const count = counts.get(date) ?? 0;
                  const state = dayState(habit, counts, skips, date, today, weekStart);
                  const ratio = isComplete(habit, count)
                    ? 1
                    : Math.min(1, count / Math.max(1, habit.target_count));
                  const isCursor = focused && i === safeCursor;
                  const clickable = date <= today;

                  return (
                    <div
                      key={date}
                      id={`${uid}-${i}`}
                      role="gridcell"
                      aria-label={`${formatDate(date, { year: true })}: ${describe(date)}`}
                      aria-selected={isCursor}
                      onMouseEnter={() => setHover(i)}
                      onClick={() => { if (clickable) { setCursor(i); onToggle(date); } }}
                      className={cn(
                        "rounded-[3px] transition-[opacity,transform] duration-150 ease-[var(--ease-out-apple)]",
                        clickable && "cursor-pointer hover:scale-125",
                        date === today && "ring-1 ring-ink-3",
                        isCursor && "ring-2 ring-accent",
                      )}
                      style={{ ...paint(state, ratio), boxSizing: "border-box", height: cellSize }}
                    />
                  );
                })}
              </div>
            ))}
          </div>

          {tipIndex != null && (
            <div
              role="tooltip"
              className="pointer-events-none absolute z-20 -translate-x-1/2 whitespace-nowrap rounded-md bg-ink px-2 py-1 text-[11px] font-medium leading-none text-canvas shadow-md anim-fade"
              style={{
                left: Math.max(30, Math.min(gridW - 30, Math.floor(tipIndex / 7) * pitch + cellSize / 2)),
                bottom: gridH - (tipIndex % 7) * pitch + 5,
              }}
            >
              {formatDate(dateAt(tipIndex), { year: true })} · {describe(dateAt(tipIndex))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Less → More key, plus the two shapes that are not a shade of the tint. */
export function HeatmapLegend({ habit, className }: { habit: Habit; className?: string }) {
  return (
    <div className={cn(`tint-${habit.color}`, "flex items-center gap-2 text-[11px] text-ink-3", className)}>
      <span className="flex items-center gap-1">
        <span>Less</span>
        {[0, 0.25, 0.5, 0.75, 1].map((step) => (
          <span
            key={step}
            aria-hidden
            className="size-[10px] rounded-[3px]"
            style={{
              background: step === 0 ? "var(--active)" : "var(--tint)",
              opacity: step === 0 ? 1 : 0.32 + 0.68 * step,
            }}
          />
        ))}
        <span>More</span>
      </span>
      <span className="flex items-center gap-1">
        <span
          aria-hidden
          className="size-[10px] rounded-[3px]"
          style={{ boxShadow: "inset 0 0 0 1.5px var(--line-strong)" }}
        />
        <span>Rest</span>
      </span>
    </div>
  );
}
