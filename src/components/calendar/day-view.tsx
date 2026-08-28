"use client";

import * as React from "react";
import { useDroppable } from "@dnd-kit/core";
import { ArrowDownToLine, Clock, Sun, Timer } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  addDays, dayName, dayNumber, formatDuration, formatTime, friendlyDate,
  monthName, todayISO, yearOf,
} from "@/lib/date";
import { completionOn, focusMinutesOn, useStore } from "@/lib/store";
import type { Task } from "@/lib/types";
import { Button, Progress, SectionLabel } from "@/components/ui/primitives";
import { TaskList } from "@/components/tasks/task-list";
import { TimeGrid } from "./time-grid";
import { DAY_MIN, isTimed, spanOf, workHoursOf, type DropPreview } from "./calendar-utils";

/** Minutes of the working window that already have a block on them. */
function busyInWindow(timed: Task[], from: number, to: number): number {
  const spans = timed
    .map(spanOf)
    .map((s) => ({ start: Math.max(s.start, from), end: Math.min(s.end, to) }))
    .filter((s) => s.end > s.start)
    .sort((a, b) => a.start - b.start);

  let total = 0;
  let cursor = -1;
  for (const s of spans) {
    const start = Math.max(s.start, cursor);
    if (s.end > start) total += s.end - start;
    cursor = Math.max(cursor, s.end);
  }
  return total;
}

function Stat({
  icon: Icon, label, value, hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="flex items-baseline gap-2 py-[3px]">
      <Icon className="size-3 shrink-0 translate-y-[2px] text-ink-4" aria-hidden />
      <span className="text-[12px] text-ink-3">{label}</span>
      <span className="ml-auto text-[12px] font-medium text-ink tnum">{value}</span>
      {hint && <span className="text-[11px] text-ink-4 tnum">{hint}</span>}
    </div>
  );
}

