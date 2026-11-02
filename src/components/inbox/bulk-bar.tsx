"use client";

import * as React from "react";
import { CalendarClock, CheckCheck, ChevronDown, CloudMoon, Copy, CornerDownRight, Flag, ListChecks, MoreHorizontal, RotateCcw, Shapes, Tag as TagIcon, Trash2, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import { formatDate, friendlyDate, todayISO } from "@/lib/date";
import { PRIORITY_LABELS, type Tint } from "@/lib/types";
import { Button, IconButton, Input, Kbd } from "@/components/ui/primitives";
import { Popover, MenuItem, MenuLabel, MenuSeparator, ConfirmDialog } from "@/components/ui/overlays";
import { MiniCalendar } from "@/components/ui/mini-calendar";
import { useTriage } from "./triage-context";
import { useTriageActions } from "./actions";
import { schedulePresets } from "./quick-schedule";

/**
 * Arrow-key roving focus, so the bar behaves the way `role="toolbar"`
 * promises: one Tab stop for the whole strip, arrows to walk it.
 */
function useRovingToolbar(ref: React.RefObject<HTMLDivElement | null>) {
  const [active, setActive] = React.useState(0);

  const items = React.useCallback(
    () => [...(ref.current?.querySelectorAll<HTMLElement>("[data-roving]") ?? [])],
    [ref],
  );

  React.useEffect(() => {
    const list = items();
    list.forEach((node, i) => { node.tabIndex = i === Math.min(active, list.length - 1) ? 0 : -1; });
  });

  return {
    onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
      const list = items();
      if (!list.length) return;
      const at = list.indexOf(document.activeElement as HTMLElement);
      let next = -1;
      if (e.key === "ArrowRight") next = at < 0 ? 0 : (at + 1) % list.length;
      else if (e.key === "ArrowLeft") next = at < 0 ? list.length - 1 : (at - 1 + list.length) % list.length;
      else if (e.key === "Home") next = 0;
      else if (e.key === "End") next = list.length - 1;
      if (next < 0) return;
      e.preventDefault();
      e.stopPropagation();
      setActive(next);
      list[next].focus();
    },
    onFocus(e: React.FocusEvent<HTMLDivElement>) {
      const at = items().indexOf(e.target as HTMLElement);
      if (at >= 0) setActive(at);
    },
  };
}

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
      data-roving
      onClick={onClick}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[12.5px] font-medium text-ink-2 cursor-pointer",
        "transition-[background-color,color,transform] duration-150 ease-[var(--ease-out-apple)]",
        "hover:bg-hover hover:text-ink active:scale-[0.97]",
        // A phone toolbar: icon over word, one fifth of the bar each, the
        // whole cell the target. The chevron is a desktop nicety with no room.
        "max-md:row-start-2 max-md:h-auto max-md:min-w-0 max-md:flex-col max-md:gap-1 max-md:rounded-xl",
        "max-md:px-0.5 max-md:py-1.5 max-md:text-[11px] max-md:active:bg-hover",
      )}
    >
      <Icon aria-hidden className="size-3.5 max-md:size-[18px]" />
      {children}
      <ChevronDown aria-hidden className="size-3 opacity-50 max-md:hidden" />
    </button>
  );
}

/**
 * The touch path to "select everything shown", which the keyboard reaches
 * with ⌘A and a mouse with shift-click. Only a touch screen draws it; the
 * desktop bar is unchanged.
 */
function SelectAllButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative hidden h-7 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[12.5px] font-medium text-ink-2 cursor-pointer",
        "transition-[background-color,color,transform] duration-150 ease-[var(--ease-out-apple)]",
        "hover:bg-hover hover:text-ink active:scale-[0.97] active:bg-hover",
        "touch:inline-flex touch-hit [--touch-hit:-8px_0px] max-md:h-9 max-md:px-2 max-md:text-[13px]",
      )}
    >
      {/* A 320px phone fits the count and the words, not the icon too. */}
      <ListChecks aria-hidden className="size-3.5 max-md:hidden" />
      Select all
    </button>
  );
}

