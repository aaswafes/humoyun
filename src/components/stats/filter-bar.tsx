"use client";

import * as React from "react";
import { Check, Download, GitCompareArrows, Tag as TagIcon, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatDuration } from "@/lib/date";
import { Button } from "@/components/ui/primitives";
import { MenuItem, MenuSeparator, Popover } from "@/components/ui/overlays";
import { MiniEmpty } from "@/components/ui/form";
import type { TagUsage } from "./derive";

/**
 * The one place the page is steered from: which tags every panel is narrowed
 * to, whether the previous window is ghosted in, and the CSV of what is on
 * screen. Clicking a tag anywhere else on the page lands here as a chip.
 */
export function FilterBar({
  tags, active, onToggle, onClear, compare, onCompare, compareLabel, onExport, filteredNote,
}: {
  tags: TagUsage[];
  active: string[];
  onToggle: (tag: string) => void;
  onClear: () => void;
  compare: boolean;
  onCompare: (next: boolean) => void;
  compareLabel: string;
  onExport: () => void;
  /** What the filter is currently hiding, in plain words. */
  filteredNote: string | null;
}) {
  const activeSet = React.useMemo(() => new Set(active), [active]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Popover
        align="start"
        className="max-h-[320px] w-[248px] overflow-y-auto"
        trigger={
          <button
            type="button"
            aria-haspopup="menu"
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-md border border-line px-2.5",
              "text-[12.5px] font-medium cursor-pointer transition-colors duration-150",
              active.length
                ? "border-accent-line bg-accent-soft text-accent"
                : "text-ink-2 hover:bg-hover hover:text-ink",
            )}
          >
            <TagIcon className="size-3.5" aria-hidden />
            {active.length ? (
              <>
                Filtered by <span className="tnum">{active.length}</span>{" "}
                {active.length === 1 ? "tag" : "tags"}
              </>
            ) : (
              "Filter by tag"
            )}
          </button>
        }
      >
        {() => (
          <div role="menu" aria-label="Filter the whole page by tag">
            {tags.length === 0 ? (
              <MiniEmpty>
                Nothing in this window carries a tag yet. Tag a task and every panel here can be
                narrowed to it.
              </MiniEmpty>
            ) : (
              <>
                {tags.map((t) => (
                  <MenuItem
                    key={t.name}
                    checked={activeSet.has(t.name)}
                    onClick={() => onToggle(t.name)}
                  >
                    <span className="flex items-center gap-1.5">
                      <span
                        className={cn("size-2 shrink-0 rounded-full", t.tint ? `tint-${t.tint}` : "tint-slate")}
                        style={{ background: "var(--tint)" }}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1 truncate">{t.name}</span>
                      <span className="shrink-0 text-[11px] text-ink-4 tnum">
                        {t.minutes >= 1 ? formatDuration(Math.round(t.minutes)) : `${t.tasks}×`}
                      </span>
                    </span>
                  </MenuItem>
                ))}
                {active.length > 0 && (
                  <>
                    <MenuSeparator />
                    <MenuItem icon={X} onClick={onClear}>Clear all filters</MenuItem>
                  </>
                )}
              </>
            )}
          </div>
        )}
      </Popover>

      {active.map((tag) => {
        const usage = tags.find((t) => t.name === tag);
        return (
          <button
            key={tag}
            type="button"
            onClick={() => onToggle(tag)}
            aria-label={`Remove the ${tag} filter`}
            className={cn(
              usage?.tint ? `tint-${usage.tint}` : "tint-slate",
              "inline-flex h-8 max-w-[200px] items-center gap-1 rounded-full px-2.5 cursor-pointer",
              "bg-[var(--tint-soft)] text-[var(--tint-ink)] text-[12px] font-medium",
              "transition-[filter] duration-150 hover:brightness-95 dark:hover:brightness-110",
            )}
          >
            <Check className="size-3 shrink-0" aria-hidden />
            <span className="truncate">{tag}</span>
            <X className="size-3 shrink-0 opacity-70" aria-hidden />
          </button>
        );
      })}

      {active.length > 1 && (
        <Button variant="ghost" size="sm" onClick={onClear}>
          Clear all
        </Button>
      )}

      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          aria-pressed={compare}
          onClick={() => onCompare(!compare)}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-md border border-line px-2.5",
            "text-[12.5px] font-medium cursor-pointer transition-colors duration-150",
            compare
              ? "border-accent-line bg-accent-soft text-accent"
              : "text-ink-2 hover:bg-hover hover:text-ink",
          )}
        >
          <GitCompareArrows className="size-3.5" aria-hidden />
          {compareLabel}
        </button>

        <Button variant="secondary" size="sm" onClick={onExport}>
          <Download className="size-3.5" aria-hidden />
          Export CSV
        </Button>
      </div>

      {filteredNote && (
        <p className="w-full text-[11.5px] leading-snug text-ink-4">{filteredNote}</p>
      )}
    </div>
  );
}
