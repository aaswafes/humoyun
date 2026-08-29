import { toISO } from "@/lib/date";
import type { Task } from "@/lib/types";

// =========================================================
// What the archive knows about itself. The Done view draws it and the control
// row prunes it, so the two must agree on what "completed", "matching" and
// "stale" mean — they agree here.
// =========================================================

/** How far back the archive keeps completed tasks before offering to prune. */
export const KEEP_DAYS = 30;

/** The day a task was actually ticked off — falling back to the day it was scheduled for. */
export function completedOn(task: Task): string | null {
  if (task.completed_at) return toISO(new Date(task.completed_at));
  return task.date;
}

/** Every finished top-level task, newest completion first. */
export function doneTasks(tasks: Task[]): Task[] {
  return tasks
    .filter((t) => t.status === "done" && !t.parent_id)
    .sort((a, b) => (completedOn(b) ?? "").localeCompare(completedOn(a) ?? ""));
}

export function matchesQuery(task: Task, needle: string): boolean {
  if (!needle) return true;
  return (
    task.title.toLowerCase().includes(needle) ||
    (task.notes ?? "").toLowerCase().includes(needle) ||
    task.tags.some((tag) => tag.toLowerCase().includes(needle))
  );
}

/**
 * Completed tasks old enough to prune. A done parent still holding open
 * children is skipped — deleting it would orphan them.
 */
export function staleTasks(tasks: Task[], cutoff: string): Task[] {
  const holdingOpenChildren = new Set<string>();
  tasks.forEach((t) => {
    if (t.parent_id && t.status !== "done") holdingOpenChildren.add(t.parent_id);
  });
  return tasks.filter((t) => {
    if (t.status !== "done" || holdingOpenChildren.has(t.id)) return false;
    const iso = completedOn(t);
    return !!iso && iso < cutoff;
  });
}
