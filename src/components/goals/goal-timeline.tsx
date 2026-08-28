"use client";

import * as React from "react";
import { CalendarRange, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { diffDays, endOfMonth, monthName, todayISO, yearOf } from "@/lib/date";
import type { Goal } from "@/lib/types";
import { Button, EmptyState, IconButton } from "@/components/ui/primitives";
import { GoalDot } from "./goal-card";
import {
  formatGoalRange, HORIZON_LABEL, horizonIndex, pct, type GoalIndex,
} from "./goal-model";

const ROW_CAP = 60;

interface Bar {
  goal: Goal;
  left: number;
  width: number;
  clippedStart: boolean;
  clippedEnd: boolean;
  progress: number;
}

export function GoalTimeline({
  goals, index, openId, onOpen,
}: {
  goals: Goal[];
  index: GoalIndex;
  openId: string | null;
  onOpen: (id: string) => void;
}) {
  const today = todayISO();
  const [year, setYear] = React.useState(() => yearOf(today));
  const [showAll, setShowAll] = React.useState(false);

  const jan1 = `${year}-01-01`;
  const dec31 = `${year}-12-31`;
  const totalDays = diffDays(dec31, jan1) + 1;
  const offset = React.useCallback(
    (iso: string) => (diffDays(iso, jan1) / totalDays) * 100,
    [jan1, totalDays],
  );

  const months = React.useMemo(() => {
    return Array.from({ length: 12 }, (_, m) => {
      const start = `${year}-${String(m + 1).padStart(2, "0")}-01`;
      const days = diffDays(endOfMonth(start), start) + 1;
      return { start, label: monthName(start, true), width: (days / totalDays) * 100 };
    });
  }, [year, totalDays]);

  const { bars, undated } = React.useMemo(() => {
    const rows: Bar[] = [];
    const loose: Goal[] = [];

    for (const goal of goals) {
      const start = goal.start_date ?? goal.end_date;
      const end = goal.end_date ?? goal.start_date;
      if (!start || !end) { loose.push(goal); continue; }
      if (end < jan1 || start > dec31) continue;

      const from = start < jan1 ? jan1 : start;
      const to = end > dec31 ? dec31 : end;
      const stats = index.stats(goal.id);
      rows.push({
        goal,
        left: offset(from),
        width: Math.max(((diffDays(to, from) + 1) / totalDays) * 100, 0.7),
        clippedStart: start < jan1,
        clippedEnd: end > dec31,
        progress: goal.status === "done" ? 1 : stats.overall,
      });
    }

    rows.sort((a, b) => {
      const h = horizonIndex(a.goal.horizon) - horizonIndex(b.goal.horizon);
      if (h !== 0) return h;
      if (a.left !== b.left) return a.left - b.left;
      return a.goal.title.localeCompare(b.goal.title);
    });

    return { bars: rows, undated: loose };
  }, [goals, index, jan1, dec31, offset, totalDays]);

  const visible = showAll ? bars : bars.slice(0, ROW_CAP);
  const todayLeft = yearOf(today) === year ? offset(today) : null;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <span className="display-serif text-[32px] leading-none text-ink tnum">{year}</span>
          <span className="text-[12.5px] text-ink-3 tnum">
            {bars.length} {bars.length === 1 ? "goal" : "goals"} on the calendar
          </span>
        </div>
        <div className="flex items-center gap-1">
          <IconButton label="Previous year" onClick={() => setYear((y) => y - 1)}>
            <ChevronLeft />
          </IconButton>
          <Button size="sm" variant="ghost" onClick={() => setYear(yearOf(today))}>
            This year
          </Button>
          <IconButton label="Next year" onClick={() => setYear((y) => y + 1)}>
            <ChevronRight />
          </IconButton>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[760px] surface overflow-hidden">
          {/* month scale */}
          <div className="flex hairline-b">
            <div className="w-[212px] shrink-0 px-3 py-2 hairline-r">
              <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">Goal</span>
            </div>
            <div className="flex flex-1">
              {months.map((m, i) => (
                <div
                  key={m.start}
                  style={{ width: `${m.width}%` }}
                  className={cn(
                    "py-2 text-center text-[11px] font-medium text-ink-3",
                    i > 0 && "hairline-l",
                  )}
                >
                  {m.label}
                </div>
              ))}
            </div>
          </div>

          {visible.length === 0 ? (
            <EmptyState
              icon={CalendarRange}
              title={`Nothing scheduled in ${year}`}
              description="Goals appear here once they have a start and an end date. Open a goal to give it a range, or step to another year."
            />
          ) : (
            <div className="relative">
              {/* gridlines sit under the bars */}
              <div className="pointer-events-none absolute inset-y-0 left-[212px] right-0">
                {months.slice(1).map((m) => (
                  <div
                    key={m.start}
                    className="absolute inset-y-0 w-px bg-line"
                    style={{ left: `${offset(m.start)}%` }}
                  />
                ))}
                {todayLeft != null && (
                  <div className="absolute inset-y-0 w-px bg-accent" style={{ left: `${todayLeft}%` }}>
                    <span className="absolute top-0 left-1/2 size-1.5 -translate-x-1/2 rounded-full bg-accent" />
                  </div>
                )}
              </div>

              {visible.map((bar) => {
                const stats = index.stats(bar.goal.id);
                return (
                  <div
                    key={bar.goal.id}
                    className={cn(
                      "relative flex items-stretch transition-colors duration-150 hover:bg-hover",
                      bar.goal.id === openId && "bg-selected",
                    )}
                  >
                    <button
                      onClick={() => onOpen(bar.goal.id)}
                      className="flex w-[212px] shrink-0 cursor-pointer items-center gap-1.5 px-3 py-1.5 text-left hairline-r"
                    >
                      <GoalDot goal={bar.goal} />
                      <span
                        className={cn(
                          "min-w-0 flex-1 truncate text-[12.5px]",
                          bar.goal.status === "done" ? "text-ink-3 line-through decoration-ink-4/60" : "text-ink",
                        )}
                      >
                        {bar.goal.title || "Untitled goal"}
                      </span>
                      <span className="shrink-0 text-[11px] text-ink-3 tnum">{pct(bar.progress)}</span>
                    </button>

                    <div className="relative flex-1 py-1.5">
                      <button
                        onClick={() => onOpen(bar.goal.id)}
                        title={`${bar.goal.title || "Untitled goal"} — ${HORIZON_LABEL[bar.goal.horizon]} · ${formatGoalRange(bar.goal)} · ${pct(bar.progress)}${stats.subtreeTotal ? ` · ${stats.subtreeDone}/${stats.subtreeTotal} tasks` : ""}`}
                        style={{ left: `${bar.left}%`, width: `${bar.width}%` }}
                        className={cn(
                          `tint-${bar.goal.color}`,
                          "absolute top-1/2 h-[17px] -translate-y-1/2 cursor-pointer overflow-hidden rounded-full",
                          "bg-[var(--tint-soft)]",
                          "transition-[filter,transform] duration-150 hover:brightness-95 dark:hover:brightness-110",
                          bar.clippedStart && "rounded-l-[3px]",
                          bar.clippedEnd && "rounded-r-[3px]",
                          bar.goal.status === "dropped" && "opacity-50",
                        )}
                      >
                        <span
                          className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-500 ease-[var(--ease-out-apple)]"
                          style={{ width: `${Math.max(bar.progress * 100, 0)}%`, background: "var(--tint)" }}
                        />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {bars.length > ROW_CAP && (
        <div className="mt-2 flex justify-center">
          <Button size="sm" variant="ghost" onClick={() => setShowAll((v) => !v)}>
            {showAll ? "Show fewer" : `Show ${bars.length - ROW_CAP} more`}
          </Button>
        </div>
      )}

      {undated.length > 0 && (
        <div className="mt-5">
          <div className="mb-1.5 flex items-baseline gap-2">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">Not on the calendar</h3>
            <span className="text-[11px] text-ink-4 tnum">{undated.length}</span>
          </div>
          <p className="mb-2 text-[12.5px] text-ink-3">
            These have no start or end date, so they cannot overlap with anything. Open one to give it a range.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {undated.map((goal) => (
              <button
                key={goal.id}
                onClick={() => onOpen(goal.id)}
                className={cn(
                  "inline-flex max-w-[260px] cursor-pointer items-center gap-1.5 rounded-full border border-line",
                  "bg-raised px-2.5 py-1 text-[12.5px] text-ink transition-colors duration-150 hover:bg-hover",
                )}
              >
                <GoalDot goal={goal} />
                <span className="truncate">{goal.title || "Untitled goal"}</span>
                <span className="shrink-0 text-[11px] text-ink-4">{HORIZON_LABEL[goal.horizon]}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
