"use client";

import * as React from "react";
import { useDraggable } from "@dnd-kit/core";
import {
  Clock, Flag, GripVertical, MoreHorizontal, Play, Copy, Trash2, Calendar,
  ChevronRight, BookOpen, Repeat, Timer as TimerIcon, ArrowRight,
  Sun, Sunrise, X, AlignLeft, Ban, CircleDot, Inbox, CornerDownRight,
  Milestone, CalendarDays, Check, Pencil, Hash, ListTree, CheckSquare,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore, subtasksOf } from "@/lib/store";
import {
  addDays, diffDays, formatDuration, formatRange, formatTime, friendlyDate, parseTime, todayISO,
} from "@/lib/date";
import { PRIORITY_LABELS, type Profile, type Task } from "@/lib/types";
import { Checkbox, Badge, IconButton, Button } from "@/components/ui/primitives";
import { Popover, MenuItem, MenuSeparator, MenuLabel, TintPicker } from "@/components/ui/overlays";
import { Field } from "@/components/ui/form";
import { MiniCalendar } from "@/components/ui/mini-calendar";

// =========================================================
// Drag payload — the one shape every surface agrees on.
// Calendar and agenda already emit exactly this, so a row dragged
// out of a list can land on any day cell that is already listening.
// =========================================================
export const TASK_DRAG_TYPE = "task" as const;

export function taskDragId(taskId: string) {
  return `task:${taskId}`;
}

export function taskDragData(task: Task) {
  return { type: TASK_DRAG_TYPE, taskId: task.id, task } as const;
}

// =========================================================
// Dependencies live in `profile.prefs`, not in a task column.
//
// There is no `links` column on tasks, and both alternatives the brief
// floated — smuggling ids into `checklist` or into `tags` — corrupt a
// column that means something else. `Profile.prefs` is already typed
// `Record<string, unknown>` and already carries UI state (`hour12`), so
// it is the one place designed to hold this.
//
// Shape: { [blockedTaskId]: string[] /* ids that must finish first */ }
// =========================================================
export type TaskLinks = Record<string, string[]>;

export function readTaskLinks(prefs: Profile["prefs"] | undefined): TaskLinks {
  const raw = (prefs as Record<string, unknown> | undefined)?.taskLinks;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: TaskLinks = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (Array.isArray(value)) {
      const ids = value.filter((v): v is string => typeof v === "string");
      if (ids.length) out[key] = ids;
    }
  }
  return out;
}

export function useTaskLinks(): TaskLinks {
  const prefs = useStore((s) => s.profile?.prefs);
  return React.useMemo(() => readTaskLinks(prefs), [prefs]);
}

/** Mutate the link map transactionally so a stale render can never drop a key. */
export function useUpdateTaskLinks() {
  const updateProfile = useStore((s) => s.updateProfile);
  return React.useCallback(
    (mutate: (links: TaskLinks) => TaskLinks) => {
      const profile = useStore.getState().profile;
      if (!profile) return;
      const next = mutate(readTaskLinks(profile.prefs));
      const clean: TaskLinks = {};
      for (const [key, ids] of Object.entries(next)) {
        const unique = [...new Set(ids)];
        if (unique.length) clean[key] = unique;
      }
      updateProfile({ prefs: { ...profile.prefs, taskLinks: clean } });
    },
    [updateProfile],
  );
}

export function blockersOf(links: TaskLinks, taskId: string): string[] {
  return links[taskId] ?? [];
}

export function blockedByThis(links: TaskLinks, taskId: string): string[] {
  return Object.keys(links).filter((id) => links[id].includes(taskId));
}

// =========================================================
// Shared bits
// =========================================================
const PRIORITY_CLASS = ["", "text-ink-3", "text-warn", "text-danger"];

/** Chip padding is negative-margined so a 28px hit box costs the row no height. */
const CHIP =
  "inline-flex max-w-full items-center gap-1 rounded-md px-1.5 py-2 -my-2 " +
  "text-[11.5px] leading-none cursor-pointer transition-colors duration-120 " +
  "hover:bg-active text-ink-3";

const CHIP_STATIC =
  "inline-flex max-w-full items-center gap-1 px-1.5 py-2 -my-2 text-[11.5px] leading-none text-ink-3";

/**
 * The calm pass: a row states at most three facts about itself. Everything else
 * keeps working — it just lives one click away, under the "…" at the end of the
 * meta line, rendered by exactly the same controls.
 */
const META_VISIBLE = 3;

interface MetaChip {
  key: string;
  /** plain-text name of the fact, used for the overflow button's label */
  label: string;
  node: React.ReactNode;
  /** used inside the overflow popover, where there is room to show everything */
  expandedNode?: React.ReactNode;
}

