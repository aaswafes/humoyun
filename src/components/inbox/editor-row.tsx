"use client";

import * as React from "react";
import { CalendarDays, Clock, CornerDownLeft, Flag, Hash, Timer as TimerIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import { parseTask } from "@/lib/parse";
import { formatDuration, formatTime, friendlyDate } from "@/lib/date";
import type { Task } from "@/lib/types";
import { Kbd } from "@/components/ui/primitives";
import { useTriage } from "./triage-context";

const PRIORITY_TINT = ["", "text-ink-2", "text-warn", "text-danger"];

/**
 * Inline rename, opened with E. It runs the same natural-language parser the
 * quick-add uses, so "call sam friday 9am #work !high" both renames and
 * reschedules in one keystroke — and shows exactly what it will do before
 * you commit, because a rename that silently moves a task is a trap.
 */
export function EditorRow({ task, showDate }: { task: Task; showDate?: boolean }) {
  const patch = useStore((s) => s.patch);
  const toast = useStore((s) => s.toast);
  const hour12 = useStore((s) => s.hour12);
  const weekStart = useStore((s) => s.profile?.week_start ?? 1);
  const { setEditingId, rows, setCursor, announce } = useTriage();

  const [value, setValue] = React.useState(task.title);
  const inputRef = React.useRef<HTMLInputElement>(null);
  // A commit fired by Tab must not fire a second time from the ensuing blur.
  const settled = React.useRef(false);

  React.useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const parsed = React.useMemo(() => parseTask(value, weekStart), [value, weekStart]);
  const newTags = parsed.tags.filter((t) => !task.tags.includes(t));

  function commit(): boolean {
    if (settled.current) return false;
    const title = parsed.title.trim();
    if (!title) {
      // An empty title would erase the row from every list, so refuse it.
      announce("Title cannot be empty");
      return false;
    }
    settled.current = true;

    const changes: Partial<Task> = {};
    if (title !== task.title) changes.title = title;
    if (parsed.date && parsed.date !== task.date) changes.date = parsed.date;
    if (parsed.start_min != null) {
      changes.start_min = parsed.start_min;
      changes.end_min = parsed.end_min;
      changes.all_day = false;
    }
    if (parsed.duration_min != null) changes.duration_min = parsed.duration_min;
    if (parsed.priority > 0 && parsed.priority !== task.priority) changes.priority = parsed.priority;
    if (newTags.length) changes.tags = [...task.tags, ...newTags];

    if (Object.keys(changes).length) {
      const before: Partial<Task> = {
        title: task.title, date: task.date, start_min: task.start_min, end_min: task.end_min,
        all_day: task.all_day, duration_min: task.duration_min, priority: task.priority, tags: task.tags,
      };
      patch("tasks", task.id, changes);
      const moved = "date" in changes || "start_min" in changes;
      if (moved) {
        toast({
          title: "Task updated",
          description: `${title} · ${friendlyDate(changes.date ?? task.date ?? "")}`.replace(/ · $/, ""),
          action: { label: "Undo", run: () => patch("tasks", task.id, before) },
        });
      }
      announce(`Renamed to ${title}`);
    }
    return true;
  }

  function close(moveBy = 0) {
    const at = rows.indexOf(task.id);
    const next = at >= 0 ? rows[at + moveBy] : undefined;
    if (moveBy !== 0 && next) {
      setCursor(next);
      setEditingId(next);
    } else {
      setEditingId(null);
    }
  }

  return (
    <div className="rounded-md bg-hover px-1.5 py-1 ring-1 ring-accent-line">
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-label={`Rename ${task.title || "Untitled"}`}
          // Tab and Enter have already committed and moved on by the time the
          // blur lands; only a click away still has work to do.
          onBlur={() => {
            if (settled.current) return;
            commit();
            setEditingId(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (commit()) close(0);
            } else if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              settled.current = true;
              setEditingId(null);
            } else if (e.key === "Tab") {
              e.preventDefault();
              if (commit()) close(e.shiftKey ? -1 : 1);
            }
          }}
          className="min-w-0 flex-1 bg-transparent text-[13.5px] text-ink outline-none placeholder:text-ink-4"
          placeholder="Task name — try “friday 9am #deep !high”"
        />
        <span className="hidden shrink-0 items-center gap-1 text-[11px] text-ink-4 sm:inline-flex">
          <Kbd>↵</Kbd> save
          <Kbd>⇥</Kbd> next
          <Kbd>esc</Kbd>
        </span>
        <CornerDownLeft aria-hidden className="size-3.5 shrink-0 text-ink-4 sm:hidden" />
      </div>

      {(parsed.date || parsed.start_min != null || parsed.duration_min != null ||
        newTags.length > 0 || parsed.priority > 0) && (
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 pl-0.5">
          {parsed.date && parsed.date !== task.date && (
            <span className="inline-flex items-center gap-1 text-[11.5px] text-accent">
              <CalendarDays aria-hidden className="size-3" />
              {friendlyDate(parsed.date)}
            </span>
          )}
          {parsed.start_min != null && (
            <span className="inline-flex items-center gap-1 text-[11.5px] text-accent tnum">
              <Clock aria-hidden className="size-3" />
              {parsed.end_min != null
                ? `${formatTime(parsed.start_min, hour12)} – ${formatTime(parsed.end_min, hour12)}`
                : formatTime(parsed.start_min, hour12)}
            </span>
          )}
          {parsed.duration_min != null && (
            <span className="inline-flex items-center gap-1 text-[11.5px] text-ink-3 tnum">
              <TimerIcon aria-hidden className="size-3" />
              {formatDuration(parsed.duration_min)}
            </span>
          )}
          {parsed.priority > 0 && (
            <span className={cn("inline-flex items-center gap-1 text-[11.5px]", PRIORITY_TINT[parsed.priority])}>
              <Flag aria-hidden className="size-3" fill="currentColor" />
              {["", "Low", "Medium", "High"][parsed.priority]}
            </span>
          )}
          {newTags.map((tag) => (
            <span key={tag} className="inline-flex items-center gap-0.5 text-[11.5px] text-ink-3">
              <Hash aria-hidden className="size-3" />
              {tag}
            </span>
          ))}
          {showDate && !parsed.date && task.date && (
            <span className="text-[11.5px] text-ink-4">stays on {friendlyDate(task.date)}</span>
          )}
        </div>
      )}
    </div>
  );
}
