"use client";

import * as React from "react";
import { ArrowDownNarrowWide, ArrowUpNarrowWide, Search, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { IconButton, Segmented } from "@/components/ui/primitives";
import { MenuItem, MenuLabel, MenuSeparator, Popover } from "@/components/ui/overlays";
import { Select } from "@/components/ui/form";
import type { SortDir, SortKey } from "./books-table";
import type { GroupBy } from "./library-prefs";

export type StatusFilter = "all" | "reading" | "planned" | "finished" | "paused";

const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "reading", label: "Reading" },
  { value: "planned", label: "Planned" },
  { value: "finished", label: "Finished" },
  { value: "paused", label: "Paused" },
];

const GROUPS: { value: GroupBy; label: string }[] = [
  { value: "status", label: "Status" },
  { value: "series", label: "Series" },
  { value: "author", label: "Author" },
  { value: "none", label: "No grouping" },
];

const SORTS: { value: SortKey; label: string }[] = [
  { value: "title", label: "Title" },
  { value: "author", label: "Author" },
  { value: "pages", label: "Pages" },
  { value: "progress", label: "Progress" },
  { value: "pace", label: "Pace" },
  { value: "daysLeft", label: "Days left" },
  { value: "finish", label: "Finish date" },
];

export function LibraryToolbar({
  query, onQuery, filter, onFilter, group, onGroup, sort, onSort, dir, onDir,
  showGrouping, count, total, className,
}: {
  query: string;
  onQuery: (v: string) => void;
  filter: StatusFilter;
  onFilter: (v: StatusFilter) => void;
  group: GroupBy;
  onGroup: (v: GroupBy) => void;
  sort: SortKey;
  onSort: (v: SortKey) => void;
  dir: SortDir;
  onDir: (v: SortDir) => void;
  /** the table sorts from its own column headers, so grouping is shelf-only */
  showGrouping: boolean;
  count: number;
  /** every book on the shelf — the count only earns its place when it differs */
  total: number;
  className?: string;
}) {
  const inputId = React.useId();
  const sortLabel = SORTS.find((s) => s.value === sort)?.label ?? "Title";
  const groupLabel = GROUPS.find((g) => g.value === group)?.label ?? "Status";
  const dirWord = dir === "asc" ? "ascending" : "descending";

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <div className="relative min-w-[180px] flex-1 sm:max-w-[260px]">
        <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-ink-4" aria-hidden />
        <input
          id={inputId}
          type="search"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          aria-label="Search the library by title, author or series"
          placeholder="Search title, author, series"
          className={cn(
            "h-8 w-full rounded-md border border-line bg-transparent pl-7 pr-8 text-[13px] text-ink",
            "transition-[border-color,box-shadow] duration-150 placeholder:text-ink-4",
            "hover:border-line-strong focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-soft",
            "[&::-webkit-search-cancel-button]:appearance-none",
          )}
        />
        {query && (
          <IconButton
            label="Clear the search"
            size="sm"
            className="absolute right-1 top-1/2 -translate-y-1/2"
            onClick={() => onQuery("")}
          >
            <X />
          </IconButton>
        )}
      </div>

      <Segmented<StatusFilter>
        size="sm"
        value={filter}
        onChange={onFilter}
        options={FILTERS}
        className="hidden md:inline-flex"
      />

      {/* the segmented control does not fit narrow screens, so it becomes a menu */}
      <div className="w-[116px] md:hidden">
        <Select<StatusFilter>
          label="Filter by status"
          value={filter}
          options={FILTERS}
          onChange={onFilter}
          size="sm"
        />
      </div>

      <div className="ml-auto flex items-center gap-1">
        {count !== total && (
          <span className="hidden pr-1 text-[11.5px] text-ink-4 tnum sm:inline">
            {count} of {total}
          </span>
        )}

        {/*
          Sort key, direction and grouping were three controls sitting open on
          a page whose job is to show covers. One quiet trigger that names the
          current sort holds all three.
        */}
        <Popover
          align="end"
          className="max-h-[70vh] w-[196px] overflow-y-auto"
          trigger={
            <button
              type="button"
              aria-label={
                `Sort and group. Sorted by ${sortLabel}, ${dirWord}`
                + (showGrouping ? `, grouped by ${groupLabel.toLowerCase()}` : "")
                + "."
              }
              className={cn(
                "inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md px-2 text-[12.5px] text-ink-2",
                "transition-colors duration-150 hover:bg-hover hover:text-ink",
              )}
            >
              {dir === "asc"
                ? <ArrowUpNarrowWide className="size-3.5 text-ink-3" aria-hidden />
                : <ArrowDownNarrowWide className="size-3.5 text-ink-3" aria-hidden />}
              <span className="truncate">{sortLabel}</span>
            </button>
          }
        >
          {(close) => (
            <>
              <MenuLabel>Sort by</MenuLabel>
              {SORTS.map((s) => (
                <MenuItem
                  key={s.value}
                  checked={s.value === sort}
                  onClick={() => { onSort(s.value); close(); }}
                >
                  {s.label}
                </MenuItem>
              ))}

              <MenuSeparator />
              <MenuItem checked={dir === "asc"} onClick={() => { onDir("asc"); close(); }}>
                Ascending
              </MenuItem>
              <MenuItem checked={dir === "desc"} onClick={() => { onDir("desc"); close(); }}>
                Descending
              </MenuItem>

              {showGrouping && (
                <>
                  <MenuSeparator />
                  <MenuLabel>Group the shelf</MenuLabel>
                  {GROUPS.map((g) => (
                    <MenuItem
                      key={g.value}
                      checked={g.value === group}
                      onClick={() => { onGroup(g.value); close(); }}
                    >
                      {g.label}
                    </MenuItem>
                  ))}
                </>
              )}
            </>
          )}
        </Popover>
      </div>
    </div>
  );
}
