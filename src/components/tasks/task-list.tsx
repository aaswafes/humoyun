"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import {
  DndContext, DragOverlay, closestCenter, pointerWithin, PointerSensor, KeyboardSensor,
  useDroppable, useSensor, useSensors,
  type CollisionDetection, type DragEndEvent, type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext, sortableKeyboardCoordinates, useSortable,
  verticalListSortingStrategy, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  GripVertical, Plus, ChevronRight, ListFilter, Sun, Sunrise, CalendarDays, Inbox,
  Check, Trash2, Flag, Hash, X, Palette, Layers, ArrowUpDown, EyeOff, MousePointerClick,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore, orderBetween, subtasksOf } from "@/lib/store";
import { parseTask } from "@/lib/parse";
import { addDays, friendlyDate, todayISO } from "@/lib/date";
import { PRIORITY_LABELS, type Task, type Tint } from "@/lib/types";
import { TaskRow, TaskDatePicker, timeOfDayOf } from "./task-row";
import { Button, EmptyState, IconButton, Badge } from "@/components/ui/primitives";
import { Popover, MenuItem, MenuLabel, MenuSeparator, TintPicker, useMounted } from "@/components/ui/overlays";
import { useDragBody } from "@/components/ui/drag";
import { useHotkeys } from "@/hooks/use-hotkeys";

// =========================================================
// Folds that remember
// =========================================================
/** 200ms, opacity only — safe to wrap around a drag surface. */
export const FOLD_ANIM = { animation: "hm-fade-in 200ms var(--ease-out-apple) both" } as const;

// Fold state is an external store, the way the settings tab already is: the
// server snapshot is the default and the client snapshot is localStorage, so
// hydration never disagrees and no effect has to write state on mount.
const foldListeners = new Set<() => void>();
const foldCache = new Map<string, boolean>();

function subscribeFolds(fn: () => void) {
  foldListeners.add(fn);
  return () => { foldListeners.delete(fn); };
}

/** Only a value the user actually chose is cached — otherwise the caller's default wins. */
function readFold(key: string, fallback: boolean): boolean {
  const cached = foldCache.get(key);
  if (cached !== undefined) return cached;
  try {
    const raw = localStorage.getItem(key);
    if (raw === "1" || raw === "0") {
      const value = raw === "1";
      foldCache.set(key, value);
      return value;
    }
  } catch { /* private mode */ }
  return fallback;
}

function writeFold(key: string, value: boolean) {
  foldCache.set(key, value);
  try { localStorage.setItem(key, value ? "1" : "0"); } catch { /* private mode */ }
  foldListeners.forEach((fn) => fn());
}

/**
 * Open/closed state for a disclosure, remembered per surface. Pass `null` as the
 * key for a fold that should not be remembered.
 */
export function useDisclosure(key: string | null, defaultOpen: boolean) {
  const [localOpen, setLocalOpen] = React.useState(defaultOpen);

  const stored = React.useSyncExternalStore(
    subscribeFolds,
    () => (key ? readFold(key, defaultOpen) : defaultOpen),
    () => defaultOpen,
  );

  const open = key ? stored : localOpen;

  const toggle = React.useCallback(() => {
    if (key) writeFold(key, !readFold(key, defaultOpen));
    else setLocalOpen((v) => !v);
  }, [key, defaultOpen]);

  /** for a shortcut that has to reveal what it targets before acting on it */
  const openNow = React.useCallback(() => {
    if (key) writeFold(key, true);
    else setLocalOpen(true);
  }, [key]);

  return { open, toggle, openNow };
}

// =========================================================
// Grouping and sorting
// =========================================================
/**
 * Marks a subtree that already sits inside a DndContext. A TaskList rendered
 * within one (the calendar day column, the day peek) must not open a second:
 * nested contexts both claim the pointer and neither resolves a drop.
 */
const InsideDnd = React.createContext(false);

export function DndBoundary({ children }: { children: React.ReactNode }) {
  return <InsideDnd.Provider value={true}>{children}</InsideDnd.Provider>;
}

export type TaskGroupBy = "none" | "priority" | "tag" | "goal" | "time";
export type TaskSortBy = "manual" | "time" | "priority" | "title" | "created";

const GROUP_LABELS: Record<TaskGroupBy, string> = {
  none: "No grouping",
  priority: "Priority",
  tag: "Tag",
  goal: "Goal",
  time: "Time of day",
};

const SORT_LABELS: Record<TaskSortBy, string> = {
  manual: "Manual order",
  time: "Time",
  priority: "Priority",
  title: "Title",
  created: "Recently added",
};

const TIME_SLOTS: { key: string; label: string; start: number | null }[] = [
  { key: "morning", label: "Morning", start: 9 * 60 },
  { key: "afternoon", label: "Afternoon", start: 14 * 60 },
  { key: "evening", label: "Evening", start: 19 * 60 },
  { key: "anytime", label: "Anytime", start: null },
];

interface Group {
  key: string;
  label: string;
  tint?: Tint | null;
  tasks: Task[];
  /** what dropping a task into this group means */
  apply?: Partial<Task> | ((task: Task) => Partial<Task>);
}