const TIME_PRESETS: { label: string; min: number }[] = [
  { label: "7:00", min: 420 },
  { label: "9:00", min: 540 },
  { label: "12:00", min: 720 },
  { label: "14:00", min: 840 },
  { label: "18:00", min: 1080 },
  { label: "20:00", min: 1200 },
];

const DURATION_PRESETS = [15, 30, 45, 60, 90, 120];

export function timeOfDayOf(task: Task): "morning" | "afternoon" | "evening" | "anytime" {
  if (task.start_min == null) return "anytime";
  if (task.start_min < 12 * 60) return "morning";
  if (task.start_min < 17 * 60) return "afternoon";
  return "evening";
}

/** Day counts so every date picker in the app shows how loaded a day already is. */
export function useDayLoad(): Map<string, number> {
  const tasks = useStore((s) => s.tasks);
  return React.useMemo(() => {
    const map = new Map<string, number>();
    for (const t of tasks) {
      if (!t.date || t.parent_id || t.status === "done" || t.status === "dropped") continue;
      map.set(t.date, (map.get(t.date) ?? 0) + 1);
    }
    return map;
  }, [tasks]);
}

// =========================================================
// Date picker body — reused by the row chip, the row menu and the
// selection bar in task-list.
// =========================================================
export function TaskDatePicker({
  value, onPick, onClear, clearLabel = "Inbox",
}: {
  value: string | null;
  onPick: (iso: string) => void;
  onClear?: () => void;
  clearLabel?: string;
}) {
  const weekStart = useStore((s) => s.profile?.week_start ?? 1);
  const load = useDayLoad();
  const today = todayISO();

  return (
    <div className="p-1">
      <div className="mb-1 grid grid-cols-2 gap-1">
        <Button size="xs" variant="ghost" className="justify-start" onClick={() => onPick(today)}>
          <Sun className="size-3" /> Today
        </Button>
        <Button size="xs" variant="ghost" className="justify-start" onClick={() => onPick(addDays(today, 1))}>
          <Sunrise className="size-3" /> Tomorrow
        </Button>
        <Button size="xs" variant="ghost" className="justify-start" onClick={() => onPick(addDays(today, 7))}>
          <CalendarDays className="size-3" /> Next week
        </Button>
        {onClear && (
          <Button size="xs" variant="ghost" className="justify-start" onClick={onClear}>
            <Inbox className="size-3" /> {clearLabel}
          </Button>
        )}
      </div>
      <MiniCalendar
        value={value ?? today}
        weekStart={weekStart}
        markers={load}
        onChange={onPick}
      />
    </div>
  );
}

// =========================================================
// Time editor body
// =========================================================
function TimeEditor({ task, onDone }: { task: Task; onDone: () => void }) {
  const patch = useStore((s) => s.patch);
  const hour12 = useStore((s) => s.hour12);
  const [start, setStart] = React.useState(task.start_min != null ? formatTime(task.start_min, false) : "");
  const [end, setEnd] = React.useState(task.end_min != null ? formatTime(task.end_min, false) : "");

  function commit(nextStart = start, nextEnd = end) {
    const s = parseTime(nextStart);
    const e = parseTime(nextEnd);
    patch("tasks", task.id, {
      start_min: s,
      end_min: s == null ? null : e != null && e > s ? e : null,
      all_day: s == null,
      duration_min: s != null && e != null && e > s ? e - s : task.duration_min,
    });
  }

  function setSpan(startMin: number, minutes?: number) {
    const span = minutes ?? (task.end_min != null && task.start_min != null
      ? task.end_min - task.start_min
      : task.duration_min ?? 60);
    const endMin = Math.min(1439, startMin + span);
    setStart(formatTime(startMin, false));
    setEnd(formatTime(endMin, false));
    patch("tasks", task.id, {
      start_min: startMin,
      end_min: endMin,
      all_day: false,
      duration_min: span,
    });
  }

  const inputCls =
    "h-7 w-full rounded-md border border-line bg-transparent px-2 text-center text-[13px] text-ink tnum " +
    "transition-[border-color,box-shadow] duration-150 hover:border-line-strong " +
    "focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-soft";

  return (
    <div className="p-1.5">
      <div className="flex items-end gap-1.5">
        <Field label="Start" className="w-[76px]">
          {(wiring) => (
            <input
              {...wiring}
              value={start}
              autoFocus
              placeholder="—"
              onChange={(e) => setStart(e.target.value)}
              onBlur={() => commit()}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(); onDone(); } }}
              className={inputCls}
            />
          )}
        </Field>
        <span aria-hidden className="pb-2 text-ink-4">–</span>
        <Field label="End" className="w-[76px]">
          {(wiring) => (
            <input
              {...wiring}
              value={end}
              placeholder="—"
              onChange={(e) => setEnd(e.target.value)}
              onBlur={() => commit()}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(); onDone(); } }}
              className={inputCls}
            />
          )}
        </Field>
      </div>

      <MenuLabel>Start at</MenuLabel>
      <div className="grid grid-cols-3 gap-1">
        {TIME_PRESETS.map((p) => (
          <Button
            key={p.min}
            size="xs"
            variant={task.start_min === p.min ? "subtle" : "ghost"}
            className="tnum"
            onClick={() => setSpan(p.min)}
          >
            {formatTime(p.min, hour12)}
          </Button>
        ))}
      </div>

      <MenuLabel>Lasts</MenuLabel>
      <div className="grid grid-cols-3 gap-1">
        {DURATION_PRESETS.map((m) => (
          <Button
            key={m}
            size="xs"
            variant={
              task.start_min != null && task.end_min != null && task.end_min - task.start_min === m
                ? "subtle"
                : "ghost"
            }
            className="tnum"
            onClick={() => setSpan(task.start_min ?? 540, m)}
          >
            {formatDuration(m)}
          </Button>
        ))}
      </div>

      <MenuSeparator />
      <MenuItem
        icon={X}
        onClick={() => {
          patch("tasks", task.id, { start_min: null, end_min: null, all_day: true });
          onDone();
        }}
      >
        Clear time
      </MenuItem>
    </div>
  );
}

