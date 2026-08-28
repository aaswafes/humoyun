"use client";

import * as React from "react";
import {
  Clock, Flag, GripVertical, MoreHorizontal, Play, Copy, Trash2, Calendar,
  ListTree, ChevronRight, BookOpen, Repeat, Timer as TimerIcon, ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore, subtasksOf } from "@/lib/store";
import { addDays, formatDuration, formatRange, friendlyDate, todayISO } from "@/lib/date";
import type { Task } from "@/lib/types";
import { Checkbox, Badge, IconButton } from "@/components/ui/primitives";
import { Popover, MenuItem, MenuSeparator, MenuLabel, TintPicker } from "@/components/ui/overlays";
import { MiniCalendar } from "@/components/ui/mini-calendar";

const PRIORITY_CLASS = ["", "text-ink-3", "text-warn", "text-danger"];

export interface TaskRowProps {
  task: Task;
  /** show the date chip — useful in Inbox / Upcoming, noise inside a single day */
  showDate?: boolean;
  showSubtasks?: boolean;
  dragHandle?: React.ReactNode;
  compact?: boolean;
  className?: string;
  onOpen?: (task: Task) => void;
}

export function TaskRow({
  task, showDate, showSubtasks = true, dragHandle, compact, className, onOpen,
}: TaskRowProps) {
  const tasks = useStore((s) => s.tasks);
  const books = useStore((s) => s.books);
  const hour12 = useStore((s) => s.hour12);
  const weekStart = useStore((s) => s.profile?.week_start ?? 1);
  const toggleTask = useStore((s) => s.toggleTask);
  const patch = useStore((s) => s.patch);
  const remove = useStore((s) => s.remove);
  const duplicateTask = useStore((s) => s.duplicateTask);
  const openInspector = useStore((s) => s.openInspector);
  const startTimer = useStore((s) => s.startTimer);
  const timer = useStore((s) => s.timer);
  const toast = useStore((s) => s.toast);

  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(task.title);
  const [expanded, setExpanded] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const subtasks = showSubtasks ? subtasksOf(tasks, task.id) : [];
  const doneSubs = subtasks.filter((s) => s.status === "done").length;
  const checklistDone = task.checklist.filter((c) => c.done).length;
  const done = task.status === "done";
  const running = timer.taskId === task.id && timer.running;
  const book = task.book_id ? books.find((b) => b.id === task.book_id) : null;
  const overdue = !done && task.date && task.date < todayISO();

  React.useEffect(() => { setDraft(task.title); }, [task.title]);

  React.useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  function commit() {
    setEditing(false);
    const next = draft.trim();
    if (next && next !== task.title) patch("tasks", task.id, { title: next });
    else setDraft(task.title);
  }

  function open() {
    if (onOpen) onOpen(task);
    else openInspector(task.id);
  }

  return (
    <div className={cn("group/task", className)}>
      <div
        className={cn(
          "relative flex items-start gap-2 rounded-md px-1.5 transition-colors duration-120",
          compact ? "py-1" : "py-[5px]",
          "hover:bg-hover",
        )}
      >
        {/* drag handle appears on hover, occupies no layout when idle */}
        <div className="absolute -left-4 top-1/2 -translate-y-1/2 opacity-0 transition-opacity group-hover/task:opacity-100">
          {dragHandle ?? <GripVertical className="size-3.5 cursor-grab text-ink-4" />}
        </div>

        <div className={cn("shrink-0", compact ? "pt-[3px]" : "pt-[3.5px]")}>
          <Checkbox
            checked={done}
            tint={task.color}
            onChange={() => toggleTask(task.id)}
            size={compact ? "sm" : "md"}
            label={done ? `Mark ${task.title} as not done` : `Mark ${task.title} as done`}
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-baseline gap-1.5">
            {subtasks.length > 0 && (
              <button
                onClick={() => setExpanded((v) => !v)}
                aria-label={expanded ? "Collapse subtasks" : "Expand subtasks"}
                className="-ml-1 grid size-4 shrink-0 place-items-center rounded text-ink-4 hover:bg-active hover:text-ink-2 cursor-pointer transition-colors"
              >
                <ChevronRight className={cn("size-3 transition-transform duration-200", expanded && "rotate-90")} />
              </button>
            )}

            {editing ? (
              <input
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); commit(); }
                  if (e.key === "Escape") { setDraft(task.title); setEditing(false); }
                }}
                className="min-w-0 flex-1 rounded-sm bg-transparent text-[13.5px] text-ink outline-none"
              />
            ) : (
              <button
                onClick={open}
                onDoubleClick={(e) => { e.stopPropagation(); setEditing(true); }}
                className={cn(
                  "min-w-0 flex-1 truncate text-left text-[13.5px] leading-[1.45] cursor-pointer transition-colors",
                  done ? "text-ink-4 line-through decoration-ink-4/60" : "text-ink",
                )}
              >
                {task.title || <span className="text-ink-4">Untitled</span>}
              </button>
            )}

            {task.priority > 0 && !done && (
              <Flag className={cn("size-3 shrink-0", PRIORITY_CLASS[task.priority])} fill="currentColor" />
            )}
            {task.recurrence && <Repeat className="size-3 shrink-0 text-ink-4" />}
          </div>

          {/* meta row — only rendered when it has something to say */}
          {(!!task.start_min || showDate || task.tags.length > 0 || subtasks.length > 0 ||
            task.checklist.length > 0 || !!task.duration_min || !!task.actual_min || !!book) && (
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
              {showDate && task.date && (
                <span className={cn("inline-flex items-center gap-1 text-[11.5px]", overdue ? "text-danger" : "text-ink-3")}>
                  <Calendar className="size-3" />
                  {friendlyDate(task.date)}
                </span>
              )}
              {task.start_min != null && (
                <span className="inline-flex items-center gap-1 text-[11.5px] text-ink-3 tnum">
                  <Clock className="size-3" />
                  {formatRange(task.start_min, task.end_min, hour12)}
                </span>
              )}
              {task.duration_min != null && task.start_min == null && (
                <span className="inline-flex items-center gap-1 text-[11.5px] text-ink-3 tnum">
                  <TimerIcon className="size-3" />
                  {formatDuration(task.duration_min)}
                </span>
              )}
              {task.actual_min > 0 && (
                <span className="inline-flex items-center gap-1 text-[11.5px] text-success tnum">
                  <TimerIcon className="size-3" />
                  {formatDuration(task.actual_min)} spent
                </span>
              )}
              {book && (
                <span className="inline-flex items-center gap-1 text-[11.5px] text-ink-3">
                  <BookOpen className="size-3" />
                  {book.title}
                </span>
              )}
              {subtasks.length > 0 && (
                <span className="inline-flex items-center gap-1 text-[11.5px] text-ink-3 tnum">
                  <ListTree className="size-3" />
                  {doneSubs}/{subtasks.length}
                </span>
              )}
              {task.checklist.length > 0 && (
                <span className="text-[11.5px] text-ink-3 tnum">
                  ☑ {checklistDone}/{task.checklist.length}
                </span>
              )}
              {task.tags.map((tag) => (
                <Badge key={tag} tint="slate">{tag}</Badge>
              ))}
            </div>
          )}
        </div>

        {/* hover actions */}
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover/task:opacity-100">
          <IconButton
            label={running ? "Timer running" : "Start focus timer"}
            size="sm"
            active={running}
            onClick={() => {
              startTimer({ taskId: task.id, label: task.title, mode: "pomodoro" });
              toast({ title: "Focus started", description: task.title });
            }}
          >
            <Play />
          </IconButton>

          <Popover
            align="end"
            className="w-[210px]"
            trigger={<IconButton label="Task options" size="sm"><MoreHorizontal /></IconButton>}
          >
            {(close) => (
              <>
                <MenuItem icon={ArrowRight} onClick={() => { patch("tasks", task.id, { date: todayISO() }); close(); }}>
                  Move to today
                </MenuItem>
                <MenuItem
                  icon={ArrowRight}
                  onClick={() => { patch("tasks", task.id, { date: addDays(task.date ?? todayISO(), 1) }); close(); }}
                >
                  Push a day
                </MenuItem>
                <MenuItem icon={Copy} onClick={() => { duplicateTask(task.id); close(); }}>Duplicate</MenuItem>
                <MenuSeparator />
                <MenuLabel>Colour</MenuLabel>
                <TintPicker
                  value={task.color}
                  allowNone
                  onChange={(t) => patch("tasks", task.id, { color: t })}
                />
                <MenuSeparator />
                <MenuLabel>Move to date</MenuLabel>
                <div className="px-1 pb-1">
                  <MiniCalendar
                    value={task.date ?? todayISO()}
                    weekStart={weekStart}
                    onChange={(iso) => { patch("tasks", task.id, { date: iso }); close(); }}
                  />
                </div>
                <MenuSeparator />
                <MenuItem icon={Trash2} danger onClick={() => { remove("tasks", task.id); close(); }}>
                  Delete
                </MenuItem>
              </>
            )}
          </Popover>
        </div>
      </div>

      {expanded && subtasks.length > 0 && (
        <div className="ml-[26px] border-l border-line pl-2">
          {subtasks.map((sub) => (
            <TaskRow key={sub.id} task={sub} compact showSubtasks={false} />
          ))}
        </div>
      )}
    </div>
  );
}
