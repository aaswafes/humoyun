"use client";

import * as React from "react";
import { ArrowRight, CalendarDays, ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore, overdueTasks, tasksOn } from "@/lib/store";
import { addDays, formatDate, friendlyDate, todayISO } from "@/lib/date";
import type { Task } from "@/lib/types";
import { Button, EmptyState } from "@/components/ui/primitives";
import { openQuickAdd } from "@/components/shell/quick-add";
import { InlineComposer } from "@/components/tasks/task-list";
import { useTriage, useRegisterRows, useRegisterRowDrop, useRegisterSummary } from "./triage-context";
import { useTriageActions } from "./actions";
import { TriageRow, DateDropZone } from "./triage-dnd";
import { QuickSchedule } from "./quick-schedule";
import { DayHeader, LabelHeader } from "./group-header";

const STEP = 14;

export function UpcomingView({ onSeeAll }: { onSeeAll: () => void }) {
  const tasks = useStore((s) => s.tasks);
  const moveTask = useStore((s) => s.moveTask);
  const toast = useStore((s) => s.toast);
  const { selecting, announce } = useTriage();
  const actions = useTriageActions();

  const [horizon, setHorizon] = React.useState(STEP);
  const [collapsed, setCollapsed] = React.useState<ReadonlySet<string>>(() => new Set<string>());
  const [overdueOpen, setOverdueOpen] = React.useState(true);

  const today = todayISO();
  const overdue = React.useMemo(() => overdueTasks(tasks, today), [tasks, today]);

  const days = React.useMemo(() => {
    const out: { iso: string; items: Task[] }[] = [];
    for (let i = 0; i < horizon; i++) {
      const iso = addDays(today, i);
      const items = tasksOn(tasks, iso);
      if (items.length) out.push({ iso, items });
    }
    return out;
  }, [tasks, today, horizon]);

  const horizonEnd = addDays(today, horizon - 1);
  const beyond = React.useMemo(
    () => tasks.filter((t) => t.date && t.date > horizonEnd && t.status !== "done" && !t.parent_id),
    [tasks, horizonEnd],
  );

  const scheduled = React.useMemo(
    () => days.reduce((n, d) => n + d.items.filter((t) => t.status !== "done").length, 0),
    [days],
  );

  // One line, in the surface's one slot. The overdue count is not repeated
  // here — the tab badge carries that alarm, and the section below names it.
  useRegisterSummary(
    days.length
      ? `${scheduled} open across ${days.length} ${days.length === 1 ? "day" : "days"}`
      : "",
  );

  // A collapsed day's rows are not on screen, so the keyboard must not walk into them.
  const order = React.useMemo(
    () => [
      ...(overdueOpen ? overdue.map((t) => t.id) : []),
      ...days.filter((d) => !collapsed.has(d.iso)).flatMap((d) => d.items.map((t) => t.id)),
    ],
    [overdue, days, collapsed, overdueOpen],
  );
  useRegisterRows(order);

  // Dropping a row on another row in a dated list means "join that day".
  const onRowDrop = React.useCallback(
    (overId: string, ids: string[]) => {
      const target = tasks.find((t) => t.id === overId);
      if (!target?.date) return;
      const movers = ids.filter((id) => tasks.find((t) => t.id === id)?.date !== target.date);
      if (!movers.length) return;
      actions.moveToDate(movers, target.date);
    },
    [tasks, actions],
  );
  useRegisterRowDrop(onRowDrop);

  function toggleDay(iso: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(iso)) next.delete(iso);
      else next.add(iso);
      return next;
    });
  }

  function pullOverdueForward() {
    const before = overdue.map((t) => [t.id, t.date] as const);
    overdue.forEach((t) => moveTask(t.id, today));
    toast({
      title: `${before.length} moved to today`,
      action: { label: "Undo", run: () => before.forEach(([id, date]) => moveTask(id, date)) },
    });
    announce(`${before.length} overdue tasks moved to today`);
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
        <section aria-label="Overdue" className="mb-8">
          <LabelHeader
            title="Overdue"
            count={overdue.length}
            action={
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="xs" onClick={pullOverdueForward}>
                  Move all to today
                </Button>
                <button
                  type="button"
                  onClick={() => setOverdueOpen((v) => !v)}
                  aria-expanded={overdueOpen}
                  aria-label={overdueOpen ? "Collapse overdue" : "Expand overdue"}
                  className="grid size-7 place-items-center rounded-md text-ink-3 hover:bg-hover hover:text-ink cursor-pointer transition-colors"
                >
                  <ChevronDown
                    aria-hidden
                    className={cn("size-3.5 transition-transform duration-200", !overdueOpen && "-rotate-90")}
                  />
                </button>
              </div>
            }
          />
          {overdueOpen &&
            overdue.map((task) => (
              <TriageRow
                key={task.id}
                task={task}
                order={order}
                showDate
                trailing={<QuickSchedule task={task} />}
              />
            ))}
        </section>
      )}

      {days.map(({ iso, items }) => {
        const isOpen = !collapsed.has(iso);
        const done = items.filter((t) => t.status === "done").length;
        return (
          <section key={iso} aria-label={`${friendlyDate(iso)}, ${items.length} tasks`} className="mb-6">
            <DateDropZone iso={iso}>
              {({ isOver }) => (
                <DayHeader
                  iso={iso}
                  done={done}
                  total={items.length}
                  collapsed={!isOpen}
                  onToggle={() => toggleDay(iso)}
                  dropActive={isOver}
                />
              )}
            </DateDropZone>

            {isOpen && (
              <>
                {items.map((task) => (
                  <TriageRow
                    key={task.id}
                    task={task}
                    order={order}
                    trailing={<QuickSchedule task={task} />}
                  />
                ))}
                {!selecting && (
                  <InlineComposer
                    date={iso}
                    placeholder={`Add to ${friendlyDate(iso)}`}
                    className="mt-1 opacity-50 transition-opacity hover:opacity-100 focus-within:opacity-100"
                  />
                )}
              </>
            )}
          </section>
        );
      })}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" onClick={() => setHorizon((h) => h + STEP)}>
          Show {STEP} more days
        </Button>
        <span className="text-[11.5px] text-ink-4">
          through {formatDate(addDays(today, horizon + STEP - 1), { weekday: false })}
        </span>
        {beyond.length > 0 && (
          <button
            onClick={onSeeAll}
            className="group/beyond ml-auto flex items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-[12.5px] text-ink-3 hover:bg-hover hover:text-ink cursor-pointer transition-colors duration-150"
          >
            <span className="tnum">{beyond.length}</span>
            <span>scheduled after {formatDate(horizonEnd, { weekday: false })}</span>
            <ArrowRight
              aria-hidden
              className="size-3.5 transition-transform duration-200 ease-[var(--ease-out-apple)] group-hover/beyond:translate-x-0.5"
            />
          </button>
        )}
      </div>
    </div>
  );
}
