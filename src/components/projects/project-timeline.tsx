"use client";

import * as React from "react";
import { CalendarRange, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import {
  addDays, addMonths, diffDays, endOfMonth, formatDate, monthName, startOfMonth,
  startOfWeek, todayISO, weekNumber, yearOf,
} from "@/lib/date";
import type { Project, Task } from "@/lib/types";
import { Button, EmptyState, IconButton, Segmented } from "@/components/ui/primitives";
import { Fold, useFold } from "./fold";
import { ProjectDot } from "./project-card";
import {
  formatRange, pct, STATUS_LABEL, type ProjectIndex,
} from "./project-model";

const ROW_CAP = 60;

type Zoom = "year" | "quarter";

const ZOOM_OPTIONS = [
  { value: "year" as const, label: "Year", title: "Twelve months at a glance" },
  { value: "quarter" as const, label: "Quarter", title: "Thirteen weeks, week by week" },
];

function quarterStart(iso: string): string {
  const month = new Date(`${iso}T12:00:00`).getMonth();
  return `${yearOf(iso)}-${String(Math.floor(month / 3) * 3 + 1).padStart(2, "0")}-01`;
}

function quarterEnd(iso: string): string {
  return endOfMonth(addMonths(quarterStart(iso), 2));
}

interface Bar {
  project: Project;
  left: number;
  width: number;
  clippedStart: boolean;
  clippedEnd: boolean;
  progress: number;
  milestones: { task: Task; left: number }[];
}

interface Column { key: string; label: string; width: number }

/**
 * Every dated project as a bar, with its milestones marked on it. Where the
 * bars stack up in one month, that month is overcommitted — which is the only
 * question this view exists to answer.
 */
export function ProjectTimeline({
  projects, index, openId, onOpen,
}: {
  projects: Project[];
  index: ProjectIndex;
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
    ? `Q${Math.floor(new Date(`${range.start}T12:00:00`).getMonth() / 3) + 1} ${yearOf(range.start)}`
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

  const { bars, undated } = React.useMemo(() => {
    const rows: Bar[] = [];
    const noDates: Project[] = [];

    for (const project of projects) {
      const stats = index.stats(project.id);
      const start = stats.start ?? stats.end;
      const end = stats.end ?? stats.start;
      if (!start || !end) { noDates.push(project); continue; }
      if (end < range.start || start > range.end) continue;

      const from = start < range.start ? range.start : start;
      const to = end > range.end ? range.end : end;
      rows.push({
        project,
        left: offset(from),
        width: Math.max(((diffDays(to, from) + 1) / totalDays) * 100, 0.7),
        clippedStart: start < range.start,
        clippedEnd: end > range.end,
        progress: project.status === "done" ? 1 : stats.progress,
        milestones: stats.milestones
          .filter((m) => m.date && m.date >= range.start && m.date <= range.end)
          .map((task) => ({ task, left: offset(task.date as string) })),
      });
    }

    rows.sort((a, b) =>
      a.left - b.left || a.project.name.localeCompare(b.project.name));

    return { bars: rows, undated: noDates };
  }, [projects, index, range.start, range.end, offset, totalDays]);

  const visible = showAll ? bars : bars.slice(0, ROW_CAP);
  const todayLeft = today >= range.start && today <= range.end ? offset(today) : null;
  const milestoneCount = bars.reduce((sum, b) => sum + b.milestones.length, 0);

  function stepBy(direction: 1 | -1) {
    setAnchor((current) => addMonths(current, (zoom === "quarter" ? 3 : 12) * direction));
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <span className="display-serif text-[32px] leading-none text-ink tnum">{heading}</span>
          <span className="text-[12.5px] text-ink-3 tnum">
            {bars.length} {bars.length === 1 ? "project" : "projects"}
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
          <div className="flex hairline-b">
            <div className="w-[212px] shrink-0 px-3 py-2 hairline-r">
              <span className="text-[11.5px] font-medium text-ink-4">Project</span>
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
              description="A project lands here once it has dates — its own, or the first and last task inside it. Open one to give it a range, or step to another period."
            />
          ) : (
            <div className="relative">
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
                    <span className="absolute left-1/2 top-0 size-1.5 -translate-x-1/2 rounded-full bg-accent" />
                  </div>
                )}
              </div>

              {visible.map((bar) => {
                const stats = index.stats(bar.project.id);
                const summary = [
                  STATUS_LABEL[bar.project.status],
                  formatRange(stats.start, stats.end),
                  stats.total ? `${stats.done} of ${stats.total} tasks` : "no tasks",
                  pct(bar.progress),
                ].filter(Boolean).join(" · ");

                return (
                  <div
                    key={bar.project.id}
                    className={cn(
                      "relative flex items-stretch transition-colors duration-150 hover:bg-hover",
                      bar.project.id === openId && "bg-selected",
                    )}
                  >
                    <button
                      onClick={() => onOpen(bar.project.id)}
                      className="flex w-[212px] shrink-0 cursor-pointer items-center gap-1.5 px-3 py-1.5 text-left hairline-r"
                    >
                      <ProjectDot project={bar.project} />
                      <span
                        className={cn(
                          "min-w-0 flex-1 truncate text-[12.5px]",
                          bar.project.status === "done" ? "text-ink-3" : "text-ink",
                        )}
                      >
                        {bar.project.name || "Untitled project"}
                      </span>
                      <span className="shrink-0 text-[11px] text-ink-3 tnum">{pct(bar.progress)}</span>
                    </button>

                    <div className="relative flex-1 py-1.5">
                      <button
                        onClick={() => onOpen(bar.project.id)}
                        title={`${bar.project.name || "Untitled project"} — ${summary}`}
                        style={{ left: `${bar.left}%`, width: `${bar.width}%` }}
                        className={cn(
                          `tint-${bar.project.color}`,
                          "absolute top-1/2 h-[17px] -translate-y-1/2 cursor-pointer overflow-hidden rounded-full",
                          "bg-[var(--tint-soft)] transition-[filter] duration-150",
                          "hover:brightness-95 dark:hover:brightness-110",
                          bar.clippedStart && "rounded-l-[3px]",
                          bar.clippedEnd && "rounded-r-[3px]",
                          bar.project.status === "dropped" && "opacity-50",
                        )}
                      >
                        <span
                          className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-500 ease-[var(--ease-out-apple)]"
                          style={{ width: `${Math.max(bar.progress * 100, 0)}%`, background: "var(--tint)" }}
                        />
                      </button>

                      {bar.milestones.map(({ task, left }) => (
                        <span
                          key={task.id}
                          title={`${task.title || "Milestone"} — ${formatDate(task.date as string, { weekday: false })}${task.status === "done" ? " · reached" : ""}`}
                          style={{ left: `${left}%` }}
                          className={cn(
                            `tint-${bar.project.color}`,
                            "pointer-events-none absolute top-1/2 z-[1] size-[9px] -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[2px] border",
                            task.status === "done"
                              ? "border-transparent bg-[var(--tint-ink)]"
                              : "border-[var(--tint-ink)] bg-raised",
                          )}
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
          id="project-timeline-undated"
          className="mt-6"
          label="Not on the calendar"
          summary={`${undated.length} ${undated.length === 1 ? "project has" : "projects have"} no dates`}
          open={loose.open}
          onToggle={loose.toggle}
        >
          <p className="mb-2 max-w-[640px] text-[12.5px] leading-relaxed text-ink-3">
            These have neither their own dates nor a dated task inside them, so they cannot
            overlap with anything. Open one to give it a range.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {undated.map((project) => (
              <button
                key={project.id}
                onClick={() => onOpen(project.id)}
                className={cn(
                  "inline-flex max-w-[260px] cursor-pointer items-center gap-1.5 rounded-full border border-line",
                  "bg-raised px-2.5 py-1 text-[12.5px] text-ink transition-colors duration-150 hover:bg-hover",
                )}
              >
                <ProjectDot project={project} />
                <span className="truncate">{project.name || "Untitled project"}</span>
                <span className="shrink-0 text-[11px] text-ink-4">{STATUS_LABEL[project.status]}</span>
              </button>
            ))}
          </div>
        </Fold>
      )}
    </div>
  );
}
