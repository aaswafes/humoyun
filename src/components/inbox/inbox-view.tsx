"use client";

import * as React from "react";
import { ArrowDownUp, Inbox as InboxIcon, ListChecks, Plus } from "lucide-react";
import { useStore, inboxTasks, orderBetween } from "@/lib/store";
import type { Task } from "@/lib/types";
import { InlineComposer } from "@/components/tasks/task-list";
import { Button, EmptyState } from "@/components/ui/primitives";
import { MenuItem, MenuLabel, Popover } from "@/components/ui/overlays";
import { openQuickAdd } from "@/components/shell/quick-add";
import { useTriage, useRegisterRows, useRegisterRowDrop, type SortKey } from "./triage-context";
import { TriageRow } from "./triage-dnd";
import { QuickSchedule } from "./quick-schedule";

const SORT_LABELS: Record<SortKey, string> = {
  manual: "My order",
  date: "Date added",
  priority: "Priority",
  created: "Newest first",
  alpha: "A–Z",
};

const INBOX_SORTS: SortKey[] = ["manual", "priority", "created", "alpha"];

function sortInbox(list: Task[], sort: SortKey): Task[] {
  const copy = [...list];
  switch (sort) {
    case "priority":
      return copy.sort((a, b) => b.priority - a.priority || a.order_index - b.order_index);
    case "created":
      return copy.sort((a, b) => b.created_at.localeCompare(a.created_at));
    case "alpha":
      return copy.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }));
    default:
      return copy;
  }
}

export function InboxView() {
  const tasks = useStore((s) => s.tasks);
  const patch = useStore((s) => s.patch);
  const { selecting, setSelecting, setSelected, count, announce } = useTriage();
  const [sort, setSort] = React.useState<SortKey>("manual");

  const items = React.useMemo(() => sortInbox(inboxTasks(tasks), sort), [tasks, sort]);
  const order = React.useMemo(() => items.map((t) => t.id), [items]);
  useRegisterRows(order);

  const manual = sort === "manual";

  // Fractional ordering: only the rows that actually moved get rewritten.
  const onRowDrop = React.useCallback(
    (overId: string, ids: string[]) => {
      if (!manual) {
        announce("Switch to My order to rearrange by hand");
        return;
      }
      const moving = new Set(ids);
      const rest = items.filter((t) => !moving.has(t.id));
      const overAt = rest.findIndex((t) => t.id === overId);
      const insertAt = overAt < 0 ? rest.length : overAt;
      const movers = items.filter((t) => moving.has(t.id));
      const next = [...rest.slice(0, insertAt), ...movers, ...rest.slice(insertAt)];

      const orders = new Map(next.map((t) => [t.id, t.order_index]));
      next.forEach((task, i) => {
        if (!moving.has(task.id)) return;
        const before = i > 0 ? orders.get(next[i - 1].id) : undefined;
        const after = i < next.length - 1 ? orders.get(next[i + 1].id) : undefined;
        const value = orderBetween(before, after);
        orders.set(task.id, value);
        patch("tasks", task.id, { order_index: value });
      });
      announce(`Moved ${movers.length} ${movers.length === 1 ? "task" : "tasks"}`);
    },
    [items, manual, patch, announce],
  );

  useRegisterRowDrop(onRowDrop);

  if (items.length === 0) {
    return (
      <EmptyState
        icon={InboxIcon}
        title="Inbox zero"
        description="Anything captured without a date waits here. Write one below, then throw it at Today, Tomorrow or the weekend — with the mouse, or with T, M and W."
        action={
          <Button variant="primary" size="sm" onClick={openQuickAdd}>
            <Plus className="size-3.5" />
            Capture something
          </Button>
        }
      />
    );
  }

  return (
    <div>
      <div className="mb-1 flex items-center gap-2 px-1.5">
        <p className="text-[12.5px] text-ink-3">
          <span className="tnum text-ink-2">{items.length}</span> waiting
        </p>
        <div className="flex-1" />

        <button
          type="button"
          onClick={() => {
            if (!selecting) setSelecting(true);
            setSelected(order, true);
            announce(`Selected all ${order.length} tasks`);
          }}
          className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[12px] text-ink-3 hover:bg-hover hover:text-ink cursor-pointer transition-colors"
        >
          <ListChecks aria-hidden className="size-3.5" />
          {count ? "Select all" : "Select"}
        </button>

        <Popover
          align="end"
          className="w-[180px]"
          trigger={
            <button
              type="button"
              className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[12px] text-ink-3 hover:bg-hover hover:text-ink cursor-pointer transition-colors"
            >
              <ArrowDownUp aria-hidden className="size-3.5" />
              {SORT_LABELS[sort]}
            </button>
          }
        >
          {(close) => (
            <>
              <MenuLabel>Order</MenuLabel>
              {INBOX_SORTS.map((key) => (
                <MenuItem
                  key={key}
                  checked={sort === key}
                  onClick={() => { setSort(key); close(); }}
                >
                  {SORT_LABELS[key]}
                </MenuItem>
              ))}
            </>
          )}
        </Popover>
      </div>

      <div role="group" aria-label={`${items.length} unscheduled tasks`}>
        {items.map((task) => (
          <TriageRow
            key={task.id}
            task={task}
            order={order}
            trailing={<QuickSchedule task={task} />}
          />
        ))}
      </div>

      {!selecting && (
        <div className="mt-1 border-t border-line pt-1">
          <InlineComposer autoFocus date={null} placeholder="Capture a task" />
        </div>
      )}
    </div>
  );
}
