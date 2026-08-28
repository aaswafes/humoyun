"use client";

import * as React from "react";
import { CheckCircle2, RotateCcw, Search, Trash2, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import {
  addDays, endOfWeek, formatDate, startOfWeek, toISO, todayISO, weekNumber, yearOf,
} from "@/lib/date";
import type { Task } from "@/lib/types";
import { Button, EmptyState, Input } from "@/components/ui/primitives";
import { ConfirmDialog } from "@/components/ui/overlays";
import { VisuallyHidden } from "@/components/ui/form";
import { useTriage, useRegisterRows, useRegisterRowDrop } from "./triage-context";
import { useTriageActions } from "./actions";
import { TriageRow } from "./triage-dnd";
import { CollapsibleHeader } from "./group-header";

const PAGE = 120;
const KEEP_DAYS = 30;
const SPARK_WEEKS = 8;

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

function StatTile({
  label, value, sub, tone = "default",
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: "default" | "success" | "danger";
}) {
  return (
    <div className="surface min-w-0 flex-1 px-3 py-2.5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">{label}</p>
      <p
        className={cn(
          "display-serif mt-0.5 text-[32px] leading-none tnum",
          tone === "success" ? "text-success" : tone === "danger" ? "text-danger" : "text-ink",
        )}
      >
        {value}
      </p>
      {sub && <p className="mt-1 text-[11.5px] leading-snug text-ink-3">{sub}</p>}
    </div>
  );
}

export function DoneView({ onSeeUpcoming }: { onSeeUpcoming: () => void }) {
  const tasks = useStore((s) => s.tasks);
  const remove = useStore((s) => s.remove);
  const toast = useStore((s) => s.toast);
  const weekStart = useStore((s) => s.profile?.week_start ?? 1);
  const { announce } = useTriage();
  const actions = useTriageActions();

  const [limit, setLimit] = React.useState(PAGE);
  const [confirming, setConfirming] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [closed, setClosed] = React.useState<ReadonlySet<string>>(() => new Set<string>());

  const today = todayISO();
  const cutoff = addDays(today, -KEEP_DAYS);
  const thisWeek = startOfWeek(today, weekStart);

  const all = React.useMemo(
    () =>
      tasks
        .filter((t) => t.status === "done" && !t.parent_id)
        .sort((a, b) => (completedOn(b) ?? "").localeCompare(completedOn(a) ?? "")),
    [tasks],
  );

  const matched = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return all;
    return all.filter(
      (t) =>
        t.title.toLowerCase().includes(needle) ||
        (t.notes ?? "").toLowerCase().includes(needle) ||
        t.tags.some((tag) => tag.toLowerCase().includes(needle)),
    );
  }, [all, q]);

  const visible = React.useMemo(() => matched.slice(0, limit), [matched, limit]);

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

  // Older weeks arrive folded — an archive is for scanning, not scrolling — so
  // the override set stores "!key" for forced open and "key" for forced closed.
  const openState = React.useCallback(
    (key: string) => {
      if (closed.has(`!${key}`)) return true;
      if (closed.has(key)) return false;
      return key === thisWeek || key === addDays(thisWeek, -7);
    },
    [closed, thisWeek],
  );

  const toggleWeek = React.useCallback((key: string) => {
    setClosed((prev) => {
      const next = new Set(prev);
      const open = prev.has(`!${key}`) ? true : prev.has(key) ? false : undefined;
      next.delete(key);
      next.delete(`!${key}`);
      // undefined means "still on the default", which the caller is now overriding.
      if (open === true) next.add(key);
      else if (open === false) next.add(`!${key}`);
      else if (key === thisWeek || key === addDays(thisWeek, -7)) next.add(key);
      else next.add(`!${key}`);
      return next;
    });
  }, [thisWeek]);

  const order = React.useMemo(
    () => groups.filter((g) => openState(g.key)).flatMap((g) => g.items.map((t) => t.id)),
    [groups, openState],
  );
  useRegisterRows(order);
  useRegisterRowDrop(null);

  // ---- stats ----
  const stats = React.useMemo(() => {
    const perDay = new Map<string, number>();
    all.forEach((t) => {
      const iso = completedOn(t);
      if (iso) perDay.set(iso, (perDay.get(iso) ?? 0) + 1);
    });

    const weeks: { start: string; count: number }[] = [];
    for (let i = SPARK_WEEKS - 1; i >= 0; i--) {
      const start = addDays(thisWeek, -7 * i);
      let count = 0;
      for (let d = 0; d < 7; d++) count += perDay.get(addDays(start, d)) ?? 0;
      weeks.push({ start, count });
    }

    const current = weeks[weeks.length - 1]?.count ?? 0;
    const previous = weeks[weeks.length - 2]?.count ?? 0;
    const finishedWeeks = weeks.slice(0, -1);
    const avg = finishedWeeks.length
      ? Math.round(finishedWeeks.reduce((n, w) => n + w.count, 0) / finishedWeeks.length)
      : 0;

    let streak = 0;
    let cursor = perDay.has(today) ? today : addDays(today, -1);
    while ((perDay.get(cursor) ?? 0) > 0 && streak < 3650) {
      streak++;
      cursor = addDays(cursor, -1);
    }

    let bestDay: { iso: string; count: number } | null = null;
    for (const [iso, count] of perDay) {
      if (bestDay === null || count > bestDay.count) bestDay = { iso, count };
    }

    return { weeks, current, previous, avg, streak, bestDay };
  }, [all, thisWeek, today]);

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
    announce(`Cleared ${count} completed tasks`);
  }

  if (!all.length) {
    return (
      <EmptyState
        icon={CheckCircle2}
        title="Nothing finished yet"
        description="Completed tasks collect here, grouped by the week you ticked them off, so a month of work reads back at a glance."
        action={<Button variant="secondary" size="sm" onClick={onSeeUpcoming}>Find something to finish</Button>}
      />
    );
  }

  const remaining = matched.length - visible.length;
  const delta = stats.current - stats.previous;
  const peak = Math.max(1, ...stats.weeks.map((w) => w.count));
  const sparkSummary = stats.weeks
    .map((w) => `week of ${formatDate(w.start, { weekday: false })}: ${w.count}`)
    .join("; ");

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        <StatTile
          label="This week"
          value={stats.current}
          tone={delta >= 0 ? "success" : "default"}
          sub={
            delta === 0
              ? "Level with last week"
              : `${delta > 0 ? "+" : ""}${delta} vs last week (${stats.previous})`
          }
        />
        <StatTile
          label="Streak"
          value={stats.streak}
          sub={stats.streak === 1 ? "day with something finished" : "days in a row with a win"}
        />
        <StatTile
          label="Weekly average"
          value={stats.avg}
          sub={`over the last ${SPARK_WEEKS - 1} finished weeks`}
        />
        <StatTile
          label="All time"
          value={all.length}
          sub={stats.bestDay ? `Best day: ${formatDate(stats.bestDay.iso, { weekday: false })} · ${stats.bestDay.count}` : undefined}
        />
      </div>

      <div className="surface mb-4 px-3 py-2.5">
        <div className="mb-2 flex items-baseline gap-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">
            Last {SPARK_WEEKS} weeks
          </h2>
          <span className="text-[11px] text-ink-4 tnum">peak {peak}</span>
        </div>
        <svg
          viewBox={`0 0 ${SPARK_WEEKS * 16} 44`}
          className="h-[44px] w-full"
          role="img"
          aria-label={`Tasks completed per week for the last ${SPARK_WEEKS} weeks`}
          aria-describedby="done-spark-summary"
          preserveAspectRatio="none"
        >
          {stats.weeks.map((w, i) => {
            const h = Math.max(2, Math.round((w.count / peak) * 38));
            const isNow = w.start === thisWeek;
            return (
              <rect
                key={w.start}
                x={i * 16 + 3}
                y={44 - h}
                width={10}
                height={h}
                rx={3}
                style={{ fill: isNow ? "var(--accent)" : "var(--line-strong)" }}
              >
                <title>{`Week ${weekNumber(w.start)} — ${w.count} completed`}</title>
              </rect>
            );
          })}
        </svg>
        <VisuallyHidden id="done-spark-summary">{sparkSummary}</VisuallyHidden>
      </div>

      <div className="mb-2 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1">
          <Search aria-hidden className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-ink-4" />
          <Input
            value={q}
            onChange={(e) => { setQ(e.target.value); setLimit(PAGE); }}
            placeholder="Search the archive"
            aria-label="Search completed tasks"
            className="h-7 pl-7 pr-7"
          />
          {q && (
            <button
              onClick={() => setQ("")}
              aria-label="Clear archive search"
              className="absolute right-1.5 top-1/2 grid size-5 -translate-y-1/2 place-items-center rounded-sm text-ink-4 hover:bg-hover hover:text-ink cursor-pointer transition-colors"
            >
              <X className="size-3" />
            </button>
          )}
        </div>

        <p aria-live="polite" aria-atomic="true" className="text-[12.5px] text-ink-3">
          <span className="tnum text-ink-2">{matched.length}</span>
          {q ? " found" : " completed"}
        </p>

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
          <Trash2 aria-hidden className="size-3.5" />
          Clear older than {KEEP_DAYS} days
          {stale.length > 0 && <span className="tnum text-ink-4">{stale.length}</span>}
        </Button>
      </div>

      {matched.length === 0 ? (
        <EmptyState
          icon={Search}
          title="Nothing in the archive matches"
          description="Try a shorter word, or clear the search to see every finished task."
          action={<Button variant="secondary" size="sm" onClick={() => setQ("")}>Clear search</Button>}
        />
      ) : (
        <div>
          {groups.map((group) => {
            const open = openState(group.key);
            const weekDone = group.items.length;
            return (
              <section key={group.key} aria-label={`${group.label}, ${weekDone} completed`} className="mb-4">
                <CollapsibleHeader
                  title={group.label}
                  count={weekDone}
                  open={open}
                  onToggle={() => toggleWeek(group.key)}
                  action={
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => actions.setDone(group.items.map((t) => t.id), false)}
                      title={`Reopen all ${weekDone} tasks from ${group.label.toLowerCase()}`}
                    >
                      <RotateCcw aria-hidden className="size-3.5" />
                      Restore all
                    </Button>
                  }
                />
                {open &&
                  group.items.map((task) => (
                    <TriageRow
                      key={task.id}
                      task={task}
                      order={order}
                      showDate
                      disabled
                      trailing={
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => actions.setDone([task.id], false)}
                          title={`Reopen ${task.title || "Untitled"}`}
                        >
                          <RotateCcw aria-hidden className="size-3.5" />
                          Restore
                        </Button>
                      }
                    />
                  ))}
              </section>
            );
          })}
        </div>
      )}

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
