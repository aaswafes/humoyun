"use client";

import * as React from "react";
import { CalendarRange, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import {
  addDays, addMonths, diffDays, endOfMonth, formatDate, monthName, startOfMonth,
  startOfWeek, todayISO, weekNumber, yearOf,
} from "@/lib/date";
import type { Goal } from "@/lib/types";
import { Button, EmptyState, IconButton, Segmented } from "@/components/ui/primitives";
import { ATTENTION_ICON, GoalDot } from "./goal-card";
import { Fold, useFold } from "./goal-fold";
import { MilestoneMark } from "./goal-milestones";
import { sortMilestones, type Milestone } from "./goal-meta";
import {
  formatGoalRange, HORIZON_LABEL, horizonIndex, pct, periodLabel, quarterEnd,
  quarterStart, type GoalIndex,
} from "./goal-model";

const ROW_CAP = 60;

type Zoom = "year" | "quarter";

const ZOOM_OPTIONS = [
  { value: "year" as const, label: "Year", title: "Twelve months at a glance" },
  { value: "quarter" as const, label: "Quarter", title: "Thirteen weeks, week by week" },
];

interface Bar {
  goal: Goal;
  left: number;
  width: number;
  clippedStart: boolean;
  clippedEnd: boolean;
  progress: number;
  milestones: { milestone: Milestone; left: number }[];
}

interface Column { key: string; label: string; width: number }

export function GoalTimeline({
  goals, index, openId, onOpen,
}: {
  goals: Goal[];
  index: GoalIndex;
  openId: string | null;
  onOpen: (id: string) => void;
}) {
  const today = todayISO();
  const weekStart = useStore((s) => s.profile?.week_start ?? 1);
  const [zoom, setZoom] = React.useState<Zoom>("year");
  const [anchor, setAnchor] = React.useState(today);
  const [showAll, setShowAll] = React.useState(false);
  const loose = useFold("timeline.undated", false);

  const range = React.useMemo(() => {
    if (zoom === "quarter") return { start: quarterStart(anchor), end: quarterEnd(anchor) };
    return { start: `${yearOf(anchor)}-01-01`, end: `${yearOf(anchor)}-12-31` };
  }, [zoom, anchor]);

  const totalDays = diffDays(range.end, range.start) + 1;
  const offset = React.useCallback(
    (iso: string) => (diffDays(iso, range.start) / totalDays) * 100,
    [range.start, totalDays],
  );

  const heading = zoom === "quarter"
    ? periodLabel("quarter", range.start)
    : String(yearOf(range.start));

  // Column headers: months either way — twelve of them across a year, three
  // across a quarter, where the gridlines fall on weeks instead.
  const columns = React.useMemo<Column[]>(() => {
    const out: Column[] = [];
    let cursor = startOfMonth(range.start);
    let guard = 0;
    while (cursor <= range.end && guard++ < 24) {
      const monthEnd = endOfMonth(cursor);
      const from = cursor < range.start ? range.start : cursor;
      const to = monthEnd > range.end ? range.end : monthEnd;
      out.push({
        key: cursor,
        label: zoom === "quarter" ? monthName(cursor) : monthName(cursor, true),
        width: ((diffDays(to, from) + 1) / totalDays) * 100,
      });
      cursor = addMonths(startOfMonth(cursor), 1);
    }
    return out;
  }, [range.start, range.end, totalDays, zoom]);

  const gridlines = React.useMemo(() => {
    const out: { key: string; left: number; label?: string }[] = [];
    if (zoom === "year") {
      let cursor = addMonths(startOfMonth(range.start), 1);
      while (cursor <= range.end) {
        out.push({ key: cursor, left: offset(cursor) });
        cursor = addMonths(cursor, 1);
      }
      return out;
    }
    let cursor = startOfWeek(range.start, weekStart);
    if (cursor < range.start) cursor = addDays(cursor, 7);
    let guard = 0;
    while (cursor <= range.end && guard++ < 30) {
      out.push({ key: cursor, left: offset(cursor), label: `W${weekNumber(cursor)}` });
      cursor = addDays(cursor, 7);
    }
    return out;
  }, [zoom, range.start, range.end, offset, weekStart]);

  const { bars, undated } = React.useMemo(() => {
    const rows: Bar[] = [];
    const loose: Goal[] = [];

    for (const goal of goals) {
      const start = goal.start_date ?? goal.end_date;
      const end = goal.end_date ?? goal.start_date;
      if (!start || !end) { loose.push(goal); continue; }
      if (end < range.start || start > range.end) continue;

      const from = start < range.start ? range.start : start;
      const to = end > range.end ? range.end : end;
      const stats = index.stats(goal.id);
      rows.push({
        goal,
        left: offset(from),
        width: Math.max(((diffDays(to, from) + 1) / totalDays) * 100, 0.7),
        clippedStart: start < range.start,
        clippedEnd: end > range.end,
        progress: goal.status === "done" ? 1 : stats.overall,
        milestones: sortMilestones(stats.meta.milestones)
          .filter((m) => m.date && m.date >= range.start && m.date <= range.end)
          .map((milestone) => ({ milestone, left: offset(milestone.date as string) })),
      });
    }

    rows.sort((a, b) => {
      const h = horizonIndex(a.goal.horizon) - horizonIndex(b.goal.horizon);
      if (h !== 0) return h;
      if (a.left !== b.left) return a.left - b.left;
      return a.goal.title.localeCompare(b.goal.title);
    });

    return { bars: rows, undated: loose };
  }, [goals, index, range.start, range.end, offset, totalDays]);

  const visible = showAll ? bars : bars.slice(0, ROW_CAP);
  const todayLeft = today >= range.start && today <= range.end ? offset(today) : null;
  const milestoneCount = bars.reduce((sum, b) => sum + b.milestones.length, 0);

  function stepBy(direction: 1 | -1) {
    setAnchor((current) => (zoom === "quarter" ? addMonths(current, 3 * direction) : addMonths(current, 12 * direction)));
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <span className="display-serif text-[32px] leading-none text-ink tnum">{heading}</span>
          <span className="text-[12.5px] text-ink-3 tnum">
            {bars.length} {bars.length === 1 ? "goal" : "goals"}
            {milestoneCount > 0 && ` · ${milestoneCount} ${milestoneCount === 1 ? "milestone" : "milestones"}`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Segmented value={zoom} options={ZOOM_OPTIONS} onChange={setZoom} size="sm" />
          <div className="flex items-center gap-1">
            <IconButton
              label={zoom === "quarter" ? "Previous quarter" : "Previous year"}
              onClick={() => stepBy(-1)}
            >
              <ChevronLeft />
            </IconButton>
            <Button size="sm" variant="ghost" onClick={() => setAnchor(today)}>
              Today
            </Button>
            <IconButton
              label={zoom === "quarter" ? "Next quarter" : "Next year"}
              onClick={() => stepBy(1)}
            >
              <ChevronRight />
            </IconButton>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[760px] surface overflow-hidden">
          {/* month scale */}
          <div className="flex hairline-b">
            <div className="w-[212px] shrink-0 px-3 py-2 hairline-r">
              <span className="text-[11.5px] font-medium text-ink-4">Goal</span>
            </div>
            <div className="relative flex flex-1">
              {columns.map((column, i) => (
                <div
                  key={column.key}
                  style={{ width: `${column.width}%` }}
                  className={cn(
                    "text-center text-[11px] font-medium text-ink-3",
                    zoom === "quarter" ? "pb-4 pt-2" : "py-2",
                    i > 0 && "hairline-l",
                  )}
                >
                  {column.label}
                </div>
              ))}
              {zoom === "quarter" && gridlines.map((line) => (
                <span
                  key={line.key}
                  className="pointer-events-none absolute bottom-[3px] -translate-x-1/2 text-[10.5px] text-ink-4 tnum"
                  style={{ left: `${line.left}%` }}
                >
                  {line.label}
                </span>
              ))}
              {todayLeft != null && (
                <span
                  className="absolute top-1.5 z-[2] -translate-x-1/2 rounded-full bg-accent px-1.5 py-[1px] text-[10.5px] font-medium text-accent-ink"
                  style={{ left: `${todayLeft}%` }}
                >
                  Today
                </span>
              )}
            </div>
          </div>

          {visible.length === 0 ? (
            <EmptyState
              icon={CalendarRange}
              title={`Nothing scheduled in ${heading}`}
              description="Goals appear here once they have a start and an end date. Open a goal to give it a range, or step to another period."
            />
          ) : (
            <div className="relative">
              {/* gridlines sit under the bars */}
              <div className="pointer-events-none absolute inset-y-0 left-[212px] right-0">
                {gridlines.map((line) => (
                  <div
                    key={line.key}
                    className="absolute inset-y-0 w-px bg-line"
                    style={{ left: `${line.left}%` }}
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
                const summary = [
                  HORIZON_LABEL[bar.goal.horizon],
                  formatGoalRange(bar.goal),
                  pct(bar.progress),
                  stats.subtreeTotal ? `${stats.subtreeDone}/${stats.subtreeTotal} tasks` : null,
                  stats.milestoneTotal ? `${stats.milestoneDone}/${stats.milestoneTotal} milestones` : null,
                ].filter(Boolean).join(" · ");

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
                      {(() => {
                        const kind = stats.overdue ? "overdue" : stats.needsCheckIn ? "checkin" : stats.stalled ? "stalled" : null;
                        if (!kind) return null;
                        const Icon = ATTENTION_ICON[kind];
                        return (
                          <Icon
                            className={cn("size-3 shrink-0", kind === "overdue" ? "text-danger" : "text-ink-4")}
                          />
                        );
                      })()}
                      <span className="shrink-0 text-[11px] text-ink-3 tnum">{pct(bar.progress)}</span>
                    </button>

                    <div className="relative flex-1 py-1.5">
                      <button
                        onClick={() => onOpen(bar.goal.id)}
                        title={`${bar.goal.title || "Untitled goal"} — ${summary}`}
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

                      {bar.milestones.map(({ milestone, left }) => (
                        <MilestoneMark
                          key={milestone.id}
                          milestone={milestone}
                          tint={`tint-${bar.goal.color}`}
                          left={left}
                          title={`${milestone.title || "Milestone"} — ${formatDate(milestone.date as string, { weekday: false })}${milestone.done ? " · reached" : ""}`}
                        />
                      ))}
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
        <Fold
          id="goal-timeline-undated"
          className="mt-6"
          label="Not on the calendar"
          summary={`${undated.length} ${undated.length === 1 ? "goal has" : "goals have"} no dates`}
          open={loose.open}
          onToggle={loose.toggle}
        >
          <p className="mb-2 text-[12.5px] leading-relaxed text-ink-3">
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
        </Fold>
      )}
    </div>
  );
}
