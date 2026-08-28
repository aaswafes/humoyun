"use client";

import * as React from "react";
import { CalendarPlus } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import { addDays, formatDate, friendlyDate, startOfWeek, todayISO, weekday } from "@/lib/date";
import type { Task } from "@/lib/types";
import { IconButton } from "@/components/ui/primitives";
import { Popover } from "@/components/ui/overlays";
import { MiniCalendar } from "@/components/ui/mini-calendar";

/** The coming Saturday — or today, if today is already the weekend. */
export function weekendISO(from: string = todayISO()): string {
  const d = weekday(from);
  if (d === 0 || d === 6) return from;
  return addDays(from, 6 - d);
}

/** First day of next week, honouring the user's week start. */
export function nextWeekISO(from: string = todayISO(), weekStart = 1): string {
  return addDays(startOfWeek(from, weekStart), 7);
}

export interface SchedulePreset {
  key: string;
  label: string;
  iso: string;
}

export function schedulePresets(weekStart = 1, from: string = todayISO()): SchedulePreset[] {
  return [
    { key: "today", label: "Today", iso: from },
    { key: "tomorrow", label: "Tomorrow", iso: addDays(from, 1) },
    { key: "weekend", label: "Weekend", iso: weekendISO(from) },
    { key: "next-week", label: "Next week", iso: nextWeekISO(from, weekStart) },
  ];
}

function PresetButton({
  children, title, onClick,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        "h-7 shrink-0 rounded-md px-2 text-[11.5px] font-medium text-ink-3 cursor-pointer",
        "transition-[background-color,color,transform] duration-150 ease-[var(--ease-out-apple)]",
        "hover:bg-active hover:text-ink active:scale-[0.97]",
      )}
    >
      {children}
    </button>
  );
}

/**
 * Row-level triage: three one-tap dates plus a calendar for everything else.
 * Every move is undoable from the toast, because a mis-tap here loses a task from view.
 */
export function QuickSchedule({ task, className }: { task: Task; className?: string }) {
  const moveTask = useStore((s) => s.moveTask);
  const toast = useStore((s) => s.toast);
  const weekStart = useStore((s) => s.profile?.week_start ?? 1);

  // A preset that matches the date the task already has would be a no-op button.
  const presets = React.useMemo(
    () => schedulePresets(weekStart).slice(0, 3).filter((p) => p.iso !== task.date),
    [weekStart, task.date],
  );

  function schedule(iso: string) {
    const previous = task.date;
    moveTask(task.id, iso);
    toast({
      title: `Scheduled for ${friendlyDate(iso)}`,
      description: task.title || "Untitled",
      action: { label: "Undo", run: () => moveTask(task.id, previous) },
    });
  }

  return (
    <div className={cn("flex items-center gap-0.5", className)}>
      {presets.map((p) => (
        <PresetButton key={p.key} title={formatDate(p.iso)} onClick={() => schedule(p.iso)}>
          {p.label}
        </PresetButton>
      ))}

      <Popover
        align="end"
        className="w-[256px] p-2"
        trigger={
          <IconButton label="Pick a date" size="sm">
            <CalendarPlus />
          </IconButton>
        }
      >
        {(close) => (
          <MiniCalendar
            value={task.date ?? todayISO()}
            weekStart={weekStart}
            onChange={(iso) => { schedule(iso); close(); }}
          />
        )}
      </Popover>
    </div>
  );
}
