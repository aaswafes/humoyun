"use client";

import * as React from "react";
import {
  ArrowDownUp, BookmarkPlus, ChevronDown, Flag, Group, ListFilter, Search, Tag as TagIcon, X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import { friendlyDate, todayISO } from "@/lib/date";
import { PRIORITY_LABELS, type Task, type TaskKind, type TaskStatus, type Tint } from "@/lib/types";
import { Button, EmptyState, Input } from "@/components/ui/primitives";
import { Popover, MenuItem, MenuLabel, MenuSeparator } from "@/components/ui/overlays";
import { openQuickAdd } from "@/components/shell/quick-add";
import {
  useTriage, useRegisterRows, useRegisterRowDrop,
  type GroupKey, type SortKey,
} from "./triage-context";
import { TriageRow } from "./triage-dnd";
import { QuickSchedule } from "./quick-schedule";
import { LabelHeader } from "./group-header";
import { VirtualRows } from "./virtual-list";
import { saveView } from "./saved-views";

/** Past this many rows the list stops rendering what nobody can see. */
const VIRTUAL_AFTER = 100;

export const SORT_LABELS: Record<SortKey, string> = {
  manual: "Manual",
  date: "Date",
  priority: "Priority",
  created: "Newest",
  alpha: "A–Z",
};

export const GROUP_LABELS: Record<GroupKey, string> = {
  none: "Nothing",
  date: "Date",
  priority: "Priority",
  status: "Status",
  tag: "Tag",
  kind: "Type",
};

export const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "To-do",
  doing: "Doing",
  done: "Done",
  dropped: "Dropped",
};

const STATUS_ORDER: TaskStatus[] = ["todo", "doing", "done", "dropped"];
const SORT_ORDER: SortKey[] = ["date", "priority", "created", "alpha"];
const GROUP_ORDER: GroupKey[] = ["none", "date", "priority", "status", "tag", "kind"];

const KIND_LABELS: Record<TaskKind, string> = {
  task: "Tasks", event: "Events", reading: "Reading", habit: "Habits",
  prayer: "Prayer", block: "Blocks", milestone: "Milestones",
};

