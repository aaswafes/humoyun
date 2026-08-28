"use client";

import * as React from "react";
import {
  X, Calendar, Clock, Flag, Hash, Palette, Trash2, Play, Plus, Repeat,
  Target, ListTree, Timer as TimerIcon, CheckSquare, Inbox, Shapes,
  History, Copy, LayoutTemplate, MoreHorizontal, Ban, Link2, ChevronUp,
  ChevronDown, CornerDownRight, Sparkles, Milestone, CalendarClock, Check,
  CircleDot, Search,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore, subtasksOf, orderBetween, uid } from "@/lib/store";
import {
  formatClock, formatDuration, formatTime, friendlyDate, parseTime, todayISO, toISO,
} from "@/lib/date";
import { PRIORITY_LABELS, type ChecklistItem, type Recurrence, type Task, type Tint } from "@/lib/types";
import {
  Sheet, Popover, MenuItem, MenuSeparator, MenuLabel, TintPicker, ConfirmDialog,
} from "@/components/ui/overlays";
import {
  AutoTextarea, Badge, Button, Checkbox, IconButton, Input, Progress, Ring, Divider,
} from "@/components/ui/primitives";
import { Toggle } from "@/components/ui/form";
import { MiniCalendar } from "@/components/ui/mini-calendar";
import { InlineComposer } from "./task-list";
import {
  blockedByThis, blockersOf, useDayLoad, useTaskLinks, useUpdateTaskLinks,
} from "./task-row";

const PRIORITY_CLASS = ["text-ink-3", "text-ink-2", "text-warn", "text-danger"];
const DURATION_CHIPS = [15, 30, 45, 60, 90, 120];

/**
 * Two-column field row. Renders a real <label for> when the control has an id,
 * so the icon + word on the left is the input's accessible name rather than
 * decoration sitting next to an unlabelled box.
 */
function InspectorRow({
  icon: Icon, label, htmlFor, children, align = "start",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
  align?: "start" | "center";
}) {
  const labelCls = cn(
    "flex w-[86px] shrink-0 items-center gap-1.5 text-[12px] text-ink-3",
    align === "start" && "pt-1.5",
    htmlFor && "cursor-pointer",
  );
  return (
    <div className={cn("flex gap-2.5 py-1", align === "center" ? "items-center" : "items-start")}>
      {htmlFor ? (
        <label htmlFor={htmlFor} className={labelCls}>
          <Icon className="size-3.5" />
          {label}
        </label>
      ) : (
        <div className={labelCls}>
          <Icon className="size-3.5" />
          {label}
        </div>
      )}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function Section({
  icon: Icon, title, count, accessory, children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  count?: React.ReactNode;
  accessory?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-2">
        <Icon className="size-3.5 text-ink-3" />
        <span className="text-[12px] font-medium text-ink-2">{title}</span>
        {count !== undefined && <span className="text-[11.5px] text-ink-4 tnum">{count}</span>}
        <div className="ml-auto">{accessory}</div>
      </div>
      {children}
    </div>
  );
}

/** "Today 14:32" / "Fri, 22 Aug 09:10" — short enough for a trail line. */
function stamp(iso: string | null, hour12: boolean): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const day = friendlyDate(toISO(d));
  return `${day} ${formatTime(d.getHours() * 60 + d.getMinutes(), hour12)}`;
}

// =========================================================
// Dependency picker
// =========================================================
function LinkPicker({
  task, exclude, onPick,
}: {
  task: Task;
  exclude: Set<string>;
  onPick: (id: string) => void;
}) {
  const tasks = useStore((s) => s.tasks);
  const [query, setQuery] = React.useState("");

  const results = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return tasks
      .filter((t) => t.id !== task.id && t.parent_id !== task.id && !exclude.has(t.id))
      .filter((t) => (q ? (t.title || "").toLowerCase().includes(q) : t.status !== "done"))
      .sort((a, b) => (a.date ?? "9999").localeCompare(b.date ?? "9999"))
      .slice(0, 8);
  }, [tasks, task.id, exclude, query]);

  return (
    <div className="p-1">
      <div className="mb-1 flex items-center gap-1.5 rounded-md border border-line px-2">
        <Search className="size-3.5 shrink-0 text-ink-4" />
        <input
          autoFocus
          value={query}
          aria-label="Search tasks to link"
          placeholder="Search tasks…"
          onChange={(e) => setQuery(e.target.value)}
          className="h-7 min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-4"
        />
      </div>
      {results.length === 0 ? (
        <p className="px-2 py-2 text-[12px] text-ink-4">No matching task.</p>
      ) : (
        results.map((t) => (
          <MenuItem key={t.id} onClick={() => onPick(t.id)}>
            <span className="block truncate">{t.title || "Untitled"}</span>
            <span className="mt-0.5 block text-[11.5px] text-ink-4">
              {t.date ? friendlyDate(t.date) : "Inbox"}
              {t.status === "done" ? " · done" : ""}
            </span>
          </MenuItem>
        ))
      )}
    </div>
  );
}

