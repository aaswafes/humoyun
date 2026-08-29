"use client";

import * as React from "react";
import { CheckCircle2, RotateCcw, Search } from "lucide-react";
import { useStore } from "@/lib/store";
import {
  addDays, endOfWeek, formatDate, startOfWeek, todayISO, weekNumber, yearOf,
} from "@/lib/date";
import type { Task } from "@/lib/types";
import { Button, EmptyState } from "@/components/ui/primitives";
import { VisuallyHidden } from "@/components/ui/form";
import {
  useTriage, useRegisterRows, useRegisterRowDrop, useRegisterSummary,
} from "./triage-context";
import { useTriageActions } from "./actions";
import { TriageRow } from "./triage-dnd";
import { CollapsibleHeader } from "./group-header";
import { Fold } from "./fold";
import { completedOn, doneTasks, matchesQuery } from "./archive";

const PAGE = 120;
const SPARK_WEEKS = 8;

function weekLabel(key: string, weekStart: number, today: string): string {
  if (key === "none") return "No completion date";
  const thisWeek = startOfWeek(today, weekStart);
  if (key === thisWeek) return "This week";
  if (key === addDays(thisWeek, -7)) return "Last week";
  const showYear = yearOf(key) !== yearOf(today);
  return `${formatDate(key, { weekday: false })} – ${formatDate(endOfWeek(key, weekStart), { weekday: false, year: showYear })}`;
}

/** One stat, on spacing alone — the four of them used to be four bordered cards. */
function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="min-w-0 flex-1">
      <p className="display-serif text-[22px] leading-none text-ink tnum">{value}</p>
      <p className="mt-1.5 text-[12px] text-ink-2">{label}</p>
      {sub && <p className="mt-0.5 text-[11.5px] leading-snug text-ink-4">{sub}</p>}
    </div>
  );
}

export function DoneView({ onSeeUpcoming }: { onSeeUpcoming: () => void }) {
  const tasks = useStore((s) => s.tasks);
  const weekStart = useStore((s) => s.profile?.week_start ?? 1);
  const { filters, patchFilters } = useTriage();
  const actions = useTriageActions();

  const [limit, setLimit] = React.useState(PAGE);
  const [closed, setClosed] = React.useState<ReadonlySet<string>>(() => new Set<string>());

  const today = todayISO();
  const thisWeek = startOfWeek(today, weekStart);
  const q = filters.q;

  // A fresh search starts at the first page again. Adjusting state during
  // render beats an effect that would paint the wrong page first.
  const [qAnchor, setQAnchor] = React.useState(q);
  if (qAnchor !== q) { setQAnchor(q); setLimit(PAGE); }

  const all = React.useMemo(() => doneTasks(tasks), [tasks]);

  const matched = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return all;
    return all.filter((t) => matchesQuery(t, needle));
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

  // The header says how many are archived; this only speaks when a search has
  // narrowed that down to something else.
  useRegisterSummary(q.trim() ? `${matched.length} found` : "");

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
    <div className="space-y-8">
      <Fold
        storageKey="doneStatsOpen"
        label="Progress"
        summary={`${stats.current} this week · ${stats.streak}-day streak · ${all.length} all time`}
      >
        <div className="flex flex-wrap gap-x-6 gap-y-5">
          <Stat
            label="This week"
            value={stats.current}
            sub={
              delta === 0
                ? "Level with last week"
                : `${delta > 0 ? "+" : ""}${delta} vs last week (${stats.previous})`
            }
          />
          <Stat
            label="Streak"
            value={stats.streak}
            sub={stats.streak === 1 ? "day with something finished" : "days in a row with a win"}
          />
          <Stat
            label="Weekly average"
            value={stats.avg}
            sub={`over the last ${SPARK_WEEKS - 1} finished weeks`}
          />
          <Stat
            label="All time"
            value={all.length}
            sub={stats.bestDay ? `Best day ${formatDate(stats.bestDay.iso, { weekday: false })} · ${stats.bestDay.count}` : undefined}
          />
        </div>

        <div className="mt-6">
          <div className="mb-1.5 flex items-baseline gap-2">
            <p className="text-[12px] text-ink-2">Last {SPARK_WEEKS} weeks</p>
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
      </Fold>

      {matched.length === 0 ? (
        <EmptyState
          icon={Search}
          title="Nothing in the archive matches"
          description="Try a shorter word, or clear the search to see every finished task."
          action={
            <Button variant="secondary" size="sm" onClick={() => patchFilters({ q: "" })}>
              Clear search
            </Button>
          }
        />
      ) : (
        <div>
          {groups.map((group) => {
            const open = openState(group.key);
            const weekDone = group.items.length;
            return (
              <section key={group.key} aria-label={`${group.label}, ${weekDone} completed`} className="mb-6">
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

          {remaining > 0 && (
            <div className="mt-4 flex justify-center">
              <Button variant="secondary" size="sm" onClick={() => setLimit((l) => l + PAGE)}>
                Show {Math.min(PAGE, remaining)} more
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