function sortTasks(list: Task[], sort: SortKey): Task[] {
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

function Chip({
  label, value, icon: Icon, active,
}: {
  label: string;
  value?: string;
  icon: React.ComponentType<{ className?: string }>;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={value ? `${label}: ${value}` : label}
      className={cn(
        "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 text-[12.5px] font-medium cursor-pointer",
        "transition-[background-color,color] duration-150 ease-[var(--ease-out-apple)]",
        active ? "bg-accent-soft text-accent" : "bg-hover text-ink-2 hover:bg-active hover:text-ink",
      )}
    >
      <Icon aria-hidden className="size-3.5" />
      <span>{value ?? label}</span>
      <ChevronDown aria-hidden className="size-3 opacity-60" />
    </button>
  );
}

type ListRow =
  | { kind: "header"; key: string; label: string; count: number }
  | { kind: "task"; key: string; task: Task };

const rowKey = (row: ListRow) => row.key;

export function AllView({ searchRef }: { searchRef?: React.RefObject<HTMLInputElement | null> }) {
  const tasks = useStore((s) => s.tasks);
  const tagRows = useStore((s) => s.tags);
  const toast = useStore((s) => s.toast);

  const { filters: f, patchFilters, resetFilters, cursorId, announce, tab } = useTriage();
  const [viewName, setViewName] = React.useState("");
  const today = todayISO();

  const tagColors = React.useMemo(() => {
    const map = new Map<string, Tint>();
    tagRows.forEach((t) => map.set(t.name, t.color));
    return map;
  }, [tagRows]);

  const allTags = React.useMemo(() => {
    const set = new Set<string>();
    tagRows.forEach((t) => set.add(t.name));
    tasks.forEach((t) => t.tags.forEach((tag) => set.add(tag)));
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [tagRows, tasks]);

  const filtered = React.useMemo(() => {
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
  }, [tasks, f]);

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

  function persistView() {
    const name = viewName.trim();
    if (!name) return;
    saveView({ name, tab, filters: f });
    setViewName("");
    toast({ title: `Saved “${name}”`, description: "Pinned to the view bar.", tone: "success" });
    announce(`View ${name} saved`);
  }

  return (
    <div>
      <div className="sticky top-0 z-10 -mx-3 mb-2 flex flex-wrap items-center gap-1.5 px-3 py-2 material hairline-b">
        <div className="relative min-w-[170px] flex-1">
          <Search aria-hidden className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-ink-4" />
          <Input
            ref={searchRef}
            value={f.q}
            onChange={(e) => patchFilters({ q: e.target.value })}
            placeholder="Search titles, notes and tags"
            aria-label="Search tasks"
            className="h-7 pl-7 pr-7"
          />
          {f.q && (
            <button
              onClick={() => patchFilters({ q: "" })}
              aria-label="Clear search"
              className="absolute right-1.5 top-1/2 grid size-5 -translate-y-1/2 place-items-center rounded-sm text-ink-4 hover:bg-hover hover:text-ink cursor-pointer transition-colors"
            >
              <X className="size-3" />
            </button>
          )}
        </div>

        <Popover
          align="start"
          className="max-h-[300px] w-[220px] overflow-y-auto"
          trigger={
            <Chip
              icon={TagIcon}
              label="Tags"
              value={f.tags.length ? `${f.tags.length} tag${f.tags.length > 1 ? "s" : ""}` : undefined}
              active={f.tags.length > 0}
            />
          }
        >
          {allTags.length === 0 ? (
            <p className="px-2 py-2 text-[12.5px] text-ink-3">
              No tags yet. Type <span className="text-ink-2">#focus</span> while adding a task.
            </p>
          ) : (
            <>
              {allTags.map((tag) => {
                const on = f.tags.includes(tag);
                return (
                  <MenuItem
                    key={tag}
                    checked={on}
                    onClick={() =>
                      patchFilters({ tags: on ? f.tags.filter((t) => t !== tag) : [...f.tags, tag] })
                    }
                  >
                    <span className={cn(`tint-${tagColors.get(tag) ?? "slate"}`, "inline-flex items-center gap-1.5")}>
                      <span className="size-2 shrink-0 rounded-full bg-[var(--tint)]" />
                      {tag}
                    </span>
                  </MenuItem>
                );
              })}
              {f.tags.length > 0 && (
                <>
                  <MenuSeparator />
                  <MenuItem icon={X} onClick={() => patchFilters({ tags: [] })}>Clear tags</MenuItem>
                </>
              )}
            </>
          )}
        </Popover>

        <Popover
          align="start"
          className="w-[160px]"
          trigger={
            <Chip
              icon={Flag}
              label="Priority"
              value={f.priority !== null ? PRIORITY_LABELS[f.priority] : undefined}
              active={f.priority !== null}
            />
          }
        >
          {(close) => (
            <>
              <MenuItem checked={f.priority === null} onClick={() => { patchFilters({ priority: null }); close(); }}>
                Any priority
              </MenuItem>
              <MenuSeparator />
              {[3, 2, 1, 0].map((p) => (
                <MenuItem key={p} checked={f.priority === p} onClick={() => { patchFilters({ priority: p }); close(); }}>
                  {PRIORITY_LABELS[p]}
                </MenuItem>
              ))}
            </>
          )}
        </Popover>

        <Popover
          align="start"
          className="w-[160px]"
          trigger={
            <Chip
              icon={ListFilter}
              label="Status"
              value={f.status !== "any" ? STATUS_LABELS[f.status] : undefined}
              active={f.status !== "any"}
            />
          }
        >
          {(close) => (
            <>
              <MenuItem checked={f.status === "any"} onClick={() => { patchFilters({ status: "any" }); close(); }}>
                Any status
              </MenuItem>
              <MenuSeparator />
              {STATUS_ORDER.map((s) => (
                <MenuItem key={s} checked={f.status === s} onClick={() => { patchFilters({ status: s }); close(); }}>
                  {STATUS_LABELS[s]}
                </MenuItem>
              ))}
            </>
          )}
        </Popover>

        <Popover
          align="start"
          className="w-[190px]"
          trigger={
            <Chip
              icon={Group}
              label="Group"
              value={f.group !== "none" ? GROUP_LABELS[f.group] : undefined}
              active={f.group !== "none"}
            />
          }
        >
          {(close) => (
            <>
              <MenuLabel>Group by</MenuLabel>
              {GROUP_ORDER.map((key) => (
                <MenuItem key={key} checked={f.group === key} onClick={() => { patchFilters({ group: key }); close(); }}>
                  {GROUP_LABELS[key]}
                </MenuItem>
              ))}
              {f.group === "tag" && (
                <p className="px-2 pb-1 pt-0.5 text-[11px] leading-snug text-ink-4">
                  A task with several tags sits under its first one.
                </p>
              )}
            </>
          )}
        </Popover>

        <Popover
          align="end"
          className="w-[170px]"
          trigger={<Chip icon={ArrowDownUp} label="Sort" value={SORT_LABELS[f.sort]} />}
        >
          {(close) => (
            <>
              <MenuLabel>Sort by</MenuLabel>
              {SORT_ORDER.map((key) => (
                <MenuItem key={key} checked={f.sort === key} onClick={() => { patchFilters({ sort: key }); close(); }}>
                  {SORT_LABELS[key]}
                </MenuItem>
              ))}
            </>
          )}
        </Popover>

        <Popover
          align="end"
          className="w-[248px] p-2"
          trigger={
            <button
              type="button"
              aria-label="Save this view"
              title="Save this combination of filters"
              className="inline-flex size-7 items-center justify-center rounded-md bg-hover text-ink-2 hover:bg-active hover:text-ink cursor-pointer transition-colors"
            >
              <BookmarkPlus aria-hidden className="size-3.5" />
            </button>
          }
        >
          {(close) => (
            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">
                Save this view
              </p>
              <Input
                value={viewName}
                onChange={(e) => setViewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  if (!viewName.trim()) return;
                  persistView();
                  close();
                }}
                placeholder="Name it — “Deep work”"
                aria-label="View name"
                className="h-7"
              />
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="text-[11px] text-ink-4 tnum">{filtered.length} rows</span>
                <Button
                  variant="primary"
                  size="xs"
                  disabled={!viewName.trim()}
                  onClick={() => { persistView(); close(); }}
                >
                  Save &amp; pin
                </Button>
              </div>
            </div>
          )}
        </Popover>

        {dirty && (
          <Button variant="ghost" size="xs" onClick={resetFilters}>
            Clear
          </Button>
        )}
      </div>

      {filtered.length === 0 ? (
        dirty ? (
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
        )
      ) : (
        <>
          <p aria-live="polite" aria-atomic="true" className="mb-1 px-2 text-[11.5px] text-ink-4">
            <span className="tnum">{filtered.length}</span>
            {filtered.length === 1 ? " task" : " tasks"}
            {f.group !== "none" && (
              <> in <span className="tnum">{buckets.length}</span> {buckets.length === 1 ? "group" : "groups"}</>
            )}
            {virtual && <span className="text-ink-4"> · windowed</span>}
          </p>

          <div role="group" aria-label={`${filtered.length} matching tasks`}>
            {virtual ? (
              <VirtualRows
                items={listRows}
                getKey={rowKey}
                estimate={34}
                focusKey={cursorId}
                render={renderRow}
              />
            ) : (
              listRows.map((row) => renderRow(row))
            )}
          </div>
        </>
      )}
    </div>
  );
}