/**
 * Floating bar that appears while rows are selected. Sits above the focus timer pill.
 *
 * On a phone it is a docked panel above the tab bar rather than a pill: seven
 * controls never fit across 390px, so the count and the two quick verbs take
 * the top row and the five menus share the bottom one as a toolbar.
 */
export function BulkBar() {
  const { ids, count, clear, selecting, setSelecting, rows, isSelected, setSelected, announce } = useTriage();
  const actions = useTriageActions();
  const tasks = useStore((s) => s.tasks);
  const tagRows = useStore((s) => s.tags);
  const weekStart = useStore((s) => s.profile?.week_start ?? 1);
  const timer = useStore((s) => s.timer);

  const [confirming, setConfirming] = React.useState(false);
  const [draftTag, setDraftTag] = React.useState("");
  const [parentQuery, setParentQuery] = React.useState("");
  const barRef = React.useRef<HTMLDivElement>(null);
  const roving = useRovingToolbar(barRef);

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

  // Anything top-level that is not itself being nested can host the selection.
  const parentCandidates = React.useMemo(() => {
    const needle = parentQuery.trim().toLowerCase();
    return tasks
      .filter((t) => !t.parent_id && !idSet.has(t.id) && t.status !== "done")
      .filter((t) => (needle ? t.title.toLowerCase().includes(needle) : true))
      .sort((a, b) => (a.date ?? "9999").localeCompare(b.date ?? "9999"))
      .slice(0, 8);
  }, [tasks, idSet, parentQuery]);

  const noun = targets.length === 1 ? "task" : "tasks";
  const timerActive = timer.running || timer.accumulated > 0;
  const anyOpen = targets.some((t) => t.status !== "done");
  const anyNested = targets.some((t) => t.parent_id);

  if (!selecting) return null;

  const canSelectMore = rows.some((id) => !isSelected(id));
  function selectAll() {
    setSelected(rows, true);
    announce(`Selected all ${rows.length} tasks`);
  }

  function addDraftTag() {
    const tag = draftTag.trim().replace(/^#/, "");
    if (!tag) return;
    actions.setTag(ids, tag, true);
    setDraftTag("");
  }

  const shell = cn(
    "fixed left-1/2 z-[60] flex max-w-[calc(100vw-24px)] -translate-x-1/2 items-center gap-1 rounded-full border border-line px-1.5 py-1.5 pl-3",
    "material shadow-lg anim-slide",
    // --bottom-inset is 0 on a desktop, so the pill sits where it always has;
    // on a phone it clears the tab bar and the home indicator instead of
    // landing on top of them, and clears the focus pill when that is up.
    timerActive
      ? "bottom-[calc(var(--bottom-inset)+74px)] max-md:bottom-[calc(var(--bottom-inset)+66px)]"
      : "bottom-[calc(var(--bottom-inset)+20px)] max-md:bottom-[calc(var(--bottom-inset)+12px)]",
    "max-md:left-3 max-md:right-3 max-md:max-w-none max-md:translate-x-0 max-md:rounded-2xl max-md:p-2",
  );

  // The panel's icon buttons grow with it: 36px on a phone, 24px in the pill.
  const phoneIcon = "max-md:size-9 max-md:[&_svg]:size-[18px]";

  // Select mode with nothing picked yet still needs to announce itself and offer a way out.
  if (!count) {
    return (
      <div className={shell}>
        <span aria-live="polite" aria-atomic="true" className="whitespace-nowrap text-[12.5px] text-ink-2 max-md:min-w-0 max-md:flex-1 max-md:truncate max-md:pl-1.5 max-md:text-[13px]">
          Select tasks
          {/* Mouse and keyboard words, so no phone and no finger gets them. */}
          <span className="ml-1 text-ink-4 max-sm:hidden touch:hidden">
            — shift-click for a range, or <Kbd>X</Kbd> on the cursor row
          </span>
        </span>
        {canSelectMore && <SelectAllButton onClick={selectAll} />}
        <span aria-hidden className="mx-0.5 h-4 w-px shrink-0 bg-line" />
        <IconButton label="Leave select mode" size="sm" className={phoneIcon} onClick={() => setSelecting(false)}>
          <X />
        </IconButton>
      </div>
    );
  }

  return (
    <>
      <div
        ref={barRef}
        role="toolbar"
        aria-orientation="horizontal"
        aria-label={`Bulk actions for ${count} selected ${noun}`}
        className={cn(shell, "max-md:grid max-md:grid-cols-5 max-md:gap-x-1 max-md:gap-y-1.5")}
        onKeyDown={roving.onKeyDown}
        onFocus={roving.onFocus}
      >
        {/* `contents` on a desktop, so the pill lays out exactly as it did; on a
            phone this is the top row's left half: the count and Select all. */}
        <div className="contents max-md:col-span-3 max-md:row-start-1 max-md:flex max-md:min-w-0 max-md:items-center max-md:gap-1">
          <span
            aria-live="polite"
            aria-atomic="true"
            className="mr-1 whitespace-nowrap text-[12.5px] font-medium text-ink max-md:mr-0 max-md:pl-1.5 max-md:text-[13px]"
          >
            <span className="tnum">{count}</span> selected
          </span>
          {canSelectMore && <SelectAllButton onClick={selectAll} />}
        </div>

        <span aria-hidden className="mx-0.5 h-4 w-px shrink-0 bg-line max-md:hidden" />

        <Popover
          side="top"
          align="center"
          className="w-[262px]"
          trigger={<BarButton icon={CalendarClock}>Date</BarButton>}
        >
          {(close) => (
            <>
              {presets.map((p) => (
                <MenuItem
                  key={p.key}
                  icon={p.icon}
                  shortcut={p.iso ? formatDate(p.iso, { weekday: false }) : p.hint}
                  onClick={() => { actions.moveToDate(ids, p.iso); close(); }}
                >
                  {p.label}
                </MenuItem>
              ))}
              <MenuItem
                icon={CloudMoon}
                onClick={() => { actions.setSomeday(ids, true); close(); }}
              >
                Someday
              </MenuItem>
              <MenuSeparator />
              <MenuLabel>Pick a date</MenuLabel>
              <div className="px-1 pb-1">
                <MiniCalendar
                  value={todayISO()}
                  weekStart={weekStart}
                  onChange={(iso) => { actions.moveToDate(ids, iso); close(); }}
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
                  shortcut={String(p)}
                  onClick={() => { actions.setPriority(ids, p); close(); }}
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
                <MenuItem key={tag} checked={onAll} onClick={() => actions.setTag(ids, tag, !onAll)}>
                  <span className={cn(`tint-${tagColors.get(tag) ?? "slate"}`, "inline-flex items-center gap-1.5")}>
                    <span className="size-2 shrink-0 rounded-full bg-[var(--tint)]" />
                    {tag}
                  </span>
                </MenuItem>
              );
            })}
            {allTags.length > 0 && <MenuSeparator />}
            <div className="flex items-center gap-1.5 px-1 pb-1 pt-0.5">
              <Input
                value={draftTag}
                onChange={(e) => setDraftTag(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  addDraftTag();
                }}
                placeholder="New tag, then ↵"
                aria-label="Add a new tag to the selection"
                className="h-7 text-[12.5px]"
              />
              {/* Return is the keyboard's way to add it; a finger gets a button. */}
              <Button
                variant="secondary"
                size="sm"
                disabled={!draftTag.trim().replace(/^#/, "")}
                onClick={addDraftTag}
                className="hidden shrink-0 touch:inline-flex touch:h-10"
              >
                Add
              </Button>
            </div>
          </>
        </Popover>

        <Popover
          side="top"
          align="center"
          className="w-[248px]"
          trigger={<BarButton icon={MoreHorizontal}>More</BarButton>}
        >
          {(close) => (
            <>
              <MenuLabel>Status</MenuLabel>
              <MenuItem
                icon={anyOpen ? CheckCheck : RotateCcw}
                shortcut="D"
                onClick={() => { actions.setDone(ids, anyOpen); close(); }}
              >
                {anyOpen ? `Complete ${count} ${noun}` : `Reopen ${count} ${noun}`}
              </MenuItem>

              <MenuSeparator />
              <MenuLabel>Convert to</MenuLabel>
              <MenuItem icon={Shapes} onClick={() => { actions.setKind(ids, "reading"); close(); }}>
                Reading
              </MenuItem>
              <MenuItem icon={Shapes} onClick={() => { actions.setKind(ids, "event"); close(); }}>
                Event
              </MenuItem>
              <MenuItem icon={Shapes} onClick={() => { actions.setKind(ids, "block"); close(); }}>
                Time block
              </MenuItem>
              <MenuItem icon={Shapes} onClick={() => { actions.setKind(ids, "task"); close(); }}>
                Plain task
              </MenuItem>

              <MenuSeparator />
              <MenuItem icon={Copy} onClick={() => { actions.duplicate(ids); close(); }}>
                Duplicate
              </MenuItem>
              {anyNested && (
                <MenuItem icon={CornerDownRight} onClick={() => { actions.unnest(ids); close(); }}>
                  Pull out of parent
                </MenuItem>
              )}
            </>
          )}
        </Popover>

        <Popover
          side="top"
          align="center"
          className="w-[268px]"
          trigger={<BarButton icon={CornerDownRight}>Nest</BarButton>}
        >
          {(close) => (
            <>
              <MenuLabel>Make subtasks of…</MenuLabel>
              <div className="px-1 pb-1">
                <Input
                  value={parentQuery}
                  onChange={(e) => setParentQuery(e.target.value)}
                  placeholder="Find a parent task"
                  aria-label="Search for a parent task"
                  className="h-7 text-[12.5px]"
                />
              </div>
              {parentCandidates.length === 0 ? (
                <p className="px-2 pb-2 pt-1 text-[12px] leading-snug text-ink-4">
                  No open task matches. Subtasks can only hang off a top-level task.
                </p>
              ) : (
                parentCandidates.map((parent) => (
                  <MenuItem
                    key={parent.id}
                    shortcut={parent.date ? friendlyDate(parent.date) : "Inbox"}
                    onClick={() => { actions.nestUnder(ids, parent.id); clear(); close(); }}
                  >
                    {parent.title || "Untitled"}
                  </MenuItem>
                ))
              )}
            </>
          )}
        </Popover>

        <span aria-hidden className="mx-0.5 h-4 w-px shrink-0 bg-line max-md:hidden" />

        <IconButton
          data-roving
          label={`Delete ${count} ${noun}`}
          size="sm"
          tone="danger"
          onClick={() => setConfirming(true)}
          className={cn(phoneIcon, "max-md:col-start-4 max-md:row-start-1 max-md:justify-self-center")}
        >
          <Trash2 />
        </IconButton>
        <IconButton
          data-roving
          label="Clear selection"
          size="sm"
          onClick={clear}
          className={cn(phoneIcon, "max-md:col-start-5 max-md:row-start-1 max-md:justify-self-center")}
        >
          <X />
        </IconButton>
      </div>

      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={() => actions.deleteTasks(ids)}
        title={`Delete ${count} ${noun}?`}
        description="This removes them permanently, along with anything nested underneath. You get one undo from the toast."
        confirmLabel="Delete"
      />
    </>
  );
}
