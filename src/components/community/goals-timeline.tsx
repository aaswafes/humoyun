"use client";

import * as React from "react";
import { CalendarRange, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import {
  addDays, addMonths, diffDays, endOfMonth, formatDate, monthName, quarterOf,
  startOfMonth, startOfWeek, todayISO, weekNumber, yearOf,
} from "@/lib/date";
import { Button, EmptyState, IconButton, Segmented } from "@/components/ui/primitives";
import type { CommunityGoal, Contribution } from "./community-types";

type Zoom = "year" | "quarter";

const ZOOM_OPTIONS = [
  { value: "year" as const, label: "Year", title: "Twelve months at a glance" },
  { value: "quarter" as const, label: "Quarter", title: "Thirteen weeks, week by week" },
];

/** Quarter bounds, computed here so this file does not pull in the whole goal model. */
function quarterStart(iso: string): string {
  const q = quarterOf(iso);
  return `${yearOf(iso)}-${String((q - 1) * 3 + 1).padStart(2, "0")}-01`;
}
function quarterEnd(iso: string): string {
  return endOfMonth(addMonths(quarterStart(iso), 2));
}

function pct(fraction: number): string {
  return `${Math.round(Math.max(0, Math.min(1, fraction)) * 100)}%`;
}

interface Bar {
  goal: CommunityGoal;
  left: number;
  width: number;
  clippedStart: boolean;
  clippedEnd: boolean;
  progress: number;
  pool: number;
}

interface Column { key: string; label: string; width: number }

export function GoalsTimeline({
  goals, contributions, onEdit, onLog,
}: {
  goals: CommunityGoal[];
  contributions: Contribution[];
  onEdit: (g: CommunityGoal) => void;
  onLog: (g: CommunityGoal) => void;
}) {
  const today = todayISO();
  const weekStart = useStore((s) => s.profile?.week_start ?? 1);
  const [zoom, setZoom] = React.useState<Zoom>("year");
  const [anchor, setAnchor] = React.useState(today);

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
    ? `Q${quarterOf(range.start)} ${yearOf(range.start)}`
    : String(yearOf(range.start));

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

  const pools = React.useMemo(() => {
    const map = new Map<string, number>();
    for (const c of contributions) {
      map.set(c.goal_id, (map.get(c.goal_id) ?? 0) + Number(c.amount));
    }
    return map;
  }, [contributions]);

  /**
   * The bar runs from the goal's start date to its deadline.
   *
   * A goal with no start date falls back to the day it was set, which is the
   * only honest answer available and is deliberately a rendering choice rather
   * than a value written into the row — goals created before the column
   * existed have no real start, and inventing one in the database would be a
   * made-up fact that outlives this view.
   */
  const { bars, undated } = React.useMemo(() => {
    const rows: Bar[] = [];
    const loose: CommunityGoal[] = [];

    for (const goal of goals) {
      if (!goal.due_date) { loose.push(goal); continue; }

      const fallback = (goal.created_at || "").slice(0, 10) || goal.due_date;
      const chosen = goal.start_date ?? fallback;
      const start = chosen < goal.due_date ? chosen : goal.due_date;
      const end = goal.due_date;

      if (end < range.start || start > range.end) continue;

      const from = start < range.start ? range.start : start;
      const to = end > range.end ? range.end : end;
      const pool = pools.get(goal.id) ?? 0;
      const target = Number(goal.target) || 1;

      rows.push({
        goal,
        left: offset(from),
        width: Math.max(((diffDays(to, from) + 1) / totalDays) * 100, 1.2),
        clippedStart: start < range.start,
        clippedEnd: end > range.end,
        progress: pool / target,
        pool,
      });
    }

    rows.sort((a, b) => (a.goal.due_date ?? "").localeCompare(b.goal.due_date ?? ""));
    return { bars: rows, undated: loose };
  }, [goals, pools, offset, range.start, range.end, totalDays]);

  const todayLeft = today >= range.start && today <= range.end ? offset(today) : null;

  function stepBy(direction: 1 | -1) {
    setAnchor((current) => addMonths(current, (zoom === "quarter" ? 3 : 12) * direction));
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <span className="display-serif text-[32px] leading-none text-ink tnum">{heading}</span>
          <span className="text-[12.5px] text-ink-3 tnum">
            {bars.length} {bars.length === 1 ? "goal" : "goals"}
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
            <Button size="sm" variant="ghost" onClick={() => setAnchor(today)}>Today</Button>
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
          <div className="flex hairline-b">
            <div className="w-[240px] shrink-0 px-3 py-2 hairline-r">
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

          {bars.length === 0 ? (
            <EmptyState
              icon={CalendarRange}
              title={`Nothing due in ${heading}`}
              description="A joint goal appears here once it has a deadline. Give one a date, or step to another period."
            />
          ) : (
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-[240px] right-0">
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

              {bars.map((bar) => {
                const target = Number(bar.goal.target) || 1;
                const overdue = (bar.goal.due_date ?? "") < today && bar.pool < target;
                const summary = [
                  `${bar.pool} of ${target}${bar.goal.unit ? ` ${bar.goal.unit}` : ""}`,
                  bar.goal.start_date
                    ? `${formatDate(bar.goal.start_date, { weekday: false })} – ${formatDate(bar.goal.due_date as string, { weekday: false })}`
                    : `due ${formatDate(bar.goal.due_date as string, { weekday: false })}`,
                  pct(bar.progress),
                ].join(" · ");

                return (
                  <div
                    key={bar.goal.id}
                    className="relative flex items-stretch transition-colors duration-150 hover:bg-hover"
                  >
                    <div className="flex w-[240px] shrink-0 items-center gap-1.5 px-3 py-1.5 hairline-r">
                      <span
                        className={cn(`tint-${bar.goal.color}`, "size-2.5 shrink-0 rounded-full")}
                        style={{ background: "var(--tint)" }}
                        aria-hidden
                      />
                      <button
                        onClick={() => onEdit(bar.goal)}
                        title={`${bar.goal.title || "Untitled goal"} — ${summary}`}
                        className="min-w-0 flex-1 cursor-pointer truncate text-left text-[12.5px] text-ink"
                      >
                        {bar.goal.title || "Untitled goal"}
                      </button>
                      <span
                        className={cn("shrink-0 text-[11px] tnum", overdue ? "text-danger" : "text-ink-3")}
                      >
                        {pct(bar.progress)}
                      </span>
                      <IconButton
                        label={`Log progress on ${bar.goal.title || "goal"}`}
                        size="sm"
                        onClick={() => onLog(bar.goal)}
                      >
                        <Plus />
                      </IconButton>
                    </div>

                    <div className="relative flex-1 py-1.5">
                      <button
                        onClick={() => onLog(bar.goal)}
                        title={`${bar.goal.title || "Untitled goal"} — ${summary}`}
                        style={{ left: `${bar.left}%`, width: `${bar.width}%` }}
                        className={cn(
                          `tint-${bar.goal.color}`,
                          "absolute top-1/2 h-[17px] -translate-y-1/2 cursor-pointer overflow-hidden rounded-full",
                          "bg-[var(--tint-soft)]",
                          "transition-[filter] duration-150 hover:brightness-95 dark:hover:brightness-110",
                          bar.clippedStart && "rounded-l-[3px]",
                          bar.clippedEnd && "rounded-r-[3px]",
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

      {/* A goal with no deadline cannot be drawn, and hiding it is how it gets
          forgotten — so it is listed, and the chip is the way to give it a date. */}
      {undated.length > 0 && (
        <section className="mt-6">
          <p className="text-[11px] uppercase tracking-[0.06em] text-ink-3">Not on the calendar</p>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-3">
            {undated.length === 1 ? "This one has" : `These ${undated.length} have`} no deadline,
            so {undated.length === 1 ? "it does" : "they do"} not appear above. Open one to give it a date.
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {undated.map((goal) => (
              <button
                key={goal.id}
                onClick={() => onEdit(goal)}
                className={cn(
                  `tint-${goal.color}`,
                  "inline-flex max-w-[260px] cursor-pointer items-center gap-1.5 rounded-full border border-line",
                  "bg-raised px-2.5 py-1 text-[12.5px] text-ink transition-colors duration-150 hover:bg-hover",
                )}
              >
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ background: "var(--tint)" }}
                  aria-hidden
                />
                <span className="truncate">{goal.title || "Untitled goal"}</span>
                <span className="shrink-0 text-[11px] text-ink-4 tnum">
                  {pools.get(goal.id) ?? 0}/{Number(goal.target)}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
