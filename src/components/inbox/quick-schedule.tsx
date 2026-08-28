"use client";

import * as React from "react";
import { CalendarPlus, Sofa, Sunrise, Sunset, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import { addDays, formatDate, friendlyDate, startOfWeek, todayISO, weekday } from "@/lib/date";
import type { Task } from "@/lib/types";
import { IconButton } from "@/components/ui/primitives";
import { MenuItem, MenuLabel, MenuSeparator, Popover } from "@/components/ui/overlays";
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
  iso: string | null;
  icon: React.ComponentType<{ className?: string }>;
  hint: string;
}

/**
 * The five doors every triage surface offers. Order matters — it is the order
 * of the rail, the row buttons, the bulk menu and the keyboard legend, so the
 * gesture you learn in one place reads the same everywhere.
 */
export function schedulePresets(weekStart = 1, from: string = todayISO()): SchedulePreset[] {
  return [
    { key: "today", label: "Today", iso: from, icon: Sunrise, hint: "T" },
    { key: "tomorrow", label: "Tomorrow", iso: addDays(from, 1), icon: Sunset, hint: "M" },
    { key: "weekend", label: "This weekend", iso: weekendISO(from), icon: Sofa, hint: "W" },
    { key: "next-week", label: "Next week", iso: nextWeekISO(from, weekStart), icon: CalendarPlus, hint: "⇧W" },
    { key: "none", label: "No date", iso: null, icon: X, hint: "U" },
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
 * Row-level triage: three one-tap dates plus a menu for everything else.
 * Every move is undoable from the toast, because a mis-tap here loses a task
 * from view.
 */
export function QuickSchedule({ task, className }: { task: Task; className?: string }) {
  const moveTask = useStore((s) => s.moveTask);
  const toast = useStore((s) => s.toast);
  const weekStart = useStore((s) => s.profile?.week_start ?? 1);

  const all = React.useMemo(() => schedulePresets(weekStart), [weekStart]);
  // A preset that matches the date the task already has would be a no-op button.
  const inline = React.useMemo(
    () => all.slice(0, 3).filter((p) => p.iso !== task.date),
    [all, task.date],
  );

  function schedule(iso: string | null) {
    const previous = task.date;
    if (iso === previous) return;
    moveTask(task.id, iso);
    toast({
      title: iso ? `Scheduled for ${friendlyDate(iso)}` : "Moved to Inbox",
      description: task.title || "Untitled",
      action: { label: "Undo", run: () => moveTask(task.id, previous) },
    });
  }

  return (
    <div className={cn("flex items-center gap-0.5", className)}>
      {inline.map((p) => (
        <PresetButton key={p.key} title={formatDate(p.iso as string)} onClick={() => schedule(p.iso)}>
          {p.label === "This weekend" ? "Weekend" : p.label}
        </PresetButton>
      ))}

      <Popover
        align="end"
        className="w-[262px]"
        trigger={
          <IconButton label={`Schedule ${task.title || "Untitled"}`} size="sm">
            <CalendarPlus />
          </IconButton>
        }
      >
        {(close) => (
          <>
            {all.map((p) => (
              <MenuItem
                key={p.key}
                icon={p.icon}
                shortcut={p.iso ? formatDate(p.iso, { weekday: false }) : undefined}
                checked={p.iso === task.date}
                onClick={() => { schedule(p.iso); close(); }}
              >
                {p.label}
              </MenuItem>
            ))}
            <MenuSeparator />
            <MenuLabel>Pick a date</MenuLabel>
            <div className="px-1 pb-1">
              <MiniCalendar
                value={task.date ?? todayISO()}
                weekStart={weekStart}
                onChange={(iso) => { schedule(iso); close(); }}
              />
            </div>
          </>
        )}
      </Popover>
    </div>
  );
}