function sortTasks(list: Task[], by: TaskSortBy): Task[] {
  if (by === "manual") return list;
  const copy = [...list];
  switch (by) {
    case "time":
      return copy.sort((a, b) => {
        const at = a.start_min ?? Number.MAX_SAFE_INTEGER;
        const bt = b.start_min ?? Number.MAX_SAFE_INTEGER;
        return at - bt || a.order_index - b.order_index;
      });
    case "priority":
      return copy.sort((a, b) => b.priority - a.priority || a.order_index - b.order_index);
    case "title":
      return copy.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
    case "created":
      return copy.sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
    default:
      return copy;
  }
}

function buildGroups(list: Task[], by: TaskGroupBy, goals: { id: string; title: string; color: Tint }[]): Group[] {
  if (by === "none") return [{ key: "all", label: "", tasks: list }];

  if (by === "priority") {
    return [3, 2, 1, 0]
      .map((p) => ({
        key: `priority:${p}`,
        label: p === 0 ? "No priority" : `${PRIORITY_LABELS[p]} priority`,
        tint: (p === 3 ? "red" : p === 2 ? "amber" : p === 1 ? "slate" : null) as Tint | null,
        tasks: list.filter((t) => t.priority === p),
        apply: { priority: p },
      }))
      .filter((g) => g.tasks.length > 0);
  }

  if (by === "time") {
    return TIME_SLOTS.map((slot) => ({
      key: `time:${slot.key}`,
      label: slot.label,
      tasks: list.filter((t) => timeOfDayOf(t) === slot.key),
      apply: (task: Task): Partial<Task> =>
        slot.start == null
          ? { start_min: null, end_min: null, all_day: true }
          : {
            start_min: slot.start,
            all_day: false,
            end_min: Math.min(1439, slot.start + (task.duration_min ?? 60)),
          },
    })).filter((g) => g.tasks.length > 0);
  }

  if (by === "goal") {
    const used = goals.filter((g) => list.some((t) => t.goal_id === g.id));
    const groups: Group[] = used.map((g) => ({
      key: `goal:${g.id}`,
      label: g.title,
      tint: g.color,
      tasks: list.filter((t) => t.goal_id === g.id),
      apply: { goal_id: g.id },
    }));
    const rest = list.filter((t) => !t.goal_id || !used.some((g) => g.id === t.goal_id));
    if (rest.length) groups.push({ key: "goal:none", label: "No goal", tasks: rest, apply: { goal_id: null } });
    return groups;
  }

  // by tag — a task lands in its first tag so a drag never duplicates a row
  const tags: string[] = [];
  list.forEach((t) => { if (t.tags[0] && !tags.includes(t.tags[0])) tags.push(t.tags[0]); });
  tags.sort((a, b) => a.localeCompare(b));
  const groups: Group[] = tags.map((tag) => ({
    key: `tag:${tag}`,
    label: `#${tag}`,
    tasks: list.filter((t) => t.tags[0] === tag),
    apply: (task: Task): Partial<Task> => ({ tags: [tag, ...task.tags.filter((x) => x !== tag)] }),
  }));
  const untagged = list.filter((t) => !t.tags.length);
  if (untagged.length) groups.push({ key: "tag:none", label: "No tag", tasks: untagged, apply: { tags: [] } });
  return groups;
}

// =========================================================
// Sortable wrapper — the row itself stays presentational
// =========================================================
interface RowChrome {
  selectable?: boolean;
  selected?: boolean;
  selectionActive?: boolean;
  onSelect?: (id: string, opts: { shift: boolean; mod: boolean }) => void;
  onInsertBelow?: (task: Task) => void;
}

function SelectionShell({
  task, chrome, children,
}: {
  task: Task;
  chrome: RowChrome;
  children: React.ReactNode;
}) {
  const { selectable, selectionActive, onSelect } = chrome;
  return (
    <div
      onMouseDownCapture={(e) => {
        // shift-click would otherwise paint a text selection across the list
        if (e.shiftKey && selectable) e.preventDefault();
      }}
      onClickCapture={(e) => {
        if (!selectable || !onSelect) return;
        const mod = e.metaKey || e.ctrlKey;
        if (mod || e.shiftKey) {
          e.preventDefault();
          e.stopPropagation();
          onSelect(task.id, { shift: e.shiftKey, mod });
          return;
        }
        if (selectionActive) {
          e.preventDefault();
          e.stopPropagation();
          onSelect(task.id, { shift: false, mod: true });
        }
      }}
    >
      {children}
    </div>
  );
}

