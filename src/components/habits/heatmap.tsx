"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { addDays, dayNameOf, formatDate, fromISO, monthNameOf, todayISO } from "@/lib/date";
import type { Habit } from "@/lib/types";
import { isScheduled, type Counts } from "./habit-utils";

interface HeatmapProps {
  habit: Habit;
  counts: Counts;
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

/**
 * A contribution grid: one column per week, one row per weekday.
 * The whole grid is a single tab stop with arrow-key navigation — 140 tab
 * stops per habit would bury the rest of the page.
 */
export function Heatmap({
  habit, counts, startWeek, weeks, weekStart = 1,
  cellSize = 11, gap = 3, showMonths, showWeekdays, onToggle, className,
}: HeatmapProps) {
  const uid = React.useId();
  const today = todayISO();
  const total = weeks * 7;

  const [cursor, setCursor] = React.useState(total - 1);
  const [focused, setFocused] = React.useState(false);
  const [hover, setHover] = React.useState<number | null>(null);

  const pitch = cellSize + gap;
  const gridW = weeks * cellSize + (weeks - 1) * gap;
  const gridH = 7 * cellSize + 6 * gap;

  // Cells are emitted column-major, so cell index and day offset coincide.
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

  function describe(date: string) {
    const count = counts.get(date) ?? 0;
    if (date > today) return "Upcoming";
    if (count > 0) {
      if (habit.target_count > 1) return `${count} of ${habit.target_count}${habit.unit ? ` ${habit.unit}` : ""}`;
      return habit.unit ? `1 ${habit.unit}` : "Done";
    }
    return isScheduled(habit, date, counts, weekStart) ? "Not logged" : "Rest day";
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
    <div className={cn(`tint-${habit.color}`, "inline-block", className)}>
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
            aria-activedescendant={`${uid}-${safeCursor}`}
            onKeyDown={onKeyDown}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onMouseLeave={() => setHover(null)}
            className="grid rounded-[5px]"
            style={{
              gridTemplateColumns: `repeat(${weeks}, ${cellSize}px)`,
              gridTemplateRows: `repeat(7, ${cellSize}px)`,
              gridAutoFlow: "column",
              gap,
            }}
          >
            {Array.from({ length: total }, (_, i) => {
              const date = dateAt(i);
              const count = counts.get(date) ?? 0;
              const future = date > today;
              const filled = count > 0;
              const ratio = Math.min(1, count / Math.max(1, habit.target_count));
              const scheduled = !future && isScheduled(habit, date, counts, weekStart);
              const isCursor = focused && i === safeCursor;
              const summary = describe(date);

              return (
                <div
                  key={date}
                  id={`${uid}-${i}`}
                  role="gridcell"
                  aria-label={`${formatDate(date, { year: true })}: ${summary}`}
                  aria-selected={isCursor}
                  onMouseEnter={() => setHover(i)}
                  onClick={() => { if (!future) { setCursor(i); onToggle(date); } }}
                  className={cn(
                    "rounded-[3px] transition-[opacity,transform] duration-150 ease-[var(--ease-out-apple)]",
                    !future && "cursor-pointer hover:scale-125",
                    date === today && "ring-1 ring-ink-3",
                    isCursor && "ring-2 ring-accent",
                  )}
                  style={{
                    background: future ? "transparent" : filled ? "var(--tint)" : "var(--active)",
                    opacity: future ? 1 : filled ? 0.32 + 0.68 * ratio : scheduled ? 1 : 0.4,
                    border: future ? "1px dashed var(--line)" : undefined,
                    boxSizing: "border-box",
                  }}
                />
              );
            })}
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

/** Less → More key. Only worth showing next to the full-year grid. */
export function HeatmapLegend({ habit, className }: { habit: Habit; className?: string }) {
  return (
    <div className={cn(`tint-${habit.color}`, "flex items-center gap-1 text-[11px] text-ink-3", className)}>
      <span>Less</span>
      {[0, 0.25, 0.5, 0.75, 1].map((step) => (
        <span
          key={step}
          className="size-[10px] rounded-[3px]"
          style={{
            background: step === 0 ? "var(--active)" : "var(--tint)",
            opacity: step === 0 ? 1 : 0.32 + 0.68 * step,
          }}
        />
      ))}
      <span>More</span>
    </div>
  );
}
