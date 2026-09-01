"use client";

import * as React from "react";
import { CalendarPlus, Flag, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import { formatDate, friendlyDate, todayISO } from "@/lib/date";
import type { Project, Task } from "@/lib/types";
import { Button, Checkbox, IconButton, InlineInput } from "@/components/ui/primitives";
import { MiniEmpty } from "@/components/ui/form";
import { Popover } from "@/components/ui/overlays";
import { MiniCalendar } from "@/components/ui/mini-calendar";
import { useProjectActions } from "./use-project-actions";

/** Undated milestones sink to the bottom — a checkpoint without a date is a wish. */
const byDate = (a: Task, b: Task) =>
  (a.date ?? "9999").localeCompare(b.date ?? "9999") || a.created_at.localeCompare(b.created_at);

function DateChip({
  date, onChange, label,
}: {
  date: string | null;
  onChange: (iso: string | null) => void;
  label: string;
}) {
  const weekStart = useStore((s) => s.profile?.week_start ?? 1);
  const today = todayISO();
  const late = !!date && date < today;

  return (
    <Popover
      align="end"
      className="w-auto p-2"
      trigger={
        <button
          type="button"
          aria-label={date ? `${label}: ${formatDate(date)}. Change the date` : `${label}: pick a date`}
          className={cn(
            "inline-flex h-7 shrink-0 cursor-pointer items-center gap-1 rounded-md px-1.5",
            "text-[12px] tnum transition-colors hover:bg-hover",
            date ? (late ? "text-danger" : "text-ink-3") : "text-ink-4",
          )}
        >
          {date ? friendlyDate(date) : <CalendarPlus className="size-3.5" />}
        </button>
      }
    >
      {(close) => (
        <>
          <MiniCalendar
            value={date ?? today}
            onChange={(iso) => { onChange(iso); close(); }}
            weekStart={weekStart}
          />
          {date && (
            <div className="mt-1 flex justify-end">
              <Button size="xs" variant="ghost" onClick={() => { onChange(null); close(); }}>
                Clear
              </Button>
            </div>
          )}
        </>
      )}
    </Popover>
  );
}

/**
 * The dated checkpoints of a project. A milestone is a task with
 * `kind: "milestone"` — so it already shows on the calendar and in search, and
 * this panel is a view of them rather than a second store.
 */
export function ProjectMilestones({
  project, milestones,
}: {
  project: Project;
  milestones: Task[];
}) {
  const patch = useStore((s) => s.patch);
  const remove = useStore((s) => s.remove);
  const toggleTask = useStore((s) => s.toggleTask);
  const openInspector = useStore((s) => s.openInspector);
  const { addMilestone } = useProjectActions();

  const [draft, setDraft] = React.useState("");
  const [draftDate, setDraftDate] = React.useState<string | null>(null);

  const ordered = React.useMemo(() => milestones.slice().sort(byDate), [milestones]);

  function commit() {
    const title = draft.trim();
    if (!title) return;
    addMilestone(project, title, draftDate);
    setDraft("");
    setDraftDate(null);
  }

  return (
    <div>
      {ordered.length === 0 ? (
        <MiniEmpty>
          A milestone is the date something has to be true by — “design signed off”,
          “first paying user”. They show on the calendar and on the timeline.
        </MiniEmpty>
      ) : (
        <ul className="space-y-px">
          {ordered.map((task) => (
            <li
              key={task.id}
              className="group/ms flex items-center gap-2 rounded-md px-1 py-1 hover:bg-hover"
            >
              <Checkbox
                size="sm"
                checked={task.status === "done"}
                tint={task.color ?? project.color}
                label={task.status === "done" ? `Undo ${task.title}` : `Mark ${task.title} reached`}
                onChange={() => toggleTask(task.id)}
              />
              <button
                onClick={() => openInspector(task.id)}
                className={cn(
                  "min-w-0 flex-1 truncate text-left text-[13px] cursor-pointer",
                  task.status === "done" ? "text-ink-3 line-through decoration-ink-4/60" : "text-ink",
                )}
              >
                {task.title || "Milestone"}
              </button>
              <DateChip
                date={task.date}
                label={task.title || "Milestone"}
                onChange={(iso) => patch("tasks", task.id, { date: iso })}
              />
              <span className="opacity-0 transition-opacity duration-150 focus-within:opacity-100 group-hover/ms:opacity-100">
                <IconButton
                  size="sm"
                  label={`Delete ${task.title || "milestone"}`}
                  onClick={() => remove("tasks", task.id)}
                >
                  <Trash2 />
                </IconButton>
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-1.5 flex items-center gap-1.5">
        <Flag className="size-3.5 shrink-0 text-ink-4" aria-hidden />
        <InlineInput
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); commit(); }
            if (e.key === "Escape") { setDraft(""); setDraftDate(null); }
          }}
          aria-label="New milestone"
          placeholder="Add a milestone"
          className="h-7 flex-1 text-[13px] text-ink placeholder:text-ink-4"
        />
        <DateChip date={draftDate} label="New milestone" onChange={setDraftDate} />
        <IconButton size="sm" label="Add milestone" disabled={!draft.trim()} onClick={commit}>
          <Plus />
        </IconButton>
      </div>
    </div>
  );
}
