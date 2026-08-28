"use client";

import * as React from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { CalendarDays, GripVertical } from "lucide-react";
import { cn } from "@/lib/cn";
import { dayNumber, formatDate, friendlyDate, todayISO, yearOf } from "@/lib/date";
import { overdueTasks, useStore } from "@/lib/store";
import type { Task } from "@/lib/types";
import { Button, EmptyState } from "@/components/ui/primitives";
import { TaskRow } from "@/components/tasks/task-row";
import { openQuickAdd } from "@/components/shell/quick-add";
import { bucketByDate, type DropPreview } from "./calendar-utils";

const PAGE = 25;

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
            {...attributes}
            {...listeners}
            aria-label={`Drag ${task.title || "task"} to another day`}
            className="grid size-4 cursor-grab place-items-center rounded text-ink-4 transition-colors hover:text-ink-2 active:cursor-grabbing"
          >
            <GripVertical className="size-3.5" />
          </button>
        }
      />
    </div>
  );
}

function DayGroup({
  date, tasks, previewed,
}: {
  date: string;
  tasks: Task[];
  previewed: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `day:${date}`, data: { type: "day", date } });
  const today = todayISO();
  const isToday = date === today;
  const done = tasks.filter((t) => t.status === "done").length;

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
      <header className="sticky top-0 z-10 flex items-baseline gap-2.5 px-1 py-2 material hairline-b">
        <span
          className={cn(
            "grid h-[26px] min-w-[26px] place-items-center rounded-full px-1 text-[17px] leading-none display-serif tnum",
            isToday ? "bg-accent text-accent-ink" : "text-ink",
          )}
        >
          {dayNumber(date)}
        </span>
        <span className="text-[13.5px] font-semibold tracking-[-0.01em] text-ink">
          {friendlyDate(date)}
        </span>
        <span className="text-[12px] text-ink-3 tnum">
          {formatDate(date, { weekday: false, year: yearOf(date) !== yearOf(today) })}
        </span>
        <span className="ml-auto text-[11.5px] text-ink-3 tnum">
          {done}<span className="text-ink-4">/{tasks.length}</span>
        </span>
      </header>

      <div className="py-1 pl-5 pr-1">
        {tasks.map((task) => <DraggableRow key={task.id} task={task} />)}
      </div>
    </section>
  );
}

export function AgendaView({ anchor, preview }: { anchor: string; preview: DropPreview | null }) {
  const tasks = useStore((s) => s.tasks);
  // Paging is scoped to the date we started from, so jumping months resets it
  // without an effect having to reach in and clear it.
  const [paging, setPaging] = React.useState({ anchor, limit: PAGE });
  const limit = paging.anchor === anchor ? paging.limit : PAGE;
  const today = todayISO();

  const groups = React.useMemo(() => {
    const byDate = bucketByDate(tasks);
    return [...byDate.entries()]
      .filter(([date]) => date >= anchor)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, list]) => ({ date, tasks: list }));
  }, [tasks, anchor]);

  const overdue = React.useMemo(
    () => (anchor <= today ? overdueTasks(tasks, today) : []),
    [tasks, anchor, today],
  );

  const previewSet = React.useMemo(() => new Set(preview?.dates ?? []), [preview]);
  const shown = groups.slice(0, limit);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto border-t border-line">
      <div className="mx-auto max-w-[720px] pb-10">
        {overdue.length > 0 && (
          <section>
            <header className="sticky top-0 z-10 flex items-baseline gap-2.5 px-1 py-2 material hairline-b">
              <span className="text-[13.5px] font-semibold tracking-[-0.01em] text-danger">Overdue</span>
              <span className="ml-auto text-[11.5px] text-ink-3 tnum">{overdue.length}</span>
            </header>
            <div className="py-1 pl-5 pr-1">
              {overdue.map((task) => <DraggableRow key={task.id} task={task} />)}
            </div>
          </section>
        )}

        {shown.map((group) => (
          <DayGroup
            key={group.date}
            date={group.date}
            tasks={group.tasks}
            previewed={previewSet.has(group.date)}
          />
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