function LinkChip({ id, tone }: { id: string; tone: "blocker" | "blocked" }) {
  const tasks = useStore((s) => s.tasks);
  const openInspector = useStore((s) => s.openInspector);
  const target = tasks.find((t) => t.id === id);
  if (!target) return null;
  const done = target.status === "done";
  return (
    <button
      onClick={() => openInspector(id)}
      aria-label={`Open ${target.title || "Untitled"}`}
      className="flex h-7 max-w-full items-center gap-1 px-0.5 cursor-pointer"
    >
      <Badge tint={done ? "emerald" : tone === "blocker" ? "amber" : "blue"} className="max-w-[190px]">
        {done ? <Check className="size-2.5 shrink-0" /> : <CircleDot className="size-2.5 shrink-0" />}
        {target.title || "Untitled"}
      </Badge>
    </button>
  );
}

// =========================================================
// TaskInspector
// =========================================================
export function TaskInspector() {
  const inspectorTaskId = useStore((s) => s.inspectorTaskId);
  const openInspector = useStore((s) => s.openInspector);
  const tasks = useStore((s) => s.tasks);
  const goals = useStore((s) => s.goals);
  const books = useStore((s) => s.books);
  const focusSessions = useStore((s) => s.focusSessions);
  const storeTags = useStore((s) => s.tags);
  const hour12 = useStore((s) => s.hour12);
  const weekStart = useStore((s) => s.profile?.week_start ?? 1);
  const patch = useStore((s) => s.patch);
  const insert = useStore((s) => s.insert);
  const remove = useStore((s) => s.remove);
  const startTimer = useStore((s) => s.startTimer);
  const createSeries = useStore((s) => s.createSeries);
  const deleteSeries = useStore((s) => s.deleteSeries);
  const duplicateTask = useStore((s) => s.duplicateTask);
  const toggleTask = useStore((s) => s.toggleTask);
  const toast = useStore((s) => s.toast);

  const links = useTaskLinks();
  const updateLinks = useUpdateTaskLinks();
  const dayLoad = useDayLoad();

  const task = tasks.find((t) => t.id === inspectorTaskId) ?? null;
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [tagDraft, setTagDraft] = React.useState("");
  const [shiftSubtasks, setShiftSubtasks] = React.useState(true);

  const close = () => openInspector(null);
  const subtasks = task ? subtasksOf(tasks, task.id) : [];
  const goal = task?.goal_id ? goals.find((g) => g.id === task.goal_id) : null;
  const book = task?.book_id ? books.find((b) => b.id === task.book_id) : null;
  const checklistDone = task?.checklist.filter((c) => c.done).length ?? 0;
  const subDone = subtasks.filter((s) => s.status === "done").length;
  const sessions = React.useMemo(
    () => (task ? focusSessions.filter((s) => s.task_id === task.id) : []),
    [focusSessions, task],
  );

  const blockerIds = task ? blockersOf(links, task.id) : [];
  const blocksIds = task ? blockedByThis(links, task.id) : [];
  const openBlockers = blockerIds.filter((id) => {
    const t = tasks.find((x) => x.id === id);
    return t && t.status !== "done" && t.status !== "dropped";
  });

  if (!task) return null;

  const current = task;
  const set = (changes: Partial<Task>) => patch("tasks", current.id, changes);

  function setChecklist(next: ChecklistItem[]) {
    set({ checklist: next });
  }

  function moveChecklist(index: number, delta: number) {
    const next = [...current.checklist];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setChecklist(next);
  }

  function checklistToSubtask(item: ChecklistItem) {
    insert("tasks", {
      title: item.text || "Untitled",
      parent_id: current.id,
      date: current.date,
      status: item.done ? "done" : "todo",
      completed_at: item.done ? new Date().toISOString() : null,
      color: current.color,
      order_index: subtasks.length,
    });
    setChecklist(current.checklist.filter((c) => c.id !== item.id));
  }

  function setDate(iso: string | null) {
    const previous = { parent: current.date, subs: subtasks.map((s) => ({ id: s.id, date: s.date })) };
    set({ date: iso });
    if (shiftSubtasks) subtasks.forEach((s) => patch("tasks", s.id, { date: iso }));
    toast({
      title: iso ? `Moved to ${friendlyDate(iso)}` : "Moved to Inbox",
      description: shiftSubtasks && subtasks.length ? `${subtasks.length} subtasks moved too` : undefined,
      action: {
        label: "Undo",
        run: () => {
          patch("tasks", current.id, { date: previous.parent });
          previous.subs.forEach((s) => patch("tasks", s.id, { date: s.date }));
        },
      },
    });
  }

  function setRecurrence(rec: Recurrence | null) {
    if (!rec) {
      if (current.series_id) deleteSeries(current.series_id, current.date ?? todayISO());
      set({ recurrence: null, series_id: null });
      return;
    }
    const made = createSeries(
      {
        title: current.title, notes: current.notes, kind: current.kind, priority: current.priority,
        color: current.color, tags: current.tags, start_min: current.start_min, end_min: current.end_min,
        all_day: current.all_day, duration_min: current.duration_min, goal_id: current.goal_id,
        date: current.date ?? todayISO(),
      },
      rec,
    );
    remove("tasks", current.id);
    toast({ title: "Repeating task created", description: `${made.length} occurrences scheduled.`, tone: "success" });
    openInspector(made[0]?.id ?? null);
  }

  // ---- convert ------------------------------------------------------------
  function convertTo(kind: Task["kind"]) {
    if (kind === "event") {
      const start = current.start_min ?? 9 * 60;
      set({
        kind: "event",
        start_min: start,
        end_min: Math.min(1439, start + (current.duration_min ?? 60)),
        all_day: false,
        date: current.date ?? todayISO(),
      });
      toast({ title: "Now an event", description: "It has a slot on the calendar." });
      return;
    }
    if (kind === "milestone") {
      set({ kind: "milestone", all_day: true, start_min: null, end_min: null, date: current.date ?? todayISO() });
      toast({ title: "Now a milestone", description: "A dated marker with no duration." });
      return;
    }
    set({ kind: "task" });
    toast({ title: "Now a task" });
  }

  function saveAsTemplate() {
    const name = current.title.trim() || "Untitled block";
    insert("templates", {
      name,
      description: current.notes,
      scope: "block",
      color: current.color ?? "violet",
      items: [
        {
          title: current.title,
          kind: current.kind,
          day_offset: 0,
          start_min: current.start_min,
          end_min: current.end_min,
          duration_min: current.duration_min,
          priority: current.priority,
          color: current.color,
          icon: current.icon,
          tags: current.tags,
          notes: current.notes,
          checklist: current.checklist,
        },
        ...subtasks.map((s) => ({
          title: s.title,
          kind: s.kind,
          day_offset: 0,
          start_min: s.start_min,
          end_min: s.end_min,
          duration_min: s.duration_min,
          priority: s.priority,
          color: s.color,
          icon: s.icon,
          tags: s.tags,
          notes: s.notes,
          checklist: s.checklist,
        })),
      ],
    });
    toast({
      title: "Saved as a template",
      description: `“${name}” · ${1 + subtasks.length} items`,
      tone: "success",
    });
  }

  function duplicateWithSubtasks() {
    const copy = duplicateTask(current.id);
    if (!copy) return;
    subtasks.forEach((s) => {
      const { id: _id, created_at: _c, updated_at: _u, ...rest } = s;
      void _id; void _c; void _u;
      insert("tasks", { ...rest, parent_id: copy.id, status: "todo", completed_at: null, actual_min: 0 });
    });
    const blockers = blockersOf(links, current.id);
    if (blockers.length) updateLinks((l) => ({ ...l, [copy.id]: blockers }));
    toast({
      title: "Duplicated",
      description: subtasks.length ? `With ${subtasks.length} subtasks` : undefined,
      tone: "success",
      action: { label: "Open", run: () => openInspector(copy.id) },
    });
  }

  function deleteTask() {
    const victims = [current, ...subtasks];
    victims.forEach((v) => remove("tasks", v.id));
    updateLinks((l) => {
      const next: Record<string, string[]> = {};
      for (const [key, ids] of Object.entries(l)) {
        if (victims.some((v) => v.id === key)) continue;
        next[key] = ids.filter((id) => !victims.some((v) => v.id === id));
      }
      return next;
    });
    close();
    toast({
      title: victims.length > 1 ? `Deleted ${victims.length} tasks` : "Task deleted",
      tone: "danger",
      action: { label: "Undo", run: () => victims.forEach((v) => insert("tasks", v)) },
    });
  }

  // ---- dependencies -------------------------------------------------------
  /** Adding `blockerId` is illegal if this task already blocks it, directly or not. */
  function wouldCycle(blockerId: string): boolean {
    const seen = new Set<string>();
    const walk = (id: string): boolean => {
      if (id === current.id) return true;
      if (seen.has(id)) return false;
      seen.add(id);
      return blockersOf(links, id).some(walk);
    };
    return walk(blockerId);
  }

  function addBlocker(id: string) {
    if (wouldCycle(id)) {
      toast({ title: "That would loop", description: "This task already blocks that one.", tone: "danger" });
      return;
    }
    updateLinks((l) => ({ ...l, [current.id]: [...(l[current.id] ?? []), id] }));
  }

  function addBlocked(id: string) {
    const seen = new Set<string>();
    const walk = (x: string): boolean => {
      if (x === id) return true;
      if (seen.has(x)) return false;
      seen.add(x);
      return blockersOf(links, x).some(walk);
    };
    if (walk(current.id)) {
      toast({ title: "That would loop", description: "That task already blocks this one.", tone: "danger" });
      return;
    }
    updateLinks((l) => ({ ...l, [id]: [...(l[id] ?? []), current.id] }));
  }

  const linkExclusions = new Set<string>([...blockerIds, ...blocksIds, ...subtasks.map((s) => s.id)]);

  // ---- activity trail -----------------------------------------------------
  const trail: { at: string; icon: React.ComponentType<{ className?: string }>; label: string; detail?: string; tone?: string }[] = [
    { at: current.created_at, icon: Sparkles, label: "Created" },
    ...sessions.map((s) => ({
      at: s.started_at,
      icon: TimerIcon,
      label: s.mode === "pomodoro" ? "Pomodoro" : "Focus session",
      detail: `${formatClock(s.seconds)}${s.completed ? "" : " · stopped early"}`,
      tone: "text-success",
    })),
  ];
  if (current.completed_at) {
    trail.push({ at: current.completed_at, icon: Check, label: "Completed", tone: "text-success" });
  }
  trail.sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));
  const loggedSeconds = sessions.reduce((sum, s) => sum + s.seconds, 0);

  return (
    <>
      <Sheet open onClose={close} width={420}>
        {/* header */}
        <div className="flex items-center gap-1 border-b border-line px-3 py-2.5">
          <Checkbox
            checked={current.status === "done"}
            indeterminate={current.status === "doing"}
            tint={current.color}
            onChange={() => toggleTask(current.id)}
            label={current.status === "done" ? "Mark as not done" : "Mark as done"}
          />
          <span className="ml-1 flex-1 truncate text-[12px] text-ink-3">
            {current.date ? friendlyDate(current.date) : "Inbox"}
            {openBlockers.length > 0 && (
              <span className="ml-1.5 text-warn">· blocked</span>
            )}
          </span>

          <Popover
            align="end"
            className="w-[220px]"
            trigger={<IconButton label="Convert and more" size="md"><MoreHorizontal /></IconButton>}
          >
            {(closeMenu) => (
              <>
                <MenuLabel>Convert to</MenuLabel>
                <MenuItem
                  icon={CheckSquare}
                  checked={current.kind === "task"}
                  onClick={() => { convertTo("task"); closeMenu(); }}
                >
                  Task
                </MenuItem>
                <MenuItem
                  icon={CalendarClock}
                  checked={current.kind === "event"}
                  onClick={() => { convertTo("event"); closeMenu(); }}
                >
                  Event
                </MenuItem>
                <MenuItem
                  icon={Milestone}
                  checked={current.kind === "milestone"}
                  onClick={() => { convertTo("milestone"); closeMenu(); }}
                >
                  Milestone
                </MenuItem>
                <MenuSeparator />
                <MenuItem icon={Copy} onClick={() => { duplicateWithSubtasks(); closeMenu(); }}>
                  Duplicate with subtasks
                </MenuItem>
                <MenuItem icon={LayoutTemplate} onClick={() => { saveAsTemplate(); closeMenu(); }}>
                  Make this a template
                </MenuItem>
                <MenuSeparator />
                <MenuLabel>Status</MenuLabel>
                <MenuItem
                  icon={CircleDot}
                  checked={current.status === "doing"}
                  onClick={() => { set({ status: current.status === "doing" ? "todo" : "doing" }); closeMenu(); }}
                >
                  In progress
                </MenuItem>
                <MenuItem
                  icon={Ban}
                  checked={current.status === "dropped"}
                  onClick={() => { set({ status: current.status === "dropped" ? "todo" : "dropped" }); closeMenu(); }}
                >
                  {current.status === "dropped" ? "Un-drop" : "Drop"}
                </MenuItem>
              </>
            )}
          </Popover>

          <IconButton
            label="Start focus timer"
            size="md"
            onClick={() => { startTimer({ taskId: current.id, label: current.title, mode: "pomodoro" }); toast({ title: "Focus started" }); }}
          >
            <Play />
          </IconButton>
          <IconButton label="Delete task" size="md" tone="danger" onClick={() => setConfirmDelete(true)}>
            <Trash2 />
          </IconButton>
          <IconButton label="Close" size="md" onClick={close}><X /></IconButton>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-3">
          {/* title */}
          <AutoTextarea
            value={current.title}
            onChange={(v) => set({ title: v })}
            placeholder="Untitled"
            aria-label="Task title"
            className={cn(
              "px-1 text-[19px] font-semibold leading-snug tracking-[-0.01em] text-ink",
              (current.status === "done" || current.status === "dropped") && "text-ink-3 line-through",
            )}
          />

          {openBlockers.length > 0 && (
            <div className="mt-2 flex items-start gap-2 rounded-lg border border-line bg-warn-soft px-2.5 py-2">
              <Ban className="mt-px size-3.5 shrink-0 text-warn" />
              <p className="text-[12px] leading-snug text-ink-2">
                Waiting on {openBlockers.length} unfinished{" "}
                {openBlockers.length === 1 ? "task" : "tasks"} below.
              </p>
            </div>
          )}

          <div className="mt-3 space-y-0.5">
            {/* date */}
            <InspectorRow icon={Calendar} label="Date">
              <div className="flex flex-wrap items-center gap-1">
                <Popover
                  className="w-[262px] p-2"
                  trigger={
                    <button className="h-7 rounded-md px-2 text-left text-[13px] text-ink hover:bg-hover cursor-pointer transition-colors">
                      {current.date ? friendlyDate(current.date) : <span className="text-ink-4">Add date</span>}
                    </button>
                  }
                >
                  {(close2) => (
                    <MiniCalendar
                      value={current.date ?? todayISO()}
                      weekStart={weekStart}
                      markers={dayLoad}
                      onChange={(iso) => { setDate(iso); close2(); }}
                      footer={
                        <>
                          <div className="flex gap-1">
                            <Button size="xs" className="flex-1" onClick={() => { setDate(todayISO()); close2(); }}>
                              Today
                            </Button>
                            <Button size="xs" className="flex-1" onClick={() => { setDate(null); close2(); }}>
                              <Inbox className="size-3" /> Inbox
                            </Button>
                          </div>
                          {subtasks.length > 0 && (
                            <Toggle
                              className="mt-2"
                              checked={shiftSubtasks}
                              onChange={setShiftSubtasks}
                              label="Move subtasks too"
                              description={`${subtasks.length} will follow this date`}
                            />
                          )}
                        </>
                      }
                    />
                  )}
                </Popover>
                {current.date && (
                  <IconButton label="Clear date" size="md" onClick={() => setDate(null)}>
                    <X />
                  </IconButton>
                )}
              </div>
            </InspectorRow>

            {/* time */}
            <InspectorRow icon={Clock} label="Time" htmlFor={`ti-start-${current.id}`}>
              <div className="flex items-center gap-1.5">
                <Input
                  id={`ti-start-${current.id}`}
                  key={`s-${current.start_min}`}
                  defaultValue={current.start_min != null ? formatTime(current.start_min, false) : ""}
                  placeholder="—"
                  onBlur={(e) => {
                    const min = parseTime(e.target.value);
                    set({
                      start_min: min,
                      all_day: min == null,
                      end_min: min == null ? null : current.end_min,
                    });
                  }}
                  className="h-7 w-[74px] text-center tnum"
                />
                <span aria-hidden className="text-ink-4">–</span>
                <Input
                  aria-label="End time"
                  key={`e-${current.end_min}`}
                  defaultValue={current.end_min != null ? formatTime(current.end_min, false) : ""}
                  placeholder="—"
                  onBlur={(e) => {
                    const min = parseTime(e.target.value);
                    set({
                      end_min: min,
                      duration_min: min != null && current.start_min != null ? min - current.start_min : current.duration_min,
                    });
                  }}
                  className="h-7 w-[74px] text-center tnum"
                />
                {current.start_min != null && (
                  <IconButton label="Clear time" size="md" onClick={() => set({ start_min: null, end_min: null, all_day: true })}>
                    <X />
                  </IconButton>
                )}
              </div>
            </InspectorRow>

            {/* estimate */}
            <InspectorRow icon={TimerIcon} label="Estimate" htmlFor={`ti-est-${current.id}`}>
              <div className="flex items-center gap-2">
                <Input
                  id={`ti-est-${current.id}`}
                  type="number"
                  min={0}
                  step={5}
                  key={`d-${current.duration_min}`}
                  defaultValue={current.duration_min ?? ""}
                  placeholder="—"
                  onBlur={(e) => set({ duration_min: e.target.value ? Number(e.target.value) : null })}
                  className="h-7 w-[74px] text-center tnum"
                />
                <span className="text-[12px] text-ink-3">minutes</span>
                {current.actual_min > 0 && (
                  <span className="ml-auto text-[12px] text-success tnum">
                    {formatDuration(current.actual_min)} spent
                  </span>
                )}
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {DURATION_CHIPS.map((m) => (
                  <Button
                    key={m}
                    size="xs"
                    variant={current.duration_min === m ? "subtle" : "ghost"}
                    className="tnum"
                    onClick={() =>
                      set({
                        duration_min: m,
                        end_min: current.start_min != null ? Math.min(1439, current.start_min + m) : current.end_min,
                      })
                    }
                  >
                    {formatDuration(m)}
                  </Button>
                ))}
              </div>
              {current.duration_min && current.actual_min > 0 && (
                <Progress
                  value={current.actual_min}
                  max={current.duration_min}
                  className="mt-1.5"
                  tint={current.actual_min > current.duration_min ? "red" : "emerald"}
                />
              )}
            </InspectorRow>

            {/* priority */}
            <InspectorRow icon={Flag} label="Priority" align="center">
              <div className="flex gap-1">
                {PRIORITY_LABELS.map((label, i) => (
                  <button
                    key={label}
                    onClick={() => set({ priority: i })}
                    aria-pressed={current.priority === i}
                    className={cn(
                      "h-7 rounded-md px-2 text-[12.5px] font-medium cursor-pointer transition-colors",
                      current.priority === i ? "bg-hover text-ink" : "text-ink-4 hover:bg-hover hover:text-ink-2",
                      current.priority === i && PRIORITY_CLASS[i],
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </InspectorRow>

            {/* kind */}
            <InspectorRow icon={Shapes} label="Type" align="center">
              <div className="flex gap-1">
                {([
                  { kind: "task", label: "Task", icon: CheckSquare },
                  { kind: "event", label: "Event", icon: CalendarClock },
                  { kind: "milestone", label: "Milestone", icon: Milestone },
                ] as const).map((opt) => (
                  <button
                    key={opt.kind}
                    onClick={() => convertTo(opt.kind)}
                    aria-pressed={current.kind === opt.kind}
                    className={cn(
                      "flex h-7 items-center gap-1.5 rounded-md px-2 text-[12.5px] font-medium cursor-pointer transition-colors",
                      current.kind === opt.kind ? "bg-hover text-ink" : "text-ink-4 hover:bg-hover hover:text-ink-2",
                    )}
                  >
                    <opt.icon className="size-3.5" />
                    {opt.label}
                  </button>
                ))}
                {!["task", "event", "milestone"].includes(current.kind) && (
                  <Badge tint="slate">{current.kind}</Badge>
                )}
              </div>
            </InspectorRow>

            {/* colour */}
            <InspectorRow icon={Palette} label="Colour" align="center">
              <Popover
                className="w-[210px]"
                trigger={
                  <button
                    className={cn(
                      "flex h-7 items-center gap-2 rounded-md px-2 text-[13px] hover:bg-hover cursor-pointer transition-colors",
                      current.color && `tint-${current.color}`,
                    )}
                  >
                    <span
                      className="size-3.5 rounded-full border border-line"
                      style={{ background: current.color ? "var(--tint)" : "transparent" }}
                    />
                    <span className="text-ink">{current.color ?? "None"}</span>
                  </button>
                }
              >
                <TintPicker value={current.color} allowNone onChange={(t) => set({ color: t as Tint | null })} />
              </Popover>
            </InspectorRow>

            {/* tags */}
            <InspectorRow icon={Hash} label="Tags">
              <div className="flex flex-wrap items-center gap-1">
                {current.tags.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => set({ tags: current.tags.filter((t) => t !== tag) })}
                    aria-label={`Remove tag ${tag}`}
                    className="group/tag flex h-7 items-center cursor-pointer"
                  >
                    <Badge tint={storeTags.find((t) => t.name === tag)?.color ?? "slate"}>
                      {tag}
                      <X className="size-2.5 shrink-0 opacity-50 transition-opacity group-hover/tag:opacity-100" />
                    </Badge>
                  </button>
                ))}
                <input
                  value={tagDraft}
                  aria-label="Add a tag"
                  onChange={(e) => setTagDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && tagDraft.trim()) {
                      e.preventDefault();
                      const t = tagDraft.trim().toLowerCase().replace(/^#/, "");
                      if (!current.tags.includes(t)) set({ tags: [...current.tags, t] });
                      setTagDraft("");
                    }
                  }}
                  placeholder="Add tag"
                  className="h-7 w-[88px] bg-transparent text-[12.5px] text-ink outline-none placeholder:text-ink-4"
                />
              </div>
              {storeTags.filter((t) => !current.tags.includes(t.name)).length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {storeTags
                    .filter((t) => !current.tags.includes(t.name))
                    .slice(0, 6)
                    .map((t) => (
                      <button
                        key={t.id}
                        onClick={() => set({ tags: [...current.tags, t.name] })}
                        aria-label={`Add tag ${t.name}`}
                        className="flex h-7 items-center cursor-pointer opacity-60 transition-opacity hover:opacity-100"
                      >
                        <Badge tint={t.color}>
                          <Plus className="size-2.5 shrink-0" />
                          {t.name}
                        </Badge>
                      </button>
                    ))}
                </div>
              )}
            </InspectorRow>

            {/* repeat */}
            <InspectorRow icon={Repeat} label="Repeat" align="center">
              <Popover
                className="w-[190px]"
                trigger={
                  <button className="h-7 rounded-md px-2 text-[13px] text-ink hover:bg-hover cursor-pointer transition-colors">
                    {current.recurrence
                      ? `Every ${current.recurrence.interval > 1 ? `${current.recurrence.interval} ` : ""}${current.recurrence.freq.replace("ly", "")}`
                      : <span className="text-ink-4">Never</span>}
                  </button>
                }
              >
                {(close2) => (
                  <>
                    <MenuItem onClick={() => { setRecurrence({ freq: "daily", interval: 1, count: 60 }); close2(); }}>
                      Every day
                    </MenuItem>
                    <MenuItem onClick={() => { setRecurrence({ freq: "weekly", interval: 1, weekdays: [1, 2, 3, 4, 5], count: 40 }); close2(); }}>
                      Weekdays
                    </MenuItem>
                    <MenuItem onClick={() => { setRecurrence({ freq: "weekly", interval: 1, weekdays: [current.date ? new Date(current.date).getDay() : 1], count: 26 }); close2(); }}>
                      Every week
                    </MenuItem>
                    <MenuItem onClick={() => { setRecurrence({ freq: "monthly", interval: 1, count: 12 }); close2(); }}>
                      Every month
                    </MenuItem>
                    {current.recurrence && (
                      <>
                        <MenuSeparator />
                        <MenuItem danger onClick={() => { setRecurrence(null); close2(); }}>
                          Stop repeating
                        </MenuItem>
                      </>
                    )}
                  </>
                )}
              </Popover>
            </InspectorRow>

            {/* goal */}
            <InspectorRow icon={Target} label="Goal" align="center">
              <Popover
                className="max-h-[260px] w-[240px] overflow-y-auto"
                trigger={
                  <button className="h-7 truncate rounded-md px-2 text-left text-[13px] text-ink hover:bg-hover cursor-pointer transition-colors">
                    {goal ? goal.title : <span className="text-ink-4">Not linked</span>}
                  </button>
                }
              >
                {(close2) => (
                  <>
                    <MenuItem onClick={() => { set({ goal_id: null }); close2(); }}>None</MenuItem>
                    {goals.filter((g) => g.status === "active").length > 0 && <MenuSeparator />}
                    {goals.filter((g) => g.status === "active").map((g) => (
                      <MenuItem
                        key={g.id}
                        checked={g.id === current.goal_id}
                        onClick={() => { set({ goal_id: g.id }); close2(); }}
                      >
                        {g.title}
                      </MenuItem>
                    ))}
                  </>
                )}
              </Popover>
            </InspectorRow>
          </div>

          <Divider className="my-3" />

          {/* notes */}
          <AutoTextarea
            value={current.notes ?? ""}
            onChange={(v) => set({ notes: v })}
            placeholder="Notes…"
            aria-label="Notes"
            minRows={2}
            className="px-1 text-[13.5px] text-ink-2"
          />

          <Divider className="my-3" />

          {/* checklist */}
          <Section
            icon={CheckSquare}
            title="Checklist"
            count={current.checklist.length > 0 ? `${checklistDone}/${current.checklist.length}` : undefined}
            accessory={
              current.checklist.length > 0 ? (
                <Ring value={checklistDone} max={current.checklist.length} size={16} stroke={2} tint={current.color} />
              ) : undefined
            }
          >
            {current.checklist.length > 0 && (
              <Progress value={checklistDone} max={current.checklist.length} className="mb-2" height={3} />
            )}
            <div className="space-y-0.5">
              {current.checklist.map((item, i) => (
                <div key={item.id} className="group/ci flex items-center gap-1.5 rounded-md px-1 py-0.5 hover:bg-hover">
                  <Checkbox
                    size="sm"
                    checked={item.done}
                    label={item.text || "Checklist item"}
                    onChange={(next) =>
                      setChecklist(current.checklist.map((c) => (c.id === item.id ? { ...c, done: next } : c)))
                    }
                  />
                  <input
                    value={item.text}
                    aria-label={`Checklist item ${i + 1}`}
                    onChange={(e) =>
                      setChecklist(current.checklist.map((c) => (c.id === item.id ? { ...c, text: e.target.value } : c)))
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        const next = [...current.checklist];
                        next.splice(i + 1, 0, { id: uid(), text: "", done: false });
                        setChecklist(next);
                      }
                      if (e.key === "Backspace" && !item.text) {
                        e.preventDefault();
                        setChecklist(current.checklist.filter((c) => c.id !== item.id));
                      }
                      if (e.key === "ArrowUp" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); moveChecklist(i, -1); }
                      if (e.key === "ArrowDown" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); moveChecklist(i, 1); }
                    }}
                    className={cn(
                      "min-w-0 flex-1 bg-transparent text-[13px] outline-none",
                      item.done ? "text-ink-4 line-through" : "text-ink",
                    )}
                  />
                  <div className="flex shrink-0 items-center opacity-0 transition-opacity focus-within:opacity-100 group-hover/ci:opacity-100">
                    <IconButton
                      label={`Move “${item.text || "item"}” up`}
                      size="sm"
                      disabled={i === 0}
                      onClick={() => moveChecklist(i, -1)}
                    >
                      <ChevronUp />
                    </IconButton>
                    <IconButton
                      label={`Move “${item.text || "item"}” down`}
                      size="sm"
                      disabled={i === current.checklist.length - 1}
                      onClick={() => moveChecklist(i, 1)}
                    >
                      <ChevronDown />
                    </IconButton>
                    <IconButton
                      label={`Turn “${item.text || "item"}” into a subtask`}
                      size="sm"
                      onClick={() => checklistToSubtask(item)}
                    >
                      <CornerDownRight />
                    </IconButton>
                    <IconButton
                      label={`Remove “${item.text || "item"}”`}
                      size="sm"
                      onClick={() => setChecklist(current.checklist.filter((c) => c.id !== item.id))}
                    >
                      <X />
                    </IconButton>
                  </div>
                </div>
              ))}
            </div>
            <button
              onClick={() => setChecklist([...current.checklist, { id: uid(), text: "", done: false }])}
              className="mt-1 flex items-center gap-1.5 rounded-md px-1 py-1 text-[12.5px] text-ink-4 hover:bg-hover hover:text-ink-3 cursor-pointer transition-colors"
            >
              <Plus className="size-3.5" /> Add item
            </button>
          </Section>

          <Divider className="my-3" />

          {/* subtasks */}
          <Section
            icon={ListTree}
            title="Subtasks"
            count={subtasks.length > 0 ? `${subDone}/${subtasks.length}` : undefined}
            accessory={
              subtasks.length > 0 ? (
                <Ring value={subDone} max={subtasks.length} size={16} stroke={2} tint={current.color} />
              ) : undefined
            }
          >
            <div className="space-y-0.5">
              {subtasks.map((sub, i) => (
                <div key={sub.id} className="group/st flex items-center gap-1.5 rounded-md px-1 py-0.5 hover:bg-hover">
                  <Checkbox
                    size="sm"
                    checked={sub.status === "done"}
                    label={sub.title || "Subtask"}
                    onChange={() => toggleTask(sub.id)}
                  />
                  <input
                    value={sub.title}
                    aria-label={`Subtask ${i + 1}`}
                    onChange={(e) => patch("tasks", sub.id, { title: e.target.value })}
                    className={cn(
                      "min-w-0 flex-1 bg-transparent text-[13px] outline-none",
                      sub.status === "done" ? "text-ink-4 line-through" : "text-ink",
                    )}
                  />
                  <div className="flex shrink-0 items-center opacity-0 transition-opacity focus-within:opacity-100 group-hover/st:opacity-100">
                    <IconButton
                      label={`Move “${sub.title || "subtask"}” up`}
                      size="sm"
                      disabled={i === 0}
                      onClick={() =>
                        patch("tasks", sub.id, {
                          order_index: orderBetween(subtasks[i - 2]?.order_index, subtasks[i - 1].order_index),
                        })
                      }
                    >
                      <ChevronUp />
                    </IconButton>
                    <IconButton
                      label={`Move “${sub.title || "subtask"}” down`}
                      size="sm"
                      disabled={i === subtasks.length - 1}
                      onClick={() =>
                        patch("tasks", sub.id, {
                          order_index: orderBetween(subtasks[i + 1].order_index, subtasks[i + 2]?.order_index),
                        })
                      }
                    >
                      <ChevronDown />
                    </IconButton>
                    <IconButton label={`Open “${sub.title || "subtask"}”`} size="sm" onClick={() => openInspector(sub.id)}>
                      <MoreHorizontal />
                    </IconButton>
                    <IconButton label={`Delete “${sub.title || "subtask"}”`} size="sm" tone="danger" onClick={() => remove("tasks", sub.id)}>
                      <X />
                    </IconButton>
                  </div>
                </div>
              ))}
            </div>
            <InlineComposer
              date={current.date}
              parentId={current.id}
              placeholder="Add subtask"
              className="mt-0.5"
            />
          </Section>

          <Divider className="my-3" />

          {/* dependencies */}
          <Section
            icon={Link2}
            title="Dependencies"
            count={blockerIds.length + blocksIds.length || undefined}
          >
            <div className="space-y-2">
              <div>
                <p className="mb-1 px-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-4">
                  Blocked by
                </p>
                <div className="flex flex-wrap items-center gap-1">
                  {blockerIds.map((id) => (
                    <span key={id} className="group/link inline-flex items-center">
                      <LinkChip id={id} tone="blocker" />
                      <IconButton
                        label="Remove this blocker"
                        size="sm"
                        onClick={() => updateLinks((l) => ({ ...l, [current.id]: (l[current.id] ?? []).filter((x) => x !== id) }))}
                      >
                        <X />
                      </IconButton>
                    </span>
                  ))}
                  <Popover
                    className="w-[260px]"
                    trigger={
                      <Button size="xs" variant="ghost" className="text-ink-4">
                        <Plus className="size-3" /> Add blocker
                      </Button>
                    }
                  >
                    {(close2) => (
                      <LinkPicker
                        task={current}
                        exclude={linkExclusions}
                        onPick={(id) => { addBlocker(id); close2(); }}
                      />
                    )}
                  </Popover>
                </div>
              </div>

              <div>
                <p className="mb-1 px-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-4">
                  Blocks
                </p>
                <div className="flex flex-wrap items-center gap-1">
                  {blocksIds.map((id) => (
                    <span key={id} className="inline-flex items-center">
                      <LinkChip id={id} tone="blocked" />
                      <IconButton
                        label="Stop blocking this task"
                        size="sm"
                        onClick={() => updateLinks((l) => ({ ...l, [id]: (l[id] ?? []).filter((x) => x !== current.id) }))}
                      >
                        <X />
                      </IconButton>
                    </span>
                  ))}
                  <Popover
                    className="w-[260px]"
                    trigger={
                      <Button size="xs" variant="ghost" className="text-ink-4">
                        <Plus className="size-3" /> Add
                      </Button>
                    }
                  >
                    {(close2) => (
                      <LinkPicker
                        task={current}
                        exclude={linkExclusions}
                        onPick={(id) => { addBlocked(id); close2(); }}
                      />
                    )}
                  </Popover>
                </div>
              </div>
            </div>
          </Section>

          <Divider className="my-3" />

          {/* activity */}
          <Section
            icon={History}
            title="Activity"
            count={loggedSeconds > 0 ? formatClock(loggedSeconds) : undefined}
          >
            <ol className="space-y-1.5">
              {trail.map((entry, i) => (
                <li key={`${entry.at}-${i}`} className="flex items-start gap-2">
                  <entry.icon className={cn("mt-px size-3.5 shrink-0 text-ink-4", entry.tone)} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[12.5px] leading-snug text-ink-2">
                      {entry.label}
                      {entry.detail && <span className="ml-1.5 text-ink-3 tnum">{entry.detail}</span>}
                    </p>
                  </div>
                  <span className="shrink-0 text-[11.5px] text-ink-4 tnum">{stamp(entry.at, hour12)}</span>
                </li>
              ))}
            </ol>
            <p className="mt-2 px-0.5 text-[11.5px] text-ink-4">
              Last edited {stamp(current.updated_at, hour12) || "—"}
            </p>
          </Section>

          {book && (
            <>
              <Divider className="my-3" />
              <div className="rounded-lg border border-line p-2.5">
                <p className="text-[12px] font-medium text-ink">{book.title}</p>
                <p className="mt-0.5 text-[11.5px] text-ink-3 tnum">
                  Pages {current.page_from}–{current.page_to} · {book.current_page}/{book.total_pages} read
                </p>
                <Progress value={book.current_page} max={book.total_pages} className="mt-1.5" tint={book.color} />
              </div>
            </>
          )}

          <div className="h-8" />
        </div>
      </Sheet>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={deleteTask}
        title="Delete this task?"
        description={
          subtasks.length
            ? `${subtasks.length} subtasks go with it. You can undo from the toast.`
            : current.series_id
              ? "Only this occurrence is deleted."
              : "You can undo from the toast."
        }
      />
    </>
  );
}
