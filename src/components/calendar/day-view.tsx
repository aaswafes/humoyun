"use client";

import * as React from "react";
import { useDroppable } from "@dnd-kit/core";
import { cn } from "@/lib/cn";
import { dayName, dayNumber, monthName, todayISO, yearOf } from "@/lib/date";
import { completionOn, useStore } from "@/lib/store";
import { Progress, SectionLabel } from "@/components/ui/primitives";
import { TaskList } from "@/components/tasks/task-list";
import { TimeGrid } from "./time-grid";
import { isTimed, type DropPreview } from "./calendar-utils";

export function DayView({
  date, hour12, preview,
}: {
  date: string;
  hour12: boolean;
  preview: DropPreview | null;
}) {
  const tasks = useStore((s) => s.tasks);
  const { setNodeRef, isOver } = useDroppable({
    id: `dayside:${date}`,
    data: { type: "day", date },
  });

  const untimed = React.useMemo(
    () => tasks
      .filter((t) => t.date === date && !t.parent_id && !isTimed(t))
      .sort((a, b) => a.order_index - b.order_index),
    [tasks, date],
  );
  const { done, total } = React.useMemo(() => completionOn(tasks, date), [tasks, date]);
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
            </span>
          </div>
          <Progress value={done} max={Math.max(1, total)} height={4} />
        </div>

        <div className="mt-6 min-h-0 flex-1">
          <SectionLabel className="mb-1.5">Unscheduled</SectionLabel>
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
