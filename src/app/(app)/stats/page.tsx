"use client";

import * as React from "react";
import { BarChart3 } from "lucide-react";
import { todayISO } from "@/lib/date";
import { prayerStreak, useStore } from "@/lib/store";
import { PageBody, PageHeader } from "@/components/shell/page-header";
import { openQuickAdd } from "@/components/shell/quick-add";
import { Button, EmptyState, Segmented } from "@/components/ui/primitives";
import { fmt } from "@/components/stats/chart-kit";
import {
  RANGE_OPTIONS, buildDayScores, buildDayStats, buildHabitSeries, buildPrayerStats,
  bucketize, doneByDate, focusByTag, focusByTask, isFocus, pagesPerWeek, perfectDays,
  previousDates, projectBooks, rangeDates, rangeLabel, sessionDate, trailingAverage,
  type RangeKey,
} from "@/components/stats/derive";
import { StatTiles, type Tile } from "@/components/stats/stat-tiles";
import { CompletionTrend } from "@/components/stats/completion-trend";
import { PlannedVsActual } from "@/components/stats/planned-vs-actual";
import { TimeBreakdown } from "@/components/stats/time-breakdown";
import { ConsistencyHeatmap } from "@/components/stats/consistency-heatmap";
import { HabitMatrix } from "@/components/stats/habit-matrix";
import { SalahPanel } from "@/components/stats/salah-panel";
import { ReadingPanel } from "@/components/stats/reading-panel";

/** Percentage change against the previous window — null when there is no baseline. */
function delta(now: number, before: number): number | null {
  if (before <= 0) return null;
  return ((now - before) / before) * 100;
}