// =========================================================
// Hover quick-bar — one tab stop, arrow keys inside (toolbar pattern)
// =========================================================
function QuickBar({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const active = React.useRef(0);

  const buttons = () =>
    Array.from(ref.current?.querySelectorAll<HTMLButtonElement>("button") ?? []);

  /**
   * A toolbar is one tab stop, not seven. React never sets tabIndex on these
   * buttons, so writing it straight to the DOM cannot fight reconciliation —
   * and it survives the conditionally-rendered actions.
   */
  React.useEffect(() => {
    const list = buttons();
    if (!list.length) return;
    if (active.current >= list.length) active.current = 0;
    list.forEach((b, i) => { b.tabIndex = i === active.current ? 0 : -1; });
  });

  function move(delta: number) {
    const list = buttons();
    if (!list.length) return;
    const current = list.findIndex((b) => b === document.activeElement);
    const next = ((current < 0 ? 0 : current) + delta + list.length) % list.length;
    active.current = next;
    list.forEach((b, i) => { b.tabIndex = i === next ? 0 : -1; });
    list[next].focus();
  }

  return (
    <div
      ref={ref}
      role="toolbar"
      aria-label="Task actions"
      onFocus={(e) => {
        const target = e.target as HTMLElement;
        const i = buttons().findIndex((b) => b === target);
        if (i >= 0) active.current = i;
      }}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") { e.preventDefault(); e.stopPropagation(); move(1); }
        if (e.key === "ArrowLeft") { e.preventDefault(); e.stopPropagation(); move(-1); }
        if (e.key === "Home") { e.preventDefault(); e.stopPropagation(); move(-active.current); }
      }}
      className={cn(
        "absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-0.5 rounded-lg",
        "material border border-line px-0.5 shadow-sm",
        "pointer-events-none opacity-0 transition-opacity duration-150 ease-[var(--ease-out-apple)]",
        "group-hover/task:pointer-events-auto group-hover/task:opacity-100",
        "focus-within:pointer-events-auto focus-within:opacity-100",
        className,
      )}
    >
      {children}
    </div>
  );
}

// =========================================================
// TaskRow
// =========================================================
export interface TaskRowProps {
  task: Task;
  /** show the date chip — useful in Inbox / Upcoming, noise inside a single day */
  showDate?: boolean;
  showSubtasks?: boolean;
  dragHandle?: React.ReactNode;
  compact?: boolean;
  className?: string;
  onOpen?: (task: Task) => void;

  // ---- additions (all optional; the row behaves exactly as before without them)
  /**
   * Register the row with the nearest DndContext as a draggable carrying
   * `{ type: 'task', taskId }`, so any surface — a day cell, another list, a
   * calendar grid — can accept the drop. Ignored when `dragHandle` is supplied.
   */
  draggable?: boolean;
  /** hover action bar. "auto" = full on normal rows, minimal on compact ones. */
  quickBar?: "auto" | "full" | "minimal" | "none";
  /** row-scoped shortcuts while focus sits inside the row. Default on. */
  hotkeys?: boolean;
  /** multi-select chrome, driven by TaskList */
  selected?: boolean;
  selectionActive?: boolean;
  onSelectToggle?: (opts: { shift: boolean; mod: boolean }) => void;
  /** "add a task under this one" — the keyboard twin of the between-rows affordance */
  onInsertBelow?: (task: Task) => void;
}

