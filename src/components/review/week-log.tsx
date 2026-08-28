"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, ChevronRight, Sun } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import { addDays, dayName, dayNumber, formatDate, todayISO } from "@/lib/date";
import type { Task } from "@/lib/types";
import { Button, EmptyState } from "@/components/ui/primitives";
import { TaskRow } from "@/components/tasks/task-row";
import { Section } from "./section";
import { plural } from "./metrics";

const SLIPPED_PREVIEW = 40;

export function WeekLog({ weekStart }: { weekStart: string }) {
  const router = useRouter();
  const tasks = useStore((s) => s.tasks);
  const moveTask = useStore((s) => s.moveTask);
  const toast = useStore((s) => s.toast);
  const [showAllSlipped, setShowAllSlipped] = React.useState(false);

  const days = React.useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );
  const weekEnd = days[6];
  const nextWeek = addDays(weekStart, 7);
  const weekOver = weekEnd < todayISO();

  const { completedByDay, completedCount, slipped } = React.useMemo(() => {
    const inWeek = new Set(days);
    const mine = tasks.filter((t) => !!t.date && inWeek.has(t.date) && !t.parent_id && t.status !== "dropped");

    const byDay = new Map<string, Task[]>();
    mine
      .filter((t) => t.status === "done")
      .forEach((t) => {
        const list = byDay.get(t.date as string) ?? [];
        list.push(t);
        byDay.set(t.date as string, list);
      });
    byDay.forEach((list) =>
      list.sort((a, b) => (a.start_min ?? 1e4) - (b.start_min ?? 1e4) || a.order_index - b.order_index),
    );

    const open = mine
      .filter((t) => t.status !== "done")
      .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? "") || a.order_index - b.order_index);

    return {
      completedByDay: byDay,
      completedCount: mine.filter((t) => t.status === "done").length,
      slipped: open,
    };
  }, [tasks, days]);

  function push(list: Task[], target: string) {
    if (!list.length) return;
    const before = list.map((t) => ({ id: t.id, date: t.date }));
    list.forEach((t) => moveTask(t.id, target));
    toast({
      title: `Moved ${list.length} ${plural(list.length, "task")} to ${formatDate(target)}`,
      tone: "success",
      action: {
        label: "Undo",
        run: () => before.forEach((b) => moveTask(b.id, b.date)),
      },
    });
  }

  const visibleSlipped = showAllSlipped ? slipped : slipped.slice(0, SLIPPED_PREVIEW);

  return (
    <>
      <Section
        label="What actually happened"
        note={completedCount ? `${completedCount} ${plural(completedCount, "task")} closed` : undefined}
      >
        {completedCount === 0 ? (
          <EmptyState
            icon={Sun}
            title="Nothing was ticked off this week"
            description="Completed tasks gather here day by day, so the review starts from what you actually did rather than what you meant to do."
            action={
              <Button size="sm" variant="secondary" onClick={() => router.push("/")}>
                Go to Today
              </Button>
            }
          />
        ) : (
          <div>
            {days
              .filter((day) => completedByDay.get(day)?.length)
              .map((day, i) => (
                <DayGroup key={day} date={day} tasks={completedByDay.get(day) as Task[]} divided={i > 0} />
              ))}
          </div>
        )}
      </Section>

      <Section
        label={weekOver ? "Slipped" : "Still open"}
        note={
          slipped.length
            ? `${slipped.length} ${plural(slipped.length, "task")} dated this week, unfinished`
            : undefined
        }
        action={
          slipped.length > 0 && (
            <Button
              size="sm"
              variant="secondary"
              title={`Move all ${slipped.length} to ${formatDate(nextWeek)}`}
              onClick={() => push(slipped, nextWeek)}
            >
              <ArrowRight className="size-3.5" />
              Carry over to {formatDate(nextWeek, { weekday: false })}
            </Button>
          )
        }
      >
        {slipped.length === 0 ? (
          <div className="flex items-center gap-2.5 px-1.5 py-3 text-[13px] text-ink-2">
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-success-soft text-success">
              <Check className="size-3.5" strokeWidth={2.5} />
            </span>
            {weekOver
              ? "Nothing slipped. Every task dated this week was closed."
              : "Nothing outstanding so far this week."}
          </div>
        ) : (
          <div>
            {visibleSlipped.map((task) => (
              <SlippedRow key={task.id} task={task} onPush={(t) => push([t], addDays(t.date as string, 7))} />
            ))}
            {slipped.length > visibleSlipped.length && (
              <button
                onClick={() => setShowAllSlipped(true)}
                className="mt-1 px-1.5 py-1.5 text-[12.5px] text-ink-3 hover:text-ink cursor-pointer transition-colors"
              >
                Show {slipped.length - visibleSlipped.length} more
              </button>
            )}
          </div>
        )}
      </Section>
    </>
  );
}

// ---------------------------------------------------------
function DayGroup({ date, tasks, divided }: { date: string; tasks: Task[]; divided: boolean }) {
  const [open, setOpen] = React.useState(false);

  return (
    <div className={cn(divided && "hairline-t")}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-md px-1.5 py-2 text-left cursor-pointer",
          "transition-colors duration-150 hover:bg-hover",
        )}
      >
        <ChevronRight
          className={cn(
            "size-3.5 shrink-0 text-ink-4 transition-transform duration-200 ease-[var(--ease-out-apple)]",
            open && "rotate-90",
          )}
        />
        <span className="display-serif w-6 shrink-0 text-[17px] leading-none text-ink tnum">
          {dayNumber(date)}
        </span>
        <span className="text-[13px] font-medium text-ink-2">{dayName(date, "long")}</span>
        <span className="ml-auto text-[12px] text-ink-3 tnum">
          {tasks.length} {plural(tasks.length, "task")}
        </span>
      </button>

      {open && (
        <div className="anim-fade pb-2 pl-7 pr-1">
          {tasks.map((task) => (
            <TaskRow key={task.id} task={task} compact showSubtasks={false} dragHandle={<span />} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------
function SlippedRow({ task, onPush }: { task: Task; onPush: (t: Task) => void }) {
  const target = addDays(task.date as string, 7);

  return (
    <div className="flex items-center gap-1 pl-4">
      <div className="min-w-0 flex-1">
        <TaskRow task={task} showDate compact showSubtasks={false} dragHandle={<span />} />
      </div>
      <button
        onClick={() => onPush(task)}
        aria-label={`Move ${task.title || "task"} to ${formatDate(target)}`}
        title={`Move to ${formatDate(target)}`}
        className={cn(
          "inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-[12px] font-medium cursor-pointer",
          "text-ink-3 hover:bg-hover hover:text-ink active:scale-[0.97]",
          "transition-[background-color,color,transform] duration-150 ease-[var(--ease-out-apple)]",
        )}
      >
        <span className="hidden sm:inline">Next week</span>
        <ArrowRight className="size-3.5" />
      </button>
    </div>
  );
}