export default function StatsPage() {
  const [range, setRange] = React.useState<RangeKey>("30d");

  const tasks = useStore((s) => s.tasks);
  const focusSessions = useStore((s) => s.focusSessions);
  const habits = useStore((s) => s.habits);
  const habitLogs = useStore((s) => s.habitLogs);
  const prayers = useStore((s) => s.prayers);
  const books = useStore((s) => s.books);
  const tags = useStore((s) => s.tags);
  const weekStart = useStore((s) => s.profile?.week_start ?? 1);

  const today = todayISO();
  const days = React.useMemo(() => rangeDates(range, today), [range, today]);
  const dateSet = React.useMemo(() => new Set(days), [days]);

  // ---- tasks & time ----
  const stats = React.useMemo(
    () => buildDayStats(days, tasks, focusSessions),
    [days, tasks, focusSessions],
  );
  const doneMap = React.useMemo(() => doneByDate(tasks), [tasks]);
  const average = React.useMemo(() => trailingAverage(days, doneMap, 7), [days, doneMap]);

  const grain: "day" | "week" = days.length > 31 ? "week" : "day";
  const buckets = React.useMemo(() => bucketize(stats, grain, weekStart), [stats, grain, weekStart]);

  const tagColors = React.useMemo(
    () => new Map(tags.map((t) => [t.name, t.color])),
    [tags],
  );
  const byTag = React.useMemo(
    () => focusByTag(focusSessions, tasks, dateSet, tagColors),
    [focusSessions, tasks, dateSet, tagColors],
  );
  const byTask = React.useMemo(
    () => focusByTask(focusSessions, tasks, dateSet),
    [focusSessions, tasks, dateSet],
  );

  // ---- consistency, habits, salah, reading ----
  const scores = React.useMemo(
    () => buildDayScores(days, tasks, habits, habitLogs, prayers),
    [days, tasks, habits, habitLogs, prayers],
  );
  const habitSeries = React.useMemo(
    () => buildHabitSeries(days, habits, habitLogs),
    [days, habits, habitLogs],
  );
  const prayerStats = React.useMemo(() => buildPrayerStats(days, prayers), [days, prayers]);
  const weeks = React.useMemo(() => pagesPerWeek(days, tasks, weekStart), [days, tasks, weekStart]);
  const projections = React.useMemo(() => projectBooks(books, tasks, days), [books, tasks, days]);

  // ---- headline tiles ----
  const previous = React.useMemo(() => previousDates(days), [days]);
  const prevStats = React.useMemo(
    () => buildDayStats(previous, tasks, focusSessions),
    [previous, tasks, focusSessions],
  );

  const tiles = React.useMemo<Tile[]>(() => {
    const done = stats.reduce((s, d) => s + d.done, 0);
    const planned = stats.reduce((s, d) => s + d.planned, 0);
    const focusMin = stats.reduce((s, d) => s + d.focusMin, 0);
    const prevDone = prevStats.reduce((s, d) => s + d.done, 0);
    const prevFocus = prevStats.reduce((s, d) => s + d.focusMin, 0);
    const sessions = focusSessions.filter((s) => isFocus(s) && dateSet.has(sessionDate(s))).length;
    const perfect = perfectDays(scores);
    const salah = prayerStreak(prayers, today);
    const topHabit = [...habitSeries].sort((a, b) => b.streak - a.streak)[0];

    return [
      {
        key: "done",
        label: "Tasks done",
        value: String(done),
        hint: planned ? `of ${planned} planned` : "nothing planned yet",
        delta: delta(done, prevDone),
      },
      {
        key: "focus",
        label: "Focus",
        value: fmt(focusMin / 60, 1),
        unit: "hours",
        hint: sessions ? `across ${sessions} session${sessions === 1 ? "" : "s"}` : "no sessions logged",
        delta: delta(focusMin, prevFocus),
      },
      {
        key: "perfect",
        label: "Perfect days",
        value: String(perfect),
        hint: "everything tracked, all closed out",
      },
      {
        key: "salah",
        label: "Salah streak",
        value: String(salah),
        unit: salah === 1 ? "day" : "days",
        hint: salah ? "all five, in a row" : "no full day yet",
      },
      {
        key: "habit",
        label: "Habit streak",
        value: String(topHabit?.streak ?? 0),
        unit: (topHabit?.streak ?? 0) === 1 ? "day" : "days",
        hint: topHabit?.streak ? topHabit.habit.name : "no habit running",
      },
    ];
  }, [stats, prevStats, focusSessions, dateSet, scores, prayers, today, habitSeries]);

  const focusTotal = stats.reduce((s, d) => s + d.focusMin, 0);
  const hasAnything =
    tasks.length + focusSessions.length + habits.length + prayers.length + books.length > 0;

  return (
    <>
      <PageHeader
        title="Stats"
        subtitle={rangeLabel(days)}
        actions={
          <Segmented
            value={range}
            onChange={setRange}
            options={RANGE_OPTIONS}
            size="sm"
          />
        }
      />

      <PageBody wide>
        {!hasAnything ? (
          <EmptyState
            className="py-24"
            icon={BarChart3}
            title="Nothing to measure yet"
            description="Stats reads everything else you do here — tasks you tick, hours you focus, habits you keep, prayers you log, pages you read. Start with one task and this page fills itself in."
            action={
              <Button variant="primary" size="sm" onClick={openQuickAdd}>
                Add your first task
              </Button>
            }
          />
        ) : (
          <div className="flex flex-col gap-4">
            <StatTiles tiles={tiles} />

            <CompletionTrend stats={stats} average={average} />
            <PlannedVsActual buckets={buckets} grain={grain} />
            <TimeBreakdown byTag={byTag} byTask={byTask} totalMinutes={focusTotal} />
            <ConsistencyHeatmap scores={scores} weekStart={weekStart} />
            <HabitMatrix series={habitSeries} days={days} />

            <div className="grid gap-4 xl:grid-cols-2">
              <SalahPanel
                stats={prayerStats}
                streak={prayerStreak(prayers, today)}
                days={days.length}
              />
              <ReadingPanel weeks={weeks} projections={projections} />
            </div>

            <p className="mt-1 px-1 text-[11.5px] leading-relaxed text-ink-4">
              Every figure here is computed from your own records across these {days.length} days.
              Nothing is estimated, smoothed or filled in for you.
            </p>
          </div>
        )}
      </PageBody>
    </>
  );
}
