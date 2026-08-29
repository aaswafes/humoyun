"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { dayName, formatDate, formatDuration, isToday, monthName, todayISO } from "@/lib/date";
import { VisuallyHidden } from "@/components/ui/form";
import { heatmapWeeks, type DayGroup, type HeatCell } from "./focus-data";

const WEEKS = 26;
const CELL = 12;
/** Padding turns a 12px square into a 16px target without changing the grid. */
const PAD = 2;
const STEP = CELL + PAD * 2;
const GUTTER = 22;

/** Four steps of the one accent — never four different colours. */
const LEVEL_OPACITY = [0, 0.22, 0.45, 0.72, 1] as const;

function cellTitle(cell: HeatCell, group: DayGroup | undefined): string {
  const when = formatDate(cell.date, { year: false });
  if (!cell.minutes) return `${when} · nothing logged`;
  const parts = [`${when} · ${formatDuration(cell.minutes)}`];
  if (group?.items.length) parts.push(`${group.items.length} session${group.items.length === 1 ? "" : "s"}`);
  if (group?.interruptions) parts.push(`${group.interruptions} interruption${group.interruptions === 1 ? "" : "s"}`);
  return parts.join(" · ");
}

/**
 * Half a year of focus at a glance. One cell per day, shaded against the daily
 * target, so a run of good days is a shape rather than a number. Arrow keys walk
 * the grid from a single tab stop.
 */