function SortableTaskRow({
  task, showDate, chrome, reorderable,
}: {
  task: Task;
  showDate?: boolean;
  chrome: RowChrome;
  reorderable: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
  const body = useDragBody(listeners);

  return (
    <SelectionShell task={task} chrome={chrome}>
      <div
        ref={setNodeRef}
        // The DragOverlay is the thing that follows the cursor, so the source
        // row stays put and simply dims — no second ghost sliding under it.
        style={{ transform: isDragging ? undefined : CSS.Translate.toString(transform), transition }}
        className={cn(isDragging && "opacity-40")}
      >
        <TaskRow
          task={task}
          showDate={showDate}
          selected={chrome.selected}
          selectionActive={chrome.selectionActive}
          onSelectToggle={chrome.onSelect ? (opts) => chrome.onSelect!(task.id, opts) : undefined}
          onInsertBelow={chrome.onInsertBelow}
          dragProps={body}
          dragHandle={
            <button
              {...attributes}
              {...listeners}
              data-no-drag
              aria-label={
                reorderable
                  ? `Reorder ${task.title || "task"}, or drag it onto a date`
                  : `Drag ${task.title || "task"} onto a date`
              }
              className="flex h-7 w-4 cursor-grab items-center justify-center rounded text-ink-4 transition-colors hover:text-ink-2 active:cursor-grabbing"
            >
              <GripVertical className="size-3.5" />
            </button>
          }
        />
      </div>
    </SelectionShell>
  );
}

// =========================================================
// Inline composer — the Notion "click here and type" row
// =========================================================
export function InlineComposer({
  date, parentId, placeholder = "Add a task", defaults, className, autoFocus, onDone,
}: {
  date?: string | null;
  parentId?: string;
  placeholder?: string;
  defaults?: Partial<Task>;
  className?: string;
  autoFocus?: boolean;
  /** fired when the composer closes — lets an insert-point unmount itself */
  onDone?: () => void;
}) {
  const addTask = useStore((s) => s.addTask);
  const weekStart = useStore((s) => s.profile?.week_start ?? 1);
  const [active, setActive] = React.useState(!!autoFocus);
  const [value, setValue] = React.useState("");
  const ref = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => { if (active) ref.current?.focus(); }, [active]);

  function submit() {
    const text = value.trim();
    if (!text) { setActive(false); onDone?.(); return; }
    const parsed = parseTask(text, weekStart);
    addTask({
      title: parsed.title,
      date: parsed.date ?? date ?? null,
      start_min: parsed.start_min,
      end_min: parsed.end_min,
      all_day: parsed.start_min == null,
      duration_min: parsed.duration_min,
      priority: parsed.priority,
      tags: parsed.tags,
      parent_id: parentId ?? null,
      ...defaults,
    });
    setValue("");
  }

  if (!active) {
    return (
      <button
        onClick={() => setActive(true)}
        className={cn(
          "flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-left text-[13.5px] text-ink-4",
          "hover:bg-hover hover:text-ink-3 cursor-pointer transition-colors",
          className,
        )}
      >
        <Plus className="size-4" />
        {placeholder}
      </button>
    );
  }

  return (
    <div className={cn("flex items-center gap-2 rounded-md bg-hover px-1.5 py-1.5", className)}>
      <Plus className="size-4 shrink-0 text-ink-4" />
      <input
        ref={ref}
        value={value}
        aria-label={placeholder}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => { submit(); setActive(false); onDone?.(); }}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); submit(); }
          if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            setValue("");
            setActive(false);
            onDone?.();
          }
        }}
        placeholder="Task name — try “friday 9am #deep !high”"
        className="min-w-0 flex-1 bg-transparent text-[13.5px] text-ink outline-none placeholder:text-ink-4"
      />
    </div>
  );
}

// =========================================================
// The hairline between two rows that opens a composer in place
// =========================================================
function InsertPoint({
  before, after, date, defaults,
}: {
  before?: number;
  after?: number;
  date?: string | null;
  defaults?: Partial<Task>;
}) {
  const [open, setOpen] = React.useState(false);

  if (open) {
    return (
      <InlineComposer
        autoFocus
        date={date}
        defaults={{ ...defaults, order_index: orderBetween(before, after) }}
        onDone={() => setOpen(false)}
        className="my-0.5"
      />
    );
  }

  return (
    <button
      type="button"
      // Kept out of the tab ring on purpose: with one of these between every
      // row it would triple the stops. The keyboard twin is "O" on a focused row.
      tabIndex={-1}
      aria-label="Insert a task here"
      onClick={() => setOpen(true)}
      className="group/gap relative -my-1 flex h-2 w-full cursor-pointer items-center"
    >
      <span className="absolute -left-1 grid size-3.5 place-items-center rounded-full bg-accent text-accent-ink opacity-0 transition-opacity duration-150 group-hover/gap:opacity-100">
        <Plus className="size-2.5" strokeWidth={3} />
      </span>
      <span className="ml-3 h-px w-[calc(100%-0.75rem)] bg-accent opacity-0 transition-opacity duration-150 group-hover/gap:opacity-100" />
    </button>
  );
}

// =========================================================
// Drag tray — the drop targets that appear while a row is in the air.
// This is what makes a drag mean "reschedule", not just "reorder".
// =========================================================
const TRAY_TARGETS: { id: string; label: string; icon: React.ComponentType<{ className?: string }>; danger?: boolean }[] = [
  { id: "today", label: "Today", icon: Sun },
  { id: "tomorrow", label: "Tomorrow", icon: Sunrise },
  { id: "nextweek", label: "Next week", icon: CalendarDays },
  { id: "inbox", label: "Inbox", icon: Inbox },
  { id: "done", label: "Complete", icon: Check },
  { id: "delete", label: "Delete", icon: Trash2, danger: true },
];