export function DayView({
  date, hour12, preview,
}: {
  date: string;
  hour12: boolean;
  preview: DropPreview | null;
}) {
  const tasks = useStore((s) => s.tasks);
  const profile = useStore((s) => s.profile);
  const sessions = useStore((s) => s.focusSessions);
  const moveTask = useStore((s) => s.moveTask);
  const patch = useStore((s) => s.patch);
  const toast = useStore((s) => s.toast);

  const { setNodeRef, isOver } = useDroppable({
    id: `dayside:${date}`,
    data: { type: "day", date },
  });

  const onDay = React.useMemo(
    () => tasks.filter((t) => t.date === date && !t.parent_id),
    [tasks, date],
  );
  const untimed = React.useMemo(
    () => onDay.filter((t) => !isTimed(t)).sort((a, b) => a.order_index - b.order_index),
    [onDay],
  );
  const timed = React.useMemo(() => onDay.filter(isTimed), [onDay]);

  const { done, total } = React.useMemo(() => completionOn(tasks, date), [tasks, date]);
  const work = React.useMemo(() => workHoursOf(profile), [profile]);

  const load = React.useMemo(() => {
    const spans = timed.map(spanOf);
    const scheduled = spans.reduce((n, s) => n + (s.end - s.start), 0);
    const busy = busyInWindow(timed, work.start, work.end);
    return {
      scheduled,
      free: Math.max(0, work.end - work.start - busy),
      first: spans.length ? Math.min(...spans.map((s) => s.start)) : null,
      last: spans.length ? Math.max(...spans.map((s) => s.end)) : null,
    };
  }, [timed, work]);

  const focusMin = React.useMemo(() => focusMinutesOn(sessions, date), [sessions, date]);

  // Yesterday's loose ends are the most common thing a day starts with.
  const carryOver = React.useMemo(() => {
    const prev = addDays(date, -1);
    return tasks.filter(
      (t) => t.date === prev && !t.parent_id && t.status !== "done" && t.status !== "dropped",
    );
  }, [tasks, date]);

  function pullCarryOver() {
    const snapshot = carryOver.map((t) => ({
      id: t.id, date: t.date, start_min: t.start_min, end_min: t.end_min, all_day: t.all_day,
    }));
    carryOver.forEach((t) => moveTask(t.id, date, isTimed(t) ? t.start_min : undefined));
    toast({
      title: `${snapshot.length} ${snapshot.length === 1 ? "task" : "tasks"} carried over`,
      description: `Moved to ${friendlyDate(date).toLowerCase()}.`,
      tone: "success",
      action: {
        label: "Undo",
        run: () => snapshot.forEach((prev) => patch("tasks", prev.id, prev)),
      },
    });
  }

  const previewed = preview?.dates.includes(date) ?? false;
  const isToday = date === todayISO();

  return (
    <div className="flex min-h-0 flex-1 gap-5">
      <aside
        ref={setNodeRef}
        className={cn(
          "flex w-[236px] shrink-0 flex-col overflow-y-auto rounded-lg pr-1 transition-colors duration-150",
          previewed && !isOver && "bg-accent-soft",
          isOver && "bg-accent-soft ring-1 ring-accent-line",
        )}
      >
        <div className="pt-1">
          <p
            className={cn(
              "text-[11px] font-semibold uppercase tracking-[0.06em]",
              isToday ? "text-accent" : "text-ink-3",
            )}
          >
            {dayName(date)}
          </p>
          <div className="flex items-baseline gap-2">
            <span className="display-serif text-[44px] leading-[1.05] text-ink tnum">
              {dayNumber(date)}
            </span>
            <span className="text-[13px] text-ink-2">
              {monthName(date)} <span className="text-ink-3 tnum">{yearOf(date)}</span>
            </span>
          </div>
        </div>

        <div className="mt-4">
          <div className="mb-1.5 flex items-baseline justify-between">
            <SectionLabel>Progress</SectionLabel>
            <span className="text-[12px] text-ink-2 tnum">
              {done}<span className="text-ink-4">/{total}</span>
              {total > 0 && (
                <span className="ml-1.5 text-ink-4">{Math.round((done / total) * 100)}%</span>
              )}
            </span>
          </div>
          <Progress value={done} max={Math.max(1, total)} height={4} />
        </div>

        <div className="mt-5">
          <SectionLabel className="mb-1">Load</SectionLabel>
          <Stat
            icon={Clock}
            label="Scheduled"
            value={formatDuration(load.scheduled)}
            hint={timed.length ? `${timed.length} ${timed.length === 1 ? "block" : "blocks"}` : undefined}
          />
          <Stat
            icon={Sun}
            label="Free in work hours"
            value={formatDuration(load.free)}
            hint={`of ${formatDuration(work.end - work.start)}`}
          />
          {load.first != null && load.last != null && (
            <Stat
              icon={Clock}
              label="First to last"
              value={`${formatTime(load.first, hour12)} – ${formatTime(Math.min(load.last, DAY_MIN), hour12)}`}
            />
          )}
          {focusMin > 0 && <Stat icon={Timer} label="Focused" value={formatDuration(focusMin)} />}
        </div>

        {carryOver.length > 0 && (
          <div className="mt-4 rounded-lg border border-line bg-raised p-2">
            <p className="text-[12px] leading-snug text-ink-2">
              {carryOver.length} unfinished {carryOver.length === 1 ? "task" : "tasks"} on{" "}
              {friendlyDate(addDays(date, -1)).toLowerCase()}.
            </p>
            <Button size="sm" className="mt-1.5 w-full" onClick={pullCarryOver}>
              <ArrowDownToLine className="size-3.5" />
              Bring {carryOver.length === 1 ? "it" : "them"} across
            </Button>
          </div>
        )}

        <div className="mt-6 min-h-0 flex-1">
          <div className="mb-1.5 flex items-baseline justify-between">
            <SectionLabel>Unscheduled</SectionLabel>
            {untimed.length > 0 && (
              <span className="text-[11px] text-ink-4 tnum">{untimed.length}</span>
            )}
          </div>
          <TaskList
            tasks={untimed}
            sortable={false}
            composer
            composerDate={date}
            emptyDescription="Nothing without a time yet."
          />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <TimeGrid dates={[date]} hour12={hour12} allDay="none" header={false} salah preview={preview} />
      </div>
    </div>
  );
}