export const FocusHeatmap = React.memo(function FocusHeatmap({
  groups, weekStart, dailyGoal, selected, onSelect,
}: {
  groups: DayGroup[];
  weekStart: number;
  dailyGoal: number;
  selected: string | null;
  onSelect: (date: string | null) => void;
}) {
  const summaryId = React.useId();
  const cellRefs = React.useRef(new Map<string, HTMLButtonElement | null>());

  const weeks = React.useMemo(
    () => heatmapWeeks(groups, WEEKS, weekStart, dailyGoal),
    [groups, weekStart, dailyGoal],
  );
  const byDate = React.useMemo(() => new Map(groups.map((g) => [g.date, g])), [groups]);
  const flat = React.useMemo(() => weeks.flat(), [weeks]);

  const [roving, setRoving] = React.useState<string | null>(null);
  const tabDate = roving ?? selected ?? todayISO();
  // The single tab stop always has to be a cell that actually rendered a button.
  const wanted = flat.findIndex((c) => c.date === tabDate && !c.future);
  const todayIndex = flat.findIndex((c) => c.date === todayISO());
  const activeIndex = wanted >= 0 ? wanted : todayIndex >= 0 ? todayIndex : 0;

  const totals = React.useMemo(() => {
    const shown = flat.filter((c) => !c.future);
    return {
      minutes: shown.reduce((sum, c) => sum + c.minutes, 0),
      days: shown.filter((c) => c.minutes > 0).length,
      hit: shown.filter((c) => c.level === 4).length,
    };
  }, [flat]);

  /** Left/right move a week, up/down move a day — and nothing walks into the future. */
  const move = (from: number, delta: number) => {
    const next = flat[Math.min(flat.length - 1, Math.max(0, from + delta))];
    if (!next || next.future) return;
    setRoving(next.date);
    cellRefs.current.get(next.date)?.focus();
  };

  const detail = selected ? byDate.get(selected) : undefined;

  // Month names sit above the first column that belongs to a new month.
  const monthLabels = weeks.map((week, i) => {
    const first = week[0].date;
    const previous = i > 0 ? weeks[i - 1][0].date : null;
    return !previous || first.slice(5, 7) !== previous.slice(5, 7) ? monthName(first, true) : "";
  });

  return (
    <section>
      <p className="mb-3 text-[11.5px] text-ink-4 tnum">
        {formatDuration(totals.minutes)} over {totals.days} {totals.days === 1 ? "day" : "days"}
        {totals.hit > 0 && ` · ${totals.hit} at target`}
      </p>

      <div className="overflow-x-auto pb-1">
        <div style={{ width: WEEKS * STEP + GUTTER }}>
          <div className="flex" style={{ paddingLeft: GUTTER }}>
            {monthLabels.map((label, i) => (
              <span key={i} className="shrink-0 text-[10.5px] text-ink-4" style={{ width: STEP }}>
                {label}
              </span>
            ))}
          </div>

          <div className="mt-0.5 flex">
            <div className="flex shrink-0 flex-col" style={{ width: GUTTER }}>
              {Array.from({ length: 7 }, (_, d) => (
                <span
                  key={d}
                  className="flex items-center justify-end pr-1.5 text-[10.5px] leading-none text-ink-4"
                  style={{ height: STEP }}
                >
                  {d % 2 === 1 ? dayName(weeks[0][d].date, "min") : ""}
                </span>
              ))}
            </div>

            <div role="group" aria-label="Focus minutes by day" aria-describedby={summaryId} className="flex">
              {weeks.map((week, w) => (
                <div key={w} className="flex flex-col">
                  {week.map((cell, d) => {
                    const index = w * 7 + d;
                    const group = byDate.get(cell.date);
                    const isSelected = selected === cell.date;
                    const swatch = (
                      <span
                        aria-hidden
                        className={cn(
                          "block rounded-xs transition-transform duration-150 ease-[var(--ease-out-apple)]",
                          cell.level === 0 && "bg-hover",
                          isToday(cell.date) && "ring-1 ring-ink-3",
                          isSelected && "ring-2 ring-accent",
                        )}
                        style={{
                          width: CELL,
                          height: CELL,
                          background: cell.level ? "var(--accent)" : undefined,
                          opacity: cell.level ? LEVEL_OPACITY[cell.level] : undefined,
                        }}
                      />
                    );

                    if (cell.future) {
                      return (
                        <span
                          key={cell.date}
                          className="grid place-items-center opacity-30"
                          style={{ width: STEP, height: STEP }}
                        >
                          {swatch}
                        </span>
                      );
                    }

                    return (
                      <button
                        key={cell.date}
                        ref={(el) => { cellRefs.current.set(cell.date, el); }}
                        type="button"
                        tabIndex={index === activeIndex ? 0 : -1}
                        aria-label={cellTitle(cell, group)}
                        aria-pressed={isSelected}
                        title={cellTitle(cell, group)}
                        onFocus={() => setRoving(cell.date)}
                        onClick={() => onSelect(isSelected ? null : cell.date)}
                        onKeyDown={(e) => {
                          const steps: Record<string, number> = {
                            ArrowLeft: -7, ArrowRight: 7, ArrowUp: -1, ArrowDown: 1,
                          };
                          if (e.key in steps) { e.preventDefault(); move(index, steps[e.key]); }
                          if (e.key === "Home") { e.preventDefault(); move(index, -index); }
                          if (e.key === "End") { e.preventDefault(); move(index, flat.length - 1 - index); }
                        }}
                        className="grid cursor-pointer place-items-center rounded-sm hover:[&>span]:scale-125"
                        style={{ width: STEP, height: STEP }}
                      >
                        {swatch}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="min-h-[17px] text-[11.5px] text-ink-3 tnum">
          {selected ? (
            <>
              <span className="text-ink-2">{formatDate(selected, { year: false })}</span>
              {detail ? (
                <>
                  {" · "}
                  {formatDuration(detail.minutes)} across {detail.items.length}{" "}
                  {detail.items.length === 1 ? "session" : "sessions"}
                  {detail.interruptions > 0 && ` · ${detail.interruptions} interrupted`}
                  {detail.breakMinutes > 0 && ` · ${formatDuration(detail.breakMinutes)} resting`}
                </>
              ) : (
                " · nothing logged"
              )}
            </>
          ) : (
            "Pick a day to open it under History."
          )}
        </p>

        <div className="flex items-center gap-1.5 text-[10.5px] text-ink-4">
          <span>Less</span>
          {LEVEL_OPACITY.map((opacity, i) => (
            <span
              key={i}
              aria-hidden
              className={cn("rounded-xs", i === 0 && "bg-hover")}
              style={{
                width: 10,
                height: 10,
                background: i ? "var(--accent)" : undefined,
                opacity: i ? opacity : undefined,
              }}
            />
          ))}
          <span>{formatDuration(dailyGoal)}+</span>
        </div>
      </div>

      <VisuallyHidden id={summaryId}>
        {`${formatDuration(totals.minutes)} of focus over the last ${WEEKS} weeks, on ${totals.days} days, ` +
          `${totals.hit} of them at or above the ${formatDuration(dailyGoal)} daily target. ` +
          "Use the arrow keys to move between days."}
      </VisuallyHidden>
    </section>
  );
});
