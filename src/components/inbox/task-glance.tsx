"use client";

import * as React from "react";
import {
  BookOpen, Calendar, Check, Clock, Flag, ListTree, Repeat, Timer as TimerIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore, subtasksOf } from "@/lib/store";
import { formatDuration, formatRange, friendlyDate, todayISO } from "@/lib/date";
import type { Task } from "@/lib/types";

const PRIORITY_CLASS = ["", "text-ink-3", "text-warn", "text-danger"];

/**
 * A read-only portrait of a task. It exists because select mode needs a row
 * whose entire subtree is inert: TaskRow carries seven controls, and a row
 * that is itself a selection control cannot contain any of them — neither for
 * the mouse nor, more importantly, for the Tab key. Also drawn inside the drag
 * overlay, where a live control would be meaningless.
 */
export function TaskGlance({
  task, showDate, dense,
}: {
  task: Task;
  showDate?: boolean;
  dense?: boolean;
}) {
  const tasks = useStore((s) => s.tasks);
  const books = useStore((s) => s.books);
  const hour12 = useStore((s) => s.hour12);

  const done = task.status === "done";
  const dropped = task.status === "dropped";
  const subtasks = React.useMemo(() => subtasksOf(tasks, task.id), [tasks, task.id]);
  const doneSubs = subtasks.filter((s) => s.status === "done").length;
  const checklistDone = task.checklist.filter((c) => c.done).length;
  const book = task.book_id ? books.find((b) => b.id === task.book_id) : null;
  const overdue = !done && !!task.date && task.date < todayISO();

  const hasMeta =
    (showDate && !!task.date) ||
    task.start_min != null ||
    task.duration_min != null ||
    task.actual_min > 0 ||
    !!book ||
    subtasks.length > 0 ||
    task.checklist.length > 0 ||
    task.tags.length > 0;

  return (
    <div className={cn("min-w-0 flex-1", dense ? "py-1" : "py-1.5")}>
      <div className="flex min-w-0 items-baseline gap-1.5">
        <span
          aria-hidden
          className={cn(
            task.color ? `tint-${task.color}` : "",
            "grid size-[13px] shrink-0 translate-y-[2px] place-items-center rounded-[4px] border",
            done ? "border-transparent text-canvas" : "border-line-strong",
          )}
          style={done ? { background: task.color ? "var(--tint)" : "var(--accent)" } : undefined}
        >
          {done && <Check className="size-2.5 stroke-[3.5]" />}
        </span>

        <span
          className={cn(
            "min-w-0 flex-1 truncate text-[13.5px] leading-[1.45]",
            done || dropped ? "text-ink-4 line-through decoration-ink-4/60" : "text-ink",
          )}
        >
          {task.title || <span className="text-ink-4">Untitled</span>}
        </span>

        {task.priority > 0 && !done && (
          <Flag
            aria-hidden
            className={cn("size-3 shrink-0", PRIORITY_CLASS[task.priority])}
            fill="currentColor"
          />
        )}
        {task.recurrence && <Repeat aria-hidden className="size-3 shrink-0 text-ink-4" />}
      </div>

      {hasMeta && !dense && (
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 pl-[19px]">
          {showDate && task.date && (
            <span className={cn("inline-flex items-center gap-1 text-[11.5px]", overdue ? "text-danger" : "text-ink-3")}>
              <Calendar aria-hidden className="size-3" />
              {friendlyDate(task.date)}
            </span>
          )}
          {task.start_min != null && (
            <span className="inline-flex items-center gap-1 text-[11.5px] text-ink-3 tnum">
              <Clock aria-hidden className="size-3" />
              {formatRange(task.start_min, task.end_min, hour12)}
            </span>
          )}
          {task.duration_min != null && task.start_min == null && (
            <span className="inline-flex items-center gap-1 text-[11.5px] text-ink-3 tnum">
              <TimerIcon aria-hidden className="size-3" />
              {formatDuration(task.duration_min)}
            </span>
          )}
          {task.actual_min > 0 && (
            <span className="inline-flex items-center gap-1 text-[11.5px] text-ink-3 tnum">
              <TimerIcon aria-hidden className="size-3" />
              {formatDuration(task.actual_min)} spent
            </span>
          )}
          {book && (
            <span className="inline-flex items-center gap-1 text-[11.5px] text-ink-3">
              <BookOpen aria-hidden className="size-3" />
              {book.title}
            </span>
          )}
          {subtasks.length > 0 && (
            <span className="inline-flex items-center gap-1 text-[11.5px] text-ink-3 tnum">
              <ListTree aria-hidden className="size-3" />
              {doneSubs}/{subtasks.length}
            </span>
          )}
          {task.checklist.length > 0 && (
            <span className="text-[11.5px] text-ink-3 tnum">
              ☑ {checklistDone}/{task.checklist.length}
            </span>
          )}
          {task.tags.map((tag) => (
            <span
              key={tag}
              className="tint-slate inline-flex h-[19px] max-w-[160px] items-center truncate rounded-[5px] bg-[var(--tint-soft)] px-1.5 text-[11.5px] font-medium leading-none text-[var(--tint-ink)]"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** One-line description of a task for aria-live announcements and tooltips. */
export function describeTask(task: Task, index?: number, total?: number): string {
  const bits: string[] = [];
  if (index != null && total != null) bits.push(`Row ${index + 1} of ${total}`);
  bits.push(task.title || "Untitled");
  bits.push(task.date ? friendlyDate(task.date) : "no date");
  if (task.priority > 0) bits.push(["", "low", "medium", "high"][task.priority] + " priority");
  if (task.status === "done") bits.push("done");
  return bits.join(", ");
}