function TrayTarget({
  id, label, icon: Icon, danger,
}: {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  danger?: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `tray:${id}` });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex h-14 w-[86px] flex-col items-center justify-center gap-1 rounded-lg border text-[11.5px] font-medium",
        "transition-[background-color,border-color,transform] duration-150 ease-[var(--ease-out-apple)]",
        isOver
          ? danger
            ? "scale-105 border-danger bg-danger-soft text-danger"
            : "scale-105 border-accent bg-accent-soft text-accent"
          : "border-line text-ink-3",
      )}
    >
      <Icon className="size-4" />
      {label}
    </div>
  );
}

function DragTray({ title }: { title: string }) {
  const mounted = useMounted();
  if (!mounted) return null;
  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[95] flex justify-center px-4">
      <div className="pointer-events-auto material anim-slide flex items-center gap-1.5 rounded-2xl border border-line p-1.5 shadow-lg">
        <div className="hidden max-w-[150px] px-2 sm:block">
          <p className="truncate text-[12px] font-medium text-ink">{title || "Untitled"}</p>
          <p className="text-[11px] text-ink-3">Drop to…</p>
        </div>
        {TRAY_TARGETS.map((t) => <TrayTarget key={t.id} {...t} />)}
      </div>
    </div>,
    document.body,
  );
}

// =========================================================
// Group header — also a drop target when grouping is on
// =========================================================
function GroupHeader({
  group, open, onToggle, droppable,
}: {
  group: Group;
  open: boolean;
  onToggle: () => void;
  droppable: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `group:${group.key}`, disabled: !droppable });
  const done = group.tasks.filter((t) => t.status === "done").length;

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "mb-1.5 mt-6 flex items-center gap-2 rounded-md px-1.5 py-1 transition-colors duration-150 first:mt-0",
        isOver && "bg-accent-soft ring-1 ring-accent-line",
        group.tint && `tint-${group.tint}`,
      )}
    >
      <button
        onClick={onToggle}
        aria-expanded={open}
        className="flex min-w-0 flex-1 items-center gap-1.5 cursor-pointer text-left"
      >
        <ChevronRight
          className={cn("size-3 shrink-0 text-ink-4 transition-transform duration-200", open && "rotate-90")}
        />
        {group.tint && <span className="size-2 shrink-0 rounded-full bg-[var(--tint)]" />}
        <span className="truncate text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">
          {group.label}
        </span>
        {/* One number per idea: the bar and the count said the same thing. */}
        <span className="shrink-0 text-[11px] text-ink-4 tnum">
          {done > 0 ? `${done}/${group.tasks.length}` : group.tasks.length}
        </span>
      </button>
    </div>
  );
}

