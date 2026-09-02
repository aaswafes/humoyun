"use client";

import * as React from "react";
import { CalendarOff, Plus, Target, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import { parseTask } from "@/lib/parse";
import { endOfMonth, formatDate, friendlyDate, todayISO, yearOf } from "@/lib/date";
import { horizonForDate, timeframeOf, TIMEFRAME_LABELS } from "@/lib/timeframe";
import { Button, IconButton, Input } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/overlays";
import { MiniCalendar } from "@/components/ui/mini-calendar";
import { useGoalActions } from "./use-goal-actions";

// =========================================================
// Starting a goal.
//
// The old button made the goal first and asked afterwards: one click and you
// owned an untitled ten-year Life goal with three empty prose boxes under it.
// Nothing about that came from you.
//
// So the order is inverted. You say what you are aiming at, when you want it
// done, and what the first moves are — and the horizon is *derived* from the
// date rather than picked from a menu, because the date is the thing you
// actually know. Nothing is written until you press the button.
// =========================================================

interface Draft {
  /** what parseTask made of the line, so "ship it friday" keeps its Friday */
  title: string;
  date: string | null;
  start_min: number | null;
  end_min: number | null;
  duration_min: number | null;
  tags: string[];
  priority: number;
}

/** Quick answers to "by when", so the calendar is for the awkward ones only. */
function presets(today: string): { label: string; date: string }[] {
  const year = yearOf(today);
  const month = new Date(`${today}T12:00:00`).getMonth();
  const quarterEnd = endOfMonth(`${year}-${String(Math.floor(month / 3) * 3 + 3).padStart(2, "0")}-01`);
  return [
    { label: "End of this month", date: endOfMonth(today) },
    { label: "End of the quarter", date: quarterEnd },
    { label: "End of the year", date: `${year}-12-31` },
    { label: "End of next year", date: `${year + 1}-12-31` },
  ];
}

export function NewGoalDialog({
  open, initialDate, onClose, onCreated,
}: {
  open: boolean;
  /** the board's "+" already knows which shelf you clicked */
  initialDate?: string | null;
  onClose: () => void;
  onCreated: (goalId: string) => void;
}) {
  const weekStart = useStore((s) => s.profile?.week_start ?? 1);
  const addTask = useStore((s) => s.addTask);
  const patch = useStore((s) => s.patch);
  const batchUndo = useStore((s) => s.batchUndo);
  const toast = useStore((s) => s.toast);
  const { createGoal } = useGoalActions();

  const today = todayISO();
  const [title, setTitle] = React.useState("");
  const [date, setDate] = React.useState<string | null>(initialDate ?? null);
  const [tasks, setTasks] = React.useState<Draft[]>([]);
  const [taskDraft, setTaskDraft] = React.useState("");
  const titleRef = React.useRef<HTMLInputElement>(null);

  // A fresh dialog every time it opens — a half-written goal from last time is
  // not a starting point, it is a surprise.
  const [wasOpen, setWasOpen] = React.useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (open) {
      setTitle("");
      setDate(initialDate ?? null);
      setTasks([]);
      setTaskDraft("");
    }
  }

  React.useEffect(() => {
    if (open) requestAnimationFrame(() => titleRef.current?.focus());
  }, [open]);

  const frame = timeframeOf(date, today);
  const ready = title.trim().length > 0;

  function addDraft() {
    const raw = taskDraft.trim();
    if (!raw) return;
    const parsed = parseTask(raw, weekStart);
    if (!parsed.title.trim()) return;
    setTasks((list) => [...list, { ...parsed, title: parsed.title.trim() }]);
    setTaskDraft("");
  }

  function create() {
    if (!ready) return;
    const name = title.trim();

    const goal = batchUndo("Add goal", () => {
      // The horizon is the date's consequence, never a separate answer.
      const made = createGoal({
        horizon: horizonForDate(date, today),
        title: name,
        anchor: date ?? undefined,
      });
      // createGoal sizes the goal to its whole period; the day you picked is
      // the day you meant, so it wins.
      if (date) patch("goals", made.id, { end_date: date });

      tasks.forEach((t, i) => {
        addTask({
          title: t.title,
          date: t.date,
          start_min: t.start_min,
          end_min: t.end_min,
          duration_min: t.duration_min,
          all_day: t.start_min == null,
          tags: t.tags,
          priority: t.priority,
          goal_id: made.id,
          color: made.color,
          order_index: i,
        });
      });
      return made;
    });

    toast({
      title: `Goal added · ${TIMEFRAME_LABELS[frame]}`,
      description: tasks.length
        ? `${name} · ${tasks.length} ${tasks.length === 1 ? "task" : "tasks"}`
        : name,
      tone: "success",
    });
    onCreated(goal.id);
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="New goal" width={460}>
      <div className="max-h-[70vh] overflow-y-auto px-4 py-4">
        {/* ---- what ---- */}
        <label htmlFor="new-goal-title" className="text-[12px] font-medium text-ink-2">
          What are you aiming at?
        </label>
        <Input
          id="new-goal-title"
          ref={titleRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && ready) { e.preventDefault(); create(); } }}
          placeholder="Read 24 books"
          className="mt-1"
        />

        {/* ---- when ---- */}
        <div className="mt-5">
          <div className="flex items-baseline gap-2">
            <span className="text-[12px] font-medium text-ink-2">By when?</span>
            {/* The one thing the old form asked you to choose is now the one
                thing it tells you. */}
            <span className="text-[11.5px] text-ink-4">
              {date
                ? <>Files under <span className="font-medium text-ink-3">{TIMEFRAME_LABELS[frame]}</span></>
                : "Optional — without a date it waits in Someday"}
            </span>
          </div>

          <div className="mt-2 flex flex-wrap gap-1.5">
            {presets(today).map((p) => (
              <button
                key={p.label}
                type="button"
                aria-pressed={date === p.date}
                onClick={() => setDate(p.date)}
                className={cn(
                  "h-7 rounded-full border px-2.5 text-[12px] cursor-pointer transition-colors",
                  date === p.date
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-line text-ink-2 hover:bg-hover",
                )}
              >
                {p.label}
              </button>
            ))}
            {date && (
              <Button size="xs" variant="ghost" onClick={() => setDate(null)}>
                <CalendarOff className="size-3.5" />
                No date
              </Button>
            )}
          </div>

          <div className="mt-2.5 rounded-lg border border-line p-2">
            <MiniCalendar
              value={date ?? today}
              onChange={setDate}
              weekStart={weekStart}
              markers={date ? new Set([date]) : undefined}
            />
          </div>

          {date && (
            <p className="mt-1.5 text-[11.5px] text-ink-4 tnum">
              Due {formatDate(date, { year: true })} · {friendlyDate(date)}
            </p>
          )}
        </div>

        {/* ---- the first moves ---- */}
        <div className="mt-5">
          <div className="flex items-baseline gap-2">
            <span className="text-[12px] font-medium text-ink-2">First tasks</span>
            <span className="text-[11.5px] text-ink-4">
              Optional — “read 30 pages friday 7am” keeps its Friday
            </span>
          </div>

          {tasks.length > 0 && (
            <ul className="mt-2 space-y-px">
              {tasks.map((t, i) => (
                <li
                  key={`${t.title}-${i}`}
                  className="group/draft flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-hover"
                >
                  <span className="size-1.5 shrink-0 rounded-full bg-ink-4" aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{t.title}</span>
                  {t.date && (
                    <span className="shrink-0 text-[11.5px] text-ink-4 tnum">{friendlyDate(t.date)}</span>
                  )}
                  <IconButton
                    size="sm"
                    label={`Remove ${t.title}`}
                    className="opacity-0 transition-opacity focus-visible:opacity-100 group-hover/draft:opacity-100"
                    onClick={() => setTasks((list) => list.filter((_, j) => j !== i))}
                  >
                    <X />
                  </IconButton>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-2 flex items-center gap-1.5">
            <Input
              value={taskDraft}
              onChange={(e) => setTaskDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); addDraft(); }
              }}
              aria-label="Add a task to this goal"
              placeholder="Add a task, press Enter"
              className="h-8 flex-1"
            />
            <IconButton label="Add task" disabled={!taskDraft.trim()} onClick={addDraft}>
              <Plus />
            </IconButton>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-line px-4 py-3">
        <Button size="sm" onClick={onClose}>Cancel</Button>
        <Button size="sm" variant="primary" disabled={!ready} onClick={create}>
          <Target className="size-3.5" />
          Create goal
        </Button>
      </div>
    </Modal>
  );
}
