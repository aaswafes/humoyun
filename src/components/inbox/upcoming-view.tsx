"use client";

import * as React from "react";
import { CalendarDays, ArrowRight } from "lucide-react";
import { useStore, overdueTasks, tasksOn } from "@/lib/store";
import { addDays, formatDate, todayISO } from "@/lib/date";
import type { Task } from "@/lib/types";
import { Button, EmptyState } from "@/components/ui/primitives";
import { openQuickAdd } from "@/components/shell/quick-add";
import { SelectableRow } from "./selectable-row";
import { QuickSchedule } from "./quick-schedule";
import { DayHeader, LabelHeader } from "./group-header";
import { useSelectionHotkeys } from "./selection";

const HORIZON = 14;

export function UpcomingView({ onSeeAll }: { onSeeAll: () => void }) {
  const tasks = useStore((s) => s.tasks);
  const moveTask = useStore((s) => s.moveTask);
  const toast = useStore((s) => s.toast);

  const today = todayISO();
  const overdue = React.useMemo(() => overdueTasks(tasks, today), [tasks, today]);

  const days = React.useMemo(() => {
    const out: { iso: string; items: Task[] }[] = [];
    for (let i = 0; i < HORIZON; i++) {
      const iso = addDays(today, i);
      const items = tasksOn(tasks, iso);
      if (items.length) out.push({ iso, items });
    }
    return out;
  }, [tasks, today]);

  const horizonEnd = addDays(today, HORIZON - 1);
  const beyond = React.useMemo(
    () => tasks.filter((t) => t.date && t.date > horizonEnd && t.status !== "done" && !t.parent_id).length,
    [tasks, horizonEnd],
  );

  const order = React.useMemo(
    () => [...overdue.map((t) => t.id), ...days.flatMap((d) => d.items.map((t) => t.id))],
    [overdue, days],
  );
  useSelectionHotkeys();

  function pullOverdueForward() {
    const before = overdue.map((t) => [t.id, t.date] as const);
    overdue.forEach((t) => moveTask(t.id, today));
    toast({
      title: `${before.length} moved to today`,
      action: { label: "Undo", run: () => before.forEach(([id, date]) => moveTask(id, date)) },
    });
  }

  if (!overdue.length && !days.length) {
    return (
      <EmptyState
        icon={CalendarDays}
        title="The next two weeks are clear"
        description="Everything you schedule between today and the end of the fortnight collects here, grouped by day with the overdue pinned on top."
        action={<Button variant="primary" size="sm" onClick={openQuickAdd}>Plan something</Button>}
      />
    );
  }

  return (
    <div>
      {overdue.length > 0 && (
        <section className="mb-5">
          <LabelHeader
            title="Overdue"
            count={overdue.length}
            tone="danger"
            action={
              <Button variant="ghost" size="xs" onClick={pullOverdueForward}>
                Move all to today
              </Button>
            }
          />
          {overdue.map((task) => (
            <SelectableRow
              key={task.id}
              task={task}
              order={order}
              showDate
              trailing={<QuickSchedule task={task} />}
            />
          ))}
        </section>
      )}

      {days.map(({ iso, items }) => (
        <section key={iso} className="mb-5">
          <DayHeader iso={iso} done={items.filter((t) => t.status === "done").length} total={items.length} />
          {items.map((task) => (
            <SelectableRow
              key={task.id}
              task={task}
              order={order}
              trailing={<QuickSchedule task={task} />}
            />
          ))}
        </section>
      ))}

      {beyond > 0 && (
        <button
          onClick={onSeeAll}
          className="group/beyond mt-1 flex w-full items-center gap-1.5 rounded-md px-2 py-2 text-left text-[12.5px] text-ink-3 hover:bg-hover hover:text-ink cursor-pointer transition-colors duration-150"
        >
          <span className="tnum">{beyond}</span>
          <span>scheduled after {formatDate(horizonEnd, { weekday: false })}</span>
          <ArrowRight className="size-3.5 transition-transform duration-200 ease-[var(--ease-out-apple)] group-hover/beyond:translate-x-0.5" />
        </button>
      )}
    </div>
  );
}
