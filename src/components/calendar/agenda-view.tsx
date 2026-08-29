"use client";

import * as React from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { CalendarDays, ChevronRight, GripVertical, Plus } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  dayNameOf, dayNumber, formatDate, formatDuration, friendlyDate, startOfWeek,
  todayISO, weekday, yearOf,
} from "@/lib/date";
import { overdueTasks, useStore } from "@/lib/store";
import type { Task } from "@/lib/types";
import { Button, EmptyState, IconButton } from "@/components/ui/primitives";
import { VisuallyHidden } from "@/components/ui/form";
import { TaskRow } from "@/components/tasks/task-row";
import { InlineComposer } from "@/components/tasks/task-list";
import { openQuickAdd } from "@/components/shell/quick-add";
import { bucketByDate, isTimed, spanOf, weekSummary, type DropPreview } from "./calendar-utils";

const PAGE = 25;
const OVERDUE_PAGE = 12;

// The two sticky levels have to agree on a height or the day header slides
// under the week header instead of stacking beneath it.
const WEEK_H = 30;

function DraggableRow({ task }: { task: Task }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `task:${task.id}`,
    data: { type: "task", taskId: task.id },
  });

  return (
    <div ref={setNodeRef} className={cn("transition-opacity duration-150", isDragging && "opacity-30")}>
      <TaskRow
        task={task}
        dragHandle={
          <button
            type="button"
            {...attributes}
            {...listeners}
            aria-label={`Drag ${task.title || "task"} to another day`}
            title="Drag to another day — or use the row menu to pick a date"
            className={cn(
              "grid size-7 cursor-grab place-items-center rounded text-ink-4",
              "transition-colors hover:text-ink-2 active:cursor-grabbing [&_svg]:size-3.5",
            )}
          >
            <GripVertical />
          </button>
        }
      />
    </div>
  );
}

/** Minutes a day has actually booked, timed blocks and estimates alike. */
function dayMinutes(tasks: Task[]): number {
  let total = 0;
  for (const t of tasks) {
    if (t.status === "dropped") continue;
    if (isTimed(t)) {
      const { start, end } = spanOf(t);
      total += end - start;
    } else if (t.duration_min) {
      total += t.duration_min;
    }
  }
  return total;
}

// ---------------------------------------------------------
// Week boundary — the shape of the seven days about to arrive
// ---------------------------------------------------------
function WeekHeader({ weekStartDate, byDate }: { weekStartDate: string; byDate: Map<string, Task[]> }) {
  const setSelectedDate = useStore((s) => s.setSelectedDate);
  const today = todayISO();
  const summary = React.useMemo(() => weekSummary(byDate, weekStartDate), [byDate, weekStartDate]);
  const peak = Math.max(1, ...summary.perDay.map((d) => d.total));

  const description =
    `Week ${summary.week}, ${formatDate(summary.start, { weekday: false })} to ` +
    `${formatDate(summary.end, { weekday: false })}: ${summary.total} items, ${summary.done} done, ` +
    `${formatDuration(summary.minutes)} booked.`;

  return (
    <div
      className="sticky top-0 z-20 flex items-center gap-2.5 px-1 py-1 bg-canvas hairline-b"
      style={{ height: WEEK_H }}
    >
      <span className="text-[11.5px] font-medium text-ink-3 tnum">
        Week {summary.week}
      </span>
      <span className="text-[11.5px] text-ink-4 tnum">
        {formatDate(summary.start, { weekday: false })} – {formatDate(summary.end, { weekday: false })}
      </span>

      <div className="ml-auto flex items-end gap-[3px]" role="group" aria-label="Load per day">
        {summary.perDay.map((d) => (
          <button
            key={d.date}
            type="button"
            onClick={() => setSelectedDate(d.date)}
            aria-label={`${dayNameOf(weekday(d.date), "long")} ${dayNumber(d.date)}, ${d.total} ${d.total === 1 ? "item" : "items"}`}
            title={`${dayNameOf(weekday(d.date), "long")} — ${d.done}/${d.total} done`}
            className="flex h-7 w-4 cursor-pointer flex-col justify-end rounded-[4px] p-[2px] transition-colors hover:bg-hover"
          >
            <span
              className={cn(
                "w-full rounded-[2px]",
                d.total === 0 ? "bg-line" : d.date === today ? "bg-accent" : "bg-ink-4",
              )}
              style={{ height: 3 + Math.round((d.total / peak) * 13) }}
            />
          </button>
        ))}
      </div>

      {/* The days below each carry their own count; the week only adds up the
          hours. The full roll-up is in the description. */}
      <span className="text-[11.5px] text-ink-4 tnum" aria-hidden>
        {formatDuration(summary.minutes)}
      </span>
      <VisuallyHidden>{description}</VisuallyHidden>
    </div>
  );
}