// =========================================================
// Floating selection bar
// =========================================================
function SelectionBar({
  tasks, onClear,
}: {
  tasks: Task[];
  onClear: () => void;
}) {
  const patch = useStore((s) => s.patch);
  const remove = useStore((s) => s.remove);
  const insert = useStore((s) => s.insert);
  const allTasks = useStore((s) => s.tasks);
  const toast = useStore((s) => s.toast);
  const tags = useStore((s) => s.tags);
  const mounted = useMounted();
  const today = todayISO();

  /**
   * Every bulk edit records the exact fields it touched, per task, so Undo puts
   * back what was there rather than a guess at what "before" meant.
   */
  function bulkApply(label: string, changesFor: (task: Task) => Partial<Task>) {
    if (!tasks.length) return;
    const steps = tasks.map((task) => {
      const changes = changesFor(task);
      const prev: Record<string, unknown> = {};
      for (const key of Object.keys(changes)) prev[key] = (task as unknown as Record<string, unknown>)[key];
      return { id: task.id, changes, prev: prev as Partial<Task> };
    });
    steps.forEach((s) => patch("tasks", s.id, s.changes));
    toast({
      title: `${label} · ${tasks.length} ${tasks.length === 1 ? "task" : "tasks"}`,
      action: { label: "Undo", run: () => steps.forEach((s) => patch("tasks", s.id, s.prev)) },
    });
  }

  function bulkDelete() {
    const victims = tasks.flatMap((t) => [t, ...subtasksOf(allTasks, t.id)]);
    victims.forEach((v) => remove("tasks", v.id));
    onClear();
    toast({
      title: `Deleted ${victims.length} ${victims.length === 1 ? "task" : "tasks"}`,
      tone: "danger",
      action: { label: "Undo", run: () => victims.forEach((v) => insert("tasks", v)) },
    });
  }

  const allDone = tasks.every((t) => t.status === "done");
  if (!mounted || !tasks.length) return null;

  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[92] flex justify-center px-4">
      <div
        role="toolbar"
        aria-label={`${tasks.length} selected`}
        className="pointer-events-auto material anim-slide flex max-w-full items-center gap-1 overflow-x-auto rounded-full border border-line p-1 pl-3 shadow-lg"
      >
        <span className="shrink-0 whitespace-nowrap text-[12.5px] font-medium text-ink tnum">
          {tasks.length} selected
        </span>
        <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-line" />

        <Button
          size="xs"
          variant="ghost"
          className="shrink-0"
          onClick={() =>
            bulkApply(allDone ? "Reopened" : "Completed", () => ({
              status: allDone ? "todo" : "done",
              completed_at: allDone ? null : new Date().toISOString(),
            }))
          }
        >
          <Check className="size-3" /> {allDone ? "Reopen" : "Complete"}
        </Button>

        <Button size="xs" variant="ghost" className="shrink-0" onClick={() => bulkApply("Moved to today", () => ({ date: today }))}>
          <Sun className="size-3" /> Today
        </Button>
        <Button
          size="xs"
          variant="ghost"
          className="shrink-0"
          onClick={() => bulkApply("Pushed a day", (t) => ({ date: addDays(t.date ?? today, 1) }))}
        >
          <Sunrise className="size-3" /> Tomorrow
        </Button>

        <Popover
          side="top"
          align="center"
          className="w-[256px]"
          trigger={
            <Button size="xs" variant="ghost" className="shrink-0">
              <CalendarDays className="size-3" /> Date
            </Button>
          }
        >
          {(close) => (
            <TaskDatePicker
              value={tasks[0]?.date ?? null}
              onPick={(iso) => { bulkApply(`Moved to ${friendlyDate(iso)}`, () => ({ date: iso })); close(); }}
              onClear={() => { bulkApply("Moved to Inbox", () => ({ date: null })); close(); }}
            />
          )}
        </Popover>

        <Popover
          side="top"
          align="center"
          className="w-[180px]"
          trigger={
            <Button size="xs" variant="ghost" className="shrink-0">
              <Flag className="size-3" /> Priority
            </Button>
          }
        >
          {(close) => (
            <>
              {PRIORITY_LABELS.map((label, i) => (
                <MenuItem key={label} onClick={() => { bulkApply(`Priority: ${label}`, () => ({ priority: i })); close(); }}>
                  {label}
                </MenuItem>
              ))}
            </>
          )}
        </Popover>

        <Popover
          side="top"
          align="center"
          className="w-[210px]"
          trigger={
            <Button size="xs" variant="ghost" className="shrink-0">
              <Hash className="size-3" /> Tag
            </Button>
          }
        >
          {(close) => (
            <>
              <MenuLabel>Add tag</MenuLabel>
              {tags.length === 0 && (
                <p className="px-2 pb-1 text-[12px] text-ink-4">No tags yet — add one from a task.</p>
              )}
              {tags.map((tag) => (
                <MenuItem
                  key={tag.id}
                  onClick={() => {
                    bulkApply(`Tagged #${tag.name}`, (t) => ({
                      tags: t.tags.includes(tag.name) ? t.tags : [...t.tags, tag.name],
                    }));
                    close();
                  }}
                >
                  <Badge tint={tag.color}>{tag.name}</Badge>
                </MenuItem>
              ))}
              <MenuSeparator />
              <MenuItem danger onClick={() => { bulkApply("Cleared tags", () => ({ tags: [] })); close(); }}>
                Clear all tags
              </MenuItem>
            </>
          )}
        </Popover>

        <Popover
          side="top"
          align="center"
          className="w-[210px]"
          trigger={
            <Button size="xs" variant="ghost" className="shrink-0">
              <Palette className="size-3" /> Colour
            </Button>
          }
        >
          <TintPicker
            value={tasks[0]?.color ?? null}
            allowNone
            onChange={(t) => bulkApply(t ? `Coloured ${t}` : "Colour cleared", () => ({ color: t }))}
          />
        </Popover>

        <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-line" />
        <IconButton label={`Delete ${tasks.length} tasks`} size="md" tone="danger" className="shrink-0" onClick={bulkDelete}>
          <Trash2 />
        </IconButton>
        <IconButton label="Clear selection" size="md" className="shrink-0" onClick={onClear}>
          <X />
        </IconButton>
      </div>
    </div>,
    document.body,
  );
}

// =========================================================
// TaskList
// =========================================================
export interface TaskListProps {
  tasks: Task[];
  showDate?: boolean;
  sortable?: boolean;
  composer?: boolean;
  composerDate?: string | null;
  composerDefaults?: Partial<Task>;
  emptyTitle?: string;
  emptyDescription?: string;
  className?: string;

  // ---- additions, all optional
  /** click + shift-click + mod-click selection and the floating action bar */
  selectable?: boolean;
  /** the group / sort / hide-done control. Defaults to on once the list has 4 rows. */
  controls?: boolean;
  defaultGroupBy?: TaskGroupBy;
  defaultSortBy?: TaskSortBy;
  /** the "+" hairline between rows. Defaults to on wherever a composer is shown. */
  insertBetween?: boolean;
  /** rows rendered before a "show more" — the contract's windowing floor */
  pageSize?: number;
  /**
   * The list owns a DndContext so a row can be dragged onto a date even in a
   * list that cannot be reordered. Set false if the surface around it wants to
   * own the drag itself (an outer DndContext cannot see an inner one's drags).
   */
  dnd?: boolean;
}

