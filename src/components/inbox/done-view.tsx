"use client";

import * as React from "react";
import { CheckCircle2, Trash2 } from "lucide-react";
import { useStore } from "@/lib/store";
import { addDays, endOfWeek, formatDate, startOfWeek, toISO, todayISO, yearOf } from "@/lib/date";
import type { Task } from "@/lib/types";
import { Button, EmptyState } from "@/components/ui/primitives";
import { ConfirmDialog } from "@/components/ui/overlays";
import { SelectableRow } from "./selectable-row";
import { LabelHeader } from "./group-header";
import { useSelectionHotkeys } from "./selection";

const PAGE = 120;
const KEEP_DAYS = 30;

/** The day a task was actually ticked off — falling back to the day it was scheduled for. */
function completedOn(task: Task): string | null {
  if (task.completed_at) return toISO(new Date(task.completed_at));
  return task.date;
}

function weekLabel(key: string, weekStart: number, today: string): string {
  if (key === "none") return "No completion date";
  const thisWeek = startOfWeek(today, weekStart);
  if (key === thisWeek) return "This week";
  if (key === addDays(thisWeek, -7)) return "Last week";
  const showYear = yearOf(key) !== yearOf(today);
  return `${formatDate(key, { weekday: false })} – ${formatDate(endOfWeek(key, weekStart), { weekday: false, year: showYear })}`;
}

export function DoneView({ onSeeUpcoming }: { onSeeUpcoming: () => void }) {
  const tasks = useStore((s) => s.tasks);
  const remove = useStore((s) => s.remove);
  const toast = useStore((s) => s.toast);
  const weekStart = useStore((s) => s.profile?.week_start ?? 1);

  const [limit, setLimit] = React.useState(PAGE);
  const [confirming, setConfirming] = React.useState(false);

  const today = todayISO();
  const cutoff = addDays(today, -KEEP_DAYS);

  const sorted = React.useMemo(
    () =>
      tasks
        .filter((t) => t.status === "done" && !t.parent_id)
        .sort((a, b) => (completedOn(b) ?? "").localeCompare(completedOn(a) ?? "")),
    [tasks],
  );

  const visible = React.useMemo(() => sorted.slice(0, limit), [sorted, limit]);
  const order = React.useMemo(() => visible.map((t) => t.id), [visible]);
  useSelectionHotkeys();

  // The list is already sorted by completion, so groups fall out contiguously.
  const groups = React.useMemo(() => {
    const out: { key: string; label: string; items: Task[] }[] = [];
    visible.forEach((task) => {
      const iso = completedOn(task);
      const key = iso ? startOfWeek(iso, weekStart) : "none";
      const last = out[out.length - 1];
      if (last && last.key === key) last.items.push(task);
      else out.push({ key, label: weekLabel(key, weekStart, today), items: [task] });
    });
    return out;
  }, [visible, weekStart, today]);

  // Deleting a done parent that still has open children would orphan them, so skip those.
  const stale = React.useMemo(() => {
    const holdingOpenChildren = new Set<string>();
    tasks.forEach((t) => {
      if (t.parent_id && t.status !== "done") holdingOpenChildren.add(t.parent_id);
    });
    return tasks.filter((t) => {
      if (t.status !== "done" || holdingOpenChildren.has(t.id)) return false;
      const iso = completedOn(t);
      return !!iso && iso < cutoff;
    });
  }, [tasks, cutoff]);

  function clearStale() {
    const count = stale.length;
    stale.forEach((t) => remove("tasks", t.id));
    toast({ title: `Cleared ${count} completed ${count === 1 ? "task" : "tasks"}`, tone: "success" });
  }

  if (!sorted.length) {
    return (
      <EmptyState
        icon={CheckCircle2}
        title="Nothing finished yet"
        description="Completed tasks collect here, grouped by the week you ticked them off, so a month of work reads back at a glance."
        action={<Button variant="secondary" size="sm" onClick={onSeeUpcoming}>Find something to finish</Button>}
      />
    );
  }

  const remaining = sorted.length - visible.length;

  return (
    <div>
      <div className="mb-2 flex items-center gap-3 px-2">
        <p className="text-[12.5px] text-ink-3">
          <span className="tnum text-ink-2">{sorted.length}</span> completed
        </p>
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="xs"
          disabled={stale.length === 0}
          onClick={() => setConfirming(true)}
          title={
            stale.length
              ? `Delete ${stale.length} completed before ${formatDate(cutoff, { weekday: false })}`
              : `Nothing completed before ${formatDate(cutoff, { weekday: false })}`
          }
        >
          <Trash2 className="size-3.5" />
          Clear older than {KEEP_DAYS} days
          {stale.length > 0 && <span className="tnum text-ink-4">{stale.length}</span>}
        </Button>
      </div>

      {groups.map((group) => (
        <section key={group.key} className="mb-5">
          <LabelHeader title={group.label} count={group.items.length} />
          {group.items.map((task) => (
            <SelectableRow key={task.id} task={task} order={order} showDate />
          ))}
        </section>
      ))}

      {remaining > 0 && (
        <div className="mt-3 flex justify-center">
          <Button variant="secondary" size="sm" onClick={() => setLimit((l) => l + PAGE)}>
            Show {Math.min(PAGE, remaining)} more
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={clearStale}
        title={`Delete ${stale.length} completed ${stale.length === 1 ? "task" : "tasks"}?`}
        description={`Everything ticked off before ${formatDate(cutoff, { weekday: false, year: true })} will be removed permanently. Tasks that still have unfinished subtasks are kept.`}
        confirmLabel="Delete"
      />
    </div>
  );
}
