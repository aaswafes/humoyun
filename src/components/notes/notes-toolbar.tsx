"use client";

import * as React from "react";
import { ListFilter, Search, Sun, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { NOTE_KINDS, NOTE_KIND_LABELS } from "@/lib/types";
import { Button, IconButton, Kbd } from "@/components/ui/primitives";
import { MenuItem, MenuLabel, MenuSeparator, Popover } from "@/components/ui/overlays";
import { NOTE_KIND_ICONS } from "./note-fields";
import { CategoryIcon } from "./category-picker";
import { hasCategory, toggleCategory, type CategoryCount, type CategoryIndex } from "./category-model";
import {
  NO_FILTERS, SOURCE_FILTERS, activeFilterCount, filterSummary, type NoteFilters,
} from "./note-model";

/** Past this many, the tag menu asks you to use the search box instead. */
const TAG_LIMIT = 14;
/** Categories are picked more often than tags, so more of them are worth showing. */
const CATEGORY_LIMIT = 16;

/**
 * One line above the notes: what you are looking for, today's page, and a
 * single control holding kind, source and tag. Three open filter rows is what
 * the calm pass folds away — but nothing is gone, it is one click in.
 */
export function NotesToolbar({
  query, onQuery, filters, onFilters, tags, categories, categoryIndex,
  count, total, searchRef, onDaily, className,
}: {
  query: string;
  onQuery: (next: string) => void;
  filters: NoteFilters;
  onFilters: (next: NoteFilters) => void;
  tags: { tag: string; count: number }[];
  categories: CategoryCount[];
  categoryIndex: CategoryIndex;
  count: number;
  /** every note written — the count only earns its place when it differs */
  total: number;
  searchRef?: React.Ref<HTMLInputElement>;
  onDaily: () => void;
  className?: string;
}) {
  const inputId = React.useId();
  const active = activeFilterCount(filters);
  const summary = filterSummary(filters);
  const shownTags = tags.slice(0, TAG_LIMIT);

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <div className="relative min-w-[180px] flex-1 sm:max-w-[280px]">
        <Search
          className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-ink-4"
          aria-hidden
        />
        <input
          id={inputId}
          ref={searchRef}
          type="search"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          aria-label="Search every note by title and body"
          placeholder="Search everything you have written"
          className={cn(
            "h-8 w-full rounded-md border border-line bg-transparent pl-7 pr-8 text-[13px] text-ink",
            "transition-[border-color,box-shadow] duration-150 placeholder:text-ink-4",
            "hover:border-line-strong focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-soft",
            "[&::-webkit-search-cancel-button]:appearance-none",
          )}
        />
        {query ? (
          <IconButton
            label="Clear the search"
            size="sm"
            className="absolute right-1 top-1/2 -translate-y-1/2"
            onClick={() => onQuery("")}
          >
            <X />
          </IconButton>
        ) : (
          <Kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2">/</Kbd>
        )}
      </div>

      <Button size="sm" onClick={onDaily}>
        <Sun className="size-3.5" />
        Today&rsquo;s note
      </Button>

      <div className="ml-auto flex items-center gap-1">
        {count !== total && (
          <span className="hidden pr-1 text-[11.5px] text-ink-4 tnum sm:inline">
            {count} of {total}
          </span>
        )}

        <Popover
          align="end"
          className="max-h-[70vh] w-[214px] overflow-y-auto"
          trigger={
            <button
              type="button"
              aria-label={`Filter notes. Showing ${summary.toLowerCase()}`}
              className={cn(
                "inline-flex h-8 max-w-[220px] cursor-pointer items-center gap-1.5 rounded-md px-2 text-[12.5px]",
                "transition-colors duration-150 hover:bg-hover hover:text-ink",
                active ? "bg-hover text-ink" : "text-ink-2",
              )}
            >
              <ListFilter className="size-3.5 shrink-0 text-ink-3" aria-hidden />
              <span className="truncate">{summary}</span>
            </button>
          }
        >
          {(close) => (
            <>
              {categories.length > 0 && (
                <>
                  <MenuLabel>Categories</MenuLabel>
                  {categories.slice(0, CATEGORY_LIMIT).map((category) => {
                    const on = hasCategory(filters.categories, category.name);
                    const look = categoryIndex.look(category.name);
                    return (
                      <MenuItem
                        key={category.name}
                        checked={on}
                        shortcut={String(category.count)}
                        onClick={() => onFilters({
                          ...filters,
                          categories: toggleCategory(filters.categories, category.name),
                        })}
                      >
                        <span className="flex items-center gap-1.5">
                          <span
                            aria-hidden
                            className={`tint-${look.color}`}
                            style={{ color: "var(--tint)" }}
                          >
                            <CategoryIcon name={look.icon} className="size-3.5" />
                          </span>
                          {category.name}
                        </span>
                      </MenuItem>
                    );
                  })}
                  {categories.length > CATEGORY_LIMIT && (
                    <p className="px-2 pb-1 pt-0.5 text-[11px] text-ink-4 tnum">
                      {categories.length - CATEGORY_LIMIT} more
                    </p>
                  )}
                  <MenuSeparator />
                </>
              )}

              <MenuLabel>Kind</MenuLabel>
              <MenuItem
                checked={filters.kind === "all"}
                onClick={() => onFilters({ ...filters, kind: "all" })}
              >
                Every kind
              </MenuItem>
              {NOTE_KINDS.map((kind) => (
                <MenuItem
                  key={kind}
                  icon={NOTE_KIND_ICONS[kind]}
                  checked={filters.kind === kind}
                  onClick={() => onFilters({ ...filters, kind })}
                >
                  {NOTE_KIND_LABELS[kind]}
                </MenuItem>
              ))}

              <MenuSeparator />
              <MenuLabel>Where it came from</MenuLabel>
              {SOURCE_FILTERS.map((source) => (
                <MenuItem
                  key={source.value}
                  checked={filters.source === source.value}
                  onClick={() => onFilters({ ...filters, source: source.value })}
                >
                  {source.label}
                </MenuItem>
              ))}

              {tags.length > 0 && (
                <>
                  <MenuSeparator />
                  <MenuLabel>Tag</MenuLabel>
                  <MenuItem
                    checked={filters.tag === null}
                    onClick={() => onFilters({ ...filters, tag: null })}
                  >
                    Any tag
                  </MenuItem>
                  {shownTags.map(({ tag, count: n }) => (
                    <MenuItem
                      key={tag}
                      checked={filters.tag === tag}
                      shortcut={String(n)}
                      onClick={() => onFilters({ ...filters, tag })}
                    >
                      #{tag}
                    </MenuItem>
                  ))}
                  {tags.length > shownTags.length && (
                    <p className="px-2 pb-1 pt-0.5 text-[11px] text-ink-4 tnum">
                      {tags.length - shownTags.length} more — search for one
                    </p>
                  )}
                </>
              )}

              {active > 0 && (
                <>
                  <MenuSeparator />
                  <MenuItem
                    onClick={() => { onFilters({ ...NO_FILTERS, query: filters.query }); close(); }}
                  >
                    Clear all filters
                  </MenuItem>
                </>
              )}
            </>
          )}
        </Popover>
      </div>
    </div>
  );
}
