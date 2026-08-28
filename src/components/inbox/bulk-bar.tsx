"use client";

import * as React from "react";
import { CalendarClock, ChevronDown, Flag, Tag as TagIcon, Trash2, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import { formatDate, friendlyDate, todayISO } from "@/lib/date";
import { PRIORITY_LABELS, type Tint } from "@/lib/types";
import { IconButton } from "@/components/ui/primitives";
import { Popover, MenuItem, MenuLabel, MenuSeparator, ConfirmDialog } from "@/components/ui/overlays";
import { MiniCalendar } from "@/components/ui/mini-calendar";
import { useSelection } from "./selection";
import { schedulePresets } from "./quick-schedule";

function BarButton({
  icon: Icon, children, onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  onClick?: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[12.5px] font-medium text-ink-2 cursor-pointer",
        "transition-[background-color,color,transform] duration-150 ease-[var(--ease-out-apple)]",
        "hover:bg-hover hover:text-ink active:scale-[0.97]",
      )}
    >
      <Icon className="size-3.5" />
      {children}
      <ChevronDown className="size-3 opacity-50" />
    </button>
  );
}

/** Floating bar that appears while rows are selected. Sits above the focus timer pill. */
export function BulkBar() {
  const { ids, count, clear, selecting, setSelecting } = useSelection();
  const tasks = useStore((s) => s.tasks);
  const tagRows = useStore((s) => s.tags);
  const patch = useStore((s) => s.patch);
  const moveTask = useStore((s) => s.moveTask);
  const remove = useStore((s) => s.remove);
  const toast = useStore((s) => s.toast);
  const weekStart = useStore((s) => s.profile?.week_start ?? 1);
  const timer = useStore((s) => s.timer);

  const [confirming, setConfirming] = React.useState(false);
  const [draftTag, setDraftTag] = React.useState("");

  const idSet = React.useMemo(() => new Set(ids), [ids]);
  const targets = React.useMemo(() => tasks.filter((t) => idSet.has(t.id)), [tasks, idSet]);
  const presets = React.useMemo(() => schedulePresets(weekStart), [weekStart]);

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

  const noun = targets.length === 1 ? "task" : "tasks";
  const timerActive = timer.running || timer.accumulated > 0;

  function applyDate(iso: string | null, label: string) {
    const before = targets.map((t) => [t.id, t.date] as const);
    targets.forEach((t) => moveTask(t.id, iso));
    toast({
      title: `${before.length} ${noun} moved to ${label}`,
      action: { label: "Undo", run: () => before.forEach(([id, date]) => moveTask(id, date)) },
    });
  }

  function applyPriority(priority: number) {
    const before = targets.map((t) => [t.id, t.priority] as const);
    targets.forEach((t) => patch("tasks", t.id, { priority }));
    toast({
      title: `Priority set to ${PRIORITY_LABELS[priority]} on ${before.length} ${noun}`,
      action: { label: "Undo", run: () => before.forEach(([id, p]) => patch("tasks", id, { priority: p })) },
    });
  }

  function applyTag(tag: string, add: boolean) {
    const before = targets.map((t) => [t.id, t.tags] as const);
    targets.forEach((t) => {
      const next = add
        ? t.tags.includes(tag) ? t.tags : [...t.tags, tag]
        : t.tags.filter((x) => x !== tag);
      if (next.length !== t.tags.length) patch("tasks", t.id, { tags: next });
    });
    toast({
      title: `${add ? "Tagged" : "Untagged"} ${before.length} ${noun} — ${tag}`,
      action: { label: "Undo", run: () => before.forEach(([id, tags]) => patch("tasks", id, { tags })) },
    });
  }

  function deleteSelection() {
    // Take subtasks down with their parent — leaving them behind orphans them from every view.
    const victims = new Set(targets.map((t) => t.id));
    tasks.forEach((t) => { if (t.parent_id && victims.has(t.parent_id)) victims.add(t.id); });
    const removed = targets.length;
    victims.forEach((id) => remove("tasks", id));
    clear();
    toast({ title: `Deleted ${removed} ${removed === 1 ? "task" : "tasks"}`, tone: "danger" });
  }

  if (!selecting) return null;

  const shell = cn(
    "fixed left-1/2 z-[60] flex -translate-x-1/2 items-center gap-1 rounded-full border border-line px-1.5 py-1.5 pl-3",
    "material shadow-lg anim-slide",
    timerActive ? "bottom-[74px]" : "bottom-5",
  );

  // Select mode with nothing picked yet still needs to announce itself and offer a way out.
  if (!count) {
    return (
      <div className={shell}>
        <span className="whitespace-nowrap text-[12.5px] text-ink-2">
          Select tasks <span className="text-ink-4">— shift-click for a range</span>
        </span>
        <span className="mx-0.5 h-4 w-px shrink-0 bg-line" />
        <IconButton label="Leave select mode" size="sm" onClick={() => setSelecting(false)}>
          <X />
        </IconButton>
      </div>
    );
  }

  return (
    <>
      <div role="toolbar" aria-label="Bulk actions" className={shell}>
        <span className="mr-1 whitespace-nowrap text-[12.5px] font-medium text-ink">
          <span className="tnum">{count}</span> selected
        </span>

        <span className="mx-0.5 h-4 w-px shrink-0 bg-line" />

        <Popover
          side="top"
          align="center"
          className="w-[258px]"
          trigger={<BarButton icon={CalendarClock}>Date</BarButton>}
        >
          {(close) => (
            <>
              {presets.map((p) => (
                <MenuItem
                  key={p.key}
                  shortcut={formatDate(p.iso, { weekday: false })}
                  onClick={() => { applyDate(p.iso, p.label); close(); }}
                >
                  {p.label}
                </MenuItem>
              ))}
              <MenuSeparator />
              <MenuItem icon={X} onClick={() => { applyDate(null, "Inbox"); close(); }}>
                Remove date
              </MenuItem>
              <MenuSeparator />
              <MenuLabel>Pick a date</MenuLabel>
              <div className="px-1 pb-1">
                <MiniCalendar
                  value={todayISO()}
                  weekStart={weekStart}
                  onChange={(iso) => { applyDate(iso, friendlyDate(iso)); close(); }}
                />
              </div>
            </>
          )}
        </Popover>

        <Popover
          side="top"
          align="center"
          className="w-[160px]"
          trigger={<BarButton icon={Flag}>Priority</BarButton>}
        >
          {(close) => (
            <>
              {[3, 2, 1, 0].map((p) => (
                <MenuItem
                  key={p}
                  checked={targets.every((t) => t.priority === p)}
                  onClick={() => { applyPriority(p); close(); }}
                >
                  {PRIORITY_LABELS[p]}
                </MenuItem>
              ))}
            </>
          )}
        </Popover>

        <Popover
          side="top"
          align="center"
          className="max-h-[320px] w-[228px] overflow-y-auto"
          trigger={<BarButton icon={TagIcon}>Tag</BarButton>}
        >
          <>
            {allTags.map((tag) => {
              const onAll = targets.every((t) => t.tags.includes(tag));
              return (
                <MenuItem key={tag} checked={onAll} onClick={() => applyTag(tag, !onAll)}>
                  <span className={cn(`tint-${tagColors.get(tag) ?? "slate"}`, "inline-flex items-center gap-1.5")}>
                    <span className="size-2 shrink-0 rounded-full bg-[var(--tint)]" />
                    {tag}
                  </span>
                </MenuItem>
              );
            })}
            {allTags.length > 0 && <MenuSeparator />}
            <div className="px-1 pb-1 pt-0.5">
              <input
                value={draftTag}
                onChange={(e) => setDraftTag(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  const tag = draftTag.trim().replace(/^#/, "");
                  if (!tag) return;
                  applyTag(tag, true);
                  setDraftTag("");
                }}
                placeholder="New tag, then ↵"
                aria-label="Add a new tag to the selection"
                className="h-7 w-full rounded-md border border-line bg-transparent px-2 text-[12.5px] text-ink outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-ink-4 focus:border-accent focus:ring-2 focus:ring-accent-soft"
              />
            </div>
          </>
        </Popover>

        <span className="mx-0.5 h-4 w-px shrink-0 bg-line" />

        <IconButton label={`Delete ${count} ${noun}`} size="sm" tone="danger" onClick={() => setConfirming(true)}>
          <Trash2 />
        </IconButton>
        <IconButton label="Clear selection" size="sm" onClick={clear}>
          <X />
        </IconButton>
      </div>

      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={deleteSelection}
        title={`Delete ${count} ${noun}?`}
        description="This removes them permanently, along with anything nested underneath."
        confirmLabel="Delete"
      />
    </>
  );
}
