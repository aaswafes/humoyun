"use client";

import * as React from "react";
import {
  X, Calendar, Clock, Flag, Hash, Palette, Trash2, Play, Plus, Repeat,
  Target, ListTree, Timer as TimerIcon, CheckSquare, GripVertical, Inbox,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore, subtasksOf, uid } from "@/lib/store";
import {
  formatDuration, formatTime, friendlyDate, parseTime, todayISO,
} from "@/lib/date";
import { PRIORITY_LABELS, type ChecklistItem, type Recurrence, type Task, type Tint } from "@/lib/types";
import {
  Sheet, Popover, MenuItem, MenuSeparator, MenuLabel, TintPicker, ConfirmDialog,
} from "@/components/ui/overlays";
import {
  AutoTextarea, Badge, Button, Checkbox, IconButton, Input, Progress, Divider,
} from "@/components/ui/primitives";
import { MiniCalendar } from "@/components/ui/mini-calendar";
import { InlineComposer } from "./task-list";

const PRIORITY_CLASS = ["text-ink-3", "text-ink-2", "text-warn", "text-danger"];

function Field({
  icon: Icon, label, children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2.5 py-1">
      <div className="flex w-[86px] shrink-0 items-center gap-1.5 pt-1.5 text-[12px] text-ink-3">
        <Icon className="size-3.5" />
        {label}
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function TaskInspector() {
  const inspectorTaskId = useStore((s) => s.inspectorTaskId);
  const openInspector = useStore((s) => s.openInspector);
  const tasks = useStore((s) => s.tasks);
  const goals = useStore((s) => s.goals);
  const books = useStore((s) => s.books);
  const hour12 = useStore((s) => s.hour12);
  const weekStart = useStore((s) => s.profile?.week_start ?? 1);
  const patch = useStore((s) => s.patch);
  const remove = useStore((s) => s.remove);
  const startTimer = useStore((s) => s.startTimer);
  const createSeries = useStore((s) => s.createSeries);
  const deleteSeries = useStore((s) => s.deleteSeries);
  const toggleTask = useStore((s) => s.toggleTask);
  const toast = useStore((s) => s.toast);

  const task = tasks.find((t) => t.id === inspectorTaskId) ?? null;
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [tagDraft, setTagDraft] = React.useState("");

  const close = () => openInspector(null);
  const subtasks = task ? subtasksOf(tasks, task.id) : [];
  const goal = task?.goal_id ? goals.find((g) => g.id === task.goal_id) : null;
  const book = task?.book_id ? books.find((b) => b.id === task.book_id) : null;
  const checklistDone = task?.checklist.filter((c) => c.done).length ?? 0;

  if (!task) return null;

  const set = (changes: Partial<Task>) => patch("tasks", task!.id, changes);

  function setChecklist(next: ChecklistItem[]) {
    set({ checklist: next });
  }

  function setRecurrence(rec: Recurrence | null) {
    if (!rec) {
      if (task!.series_id) deleteSeries(task!.series_id, task!.date ?? todayISO());
      set({ recurrence: null, series_id: null });
      return;
    }
    const made = createSeries(
      {
        title: task!.title, notes: task!.notes, kind: task!.kind, priority: task!.priority,
        color: task!.color, tags: task!.tags, start_min: task!.start_min, end_min: task!.end_min,
        all_day: task!.all_day, duration_min: task!.duration_min, goal_id: task!.goal_id,
        date: task!.date ?? todayISO(),
      },
      rec,
    );
    remove("tasks", task!.id);
    toast({ title: "Repeating task created", description: `${made.length} occurrences scheduled.`, tone: "success" });
    openInspector(made[0]?.id ?? null);
  }

  return (
    <>
      <Sheet open onClose={close} width={420}>
        {/* header */}
        <div className="flex items-center gap-2 border-b border-line px-3 py-2.5">
          <Checkbox
            checked={task.status === "done"}
            tint={task.color}
            onChange={() => toggleTask(task.id)}
          />
          <span className="flex-1 text-[12px] text-ink-3">
            {task.date ? friendlyDate(task.date) : "Inbox"}
          </span>
          <IconButton
            label="Start focus timer"
            size="sm"
            onClick={() => { startTimer({ taskId: task.id, label: task.title, mode: "pomodoro" }); toast({ title: "Focus started" }); }}
          >
            <Play />
          </IconButton>
          <IconButton label="Delete task" size="sm" tone="danger" onClick={() => setConfirmDelete(true)}>
            <Trash2 />
          </IconButton>
          <IconButton label="Close" size="sm" onClick={close}><X /></IconButton>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-3">
          {/* title */}
          <AutoTextarea
            value={task.title}
            onChange={(v) => set({ title: v })}
            placeholder="Untitled"
            className={cn(
              "px-1 text-[19px] font-semibold leading-snug tracking-[-0.01em] text-ink",
              task.status === "done" && "text-ink-3 line-through",
            )}
          />

          <div className="mt-3 space-y-0.5">
            {/* date */}
            <Field icon={Calendar} label="Date">
              <div className="flex flex-wrap items-center gap-1">
                <Popover
                  className="w-[248px] p-2"
                  trigger={
                    <button className="h-7 rounded-md px-2 text-left text-[13px] text-ink hover:bg-hover cursor-pointer transition-colors">
                      {task.date ? friendlyDate(task.date) : <span className="text-ink-4">Add date</span>}
                    </button>
                  }
                >
                  {(close2) => (
                    <MiniCalendar
                      value={task.date ?? todayISO()}
                      weekStart={weekStart}
                      onChange={(iso) => { set({ date: iso }); close2(); }}
                      footer={
                        <div className="flex gap-1">
                          <Button size="xs" className="flex-1" onClick={() => { set({ date: todayISO() }); close2(); }}>
                            Today
                          </Button>
                          <Button size="xs" className="flex-1" onClick={() => { set({ date: null }); close2(); }}>
                            <Inbox className="size-3" /> Inbox
                          </Button>
                        </div>
                      }
                    />
                  )}
                </Popover>
                {task.date && (
                  <IconButton label="Clear date" size="sm" onClick={() => set({ date: null })}>
                    <X />
                  </IconButton>
                )}
              </div>
            </Field>

            {/* time */}
            <Field icon={Clock} label="Time">
              <div className="flex items-center gap-1.5">
                <Input
                  defaultValue={task.start_min != null ? formatTime(task.start_min, false) : ""}
                  placeholder="—"
                  onBlur={(e) => {
                    const min = parseTime(e.target.value);
                    set({ start_min: min, all_day: min == null });
                  }}
                  className="h-7 w-[74px] text-center tnum"
                />
                <span className="text-ink-4">–</span>
                <Input
                  defaultValue={task.end_min != null ? formatTime(task.end_min, false) : ""}
                  placeholder="—"
                  onBlur={(e) => set({ end_min: parseTime(e.target.value) })}
                  className="h-7 w-[74px] text-center tnum"
                />
                {task.start_min != null && (
                  <IconButton label="Clear time" size="sm" onClick={() => set({ start_min: null, end_min: null, all_day: true })}>
                    <X />
                  </IconButton>
                )}
              </div>
            </Field>

            {/* estimate */}
            <Field icon={TimerIcon} label="Estimate">
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={0}
                  step={5}
                  defaultValue={task.duration_min ?? ""}
                  placeholder="—"
                  onBlur={(e) => set({ duration_min: e.target.value ? Number(e.target.value) : null })}
                  className="h-7 w-[74px] text-center tnum"
                />
                <span className="text-[12px] text-ink-3">minutes</span>
                {task.actual_min > 0 && (
                  <span className="ml-auto text-[12px] text-success tnum">
                    {formatDuration(task.actual_min)} spent
                  </span>
                )}
              </div>
              {task.duration_min && task.actual_min > 0 && (
                <Progress
                  value={task.actual_min}
                  max={task.duration_min}
                  className="mt-1.5"
                  tint={task.actual_min > task.duration_min ? "red" : "emerald"}
                />
              )}
            </Field>

            {/* priority */}
            <Field icon={Flag} label="Priority">
              <div className="flex gap-1">
                {PRIORITY_LABELS.map((label, i) => (
                  <button
                    key={label}
                    onClick={() => set({ priority: i })}
                    className={cn(
                      "h-7 rounded-md px-2 text-[12.5px] font-medium cursor-pointer transition-colors",
                      task.priority === i ? "bg-hover text-ink" : "text-ink-4 hover:bg-hover hover:text-ink-2",
                      task.priority === i && PRIORITY_CLASS[i],
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </Field>

            {/* colour */}
            <Field icon={Palette} label="Colour">
              <Popover
                className="w-[210px]"
                trigger={
                  <button
                    className={cn(
                      "flex h-7 items-center gap-2 rounded-md px-2 text-[13px] hover:bg-hover cursor-pointer transition-colors",
                      task.color && `tint-${task.color}`,
                    )}
                  >
                    <span
                      className="size-3.5 rounded-full border border-line"
                      style={{ background: task.color ? "var(--tint)" : "transparent" }}
                    />
                    <span className="text-ink">{task.color ?? "None"}</span>
                  </button>
                }
              >
                <TintPicker value={task.color} allowNone onChange={(t) => set({ color: t as Tint | null })} />
              </Popover>
            </Field>

            {/* tags */}
            <Field icon={Hash} label="Tags">
              <div className="flex flex-wrap items-center gap-1">
                {task.tags.map((tag) => (
                  <Badge
                    key={tag}
                    tint="slate"
                    onClick={() => set({ tags: task.tags.filter((t) => t !== tag) })}
                  >
                    {tag} ×
                  </Badge>
                ))}
                <input
                  value={tagDraft}
                  onChange={(e) => setTagDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && tagDraft.trim()) {
                      e.preventDefault();
                      const t = tagDraft.trim().toLowerCase().replace(/^#/, "");
                      if (!task.tags.includes(t)) set({ tags: [...task.tags, t] });
                      setTagDraft("");
                    }
                  }}
                  placeholder="Add tag"
                  className="h-6 w-[88px] bg-transparent text-[12.5px] text-ink outline-none placeholder:text-ink-4"
                />
              </div>
            </Field>

            {/* repeat */}
            <Field icon={Repeat} label="Repeat">
              <Popover
                className="w-[190px]"
                trigger={
                  <button className="h-7 rounded-md px-2 text-[13px] text-ink hover:bg-hover cursor-pointer transition-colors">
                    {task.recurrence
                      ? `Every ${task.recurrence.interval > 1 ? `${task.recurrence.interval} ` : ""}${task.recurrence.freq.replace("ly", "")}`
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
                    <MenuItem onClick={() => { setRecurrence({ freq: "weekly", interval: 1, weekdays: [task.date ? new Date(task.date).getDay() : 1], count: 26 }); close2(); }}>
                      Every week
                    </MenuItem>
                    <MenuItem onClick={() => { setRecurrence({ freq: "monthly", interval: 1, count: 12 }); close2(); }}>
                      Every month
                    </MenuItem>
                    {task.recurrence && (
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
            </Field>

            {/* goal */}
            <Field icon={Target} label="Goal">
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
                        checked={g.id === task.goal_id}
                        onClick={() => { set({ goal_id: g.id }); close2(); }}
                      >
                        {g.title}
                      </MenuItem>
                    ))}
                  </>
                )}
              </Popover>
            </Field>
          </div>

          <Divider className="my-3" />

          {/* notes */}
          <AutoTextarea
            value={task.notes ?? ""}
            onChange={(v) => set({ notes: v })}
            placeholder="Notes…"
            minRows={2}
            className="px-1 text-[13.5px] text-ink-2"
          />

          <Divider className="my-3" />

          {/* checklist */}
          <div>
            <div className="mb-1.5 flex items-center gap-2">
              <CheckSquare className="size-3.5 text-ink-3" />
              <span className="text-[12px] font-medium text-ink-2">Checklist</span>
              {task.checklist.length > 0 && (
                <span className="text-[11.5px] text-ink-4 tnum">
                  {checklistDone}/{task.checklist.length}
                </span>
              )}
            </div>
            {task.checklist.length > 0 && (
              <Progress
                value={checklistDone}
                max={task.checklist.length}
                className="mb-2"
                height={3}
              />
            )}
            <div className="space-y-0.5">
              {task.checklist.map((item, i) => (
                <div key={item.id} className="group/ci flex items-center gap-2 rounded-md px-1 py-0.5 hover:bg-hover">
                  <GripVertical className="size-3 shrink-0 text-ink-4 opacity-0 group-hover/ci:opacity-100" />
                  <Checkbox
                    size="sm"
                    checked={item.done}
                    onChange={(next) =>
                      setChecklist(task.checklist.map((c) => (c.id === item.id ? { ...c, done: next } : c)))
                    }
                  />
                  <input
                    value={item.text}
                    onChange={(e) =>
                      setChecklist(task.checklist.map((c) => (c.id === item.id ? { ...c, text: e.target.value } : c)))
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        const next = [...task.checklist];
                        next.splice(i + 1, 0, { id: uid(), text: "", done: false });
                        setChecklist(next);
                      }
                      if (e.key === "Backspace" && !item.text) {
                        e.preventDefault();
                        setChecklist(task.checklist.filter((c) => c.id !== item.id));
                      }
                    }}
                    className={cn(
                      "min-w-0 flex-1 bg-transparent text-[13px] outline-none",
                      item.done ? "text-ink-4 line-through" : "text-ink",
                    )}
                  />
                  <IconButton
                    label="Remove item"
                    size="sm"
                    className="opacity-0 group-hover/ci:opacity-100"
                    onClick={() => setChecklist(task.checklist.filter((c) => c.id !== item.id))}
                  >
                    <X />
                  </IconButton>
                </div>
              ))}
            </div>
            <button
              onClick={() => setChecklist([...task.checklist, { id: uid(), text: "", done: false }])}
              className="mt-1 flex items-center gap-1.5 rounded-md px-1 py-1 text-[12.5px] text-ink-4 hover:bg-hover hover:text-ink-3 cursor-pointer transition-colors"
            >
              <Plus className="size-3.5" /> Add item
            </button>
          </div>

          <Divider className="my-3" />

          {/* subtasks */}
          <div>
            <div className="mb-1.5 flex items-center gap-2">
              <ListTree className="size-3.5 text-ink-3" />
              <span className="text-[12px] font-medium text-ink-2">Subtasks</span>
              {subtasks.length > 0 && (
                <span className="text-[11.5px] text-ink-4 tnum">
                  {subtasks.filter((s) => s.status === "done").length}/{subtasks.length}
                </span>
              )}
            </div>
            <div className="space-y-0.5">
              {subtasks.map((sub) => (
                <div key={sub.id} className="group/st flex items-center gap-2 rounded-md px-1 py-0.5 hover:bg-hover">
                  <Checkbox size="sm" checked={sub.status === "done"} onChange={() => toggleTask(sub.id)} />
                  <input
                    value={sub.title}
                    onChange={(e) => patch("tasks", sub.id, { title: e.target.value })}
                    className={cn(
                      "min-w-0 flex-1 bg-transparent text-[13px] outline-none",
                      sub.status === "done" ? "text-ink-4 line-through" : "text-ink",
                    )}
                  />
                  <IconButton
                    label="Delete subtask"
                    size="sm"
                    className="opacity-0 group-hover/st:opacity-100"
                    onClick={() => remove("tasks", sub.id)}
                  >
                    <X />
                  </IconButton>
                </div>
              ))}
            </div>
            <InlineComposer
              date={task.date}
              parentId={task.id}
              placeholder="Add subtask"
              className="mt-0.5"
            />
          </div>

          {book && (
            <>
              <Divider className="my-3" />
              <div className="rounded-lg border border-line p-2.5">
                <p className="text-[12px] font-medium text-ink">{book.title}</p>
                <p className="mt-0.5 text-[11.5px] text-ink-3 tnum">
                  Pages {task.page_from}–{task.page_to} · {book.current_page}/{book.total_pages} read
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
        onConfirm={() => { remove("tasks", task.id); close(); }}
        title="Delete this task?"
        description={task.series_id ? "Only this occurrence is deleted." : "This cannot be undone."}
      />
    </>
  );
}