export function TaskList({
  tasks, showDate, sortable = true, composer, composerDate, composerDefaults,
  emptyTitle = "Nothing here yet", emptyDescription, className,
  selectable = true, controls, defaultGroupBy = "none", defaultSortBy = "manual",
  insertBetween, pageSize = 60, dnd = true,
}: TaskListProps) {
  const patch = useStore((s) => s.patch);
  const remove = useStore((s) => s.remove);
  const insert = useStore((s) => s.insert);
  const allTasks = useStore((s) => s.tasks);
  const goals = useStore((s) => s.goals);
  const toast = useStore((s) => s.toast);

  const [groupBy, setGroupBy] = React.useState<TaskGroupBy>(defaultGroupBy);
  const [sortBy, setSortBy] = React.useState<TaskSortBy>(defaultSortBy);
  const [hideDone, setHideDone] = React.useState(false);
  const [collapsed, setCollapsed] = React.useState<ReadonlySet<string>>(() => new Set<string>());
  const [limit, setLimit] = React.useState(pageSize);
  const [dragging, setDragging] = React.useState<Task | null>(null);
  const [insertAfter, setInsertAfter] = React.useState<string | null>(null);

  const [selected, setSelected] = React.useState<ReadonlySet<string>>(() => new Set<string>());
  const anchor = React.useRef<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const showInsert = insertBetween ?? !!composer;
  const showControls = controls ?? tasks.length >= 4;
  // One control above a list, not a row of them. Its label names the view that
  // is on, so the popover never has to be opened just to find out.
  const viewLabel =
    groupBy !== "none"
      ? GROUP_LABELS[groupBy]
      : sortBy !== "manual"
        ? SORT_LABELS[sortBy]
        : hideDone
          ? "Completed hidden"
          : "View";
  // An enclosing surface may already own the drag context.
  const nestedInDnd = React.useContext(InsideDnd);
  const ownsDnd = dnd && !nestedInDnd;
  const canSort = sortable && ownsDnd;
  const reorderable = canSort && sortBy === "manual" && groupBy === "none";

  // ---- derived rows -------------------------------------------------------
  const visible = React.useMemo(() => {
    const filtered = hideDone ? tasks.filter((t) => t.status !== "done") : tasks;
    return sortTasks(filtered, sortBy);
  }, [tasks, hideDone, sortBy]);

  const paged = React.useMemo(() => visible.slice(0, limit), [visible, limit]);
  const groups = React.useMemo(
    () => buildGroups(paged, groupBy, goals),
    [paged, groupBy, goals],
  );
  const flatOrder = React.useMemo(
    () => groups.flatMap((g) => (collapsed.has(g.key) ? [] : g.tasks.map((t) => t.id))),
    [groups, collapsed],
  );

  const selectedTasks = React.useMemo(
    () => allTasks.filter((t) => selected.has(t.id)),
    [allTasks, selected],
  );
  const selectionActive = selectable && selected.size > 0;

  // Rows can vanish under a live selection (deleted from another surface).
  React.useEffect(() => {
    if (!selected.size) return;
    const live = new Set([...selected].filter((id) => allTasks.some((t) => t.id === id)));
    if (live.size !== selected.size) setSelected(live);
  }, [allTasks, selected]);

  const clearSelection = React.useCallback(() => {
    setSelected(new Set<string>());
    anchor.current = null;
  }, []);

  const onSelect = React.useCallback(
    (id: string, opts: { shift: boolean; mod: boolean }) => {
      const from = anchor.current;
      const extending = opts.shift && !!from && flatOrder.includes(from) && flatOrder.includes(id);
      setSelected((prev) => {
        const next = new Set(prev);
        if (extending && from) {
          const a = flatOrder.indexOf(from);
          const b = flatOrder.indexOf(id);
          const [lo, hi] = a <= b ? [a, b] : [b, a];
          for (let i = lo; i <= hi; i++) next.add(flatOrder[i]);
          return next;
        }
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
      if (!extending) anchor.current = id;
    },
    [flatOrder],
  );

  useHotkeys(
    {
      escape: () => {
        // let an open popover or sheet take Escape first
        if (document.querySelector('[role="dialog"]')) return;
        clearSelection();
      },
      "mod+a": () => setSelected(new Set(flatOrder)),
    },
    { enabled: selectionActive },
  );

  // ---- drag ---------------------------------------------------------------
  const collisionDetection: CollisionDetection = React.useCallback((args) => {
    const hits = pointerWithin(args);
    return hits.length ? hits : closestCenter(args);
  }, []);

  function onDragStart(event: DragStartEvent) {
    const id = String(event.active.id).replace(/^task:/, "");
    setDragging(allTasks.find((t) => t.id === id) ?? null);
  }

  function applyToDragged(task: Task, changes: Partial<Task>, label: string) {
    const prev: Record<string, unknown> = {};
    for (const key of Object.keys(changes)) prev[key] = (task as unknown as Record<string, unknown>)[key];
    patch("tasks", task.id, changes);
    toast({
      title: label,
      description: task.title || "Untitled",
      action: { label: "Undo", run: () => patch("tasks", task.id, prev as Partial<Task>) },
    });
  }

  function onDragEnd(event: DragEndEvent) {
    setDragging(null);
    const { active, over } = event;
    if (!over) return;

    const activeId = String(active.id).replace(/^task:/, "");
    const task = allTasks.find((t) => t.id === activeId);
    if (!task) return;
    const overId = String(over.id);
    const today = todayISO();

    // 1. the floating tray — reschedule, complete, delete
    if (overId.startsWith("tray:")) {
      switch (overId.slice(5)) {
        case "today": applyToDragged(task, { date: today }, "Moved to today"); return;
        case "tomorrow": applyToDragged(task, { date: addDays(task.date ?? today, 1) }, "Pushed a day"); return;
        case "nextweek": applyToDragged(task, { date: addDays(today, 7) }, `Moved to ${friendlyDate(addDays(today, 7))}`); return;
        case "inbox": applyToDragged(task, { date: null }, "Moved to Inbox"); return;
        case "done":
          applyToDragged(task, { status: "done", completed_at: new Date().toISOString() }, "Completed");
          return;
        case "delete": {
          const victims = [task, ...subtasksOf(allTasks, task.id)];
          victims.forEach((v) => remove("tasks", v.id));
          toast({
            title: "Task deleted",
            description: task.title || "Untitled",
            tone: "danger",
            action: { label: "Undo", run: () => victims.forEach((v) => insert("tasks", v)) },
          });
          return;
        }
        default: return;
      }
    }

    // 2. another group — this is the cross-list drag: groups are the lists
    if (overId.startsWith("group:")) {
      const group = groups.find((g) => `group:${g.key}` === overId);
      if (!group?.apply) return;
      const changes = typeof group.apply === "function" ? group.apply(task) : group.apply;
      applyToDragged(task, changes, `Moved to ${group.label}`);
      return;
    }

    if (active.id === over.id) return;
    const overTaskId = overId.replace(/^task:/, "");

    // 3. dropped on a row that lives in another group — same intent as
    //    dropping on that group's header, so it should do the same thing
    if (groupBy !== "none") {
      const from = groups.find((g) => g.tasks.some((t) => t.id === activeId));
      const into = groups.find((g) => g.tasks.some((t) => t.id === overTaskId));
      if (into?.apply && into.key !== from?.key) {
        const changes = typeof into.apply === "function" ? into.apply(task) : into.apply;
        applyToDragged(task, changes, `Moved to ${into.label}`);
      }
      return;
    }

    // 4. reordering inside the list
    if (!reorderable) return;
    const oldIndex = visible.findIndex((t) => t.id === activeId);
    const newIndex = visible.findIndex((t) => t.id === overTaskId);
    if (oldIndex < 0 || newIndex < 0) return;
    const reordered = arrayMove(visible, oldIndex, newIndex);
    patch("tasks", activeId, {
      order_index: orderBetween(reordered[newIndex - 1]?.order_index, reordered[newIndex + 1]?.order_index),
    });
  }

  // ---- render -------------------------------------------------------------
  if (!tasks.length && !composer) {
    return <EmptyState title={emptyTitle} description={emptyDescription} className={className} />;
  }

  const chromeFor = (task: Task): RowChrome => ({
    selectable,
    selected: selected.has(task.id),
    selectionActive,
    onSelect: selectable ? onSelect : undefined,
    onInsertBelow: showInsert && sortBy === "manual" ? (t) => setInsertAfter(t.id) : undefined,
  });

  function renderGroup(group: Group) {
    const open = !collapsed.has(group.key);
    return (
      <div key={group.key}>
        {groupBy !== "none" && (
          <GroupHeader
            group={group}
            open={open}
            droppable={ownsDnd}
            onToggle={() =>
              setCollapsed((prev) => {
                const next = new Set(prev);
                if (next.has(group.key)) next.delete(group.key);
                else next.add(group.key);
                return next;
              })
            }
          />
        )}
        {open && group.tasks.map((task, i) => (
          <React.Fragment key={task.id}>
            {showInsert && sortBy === "manual" && i > 0 && (
              <InsertPoint
                before={group.tasks[i - 1].order_index}
                after={task.order_index}
                date={composerDate}
                defaults={composerDefaults}
              />
            )}
            {canSort ? (
              <SortableTaskRow task={task} showDate={showDate} chrome={chromeFor(task)} reorderable={reorderable} />
            ) : (
              <SelectionShell task={task} chrome={chromeFor(task)}>
                <TaskRow
                  task={task}
                  draggable={ownsDnd}
                  showDate={showDate}
                  selected={selected.has(task.id)}
                  selectionActive={selectionActive}
                  onSelectToggle={selectable ? (opts) => onSelect(task.id, opts) : undefined}
                  onInsertBelow={chromeFor(task).onInsertBelow}
                />
              </SelectionShell>
            )}
            {insertAfter === task.id && (
              <InlineComposer
                autoFocus
                date={composerDate}
                defaults={{
                  ...composerDefaults,
                  order_index: orderBetween(task.order_index, group.tasks[i + 1]?.order_index),
                }}
                onDone={() => setInsertAfter(null)}
                className="my-0.5"
              />
            )}
          </React.Fragment>
        ))}
      </div>
    );
  }

  const body = groups.map(renderGroup);

  // Every list gets a DndContext: even a time-ordered list that cannot be
  // reordered should let you drag a row onto a date.
  const rows = !ownsDnd ? body : (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setDragging(null)}
    >
      {canSort ? (
        <SortableContext items={flatOrder} strategy={verticalListSortingStrategy}>
          {body}
        </SortableContext>
      ) : body}
      <DragOverlay dropAnimation={null}>
        {dragging && (
          <div className="pointer-events-none w-[280px] max-w-[80vw] rounded-md border border-line bg-raised px-2 py-1.5 shadow-pop">
            <p className="truncate text-[13.5px] text-ink">{dragging.title || "Untitled"}</p>
          </div>
        )}
      </DragOverlay>
      {dragging && <DragTray title={dragging.title} />}
    </DndContext>
  );

  return (
    <div className={cn("group/list relative", className)}>
      {showControls && (
        <div className="mb-1.5 flex items-center justify-end">
          <Popover
            align="end"
            className="w-[224px]"
            trigger={
              <Button
                size="xs"
                variant="ghost"
                className={cn(viewLabel === "View" ? "text-ink-4" : "text-ink-2")}
              >
                <ListFilter className="size-3" />
                {viewLabel}
              </Button>
            }
          >
            {(close) => (
              <>
                <MenuLabel>Group by</MenuLabel>
                {(Object.keys(GROUP_LABELS) as TaskGroupBy[]).map((key) => (
                  <MenuItem
                    key={key}
                    icon={key === "none" ? undefined : Layers}
                    checked={groupBy === key}
                    onClick={() => setGroupBy(key)}
                  >
                    {GROUP_LABELS[key]}
                  </MenuItem>
                ))}
                <MenuSeparator />
                <MenuLabel>Sort</MenuLabel>
                {(Object.keys(SORT_LABELS) as TaskSortBy[]).map((key) => (
                  <MenuItem
                    key={key}
                    icon={key === "manual" ? undefined : ArrowUpDown}
                    checked={sortBy === key}
                    onClick={() => setSortBy(key)}
                  >
                    {SORT_LABELS[key]}
                  </MenuItem>
                ))}
                <MenuSeparator />
                <MenuItem icon={EyeOff} checked={hideDone} onClick={() => setHideDone((v) => !v)}>
                  Hide completed
                </MenuItem>
                {selectable && (
                  <MenuItem
                    icon={MousePointerClick}
                    shortcut={selectionActive ? "Esc" : undefined}
                    onClick={() => {
                      if (selectionActive) clearSelection();
                      else setSelected(new Set(flatOrder));
                      close();
                    }}
                  >
                    {selectionActive ? "Clear selection" : "Select all"}
                  </MenuItem>
                )}
              </>
            )}
          </Popover>
        </div>
      )}

      {rows}

      {visible.length > paged.length && (
        <Button
          size="xs"
          variant="ghost"
          className="mt-1 w-full justify-center text-ink-3"
          onClick={() => setLimit((n) => n + pageSize)}
        >
          Show {Math.min(pageSize, visible.length - paged.length)} more
          <span className="text-ink-4 tnum">of {visible.length - paged.length}</span>
        </Button>
      )}

      {!visible.length && (
        <p className="px-1.5 py-2 text-[13px] text-ink-4">
          {hideDone && tasks.length ? "Everything here is done." : emptyDescription ?? emptyTitle}
        </p>
      )}

      {composer && (
        <InlineComposer date={composerDate} defaults={composerDefaults} className="mt-0.5" />
      )}

      {selectionActive && <SelectionBar tasks={selectedTasks} onClear={clearSelection} />}
    </div>
  );
}

/**
 * Collapsible section wrapper used by Today, Inbox and Upcoming.
 *
 * `summary` is the folded state's one-line value ("5h 20m planned · 1 unscheduled")
 * and `persistKey` remembers whether the reader left it open. Both are optional,
 * so every existing caller keeps behaving exactly as it did.
 */
export function TaskSection({
  title, count, children, defaultOpen = true, accessory, tone, summary, persistKey,
}: {
  title: string;
  count?: number;
  children: React.ReactNode;
  defaultOpen?: boolean;
  accessory?: React.ReactNode;
  tone?: "danger" | "default";
  summary?: React.ReactNode;
  persistKey?: string;
}) {
  const { open, toggle } = useDisclosure(
    persistKey ? `humoyun.tasks.section.${persistKey}` : null,
    defaultOpen,
  );

  return (
    <section className="mb-8">
      <div className="mb-2 flex items-center gap-2">
        <button
          onClick={toggle}
          aria-expanded={open}
          className="group flex min-w-0 items-center gap-1.5 cursor-pointer py-0.5"
        >
          <ChevronRight
            className={cn(
              "size-3 shrink-0 text-ink-4 transition-transform duration-200 group-hover:text-ink-3",
              open && "rotate-90",
            )}
          />
          <h2 className={cn(
            "shrink-0 text-[11px] font-semibold uppercase tracking-[0.06em]",
            tone === "danger" ? "text-danger" : "text-ink-3",
          )}>
            {title}
          </h2>
          {count !== undefined && (
            <span className="shrink-0 text-[11px] text-ink-4 tnum">{count}</span>
          )}
          {!open && summary && (
            <span className="truncate text-[11.5px] text-ink-4">{summary}</span>
          )}
        </button>
        <div className="ml-auto">{accessory}</div>
      </div>
      {open && <div style={FOLD_ANIM}>{children}</div>}
    </section>
  );
}
