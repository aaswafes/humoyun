"use client";

import * as React from "react";
import {
  GitBranch, Keyboard, LayoutGrid, ListTree, Palette, ScanSearch, Search,
  Sparkles, Tags, X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { IconButton, Kbd } from "@/components/ui/primitives";
import { MenuItem, MenuLabel, MenuSeparator, Popover } from "@/components/ui/overlays";
import { Select } from "@/components/ui/form";
import { LAYOUT_LABELS, type LayoutKind } from "./auto-layout";
import type { ColorBy } from "./prefs";

const COLOR_OPTIONS: { value: ColorBy; label: string; description: string }[] = [
  { value: "tint", label: "Colour", description: "Each node keeps its own tint" },
  { value: "kind", label: "Type", description: "Notes, ideas, questions, projects" },
  { value: "goal", label: "Goal", description: "Which goal the node serves" },
];

const LAYOUT_ICON: Record<LayoutKind, React.ComponentType<{ className?: string }>> = {
  tree: GitBranch,
  radial: Sparkles,
  grid: LayoutGrid,
};

const SHORTCUTS: { keys: string[]; what: string }[] = [
  { keys: ["Space", "drag"], what: "Pan the board" },
  { keys: ["Scroll"], what: "Zoom · Shift-scroll moves across" },
  { keys: ["Double-click"], what: "New node where you clicked" },
  { keys: ["Enter"], what: "Rename the selected node" },
  { keys: ["L"], what: "Link two or more selected nodes" },
  { keys: ["Arrows"], what: "Nudge the selection — or pan when nothing is selected" },
  { keys: ["Alt", "Arrows"], what: "Resize the selection" },
  { keys: ["⌘", "A"], what: "Select everything" },
  { keys: ["/"], what: "Search this board" },
  { keys: ["Shift", "1"], what: "Fit the board" },
  { keys: ["Shift", "2"], what: "Fit the dated range" },
  { keys: ["Shift", "0"], what: "Zoom back to 100%" },
  { keys: ["Delete"], what: "Delete the selection" },
];

/**
 * Board-level view controls. They sit on the canvas rather than in the page
 * header because every one of them changes what you are looking at right now.
 */
export function BoardToolbar({
  query, onQuery, searchRef, matchCount, total,
  colorBy, onColorBy,
  outlineOpen, onToggleOutline,
  legendOpen, onToggleLegend,
  onLayout, timelineMode, onFitDated, datedCount,
}: {
  query: string;
  onQuery: (value: string) => void;
  searchRef: React.RefObject<HTMLInputElement | null>;
  matchCount: number;
  total: number;
  colorBy: ColorBy;
  onColorBy: (value: ColorBy) => void;
  outlineOpen: boolean;
  onToggleOutline: () => void;
  legendOpen: boolean;
  onToggleLegend: () => void;
  onLayout: (kind: LayoutKind) => void;
  timelineMode: boolean;
  onFitDated: () => void;
  datedCount: number;
}) {
  const searchId = React.useId();
  const searching = query.trim().length > 0;

  return (
    <div
      data-no-zoom
      onPointerDown={(e) => e.stopPropagation()}
      className="flex flex-wrap items-center gap-1 rounded-lg border border-line p-1 material shadow-[var(--shadow-md)]"
    >
      <IconButton
        label={outlineOpen ? "Hide outline" : "Show outline"}
        size="md"
        active={outlineOpen}
        aria-pressed={outlineOpen}
        onClick={onToggleOutline}
      >
        <ListTree />
      </IconButton>

      <div className="mx-0.5 h-4 w-px bg-line" aria-hidden />

      <div className="relative">
        {/* a real <label for>, just not one that steals space from the canvas */}
        <label
          htmlFor={searchId}
          className="absolute size-px overflow-hidden whitespace-nowrap [clip-path:inset(50%)]"
        >
          Search this board
        </label>
        <Search
          className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-ink-4"
          aria-hidden
        />
        <input
          ref={searchRef}
          id={searchId}
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Escape") { onQuery(""); e.currentTarget.blur(); }
          }}
          placeholder="Search nodes"
          className={cn(
            "h-7 w-[168px] rounded-md bg-hover pl-7 text-[12.5px] text-ink outline-none",
            "placeholder:text-ink-4 focus-visible:ring-2 focus-visible:ring-accent-soft",
            searching && "pr-14",
          )}
        />
        {searching && (
          <span className="pointer-events-none absolute right-7 top-1/2 -translate-y-1/2 text-[11px] text-ink-4 tnum">
            {matchCount}/{total}
          </span>
        )}
        {searching && (
          <button
            onClick={() => { onQuery(""); searchRef.current?.focus(); }}
            aria-label="Clear search"
            className="absolute right-0.5 top-1/2 grid size-6 -translate-y-1/2 cursor-pointer place-items-center rounded text-ink-4 transition-colors hover:text-ink"
          >
            <X className="size-3.5" aria-hidden />
          </button>
        )}
      </div>

      <div className="mx-0.5 h-4 w-px bg-line" aria-hidden />

      <Palette className="size-3.5 shrink-0 text-ink-3" aria-hidden />
      <Select
        size="sm"
        label="Colour the board by"
        value={colorBy}
        options={COLOR_OPTIONS}
        onChange={onColorBy}
        className="w-[104px]"
      />
      <IconButton
        label={legendOpen ? "Hide legend" : "Show legend"}
        size="md"
        active={legendOpen}
        aria-pressed={legendOpen}
        onClick={onToggleLegend}
      >
        <Tags />
      </IconButton>

      <div className="mx-0.5 h-4 w-px bg-line" aria-hidden />

      {timelineMode ? (
        <IconButton
          label={`Fit the dated range (${datedCount} node${datedCount === 1 ? "" : "s"})`}
          size="md"
          disabled={datedCount === 0}
          onClick={onFitDated}
        >
          <ScanSearch />
        </IconButton>
      ) : (
        <Popover
          align="start"
          className="w-[216px]"
          trigger={
            <IconButton label="Tidy the board" size="md">
              <Sparkles />
            </IconButton>
          }
        >
          {(close) => (
            <>
              <MenuLabel>Auto-layout</MenuLabel>
              {(Object.keys(LAYOUT_LABELS) as LayoutKind[]).map((kind) => (
                <MenuItem
                  key={kind}
                  icon={LAYOUT_ICON[kind]}
                  onClick={() => { onLayout(kind); close(); }}
                >
                  {LAYOUT_LABELS[kind]}
                </MenuItem>
              ))}
              <MenuSeparator />
              <p className="px-2 pb-1.5 pt-0.5 text-[11.5px] leading-snug text-ink-4">
                Arrows decide the hierarchy. Every move can be undone from the toast.
              </p>
            </>
          )}
        </Popover>
      )}

      <Popover
        align="start"
        className="w-[300px]"
        trigger={
          <IconButton label="Keyboard shortcuts" size="md">
            <Keyboard />
          </IconButton>
        }
      >
        <>
          <MenuLabel>Shortcuts</MenuLabel>
          <ul className="px-1 pb-1">
            {SHORTCUTS.map((s) => (
              <li key={s.what} className="flex items-center gap-2 px-1 py-[3px]">
                <span className="flex shrink-0 items-center gap-1">
                  {s.keys.map((k) => <Kbd key={k}>{k}</Kbd>)}
                </span>
                <span className="min-w-0 flex-1 text-right text-[11.5px] leading-snug text-ink-3">
                  {s.what}
                </span>
              </li>
            ))}
          </ul>
        </>
      </Popover>
    </div>
  );
}
