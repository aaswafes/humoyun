"use client";

import * as React from "react";
import {
  Bookmark, ChevronDown, Pencil, Pin, PinOff, Trash2, ArrowUp, ArrowDown, Check,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import { PRIORITY_LABELS, type TaskStatus } from "@/lib/types";
import { Input } from "@/components/ui/primitives";
import { MenuItem, MenuLabel, MenuSeparator, Popover } from "@/components/ui/overlays";
import {
  describeFilters, useTriage, type GroupKey, type SortKey,
} from "./triage-context";
import {
  deleteView, markViewUsed, reorderView, restoreView, updateView, useSavedViews, viewMatches,
  type SavedView,
} from "./saved-views";
import { GROUP_LABELS, SORT_LABELS, STATUS_LABELS } from "./all-view";

const LABELS = {
  priority: (p: number) => `${PRIORITY_LABELS[p]} priority`,
  status: (s: TaskStatus) => STATUS_LABELS[s],
  sort: (s: SortKey) => SORT_LABELS[s],
  group: (g: GroupKey) => GROUP_LABELS[g],
};

/**
 * Pinned filter sets. They live in this browser, so they load with the page
 * and never wait on the network; the manage menu is the only place they can be
 * renamed, reordered or dropped.
 */
export function ViewsBar() {
  const views = useSavedViews();
  const toast = useStore((s) => s.toast);
  const { tab, setTab, filters, replaceFilters, announce } = useTriage();
  const [renaming, setRenaming] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState("");

  const pinned = views.filter((v) => v.pinned);
  if (!views.length) return null;

  function apply(view: SavedView) {
    setTab(view.tab);
    replaceFilters({ ...view.filters, tags: [...view.filters.tags] });
    markViewUsed(view.id);
    announce(`Applied view ${view.name}`);
  }

  function startRename(view: SavedView) {
    setRenaming(view.id);
    setDraft(view.name);
  }

  function commitRename() {
    if (!renaming) return;
    const name = draft.trim();
    if (name) updateView(renaming, { name: name.slice(0, 40) });
    setRenaming(null);
  }

  return (
    <div className="mb-2 flex flex-wrap items-center gap-1.5">
      <Bookmark aria-hidden className="size-3.5 shrink-0 text-ink-4" />

      {pinned.map((view) => {
        const active = viewMatches(view, tab, filters);
        return (
          <button
            key={view.id}
            type="button"
            onClick={() => apply(view)}
            aria-pressed={active}
            title={describeFilters(view.filters, LABELS)}
            className={cn(
              "inline-flex h-7 max-w-[200px] items-center gap-1.5 rounded-full px-2.5 text-[12.5px] font-medium cursor-pointer",
              "transition-[background-color,color,transform] duration-150 ease-[var(--ease-out-apple)] active:scale-[0.97]",
              active
                ? "bg-accent-soft text-accent"
                : "bg-hover text-ink-2 hover:bg-active hover:text-ink",
            )}
          >
            {active && <Check aria-hidden className="size-3 shrink-0" />}
            <span className="truncate">{view.name}</span>
          </button>
        );
      })}

      <Popover
        align="start"
        className="max-h-[380px] w-[286px] overflow-y-auto"
        trigger={
          <button
            type="button"
            className="inline-flex h-7 items-center gap-1 rounded-full px-2 text-[12px] text-ink-3 hover:bg-hover hover:text-ink cursor-pointer transition-colors"
          >
            {pinned.length ? "Manage" : `${views.length} saved`}
            <ChevronDown aria-hidden className="size-3 opacity-60" />
          </button>
        }
      >
        <>
          <MenuLabel>Saved views</MenuLabel>
          {views.map((view, i) => (
            <div key={view.id} className="rounded-md px-1 py-0.5 hover:bg-hover">
              {renaming === view.id ? (
                <Input
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); commitRename(); }
                    if (e.key === "Escape") { e.stopPropagation(); setRenaming(null); }
                  }}
                  aria-label={`Rename ${view.name}`}
                  className="h-7 text-[12.5px]"
                />
              ) : (
                <>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => apply(view)}
                      className="min-w-0 flex-1 truncate rounded-md px-1 py-1 text-left text-[13px] text-ink cursor-pointer hover:text-accent transition-colors"
                    >
                      {view.name}
                    </button>
                    <button
                      type="button"
                      onClick={() => updateView(view.id, { pinned: !view.pinned })}
                      aria-label={view.pinned ? `Unpin ${view.name}` : `Pin ${view.name}`}
                      title={view.pinned ? "Unpin" : "Pin to the bar"}
                      className={cn(
                        "grid size-7 shrink-0 place-items-center rounded-md cursor-pointer transition-colors",
                        view.pinned ? "text-accent hover:bg-accent-soft" : "text-ink-4 hover:bg-active hover:text-ink-2",
                      )}
                    >
                      {view.pinned ? <Pin className="size-3.5" /> : <PinOff className="size-3.5" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => startRename(view)}
                      aria-label={`Rename ${view.name}`}
                      className="grid size-7 shrink-0 place-items-center rounded-md text-ink-4 hover:bg-active hover:text-ink-2 cursor-pointer transition-colors"
                    >
                      <Pencil className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={i === 0}
                      onClick={() => reorderView(view.id, -1)}
                      aria-label={`Move ${view.name} up`}
                      className="grid size-7 shrink-0 place-items-center rounded-md text-ink-4 hover:bg-active hover:text-ink-2 cursor-pointer transition-colors disabled:pointer-events-none disabled:opacity-30"
                    >
                      <ArrowUp className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={i === views.length - 1}
                      onClick={() => reorderView(view.id, 1)}
                      aria-label={`Move ${view.name} down`}
                      className="grid size-7 shrink-0 place-items-center rounded-md text-ink-4 hover:bg-active hover:text-ink-2 cursor-pointer transition-colors disabled:pointer-events-none disabled:opacity-30"
                    >
                      <ArrowDown className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        deleteView(view.id);
                        toast({
                          title: `Deleted “${view.name}”`,
                          tone: "danger",
                          // Restored by id and index, so its pin and position come back too.
                          action: { label: "Undo", run: () => restoreView(view, i) },
                        });
                      }}
                      aria-label={`Delete ${view.name}`}
                      className="grid size-7 shrink-0 place-items-center rounded-md text-ink-4 hover:bg-danger-soft hover:text-danger cursor-pointer transition-colors"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                  <p className="truncate px-1 pb-1 text-[11px] text-ink-4">
                    {view.tab === "all" ? "" : `${view.tab} · `}
                    {describeFilters(view.filters, LABELS)}
                  </p>
                </>
              )}
            </div>
          ))}

          <MenuSeparator />
          <MenuItem
            onClick={() => {
              views.filter((v) => !v.pinned).forEach((v) => updateView(v.id, { pinned: true }));
            }}
          >
            Pin every view
          </MenuItem>
        </>
      </Popover>
    </div>
  );
}