// ---------------------------------------------------------
// One day
// ---------------------------------------------------------
function DayGroup({
  date, tasks, previewed,
}: {
  date: string;
  tasks: Task[];
  previewed: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `day:${date}`, data: { type: "day", date } });
  const [adding, setAdding] = React.useState(false);
  const today = todayISO();
  const isToday = date === today;
  const done = tasks.filter((t) => t.status === "done").length;
  const minutes = React.useMemo(() => dayMinutes(tasks), [tasks]);
  // "Friday" and "5 Sep" are two ways of saying the same day; the second only
  // earns its place when the first is a relative word, or the year differs.
  const friendly = friendlyDate(date);
  const showDate = friendly !== formatDate(date) || yearOf(date) !== yearOf(today);

  return (
    <section
      ref={setNodeRef}
      data-day-cell={date}
      className={cn(
        "rounded-lg transition-colors duration-150",
        previewed && !isOver && "bg-accent-soft",
        isOver && "bg-accent-soft ring-1 ring-accent-line",
      )}
    >
      <header
        className="sticky z-10 flex items-baseline gap-2.5 px-1 py-2 bg-canvas hairline-b"
        style={{ top: WEEK_H }}
      >
        <span
          className={cn(
            "grid h-[26px] min-w-[26px] place-items-center rounded-full px-1 text-[17px] leading-none display-serif tnum",
            isToday ? "bg-accent text-accent-ink" : "text-ink",
          )}
        >
          {dayNumber(date)}
        </span>
        <span className="text-[13.5px] font-semibold tracking-[-0.01em] text-ink">
          {friendly}
        </span>
        {showDate && (
          <span className="text-[12px] text-ink-3 tnum">
            {formatDate(date, { weekday: false, year: yearOf(date) !== yearOf(today) })}
          </span>
        )}
        {minutes > 0 && (
          <span className="text-[11.5px] text-ink-4 tnum">{formatDuration(minutes)}</span>
        )}
        <span className="ml-auto text-[11.5px] text-ink-3 tnum">
          {done}<span className="text-ink-4">/{tasks.length}</span>
        </span>
        <IconButton
          label={`Add a task on ${formatDate(date)}`}
          size="md"
          onClick={() => setAdding(true)}
        >
          <Plus />
        </IconButton>
      </header>

      <div className="py-1 pl-5 pr-1">
        {tasks.map((task) => <DraggableRow key={task.id} task={task} />)}
        {adding && (
          <InlineComposer
            date={date}
            autoFocus
            placeholder={`Add to ${friendlyDate(date).toLowerCase()}`}
            className="mt-0.5"
          />
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------
// Agenda
// ---------------------------------------------------------
export function AgendaView({ anchor, preview }: { anchor: string; preview: DropPreview | null }) {
  const tasks = useStore((s) => s.tasks);
  const weekStart = useStore((s) => s.profile?.week_start ?? 1);
  const moveTask = useStore((s) => s.moveTask);
  const patch = useStore((s) => s.patch);
  const toast = useStore((s) => s.toast);
  // Paging is scoped to the date we started from, so jumping months resets it
  // without an effect having to reach in and clear it.
  const [paging, setPaging] = React.useState({ anchor, limit: PAGE });
  const [overdueLimit, setOverdueLimit] = React.useState(OVERDUE_PAGE);
  const limit = paging.anchor === anchor ? paging.limit : PAGE;
  const today = todayISO();

  const byDate = React.useMemo(() => bucketByDate(tasks), [tasks]);

  const groups = React.useMemo(
    () => [...byDate.entries()]
      .filter(([date]) => date >= anchor)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, list]) => ({ date, tasks: list })),
    [byDate, anchor],
  );

  const overdue = React.useMemo(
    () => (anchor <= today ? overdueTasks(tasks, today) : []),
    [tasks, anchor, today],
  );

  const previewSet = React.useMemo(() => new Set(preview?.dates ?? []), [preview]);
  const shown = React.useMemo(() => groups.slice(0, limit), [groups, limit]);

  // Weeks own their days, so the week header's sticky range ends where the week
  // does instead of riding along over every week that follows.
  const weeks = React.useMemo(() => {
    const out: { start: string; days: { date: string; tasks: Task[] }[] }[] = [];
    for (const group of shown) {
      const start = startOfWeek(group.date, weekStart);
      const last = out[out.length - 1];
      if (last && last.start === start) last.days.push(group);
      else out.push({ start, days: [group] });
    }
    return out;
  }, [shown, weekStart]);

  function pullOverdue() {
    const snapshot = overdue.map((t) => ({
      id: t.id, date: t.date, start_min: t.start_min, end_min: t.end_min, all_day: t.all_day,
    }));
    overdue.forEach((t) => moveTask(t.id, today, isTimed(t) ? t.start_min : undefined));
    toast({
      title: `${snapshot.length} ${snapshot.length === 1 ? "task" : "tasks"} moved to today`,
      tone: "success",
      action: {
        label: "Undo",
        run: () => snapshot.forEach((prev) => patch("tasks", prev.id, prev)),
      },
    });
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto border-t border-line">
      <div className="mx-auto max-w-[720px] pb-10">
        {overdue.length > 0 && (
          <section>
            <header className="sticky top-0 z-20 flex items-baseline gap-2.5 px-1 py-2 bg-canvas hairline-b">
              <span className="text-[13.5px] font-semibold tracking-[-0.01em] text-danger">Overdue</span>
              <div className="ml-auto">
                <Button size="sm" onClick={pullOverdue}>
                  Move {overdue.length === 1 ? "it" : `all ${overdue.length}`} to today
                  <ChevronRight className="size-3.5" />
                </Button>
              </div>
            </header>
            <div className="py-1 pl-5 pr-1">
              {/* A long tail of overdue rows must not push the agenda itself
                  off the screen — the rest is one button away. */}
              {overdue.slice(0, overdueLimit).map((task) => <DraggableRow key={task.id} task={task} />)}
              {overdue.length > overdueLimit && (
                <button
                  type="button"
                  onClick={() => setOverdueLimit(overdue.length)}
                  className="mt-1 h-7 cursor-pointer rounded-md px-1.5 text-[12.5px] text-ink-3 transition-colors hover:bg-hover hover:text-ink"
                >
                  Show {overdue.length - overdueLimit} more overdue
                </button>
              )}
            </div>
          </section>
        )}

        {weeks.map((week) => (
          <section key={week.start}>
            <WeekHeader weekStartDate={week.start} byDate={byDate} />
            {week.days.map((group) => (
              <DayGroup
                key={group.date}
                date={group.date}
                tasks={group.tasks}
                previewed={previewSet.has(group.date)}
              />
            ))}
          </section>
        ))}

        {groups.length > shown.length && (
          <div className="flex justify-center pt-4">
            <Button size="sm" onClick={() => setPaging({ anchor, limit: limit + PAGE })}>
              Show {Math.min(PAGE, groups.length - shown.length)} more days
            </Button>
          </div>
        )}

        {!groups.length && !overdue.length && (
          <EmptyState
            icon={CalendarDays}
            title="The road ahead is clear"
            description="Agenda lists every day that has something on it, starting from the date you're on. Add the first thing and it shows up here."
            action={<Button variant="primary" size="sm" onClick={openQuickAdd}>Add a task</Button>}
          />
        )}
      </div>
    </div>
  );
}
