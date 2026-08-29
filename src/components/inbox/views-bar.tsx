"use client";

import * as React from "react";
import {
  ArrowDown, ArrowUp, Bookmark, Check, ChevronDown, Pencil, Pin, PinOff, Trash2,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import { PRIORITY_LABELS, type TaskStatus } from "@/lib/types";
import { Button, Input } from "@/components/ui/primitives";
import { MenuItem, MenuLabel, MenuSeparator, Popover } from "@/components/ui/overlays";
import {
  describeFilters, useTriage, type GroupKey, type SortKey,
} from "./triage-context";
import {
  deleteView, markViewUsed, reorderView, restoreView, saveView, updateView, useSavedViews,
  viewMatches, type SavedView,
} from "./saved-views";
import { GROUP_LABELS, SORT_LABELS, STATUS_LABELS } from "./labels";

const LABELS = {
  priority: (p: number) => `${PRIORITY_LABELS[p]} priority`,
  status: (s: TaskStatus) => STATUS_LABELS[s],
  sort: (s: SortKey) => SORT_LABELS[s],
  group: (g: GroupKey) => GROUP_LABELS[g],
};

/**
 * Saved views, folded into one dropdown.
 *
 * They used to spread across a row of pins with a manage menu beside them and
 * a separate save button over in the filter bar — three places for one idea.
 * Now the trigger says which view you are looking at, and everything that can
 * be done to a view (apply, pin, rename, reorder, delete, save a new one) is
 * inside it.
 */
export function ViewsMenu() {
  const views = useSavedViews();
  const toast = useStore((s) => s.toast);
  const { tab, setTab, filters, replaceFilters, announce, rows } = useTriage();

  const [renaming, setRenaming] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState("");
  const [newName, setNewName] = React.useState("");

  const active = views.find((v) => viewMatches(v, tab, filters)) ?? null;
  const pinned = React.useMemo(() => views.filter((v) => v.pinned), [views]);
  const unpinned = React.useMemo(() => views.filter((v) => !v.pinned), [views]);

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

  function persist(close: () => void) {
    const name = newName.trim();
    if (!name) return;
    saveView({ name, tab, filters });
    setNewName("");
    toast({ title: `Saved “${name}”`, description: "It is in the views menu.", tone: "success" });
    announce(`View ${name} saved`);
    close();
  }

  // Called, not rendered as <Row/>: a component declared inside this one would
  // be a new type every keystroke, and the rename field would lose its caret.
  function renderRow(view: SavedView, index: number) {
    const isActive = active?.id === view.id;
    if (renaming === view.id) {
      return (
        <div key={view.id} className="px-1 py-0.5">
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
        </div>
      );
    }

    return (
      <div key={view.id} className="group/view rounded-md px-1 py-0.5 hover:bg-hover">
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => apply(view)}
            aria-pressed={isActive}
            title={describeFilters(view.filters, LABELS)}
            className={cn(
              "flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-1 py-1 text-left text-[13px] cursor-pointer",
              isActive ? "text-accent" : "text-ink hover:text-ink",
            )}
          >
            {isActive
              ? <Check aria-hidden className="size-3 shrink-0" />
              : <span aria-hidden className="size-3 shrink-0" />}
            <span className="truncate">{view.name}</span>
          </button>

          <span className="flex shrink-0 items-center opacity-0 transition-opacity duration-150 focus-within:opacity-100 group-hover/view:opacity-100">
            <button
              type="button"
              onClick={() => updateView(view.id, { pinned: !view.pinned })}
              aria-label={view.pinned ? `Unpin ${view.name}` : `Pin ${view.name}`}
              title={view.pinned ? "Unpin" : "Keep at the top"}
              className={cn(
                "grid size-7 place-items-center rounded-md cursor-pointer transition-colors",
                view.pinned ? "text-ink-2 hover:bg-active" : "text-ink-4 hover:bg-active hover:text-ink-2",
              )}
            >
              {view.pinned ? <Pin className="size-3.5" /> : <PinOff className="size-3.5" />}
            </button>
            <button
              type="button"
              onClick={() => startRename(view)}
              aria-label={`Rename ${view.name}`}
              className="grid size-7 place-items-center rounded-md text-ink-4 hover:bg-active hover:text-ink-2 cursor-pointer transition-colors"
            >
              <Pencil className="size-3.5" />
            </button>
            <button
              type="button"
              disabled={index === 0}
              onClick={() => reorderView(view.id, -1)}
              aria-label={`Move ${view.name} up`}
              className="grid size-7 place-items-center rounded-md text-ink-4 hover:bg-active hover:text-ink-2 cursor-pointer transition-colors disabled:pointer-events-none disabled:opacity-30"
            >
              <ArrowUp className="size-3.5" />
            </button>
            <button
              type="button"
              disabled={index === views.length - 1}
              onClick={() => reorderView(view.id, 1)}
              aria-label={`Move ${view.name} down`}
              className="grid size-7 place-items-center rounded-md text-ink-4 hover:bg-active hover:text-ink-2 cursor-pointer transition-colors disabled:pointer-events-none disabled:opacity-30"
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
                  action: { label: "Undo", run: () => restoreView(view, index) },
                });
              }}
              aria-label={`Delete ${view.name}`}
              className="grid size-7 place-items-center rounded-md text-ink-4 hover:bg-danger-soft hover:text-danger cursor-pointer transition-colors"
            >
              <Trash2 className="size-3.5" />
            </button>
          </span>
        </div>
        <p className="truncate px-1 pb-1 pl-[22px] text-[11px] text-ink-4">
          {view.tab === "all" ? "" : `${view.tab} · `}
          {describeFilters(view.filters, LABELS)}
        </p>
      </div>
    );
  }

  return (
    <Popover
      align="start"
      className="max-h-[420px] w-[300px] overflow-y-auto"
      trigger={
        <button
          type="button"
          aria-label={active ? `Saved views — ${active.name} applied` : "Saved views"}
          className={cn(
            "inline-flex h-7 max-w-[180px] shrink-0 items-center gap-1.5 rounded-md px-2 text-[12.5px] cursor-pointer",
            "transition-colors duration-150 ease-[var(--ease-out-apple)]",
            active ? "text-ink font-medium hover:bg-hover" : "text-ink-3 hover:bg-hover hover:text-ink",
          )}
        >
          <Bookmark aria-hidden className="size-3.5 shrink-0 text-ink-4" />
          <span className="truncate">{active?.name ?? "Views"}</span>
          <ChevronDown aria-hidden className="size-3 shrink-0 opacity-50" />
        </button>
      }
    >
      {(close) => (
        <>
          {views.length === 0 ? (
            <p className="px-2 py-2 text-[12px] leading-snug text-ink-4">
              A view remembers a tab and its filters. Name the one you are looking at below.
            </p>
          ) : (
            <>
              {pinned.length > 0 && <MenuLabel>Pinned</MenuLabel>}
              {pinned.map((view) => renderRow(view, views.indexOf(view)))}
              {unpinned.length > 0 && (
                <>
                  {pinned.length > 0 && <MenuSeparator />}
                  <MenuLabel>{pinned.length ? "Everything else" : "Saved views"}</MenuLabel>
                  {unpinned.map((view) => renderRow(view, views.indexOf(view)))}
                </>
              )}
              {unpinned.length > 0 && (
                <MenuItem icon={Pin} onClick={() => unpinned.forEach((v) => updateView(v.id, { pinned: true }))}>
                  Pin every view
                </MenuItem>
              )}
            </>
          )}

          <MenuSeparator />
          <div className="p-1">
            <div className="flex items-center gap-1.5">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  persist(close);
                }}
                placeholder="Save this view — “Deep work”"
                aria-label="Name for a new saved view"
                className="h-7 text-[12.5px]"
              />
              <Button
                variant="primary"
                size="xs"
                disabled={!newName.trim()}
                onClick={() => persist(close)}
              >
                Save
              </Button>
            </div>
            <p className="mt-1 px-0.5 text-[11px] text-ink-4 tnum">
              {rows.length} {rows.length === 1 ? "row" : "rows"} on screen
            </p>
          </div>
        </>
      )}
    </Popover>
  );
}
