"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import {
  dayNumber, formatDate, isSameMonth, monthGrid, monthName,
  startOfMonth, todayISO, weekdayHeaders, yearOf,
} from "@/lib/date";
import type { Task, Tint } from "@/lib/types";
import { Button } from "@/components/ui/primitives";
import { VisuallyHidden } from "@/components/ui/form";
import type { ReadDay } from "./pace";

const MONTHS_SHOWN = 3;

type DayState = "done" | "missed" | "today" | "planned" | "logged" | "idle";

interface Cell {
  iso: string;
  state: DayState;
  task: Task | null;
  pages: number;
}

const STATE_WORD: Record<DayState, string> = {
  done: "read",
  missed: "missed",
  today: "due today",
  planned: "planned",
  logged: "read off-plan",
  idle: "no reading",
};

function nextMonth(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
}

/**
 * The plan as a calendar rather than a list: every scheduled day for one book,
 * filled in as it is read. Clicking a scheduled day ticks its block, which is
 * the same thing the row list does — so the strip is a shortcut, not a
 * keyboard dead end.
 */
export function BookCalendarStrip({
  blocks, readDays, tint, weekStart, onToggle, className,
}: {
  blocks: Task[];
  readDays: ReadDay[];
  tint: Tint;
  weekStart: number;
  onToggle: (task: Task) => void;
  className?: string;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const today = todayISO();

  const { months, cells, counts } = React.useMemo(() => {
    const byDate = new Map<string, Task>();
    for (const t of blocks) {
      if (!t.date) continue;
      // Two blocks on one day: the unfinished one is the actionable one.
      const seen = byDate.get(t.date);
      if (!seen || (seen.status === "done" && t.status !== "done")) byDate.set(t.date, t);
    }

    const read = new Map(readDays.map((d) => [d.date, d.pages]));
    const dates = [...new Set([...byDate.keys(), ...read.keys()])].sort();

    const map = new Map<string, Cell>();
    for (const iso of dates) {
      const task = byDate.get(iso) ?? null;
      const pages = read.get(iso) ?? 0;
      let state: DayState;
      if (task?.status === "done" || (!task && pages > 0)) state = task ? "done" : "logged";
      else if (!task) state = "idle";
      else if (iso === today) state = "today";
      else if (iso < today) state = "missed";
      else state = "planned";
      map.set(iso, { iso, state, task, pages });
    }

    const monthList: string[] = [];
    if (dates.length) {
      let cursor = startOfMonth(dates[0]);
      const last = startOfMonth(dates[dates.length - 1]);
      let guard = 0;
      while (cursor <= last && guard++ < 48) {
        monthList.push(cursor);
        cursor = nextMonth(cursor);
      }
    }

    const tally = { done: 0, missed: 0, planned: 0, logged: 0 };
    for (const c of map.values()) {
      if (c.state === "done") tally.done++;
      else if (c.state === "missed") tally.missed++;
      else if (c.state === "planned" || c.state === "today") tally.planned++;
      else if (c.state === "logged") tally.logged++;
    }

    return { months: monthList, cells: map, counts: tally };
  }, [blocks, readDays, today]);

  const headers = React.useMemo(() => weekdayHeaders(weekStart, "min"), [weekStart]);
  const summaryId = React.useId();

  if (!months.length) return null;

  const visible = expanded ? months : months.slice(0, MONTHS_SHOWN);
  const summary =
    `${counts.done + counts.logged} of ${counts.done + counts.logged + counts.planned + counts.missed} reading days done`
    + (counts.missed ? `, ${counts.missed} missed` : "")
    + (counts.planned ? `, ${counts.planned} still ahead` : "")
    + ".";

  return (
    <div className={cn(`tint-${tint}`, className)} aria-describedby={summaryId}>
      <VisuallyHidden id={summaryId}>{summary}</VisuallyHidden>

      <div className="flex flex-wrap gap-x-5 gap-y-4">
        {visible.map((monthStart) => (
          <div key={monthStart} className="w-[196px]">
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">
              {monthName(monthStart, true)}
              {yearOf(monthStart) !== yearOf(today) && (
                <span className="ml-1 text-ink-4 tnum">{yearOf(monthStart)}</span>
              )}
            </p>

            <div className="grid grid-cols-7">
              {headers.map((h, i) => (
                <span key={i} className="grid h-4 place-items-center text-[10.5px] font-medium text-ink-4">
                  {h}
                </span>
              ))}

              {monthGrid(monthStart, weekStart).map((iso) => {
                if (!isSameMonth(iso, monthStart)) return <span key={iso} className="size-7" />;
                const cell = cells.get(iso);
                return (
                  <DayCell
                    key={iso}
                    iso={iso}
                    cell={cell}
                    isToday={iso === today}
                    onToggle={onToggle}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {months.length > MONTHS_SHOWN && (
        <Button size="sm" variant="ghost" className="mt-2" onClick={() => setExpanded((v) => !v)}>
          {expanded ? "Show fewer months" : `Show all ${months.length} months`}
        </Button>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-3">
        <Legend swatch="done" label={`${counts.done + counts.logged} read`} />
        {counts.missed > 0 && <Legend swatch="missed" label={`${counts.missed} missed`} />}
        {counts.planned > 0 && <Legend swatch="planned" label={`${counts.planned} ahead`} />}
      </div>
    </div>
  );
}

function Legend({ swatch, label }: { swatch: "done" | "missed" | "planned"; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 tnum">
      <span
        aria-hidden
        className={cn(
          "size-2.5 rounded-[3px]",
          swatch === "missed" && "border border-dashed border-warn",
          swatch === "planned" && "border border-line-strong",
        )}
        style={swatch === "done"
          ? { background: "var(--tint-soft)", boxShadow: "inset 0 0 0 1px var(--tint)" }
          : undefined}
      />
      {label}
    </span>
  );
}

function DayCell({
  iso, cell, isToday, onToggle,
}: {
  iso: string;
  cell: Cell | undefined;
  isToday: boolean;
  onToggle: (task: Task) => void;
}) {
  const state = cell?.state ?? "idle";
  const n = dayNumber(iso);

  const box = cn(
    "grid size-7 place-items-center rounded-[6px] text-[11.5px] tnum",
    "transition-[background-color,color,box-shadow,transform] duration-150 ease-[var(--ease-out-apple)]",
    isToday && "ring-1 ring-accent ring-offset-1 ring-offset-[var(--canvas)]",
    state === "missed" && "border border-dashed border-warn text-warn",
    (state === "planned" || state === "today") && "border border-line-strong text-ink-2",
    state === "idle" && "text-ink-4",
  );

  // tint-soft + tint-ink is the pair the kit already trusts for contrast in
  // both themes; a white numeral on a raw tint fails on amber.
  const filled = state === "done" || state === "logged";
  const style = filled
    ? { background: "var(--tint-soft)", color: "var(--tint-ink)" }
    : undefined;

  if (!cell?.task) {
    return (
      <span
        className={cn(box, filled && "font-semibold")}
        style={style}
        title={filled ? `${formatDate(iso)} · ${cell?.pages ?? 0} pages read` : undefined}
      >
        {n}
      </span>
    );
  }

  const task = cell.task;
  const range = task.page_from != null && task.page_to != null
    ? `p.${task.page_from}–${task.page_to}`
    : task.title;

  return (
    <button
      type="button"
      onClick={() => onToggle(task)}
      title={`${formatDate(iso)} · ${range} · ${STATE_WORD[state]}`}
      aria-pressed={state === "done"}
      aria-label={`${formatDate(iso)}, ${range}, ${STATE_WORD[state]}. ${state === "done" ? "Mark as not read" : "Mark as read"}`}
      className={cn(box, "cursor-pointer active:scale-90 hover:brightness-95 dark:hover:brightness-110",
        !filled && "hover:bg-hover", filled && "font-semibold")}
      style={style}
    >
      {n}
    </button>
  );
}
