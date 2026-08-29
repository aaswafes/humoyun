"use client";

import * as React from "react";
import { Inbox as InboxIcon, Plus } from "lucide-react";
import { useStore, inboxTasks, orderBetween } from "@/lib/store";
import type { Task } from "@/lib/types";
import { InlineComposer } from "@/components/tasks/task-list";
import { Button, EmptyState } from "@/components/ui/primitives";
import { openQuickAdd } from "@/components/shell/quick-add";
import {
  useTriage, useRegisterRows, useRegisterRowDrop, useRegisterSummary, type SortKey,
} from "./triage-context";
import { TriageRow } from "./triage-dnd";
import { QuickSchedule } from "./quick-schedule";

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
  // The order picker and the select-all button moved to the surface's one
  // control row; the choice itself still lives here, in the list it orders.
  const { selecting, announce, inboxSort: sort } = useTriage();

  const items = React.useMemo(() => sortInbox(inboxTasks(tasks), sort), [tasks, sort]);
  const order = React.useMemo(() => items.map((t) => t.id), [items]);
  useRegisterRows(order);

  // The page header already says "N unscheduled". Saying it again here was the
  // same fact twice.
  useRegisterSummary("");

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
        <div className="mt-4 pt-3 hairline-t">
          <InlineComposer autoFocus date={null} placeholder="Capture a task" />
        </div>
      )}
    </div>
  );
}
