"use client";

import * as React from "react";
import { ListFilter, Search } from "lucide-react";
import { useStore } from "@/lib/store";
import { friendlyDate, todayISO } from "@/lib/date";
import { PRIORITY_LABELS, type Task } from "@/lib/types";
import { Button, EmptyState } from "@/components/ui/primitives";
import { openQuickAdd } from "@/components/shell/quick-add";
import {
  useTriage, useRegisterRows, useRegisterRowDrop, useRegisterSummary,
  type Filters, type GroupKey, type SortKey,
} from "./triage-context";
import { TriageRow } from "./triage-dnd";
import { QuickSchedule } from "./quick-schedule";
import { LabelHeader } from "./group-header";
import { VirtualRows } from "./virtual-list";
import { KIND_LABELS, STATUS_LABELS, STATUS_ORDER } from "./labels";

/** Past this many rows the list stops rendering what nobody can see. */
const VIRTUAL_AFTER = 100;

export function sortTasks(list: Task[], sort: SortKey): Task[] {
  const copy = [...list];
  switch (sort) {
    case "priority":
      return copy.sort(
        (a, b) => b.priority - a.priority || (a.date ?? "9999").localeCompare(b.date ?? "9999"),
      );
    case "created":
      return copy.sort((a, b) => b.created_at.localeCompare(a.created_at));
    case "alpha":
      return copy.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }));
    case "manual":
      return copy.sort((a, b) => a.order_index - b.order_index);
    default:
      // undated tasks sink to the bottom rather than pretending to be the year 0
      return copy.sort((a, b) => {
        if (!a.date && !b.date) return a.order_index - b.order_index;
        if (!a.date) return 1;
        if (!b.date) return -1;
        if (a.date !== b.date) return a.date < b.date ? -1 : 1;
        return (a.start_min ?? 1440) - (b.start_min ?? 1440) || a.order_index - b.order_index;
      });
  }
}

/**
 * Search, tags, priority, status and sort applied in one pass. Exported so the
 * page header can say how many rows the current filters leave without the list
 * having to tell it — one number, computed one way.
 */
export function filterTasks(tasks: Task[], f: Filters): Task[] {
  const q = f.q.trim().toLowerCase();
  let list = tasks.filter((t) => !t.parent_id);
  if (q) {
    list = list.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        (t.notes ?? "").toLowerCase().includes(q) ||
        t.tags.some((tag) => tag.toLowerCase().includes(q)),
    );
  }
  if (f.tags.length) list = list.filter((t) => t.tags.some((tag) => f.tags.includes(tag)));
  if (f.priority !== null) list = list.filter((t) => t.priority === f.priority);
  if (f.status !== "any") list = list.filter((t) => t.status === f.status);
  return sortTasks(list, f.sort);
}

interface Bucket { key: string; label: string; items: Task[] }

function bucketOf(task: Task, group: GroupKey, today: string): { key: string; label: string; rank: number } {
  switch (group) {
    case "date": {
      if (!task.date) return { key: "none", label: "No date", rank: 4 };
      if (task.date < today) return { key: "overdue", label: "Overdue", rank: 0 };
      if (task.date === today) return { key: today, label: "Today", rank: 1 };
      return { key: task.date, label: friendlyDate(task.date), rank: 2 };
    }
    case "priority":
      return {
        key: `p${task.priority}`,
        label: task.priority ? `${PRIORITY_LABELS[task.priority]} priority` : "No priority",
        rank: 3 - task.priority,
      };
    case "status":
      return { key: task.status, label: STATUS_LABELS[task.status], rank: STATUS_ORDER.indexOf(task.status) };
    case "tag": {
      const tag = task.tags[0];
      return tag ? { key: `#${tag}`, label: `#${tag}`, rank: 0 } : { key: "untagged", label: "Untagged", rank: 1 };
    }
    case "kind":
      return { key: task.kind, label: KIND_LABELS[task.kind] ?? task.kind, rank: 0 };
    default:
      return { key: "all", label: "All", rank: 0 };
  }
}

function groupTasks(list: Task[], group: GroupKey, today: string): Bucket[] {
  if (group === "none") return [{ key: "all", label: "All", items: list }];
  const map = new Map<string, Bucket & { rank: number }>();
  list.forEach((task) => {
    const b = bucketOf(task, group, today);
    const existing = map.get(b.key);
    if (existing) existing.items.push(task);
    else map.set(b.key, { key: b.key, label: b.label, rank: b.rank, items: [task] });
  });
  return [...map.values()].sort(
    (a, b) => a.rank - b.rank || a.key.localeCompare(b.key),
  );
}

type ListRow =
  | { kind: "header"; key: string; label: string; count: number }
  | { kind: "task"; key: string; task: Task };

const rowKey = (row: ListRow) => row.key;

export function AllView() {
  const tasks = useStore((s) => s.tasks);
  const { filters: f, resetFilters, cursorId } = useTriage();
  const today = todayISO();

  const filtered = React.useMemo(() => filterTasks(tasks, f), [tasks, f]);

  const buckets = React.useMemo(
    () => groupTasks(filtered, f.group, today),
    [filtered, f.group, today],
  );

  const listRows = React.useMemo<ListRow[]>(() => {
    const out: ListRow[] = [];
    buckets.forEach((bucket) => {
      if (f.group !== "none") {
        out.push({ kind: "header", key: `h:${bucket.key}`, label: bucket.label, count: bucket.items.length });
      }
      bucket.items.forEach((task) => out.push({ kind: "task", key: task.id, task }));
    });
    return out;
  }, [buckets, f.group]);

  const order = React.useMemo(() => filtered.map((t) => t.id), [filtered]);
  useRegisterRows(order);
  useRegisterRowDrop(null);

  const dirty =
    f.q !== "" || f.tags.length > 0 || f.priority !== null || f.status !== "any" ||
    f.sort !== "date" || f.group !== "none";
  const virtual = listRows.length > VIRTUAL_AFTER;

  // The header already says how many rows there are; this line only speaks when
  // it has something the header cannot say.
  useRegisterSummary(
    [
      f.group !== "none" ? `${buckets.length} ${buckets.length === 1 ? "group" : "groups"}` : "",
      virtual ? "windowed" : "",
    ].filter(Boolean).join(" · "),
  );

  const renderRow = React.useCallback(
    (row: ListRow) =>
      row.kind === "header" ? (
        <LabelHeader key={row.key} title={row.label} count={row.count} sticky={!virtual} />
      ) : (
        <TriageRow
          key={row.key}
          task={row.task}
          order={order}
          showDate
          trailing={<QuickSchedule task={row.task} />}
        />
      ),
    [order, virtual],
  );

  if (filtered.length === 0) {
    return dirty ? (
      <EmptyState
        icon={Search}
        title="Nothing matches"
        description="No task fits this combination of search, tags, priority and status."
        action={<Button variant="secondary" size="sm" onClick={resetFilters}>Clear filters</Button>}
      />
    ) : (
      <EmptyState
        icon={ListFilter}
        title="No tasks yet"
        description="Every task you create — dated or not, open or finished — is searchable from this tab."
        action={<Button variant="primary" size="sm" onClick={openQuickAdd}>New task</Button>}
      />
    );
  }

  return (
    <div role="group" aria-label={`${filtered.length} matching tasks`}>
      {virtual ? (
        <VirtualRows
          items={listRows}
          getKey={rowKey}
          estimate={38}
          focusKey={cursorId}
          render={renderRow}
        />
      ) : (
        listRows.map((row) => renderRow(row))
      )}
    </div>
  );
}
