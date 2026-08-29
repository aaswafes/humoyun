"use client";

import * as React from "react";
import {
  ChevronRight, GitBranch, Keyboard, LayoutGrid, ListTree, Map as MapIcon, ScanSearch,
  Search, SlidersHorizontal, Sparkles, Tags, X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { IconButton, Kbd } from "@/components/ui/primitives";
import { MenuItem, MenuLabel, MenuSeparator, Popover } from "@/components/ui/overlays";
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
  { keys: ["Scroll"], what: "Pan — two fingers move the board any direction" },
  { keys: ["Pinch"], what: "Zoom · ⌘-scroll does the same" },
  { keys: ["Space", "drag"], what: "Pan the board" },
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
 * One row of the View menu that folds a canvas panel. A real disclosure: it
 * says what is inside before you open it, and the chevron states which way it
 * is currently pointing.
 */
function PanelRow({
  icon: Icon, label, summary, open, onToggle,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  summary: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-expanded={open}
      onClick={onToggle}
      className={cn(
        "flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-[6px] text-left",
        "transition-colors duration-100 hover:bg-hover",
      )}
    >
      <Icon className={cn("size-4 shrink-0", open ? "text-ink-2" : "text-ink-3")} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] text-ink">{label}</span>
        <span className="block truncate text-[11.5px] text-ink-4">{summary}</span>
      </span>
      <ChevronRight
        className={cn(
          "size-3.5 shrink-0 text-ink-4 transition-transform duration-200 ease-[var(--ease-out-apple)]",
          open && "rotate-90",
        )}
        aria-hidden
      />
    </button>
  );
}

/**
 * The board's floating chrome. It rests at low opacity over the canvas and
 * comes back the moment the pointer or the keyboard reaches it, because the
 * drawing is the thing you came to look at.
 *
 * Everything that only changes *how the board is displayed* — the three panels,
 * the colour-by, the tidy-up layouts and the timeline's fit — lives behind the
 * one View menu, so the resting toolbar is three buttons wide.
 */