export function TaskRow(props: TaskRowProps) {
  // A conditional hook is illegal, a conditional component is not.
  if (props.draggable && !props.dragHandle) return <DraggableTaskRow {...props} />;
  return <TaskRowBase {...props} />;
}

function DraggableTaskRow(props: TaskRowProps) {
  const { task } = props;
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: taskDragId(task.id),
    data: taskDragData(task),
  });

  return (
    <div
      ref={setNodeRef}
      className={cn("transition-opacity duration-150", isDragging && "opacity-30")}
    >
      <TaskRowBase
        {...props}
        dragHandle={
          <button
            {...attributes}
            {...listeners}
            aria-label={`Drag ${task.title || "task"} to another day or list`}
            className="flex h-7 w-4 cursor-grab items-center justify-center rounded text-ink-4 transition-colors hover:text-ink-2 active:cursor-grabbing"
          >
            <GripVertical className="size-3.5" />
          </button>
        }
      />
    </div>
  );
}

function TaskRowBase({
  task, showDate, showSubtasks = true, dragHandle, compact, className, onOpen,
  quickBar = "auto", hotkeys = true, selected, selectionActive, onSelectToggle, onInsertBelow,
}: TaskRowProps) {
  const tasks = useStore((s) => s.tasks);
  const books = useStore((s) => s.books);
  const hour12 = useStore((s) => s.hour12);
  const toggleTask = useStore((s) => s.toggleTask);
  const patch = useStore((s) => s.patch);
  const remove = useStore((s) => s.remove);
  const insert = useStore((s) => s.insert);
  const duplicateTask = useStore((s) => s.duplicateTask);
  const openInspector = useStore((s) => s.openInspector);
  const startTimer = useStore((s) => s.startTimer);
  const timer = useStore((s) => s.timer);
  const toast = useStore((s) => s.toast);
  const links = useTaskLinks();

  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(task.title);
  const [expanded, setExpanded] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const titleRef = React.useRef<HTMLButtonElement>(null);
  const returnFocus = React.useRef(false);

  const subtasks = showSubtasks ? subtasksOf(tasks, task.id) : [];
  const doneSubs = subtasks.filter((s) => s.status === "done").length;
  const checklistDone = task.checklist.filter((c) => c.done).length;
  const done = task.status === "done";
  const doing = task.status === "doing";
  const dropped = task.status === "dropped";
  const running = timer.taskId === task.id && timer.running;
  const book = task.book_id ? books.find((b) => b.id === task.book_id) : null;
  const today = todayISO();
  const overdue = !done && !!task.date && task.date < today;
  const lateBy = overdue && task.date ? Math.max(0, diffDays(today, task.date)) : 0;

  const blockerIds = blockersOf(links, task.id);
  const openBlockers = blockerIds
    .map((id) => tasks.find((t) => t.id === id))
    .filter((t): t is Task => !!t && t.status !== "done" && t.status !== "dropped");
  const blocked = !done && openBlockers.length > 0;

  React.useEffect(() => { setDraft(task.title); }, [task.title]);

  React.useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    } else if (returnFocus.current) {
      returnFocus.current = false;
      titleRef.current?.focus();
    }
  }, [editing]);

  // Focus only goes back to the title when the user left the field with a key —
  // clicking away means they wanted to be somewhere else.
  function commit() {
    setEditing(false);
    const next = draft.trim();
    if (next && next !== task.title) patch("tasks", task.id, { title: next });
    else setDraft(task.title);
  }

  function open() {
    if (onOpen) onOpen(task);
    else openInspector(task.id);
  }

  function moveTo(date: string | null) {
    const previous = task.date;
    patch("tasks", task.id, { date });
    subtasksOf(tasks, task.id).forEach((s) => patch("tasks", s.id, { date }));
    toast({
      title: date ? `Moved to ${friendlyDate(date)}` : "Moved to Inbox",
      description: task.title || "Untitled",
      action: {
        label: "Undo",
        run: () => {
          patch("tasks", task.id, { date: previous });
          subtasksOf(useStore.getState().tasks, task.id).forEach((s) => patch("tasks", s.id, { date: previous }));
        },
      },
    });
  }

  function duplicate() {
    const copy = duplicateTask(task.id);
    if (!copy) return;
    subtasksOf(tasks, task.id).forEach((s) => {
      const { id: _id, created_at: _c, updated_at: _u, ...rest } = s;
      void _id; void _c; void _u;
      insert("tasks", { ...rest, parent_id: copy.id, status: "todo", completed_at: null, actual_min: 0 });
    });
    toast({
      title: "Duplicated",
      description: copy.title || "Untitled",
      action: { label: "Undo", run: () => remove("tasks", copy.id) },
    });
  }

  function deleteWithUndo() {
    const victims = [task, ...subtasksOf(tasks, task.id)];
    victims.forEach((v) => remove("tasks", v.id));
    toast({
      title: victims.length > 1 ? `Deleted ${victims.length} tasks` : "Task deleted",
      description: task.title || "Untitled",
      action: { label: "Undo", run: () => victims.forEach((v) => insert("tasks", v)) },
    });
  }

  function setStatus(status: Task["status"]) {
    patch("tasks", task.id, {
      status,
      completed_at: status === "done" ? new Date().toISOString() : null,
    });
  }

  // ---- row-scoped keyboard -------------------------------------------------
  function onKeyDown(e: React.KeyboardEvent) {
    if (!hotkeys || editing) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const target = e.target as HTMLElement;
    if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;

    const handled = () => { e.preventDefault(); e.stopPropagation(); };

    switch (e.key) {
      case " ":
        // Space belongs to whatever button has focus — except the title, whose
        // own activation (open details) already has Enter and a click.
        if (target !== titleRef.current && (target.tagName === "BUTTON" || target.tagName === "A")) return;
        handled(); toggleTask(task.id); break;
      case "Enter":
        if (target.tagName === "BUTTON" || target.tagName === "A") return;
        handled(); open(); break;
      case "e": case "E":
        handled(); setEditing(true); break;
      case "d": case "D":
        handled(); duplicate(); break;
      case "Backspace": case "Delete":
        handled(); deleteWithUndo(); break;
      case "0": case "1": case "2": case "3":
        handled(); patch("tasks", task.id, { priority: Number(e.key) }); break;
      case "t": case "T":
        handled(); moveTo(today); break;
      case "y": case "Y":
        handled(); moveTo(addDays(task.date ?? today, 1)); break;
      case "i": case "I":
        handled(); moveTo(null); break;
      case "o": case "O":
        if (!onInsertBelow) return;
        handled(); onInsertBelow(task); break;
      case "x": case "X":
        if (!onSelectToggle) return;
        handled(); onSelectToggle({ shift: false, mod: true }); break;
      default:
        break;
    }
  }

  const showQuickBar = quickBar !== "none" && !selectionActive;

  function removeTag(tag: string) {
    const previous = task.tags;
    patch("tasks", task.id, { tags: task.tags.filter((t) => t !== tag) });
    toast({
      title: `Removed #${tag}`,
      action: { label: "Undo", run: () => patch("tasks", task.id, { tags: previous }) },
    });
  }

  const tagChip = (tag: string) => (
    <button
      key={tag}
      onClick={() => removeTag(tag)}
      aria-label={`Remove tag ${tag}`}
      className="group/tag -my-2 flex h-7 max-w-[150px] items-center px-1 cursor-pointer"
    >
      <Badge tint="slate" className="group-hover/tag:brightness-95 dark:group-hover/tag:brightness-110">
        <Hash className="size-2.5 shrink-0 opacity-60" />
        {tag}
        <X className="size-2.5 shrink-0 opacity-0 transition-opacity duration-120 group-hover/tag:opacity-100" />
      </Badge>
    </button>
  );

  // ---- meta line ----------------------------------------------------------
  // Built in order of relevance. The first three are shown; the rest keep every
  // control they had, one click away under the "…".
  const metas: MetaChip[] = [];
  const dateISO = task.date;

  if (blocked) {
    metas.push({
      key: "blocked",
      label: `blocked by ${openBlockers.length === 1 ? openBlockers[0].title || "Untitled" : `${openBlockers.length} tasks`}`,
      node: (
        <button
          onClick={() => openInspector(openBlockers[0].id)}
          className={cn(CHIP, "text-ink-2")}
          aria-label={`Blocked by ${openBlockers.map((b) => b.title || "Untitled").join(", ")} — open the blocker`}
        >
          <Ban className="size-3 shrink-0" />
          <span className="truncate">
            Blocked by {openBlockers.length > 1 ? `${openBlockers.length} tasks` : openBlockers[0].title || "Untitled"}
          </span>
        </button>
      ),
    });
  }

  if (showDate && dateISO) {
    metas.push({
      key: "date",
      label: friendlyDate(dateISO) + (lateBy > 1 ? ` · ${lateBy}d late` : ""),
      node: (
        <Popover
          className="w-[256px]"
          trigger={
            <button
              className={cn(CHIP, overdue && "text-ink-2")}
              aria-label={`Reschedule — currently ${friendlyDate(dateISO)}${lateBy > 1 ? `, ${lateBy} days late` : ""}`}
            >
              <Calendar className="size-3 shrink-0" />
              <span className="truncate">{friendlyDate(dateISO)}</span>
              {lateBy > 1 && <span className="tnum">· {lateBy}d late</span>}
            </button>
          }
        >
          {(close) => (
            <TaskDatePicker
              value={dateISO}
              onPick={(iso) => { moveTo(iso); close(); }}
              onClear={() => { moveTo(null); close(); }}
            />
          )}
        </Popover>
      ),
    });
  } else if (showDate) {
    metas.push({
      key: "inbox",
      label: "Inbox",
      node: (
        <Popover
          className="w-[256px]"
          trigger={
            <button className={cn(CHIP, "text-ink-4")} aria-label="Schedule this task">
              <Calendar className="size-3 shrink-0" /> Inbox
            </button>
          }
        >
          {(close) => <TaskDatePicker value={null} onPick={(iso) => { moveTo(iso); close(); }} />}
        </Popover>
      ),
    });
  }

  if (task.start_min != null) {
    metas.push({
      key: "time",
      label: formatRange(task.start_min, task.end_min, hour12),
      node: (
        <Popover
          className="w-[236px]"
          trigger={
            <button
              className={cn(CHIP, "tnum")}
              aria-label={`Edit time — currently ${formatRange(task.start_min, task.end_min, hour12)}`}
            >
              <Clock className="size-3 shrink-0" />
              {formatRange(task.start_min, task.end_min, hour12)}
            </button>
          }
        >
          {(close) => <TimeEditor task={task} onDone={close} />}
        </Popover>
      ),
    });
  } else if (task.duration_min != null) {
    metas.push({
      key: "estimate",
      label: `${formatDuration(task.duration_min)} estimated`,
      node: (
        <Popover
          className="w-[236px]"
          trigger={
            <button
              className={cn(CHIP, "tnum")}
              aria-label={`Give this a start time — estimated ${formatDuration(task.duration_min)}`}
            >
              <TimerIcon className="size-3 shrink-0" />
              {formatDuration(task.duration_min)}
            </button>
          }
        >
          {(close) => <TimeEditor task={task} onDone={close} />}
        </Popover>
      ),
    });
  }

  if (subtasks.length > 0) {
    metas.push({
      key: "subtasks",
      label: `${doneSubs}/${subtasks.length} subtasks`,
      node: (
        <button
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className={cn(CHIP, "tnum")}
          aria-label={`${doneSubs} of ${subtasks.length} subtasks done — ${expanded ? "collapse" : "expand"}`}
        >
          <ListTree className="size-3 shrink-0" />
          {doneSubs}/{subtasks.length}
        </button>
      ),
    });
  }

  if (task.checklist.length > 0) {
    metas.push({
      key: "checklist",
      label: `${checklistDone}/${task.checklist.length} checklist`,
      node: (
        <button
          onClick={open}
          className={cn(CHIP, "tnum")}
          aria-label={`Checklist ${checklistDone} of ${task.checklist.length} — open task`}
        >
          <CheckSquare className="size-3 shrink-0" />
          {checklistDone}/{task.checklist.length}
        </button>
      ),
    });
  }

  if (task.actual_min > 0) {
    metas.push({
      key: "spent",
      label: `${formatDuration(task.actual_min)} spent`,
      node: (
        <span className={cn(CHIP_STATIC, "tnum")} title="Time logged against this task">
          <TimerIcon className="size-3 shrink-0" />
          {formatDuration(task.actual_min)} spent
          {task.duration_min ? (
            <span className="text-ink-4"> / {formatDuration(task.duration_min)}</span>
          ) : null}
        </span>
      ),
    });
  }

  if (book) {
    metas.push({
      key: "book",
      label: book.title,
      node: (
        <span className={cn(CHIP_STATIC, "min-w-0")}>
          <BookOpen className="size-3 shrink-0" />
          <span className="truncate">{book.title}</span>
        </span>
      ),
    });
  }

  if (task.tags.length > 0) {
    const [firstTag, ...restTags] = task.tags;
    metas.push({
      key: "tags",
      label: task.tags.map((t) => `#${t}`).join(", "),
      node: (
        <span className="inline-flex items-center gap-0.5">
          {tagChip(firstTag)}
          {restTags.length > 0 && (
            <Popover
              className="w-[210px]"
              trigger={
                <button
                  className={cn(CHIP, "tnum text-ink-4")}
                  aria-label={`${restTags.length} more tags: ${restTags.map((t) => `#${t}`).join(", ")}`}
                >
                  +{restTags.length}
                </button>
              }
            >
              <div className="flex flex-wrap items-center gap-1 p-1">{restTags.map(tagChip)}</div>
            </Popover>
          )}
        </span>
      ),
      expandedNode: (
        <span className="inline-flex flex-wrap items-center gap-0.5">{task.tags.map(tagChip)}</span>
      ),
    });
  }

  if (dropped) {
    metas.push({
      key: "dropped",
      label: "dropped",
      node: (
        <span className={cn(CHIP_STATIC, "text-ink-4")}>
          <CircleDot className="size-3 shrink-0" /> Dropped
        </span>
      ),
    });
  }

  if (task.notes) {
    metas.push({
      key: "notes",
      label: "has notes",
      node: (
        <span className={cn(CHIP_STATIC, "text-ink-4")} title="Has notes">
          <AlignLeft className="size-3 shrink-0" /> Notes
        </span>
      ),
    });
  }

  const metaShown = metas.slice(0, META_VISIBLE);
  const metaRest = metas.slice(META_VISIBLE);

  return (
    <div
      className={cn("group/task", className)}
      data-task-row={task.id}
      onKeyDown={onKeyDown}
    >
      <div
        className={cn(
          "relative flex items-start gap-2 rounded-md px-1.5 transition-colors duration-120",
          compact ? "py-1" : "py-1.5",
          selected ? "bg-selected" : "hover:bg-hover",
        )}
      >
        {/* gutter: drag handle on hover, or the selection tick while selecting */}
        <div
          className={cn(
            "absolute -left-4 top-1/2 -translate-y-1/2 transition-opacity duration-150",
            selectionActive ? "opacity-100" : "opacity-0 group-hover/task:opacity-100 focus-within:opacity-100",
          )}
        >
          {selectionActive && onSelectToggle ? (
            <Checkbox
              size="sm"
              checked={!!selected}
              onChange={() => onSelectToggle({ shift: false, mod: true })}
              label={`${selected ? "Deselect" : "Select"} ${task.title || "Untitled"}`}
            />
          ) : (
            dragHandle ?? <GripVertical className="size-3.5 cursor-grab text-ink-4" />
          )}
        </div>

        <div className="flex h-5 shrink-0 items-center">
          <Checkbox
            checked={done}
            indeterminate={doing}
            tint={task.color}
            onChange={() => toggleTask(task.id)}
            size={compact ? "sm" : "md"}
            label={done ? `Mark ${task.title} as not done` : `Mark ${task.title} as done`}
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-baseline gap-1.5">
            {subtasks.length > 0 && (
              <button
                onClick={() => setExpanded((v) => !v)}
                aria-label={expanded ? "Collapse subtasks" : "Expand subtasks"}
                aria-expanded={expanded}
                className="-ml-1 flex h-5 w-4 shrink-0 items-center justify-center rounded text-ink-4 hover:bg-active hover:text-ink-2 cursor-pointer transition-colors"
              >
                <ChevronRight className={cn("size-3 transition-transform duration-200", expanded && "rotate-90")} />
              </button>
            )}

            {editing ? (
              <input
                ref={inputRef}
                value={draft}
                aria-label="Task title"
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    returnFocus.current = true;
                    commit();
                  }
                  if (e.key === "Escape") {
                    e.preventDefault();
                    e.stopPropagation();
                    setDraft(task.title);
                    returnFocus.current = true;
                    setEditing(false);
                  }
                }}
                className="min-w-0 flex-1 rounded-sm bg-transparent text-[13.5px] text-ink outline-none"
              />
            ) : (
              <button
                ref={titleRef}
                onClick={open}
                onDoubleClick={(e) => { e.stopPropagation(); setEditing(true); }}
                className={cn(
                  "min-w-0 flex-1 truncate text-left text-[13.5px] leading-[1.45] cursor-pointer transition-colors",
                  done || dropped ? "text-ink-4 line-through decoration-ink-4/60" : "text-ink",
                  blocked && !done && "text-ink-2",
                )}
              >
                {task.title || <span className="text-ink-4">Untitled</span>}
              </button>
            )}

            {task.priority > 0 && !done && (
              <Flag
                className={cn("size-3 shrink-0", PRIORITY_CLASS[task.priority])}
                fill="currentColor"
                aria-label={`${PRIORITY_LABELS[task.priority]} priority`}
              />
            )}
            {task.recurrence && <Repeat className="size-3 shrink-0 text-ink-4" aria-label="Repeats" />}
            {task.kind === "milestone" && <Milestone className="size-3 shrink-0 text-ink-4" aria-label="Milestone" />}
          </div>

          {/* meta line — three facts, the rest one click away */}
          {metas.length > 0 && (
            <div className="mt-1 -ml-1.5 flex flex-wrap items-center gap-x-0.5 gap-y-1.5">
              {metaShown.map((m) => (
                <React.Fragment key={m.key}>{m.node}</React.Fragment>
              ))}

              {metaRest.length > 0 && (
                <Popover
                  className="w-[232px]"
                  trigger={
                    <button
                      className={cn(CHIP, "text-ink-4")}
                      aria-label={`${metaRest.length} more details — ${metaRest.map((m) => m.label).join(", ")}`}
                    >
                      <MoreHorizontal className="size-3 shrink-0" />
                    </button>
                  }
                >
                  <div className="flex flex-col items-start gap-0.5 p-1">
                    {metaRest.map((m) => (
                      <div key={m.key} className="flex min-h-7 max-w-full items-center px-0.5">
                        {m.expandedNode ?? m.node}
                      </div>
                    ))}
                  </div>
                </Popover>
              )}
            </div>
          )}
        </div>

        {/* Hover actions: two direct ones. Everything the bar used to carry —
            today, tomorrow, priority, duplicate, delete — is in the menu. */}
        {showQuickBar && (
          <QuickBar>
            <IconButton
              label={running ? "Timer running" : "Start focus timer"}
              size="md"
              active={running}
              onClick={() => {
                startTimer({ taskId: task.id, label: task.title, mode: "pomodoro" });
                toast({ title: "Focus started", description: task.title });
              }}
            >
              <Play />
            </IconButton>

            <Popover
              align="end"
              className="w-[228px]"
              trigger={<IconButton label="Task options" size="md"><MoreHorizontal /></IconButton>}
            >
              {(close) => (
                <>
                  <MenuItem icon={Pencil} shortcut="E" onClick={() => { setEditing(true); close(); }}>
                    Rename
                  </MenuItem>
                  <MenuItem icon={ArrowRight} shortcut="↵" onClick={() => { open(); close(); }}>
                    Open details
                  </MenuItem>
                  {onInsertBelow && (
                    <MenuItem icon={CornerDownRight} shortcut="O" onClick={() => { onInsertBelow(task); close(); }}>
                      Add task below
                    </MenuItem>
                  )}
                  <MenuSeparator />

                  <MenuLabel>Schedule</MenuLabel>
                  <MenuItem icon={Sun} shortcut="T" onClick={() => { moveTo(today); close(); }}>
                    Today
                  </MenuItem>
                  <MenuItem icon={Sunrise} shortcut="Y" onClick={() => { moveTo(addDays(task.date ?? today, 1)); close(); }}>
                    Tomorrow
                  </MenuItem>
                  <MenuItem icon={CalendarDays} onClick={() => { moveTo(addDays(today, 7)); close(); }}>
                    Next week
                  </MenuItem>
                  <MenuItem icon={Inbox} shortcut="I" onClick={() => { moveTo(null); close(); }}>
                    Move to Inbox
                  </MenuItem>
                  <div className="px-1 pb-1">
                    <TaskDatePicker value={task.date} onPick={(iso) => { moveTo(iso); close(); }} />
                  </div>

                  <MenuSeparator />
                  <MenuLabel>Priority</MenuLabel>
                  <div className="grid grid-cols-4 gap-1 px-1 pb-1">
                    {PRIORITY_LABELS.map((label, i) => (
                      <Button
                        key={label}
                        size="xs"
                        variant={task.priority === i ? "subtle" : "ghost"}
                        className={cn("justify-center", task.priority === i && PRIORITY_CLASS[i])}
                        onClick={() => patch("tasks", task.id, { priority: i })}
                      >
                        {label === "None" ? "—" : label[0]}
                      </Button>
                    ))}
                  </div>

                  <MenuSeparator />
                  <MenuLabel>Status</MenuLabel>
                  <MenuItem icon={Check} checked={done} onClick={() => { setStatus(done ? "todo" : "done"); close(); }}>
                    {done ? "Mark not done" : "Mark done"}
                  </MenuItem>
                  <MenuItem icon={CircleDot} checked={doing} onClick={() => { setStatus(doing ? "todo" : "doing"); close(); }}>
                    In progress
                  </MenuItem>
                  <MenuItem icon={Ban} checked={dropped} onClick={() => { setStatus(dropped ? "todo" : "dropped"); close(); }}>
                    {dropped ? "Un-drop" : "Drop"}
                  </MenuItem>

                  <MenuSeparator />
                  <MenuLabel>Colour</MenuLabel>
                  <TintPicker
                    value={task.color}
                    allowNone
                    onChange={(t) => patch("tasks", task.id, { color: t })}
                  />

                  <MenuSeparator />
                  <MenuItem icon={Copy} shortcut="D" onClick={() => { duplicate(); close(); }}>
                    Duplicate
                  </MenuItem>
                  <MenuItem icon={Trash2} danger shortcut="⌫" onClick={() => { deleteWithUndo(); close(); }}>
                    Delete
                  </MenuItem>
                </>
              )}
            </Popover>
          </QuickBar>
        )}
      </div>

      {expanded && subtasks.length > 0 && (
        <div className="ml-[26px] border-l border-line pl-2">
          {subtasks.map((sub) => (
            <TaskRow key={sub.id} task={sub} compact showSubtasks={false} quickBar="minimal" />
          ))}
        </div>
      )}
    </div>
  );
}
