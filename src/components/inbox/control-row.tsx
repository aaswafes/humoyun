"use client";

import * as React from "react";
import { ListChecks, Search, SlidersHorizontal, Trash2, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import { addDays, formatDate, todayISO } from "@/lib/date";
import { PRIORITY_LABELS, type Tint } from "@/lib/types";
import { Button, IconButton, Input, Segmented } from "@/components/ui/primitives";
import { MenuItem, MenuLabel, MenuSeparator, Popover, ConfirmDialog } from "@/components/ui/overlays";
import { Select } from "@/components/ui/form";
import { useTriage, type SortKey, type TriageLayout } from "./triage-context";
import { ViewsMenu } from "./views-bar";
import {
  GROUP_LABELS, GROUP_ORDER, INBOX_SORTS, INBOX_SORT_LABELS, SORT_LABELS, SORT_ORDER,
  STATUS_LABELS, STATUS_ORDER,
} from "./labels";
import { KEEP_DAYS, staleTasks } from "./archive";

// =========================================================
// One row of controls for the whole surface.
//
// Before this there were three: a strip of saved-view pills, a filter bar of
// six chips, and a per-view line of counts and options. They are all folded
// into the row below — the views into a dropdown, the filters into a single
// popover that carries its own active count, and every aggregate number into
// one quiet slot on the right that the active view fills in.
// =========================================================

/** Facets that count as "a filter is on" — sort is always set, so it never counts. */
function activeFilterCount(f: {
  tags: string[]; priority: number | null; status: string; group: string;
}): number {
  return (
    (f.tags.length ? 1 : 0) +
    (f.priority !== null ? 1 : 0) +
    (f.status !== "any" ? 1 : 0) +
    (f.group !== "none" ? 1 : 0)
  );
}

function SearchBox({
  inputRef, placeholder, label,
}: {
  inputRef?: React.RefObject<HTMLInputElement | null>;
  placeholder: string;
  label: string;
}) {
  const { filters, patchFilters } = useTriage();
  return (
    <div className="relative min-w-[150px] max-w-[300px] flex-1">
      <Search aria-hidden className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-ink-4" />
      <Input
        ref={inputRef}
        value={filters.q}
        onChange={(e) => patchFilters({ q: e.target.value })}
        placeholder={placeholder}
        aria-label={label}
        className="h-7 pl-7 pr-7"
      />
      {filters.q && (
        <button
          type="button"
          onClick={() => patchFilters({ q: "" })}
          aria-label="Clear search"
          className="absolute right-1.5 top-1/2 grid size-5 -translate-y-1/2 place-items-center rounded-sm text-ink-4 hover:bg-hover hover:text-ink cursor-pointer transition-colors"
        >
          <X className="size-3" />
        </button>
      )}
    </div>
  );
}

/** Tags, priority, status, grouping and sort — five menus folded into one. */
function FiltersMenu() {
  const tasks = useStore((s) => s.tasks);
  const tagRows = useStore((s) => s.tags);
  const { filters: f, patchFilters, resetFilters } = useTriage();

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

  const n = activeFilterCount(f);

  return (
    <Popover
      align="start"
      className="max-h-[420px] w-[240px] overflow-y-auto"
      trigger={
        <button
          type="button"
          aria-label={n ? `Filters, ${n} active` : "Filters"}
          className={cn(
            "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 text-[12.5px] cursor-pointer",
            "transition-colors duration-150 ease-[var(--ease-out-apple)]",
            n ? "bg-accent-soft text-accent font-medium" : "text-ink-3 hover:bg-hover hover:text-ink",
          )}
        >
          <SlidersHorizontal aria-hidden className="size-3.5" />
          Filters
          {n > 0 && <span className="tnum">{n}</span>}
        </button>
      }
    >
      <>
        <MenuLabel>Tags</MenuLabel>
        {allTags.length === 0 ? (
          <p className="px-2 pb-1 text-[11.5px] leading-snug text-ink-4">
            None yet. Type <span className="text-ink-3">#focus</span> while adding a task.
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
              <MenuItem icon={X} onClick={() => patchFilters({ tags: [] })}>Clear tags</MenuItem>
            )}
          </>
        )}

        <MenuSeparator />
        <MenuLabel>Priority</MenuLabel>
        <MenuItem checked={f.priority === null} onClick={() => patchFilters({ priority: null })}>
          Any priority
        </MenuItem>
        {[3, 2, 1, 0].map((p) => (
          <MenuItem key={p} checked={f.priority === p} onClick={() => patchFilters({ priority: p })}>
            {PRIORITY_LABELS[p]}
          </MenuItem>
        ))}

        <MenuSeparator />
        <MenuLabel>Status</MenuLabel>
        <MenuItem checked={f.status === "any"} onClick={() => patchFilters({ status: "any" })}>
          Any status
        </MenuItem>
        {STATUS_ORDER.map((s) => (
          <MenuItem key={s} checked={f.status === s} onClick={() => patchFilters({ status: s })}>
            {STATUS_LABELS[s]}
          </MenuItem>
        ))}

        <MenuSeparator />
        <MenuLabel>Group by</MenuLabel>
        {GROUP_ORDER.map((key) => (
          <MenuItem key={key} checked={f.group === key} onClick={() => patchFilters({ group: key })}>
            {GROUP_LABELS[key]}
          </MenuItem>
        ))}
        {f.group === "tag" && (
          <p className="px-2 pb-1 pt-0.5 text-[11px] leading-snug text-ink-4">
            A task with several tags sits under its first one.
          </p>
        )}

        <MenuSeparator />
        <MenuLabel>Sort by</MenuLabel>
        {SORT_ORDER.map((key) => (
          <MenuItem key={key} checked={f.sort === key} onClick={() => patchFilters({ sort: key })}>
            {SORT_LABELS[key]}
          </MenuItem>
        ))}

        <MenuSeparator />
        <MenuItem icon={X} onClick={resetFilters}>Reset everything</MenuItem>
      </>
    </Popover>
  );
}

