"use client";

import * as React from "react";
import {
  ArrowDownUp, ChevronDown, Flag, ListFilter, Search, Tag as TagIcon, X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import { PRIORITY_LABELS, type Task, type TaskStatus, type Tint } from "@/lib/types";
import { Button, EmptyState, Input } from "@/components/ui/primitives";
import { Popover, MenuItem, MenuLabel, MenuSeparator } from "@/components/ui/overlays";
import { openQuickAdd } from "@/components/shell/quick-add";
import { SelectableRow } from "./selectable-row";
import { QuickSchedule } from "./quick-schedule";
import { useSelectionHotkeys } from "./selection";

const PAGE = 100;

type SortKey = "date" | "priority" | "created" | "alpha";

const SORT_LABELS: Record<SortKey, string> = {
  date: "Date",
  priority: "Priority",
  created: "Newest",
  alpha: "A–Z",
};

const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "To-do",
  doing: "Doing",
  done: "Done",
  dropped: "Dropped",
};

const STATUS_ORDER: TaskStatus[] = ["todo", "doing", "done", "dropped"];

interface Filters {
  q: string;
  tags: string[];
  priority: number | null;
  status: TaskStatus | "any";
  sort: SortKey;
}

const INITIAL: Filters = { q: "", tags: [], priority: null, status: "any", sort: "date" };

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

function Chip({
  label, value, icon: Icon, active, onClick,
}: {
  label: string;
  value?: string;
  icon: React.ComponentType<{ className?: string }>;
  active?: boolean;
  onClick?: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 text-[12.5px] font-medium cursor-pointer",
        "transition-[background-color,color] duration-150 ease-[var(--ease-out-apple)]",
        active ? "bg-accent-soft text-accent" : "bg-hover text-ink-2 hover:bg-active hover:text-ink",
      )}
    >
      <Icon className="size-3.5" />
      <span>{value ?? label}</span>
      <ChevronDown className="size-3 opacity-60" />
    </button>
  );
}

export function AllView() {
  const tasks = useStore((s) => s.tasks);
  const tagRows = useStore((s) => s.tags);

  const [f, setF] = React.useState<Filters>(INITIAL);
  const [limit, setLimit] = React.useState(PAGE);

  // Any filter change restarts paging — otherwise page 3 of the old query bleeds through.
  const update = React.useCallback((changes: Partial<Filters>) => {
    setF((prev) => ({ ...prev, ...changes }));
    setLimit(PAGE);
  }, []);

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

  const visible = React.useMemo(() => filtered.slice(0, limit), [filtered, limit]);
  const order = React.useMemo(() => visible.map((t) => t.id), [visible]);
  useSelectionHotkeys();

  const dirty = f.q !== "" || f.tags.length > 0 || f.priority !== null || f.status !== "any";
  const remaining = filtered.length - visible.length;

  return (
    <div>
      <div className="sticky top-0 z-10 -mx-3 mb-2 flex flex-wrap items-center gap-1.5 px-3 py-2 material hairline-b">
        <div className="relative min-w-[170px] flex-1">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-ink-4" />
          <Input
            value={f.q}
            onChange={(e) => update({ q: e.target.value })}
            placeholder="Search titles, notes and tags"
            aria-label="Search tasks"
            className="h-7 pl-7 pr-7"
          />
          {f.q && (
            <button
              onClick={() => update({ q: "" })}
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
                      update({ tags: on ? f.tags.filter((t) => t !== tag) : [...f.tags, tag] })
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
                  <MenuItem icon={X} onClick={() => update({ tags: [] })}>Clear tags</MenuItem>
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
              <MenuItem checked={f.priority === null} onClick={() => { update({ priority: null }); close(); }}>
                Any priority
              </MenuItem>
              <MenuSeparator />
              {[3, 2, 1, 0].map((p) => (
                <MenuItem
                  key={p}
                  checked={f.priority === p}
                  onClick={() => { update({ priority: p }); close(); }}
                >
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
              <MenuItem checked={f.status === "any"} onClick={() => { update({ status: "any" }); close(); }}>
                Any status
              </MenuItem>
              <MenuSeparator />
              {STATUS_ORDER.map((s) => (
                <MenuItem key={s} checked={f.status === s} onClick={() => { update({ status: s }); close(); }}>
                  {STATUS_LABELS[s]}
                </MenuItem>
              ))}
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
              {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
                <MenuItem key={key} checked={f.sort === key} onClick={() => { update({ sort: key }); close(); }}>
                  {SORT_LABELS[key]}
                </MenuItem>
              ))}
            </>
          )}
        </Popover>

        {dirty && (
          <Button variant="ghost" size="xs" onClick={() => { setF(INITIAL); setLimit(PAGE); }}>
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
            action={
              <Button variant="secondary" size="sm" onClick={() => { setF(INITIAL); setLimit(PAGE); }}>
                Clear filters
              </Button>
            }
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
          <p className="mb-1 px-2 text-[11.5px] text-ink-4">
            <span className="tnum">{visible.length}</span>
            {remaining > 0 && <> of <span className="tnum">{filtered.length}</span></>}
            {filtered.length === 1 ? " task" : " tasks"}
          </p>

          {visible.map((task) => (
            <SelectableRow
              key={task.id}
              task={task}
              order={order}
              showDate
              trailing={<QuickSchedule task={task} />}
            />
          ))}

          {remaining > 0 && (
            <div className="mt-3 flex justify-center">
              <Button variant="secondary" size="sm" onClick={() => setLimit((l) => l + PAGE)}>
                Show {Math.min(PAGE, remaining)} more
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