export function BoardToolbar({
  query, onQuery, searchRef, searchOpen, onSearchOpen, matchCount, total,
  colorBy, onColorBy, groupLabel, groupCount,
  outlineOpen, onToggleOutline,
  legendOpen, onToggleLegend,
  minimapOpen, onToggleMinimap,
  onLayout, timelineMode, onFitDated, datedCount,
}: {
  query: string;
  onQuery: (value: string) => void;
  searchRef: React.RefObject<HTMLInputElement | null>;
  searchOpen: boolean;
  onSearchOpen: (open: boolean) => void;
  matchCount: number;
  total: number;
  colorBy: ColorBy;
  onColorBy: (value: ColorBy) => void;
  /** what the legend would be listing right now */
  groupLabel: string;
  groupCount: number;
  outlineOpen: boolean;
  onToggleOutline: () => void;
  legendOpen: boolean;
  onToggleLegend: () => void;
  minimapOpen: boolean;
  onToggleMinimap: () => void;
  onLayout: (kind: LayoutKind) => void;
  timelineMode: boolean;
  onFitDated: () => void;
  datedCount: number;
}) {
  const searchId = React.useId();
  const [viewOpen, setViewOpen] = React.useState(false);
  const [keysOpen, setKeysOpen] = React.useState(false);
  const searching = query.trim().length > 0;
  const expanded = searchOpen || searching;
  const panelsOpen = outlineOpen || legendOpen || minimapOpen;

  // The toolbar only dims when nothing about it is live: no menu open, no
  // search running, nothing focused inside it.
  const busy = viewOpen || keysOpen || expanded;

  return (
    <div
      data-no-zoom
      onPointerDown={(e) => e.stopPropagation()}
      className={cn(
        "flex flex-wrap items-center gap-0.5 rounded-lg p-1 material shadow-[var(--shadow-md)]",
        "transition-opacity duration-200 ease-[var(--ease-out-apple)]",
        busy ? "opacity-100" : "opacity-60 hover:opacity-100 focus-within:opacity-100",
      )}
    >
      {expanded ? (
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
              if (e.key !== "Escape") return;
              if (searching) { onQuery(""); return; }
              onSearchOpen(false);
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
          <button
            onClick={() => { onQuery(""); onSearchOpen(false); }}
            aria-label={searching ? "Clear search" : "Close search"}
            className="absolute right-0.5 top-1/2 grid size-6 -translate-y-1/2 cursor-pointer place-items-center rounded text-ink-4 transition-colors hover:text-ink"
          >
            <X className="size-3.5" aria-hidden />
          </button>
        </div>
      ) : (
        <IconButton label="Search this board" size="md" onClick={() => onSearchOpen(true)}>
          <Search />
        </IconButton>
      )}

      <Popover
        open={viewOpen}
        onOpenChange={setViewOpen}
        align="start"
        className="w-[248px]"
        trigger={
          <button
            type="button"
            aria-expanded={viewOpen}
            aria-haspopup="dialog"
            title="View options"
            className={cn(
              "flex h-7 cursor-pointer items-center gap-1.5 rounded-md px-2 text-[12.5px] font-medium",
              "transition-colors duration-150 hover:bg-hover active:scale-[0.97]",
              panelsOpen ? "text-ink" : "text-ink-3",
            )}
          >
            <SlidersHorizontal className="size-3.5" aria-hidden />
            View
          </button>
        }
      >
        {(close) => (
          <>
            <PanelRow
              icon={ListTree}
              label="Outline"
              summary={total ? `${total} node${total === 1 ? "" : "s"} as a tree` : "Nothing on the board yet"}
              open={outlineOpen}
              onToggle={onToggleOutline}
            />
            <PanelRow
              icon={Tags}
              label="Legend"
              summary={`${groupLabel.toLowerCase()} · ${groupCount} group${groupCount === 1 ? "" : "s"}, click to filter`}
              open={legendOpen}
              onToggle={onToggleLegend}
            />
            <PanelRow
              icon={MapIcon}
              label="Overview map"
              summary="Whole board in the corner"
              open={minimapOpen}
              onToggle={onToggleMinimap}
            />

            <MenuSeparator />
            <MenuLabel>Colour by</MenuLabel>
            {COLOR_OPTIONS.map((opt) => (
              <MenuItem
                key={opt.value}
                checked={opt.value === colorBy}
                onClick={() => onColorBy(opt.value)}
              >
                <span className="block truncate">{opt.label}</span>
                <span className="mt-0.5 block truncate text-[11.5px] text-ink-4">
                  {opt.description}
                </span>
              </MenuItem>
            ))}

            <MenuSeparator />
            <MenuLabel>Arrange</MenuLabel>
            {timelineMode ? (
              <>
                <MenuItem
                  icon={ScanSearch}
                  shortcut="⇧2"
                  disabled={datedCount === 0}
                  onClick={() => { onFitDated(); close(); }}
                >
                  Fit the dated range
                </MenuItem>
                <p className="px-2 pb-1.5 pt-0.5 text-[11.5px] leading-snug text-ink-4 tnum">
                  {datedCount} node{datedCount === 1 ? "" : "s"} sit on the axis. Drag one up or
                  down to change its row.
                </p>
              </>
            ) : (
              <>
                {(Object.keys(LAYOUT_LABELS) as LayoutKind[]).map((kind) => (
                  <MenuItem
                    key={kind}
                    icon={LAYOUT_ICON[kind]}
                    onClick={() => { onLayout(kind); close(); }}
                  >
                    {LAYOUT_LABELS[kind]}
                  </MenuItem>
                ))}
                <p className="px-2 pb-1.5 pt-0.5 text-[11.5px] leading-snug text-ink-4">
                  Arrows decide the hierarchy. Every move can be undone from the toast.
                </p>
              </>
            )}
          </>
        )}
      </Popover>

      <Popover
        open={keysOpen}
        onOpenChange={setKeysOpen}
        align="start"
        className="w-[300px]"
        trigger={
          <IconButton label="Keyboard shortcuts" size="md" aria-expanded={keysOpen}>
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