/** Prune the archive. Lives out here so the Done view is nothing but its list. */
function ClearOlder() {
  const tasks = useStore((s) => s.tasks);
  const remove = useStore((s) => s.remove);
  const toast = useStore((s) => s.toast);
  const { announce } = useTriage();
  const [confirming, setConfirming] = React.useState(false);

  const cutoff = addDays(todayISO(), -KEEP_DAYS);
  const stale = React.useMemo(() => staleTasks(tasks, cutoff), [tasks, cutoff]);

  function clear() {
    const n = stale.length;
    stale.forEach((t) => remove("tasks", t.id));
    toast({ title: `Cleared ${n} completed ${n === 1 ? "task" : "tasks"}`, tone: "success" });
    announce(`Cleared ${n} completed tasks`);
  }

  return (
    <>
      <IconButton
        label={
          stale.length
            ? `Clear ${stale.length} completed before ${formatDate(cutoff, { weekday: false })}`
            : `Nothing completed before ${formatDate(cutoff, { weekday: false })}`
        }
        size="md"
        disabled={stale.length === 0}
        onClick={() => setConfirming(true)}
      >
        <Trash2 />
      </IconButton>

      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={clear}
        title={`Delete ${stale.length} completed ${stale.length === 1 ? "task" : "tasks"}?`}
        description={`Everything ticked off before ${formatDate(cutoff, { weekday: false, year: true })} will be removed permanently. Tasks that still have unfinished subtasks are kept.`}
        confirmLabel="Delete"
      />
    </>
  );
}

function LayoutToggle() {
  const { layout, setLayout } = useTriage();
  return (
    <Segmented<TriageLayout>
      value={layout}
      onChange={setLayout}
      size="sm"
      options={[
        { value: "list", label: "List" },
        { value: "matrix", label: "Matrix", title: "Urgent against important" },
      ]}
    />
  );
}

export function ControlRow({
  searchRef,
}: {
  searchRef?: React.RefObject<HTMLInputElement | null>;
}) {
  const {
    tab, filters, resetFilters, inboxSort, setInboxSort, summary,
    rows, selecting, setSelecting, setSelected, announce,
  } = useTriage();

  const dirty =
    filters.q !== "" || activeFilterCount(filters) > 0 || filters.sort !== "date";

  return (
    <div className="mb-5 flex flex-wrap items-center gap-1.5">
      <ViewsMenu />

      {(tab === "all" || tab === "done") && (
        <SearchBox
          inputRef={searchRef}
          placeholder={tab === "done" ? "Search the archive" : "Search titles, notes and tags"}
          label={tab === "done" ? "Search completed tasks" : "Search tasks"}
        />
      )}

      {tab === "all" && <FiltersMenu />}
      {tab === "all" && <LayoutToggle />}

      {tab === "all" && dirty && (
        <Button variant="ghost" size="xs" onClick={resetFilters}>Clear</Button>
      )}

      {tab === "inbox" && (
        <button
          type="button"
          onClick={() => {
            if (!selecting) setSelecting(true);
            setSelected(rows, true);
            announce(`Selected all ${rows.length} tasks`);
          }}
          className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 text-[12.5px] text-ink-3 hover:bg-hover hover:text-ink cursor-pointer transition-colors"
        >
          <ListChecks aria-hidden className="size-3.5" />
          Select all
        </button>
      )}

      <div className="flex-1" />

      {/* The one place a count is spoken on this surface. */}
      <p aria-live="polite" aria-atomic="true" className="truncate text-[12px] text-ink-4 tnum">
        {summary}
      </p>

      {tab === "inbox" && (
        <Select<SortKey>
          value={inboxSort}
          onChange={setInboxSort}
          label="Order"
          size="sm"
          align="end"
          className="w-[126px]"
          options={INBOX_SORTS.map((key) => ({ value: key, label: INBOX_SORT_LABELS[key] }))}
        />
      )}

      {tab === "done" && <ClearOlder />}
    </div>
  );
}
