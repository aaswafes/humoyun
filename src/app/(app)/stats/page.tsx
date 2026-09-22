"use client";

import * as React from "react";
import { BarChart3 } from "lucide-react";
import { todayISO } from "@/lib/date";
import { prayerStreak, useStore } from "@/lib/store";
import { PRAYER_LABELS } from "@/lib/types";
import { PageBody, PageHeader } from "@/components/shell/page-header";
import { openQuickAdd } from "@/components/shell/quick-add";
import { Button, EmptyState, Segmented } from "@/components/ui/primitives";
import { fmt, pctOf } from "@/components/stats/chart-kit";
import {
  RANGE_OPTIONS, applyTagFilter, bucketEstimates, buildDayScores, buildDayStats,
  buildHabitSeries, buildHourStats, buildInsights, buildPrayerStats, buildTagDrift,
  buildWeekdayStats, bucketize, changePct, doneByDate, estimateSamples, focusByTag,
  focusByTask, isFocus, onTime, pagesPerWeek, perfectDays, previousDates, projectBooks,
  rangeDates, rangeLabel, sessionDate, summariseEstimates, tagUsage, trailingAverage,
  buildGoalStats, buildShelfStats, buildWellbeing,
  type RangeKey,
} from "@/components/stats/derive";
import { csvFilename, downloadCsv, toCsv, type CsvSection } from "@/components/stats/csv";
import { StatTiles, type Tile } from "@/components/stats/stat-tiles";
import { InsightLines } from "@/components/stats/insights";
import { FilterBar } from "@/components/stats/filter-bar";
import { CompletionTrend } from "@/components/stats/completion-trend";
import { EstimateAccuracy } from "@/components/stats/estimate-accuracy";
import { PlannedVsActual } from "@/components/stats/planned-vs-actual";
import { HourPanel, WeekdayPanel } from "@/components/stats/rhythm";
import { TimeBreakdown } from "@/components/stats/time-breakdown";
import { TagDrift } from "@/components/stats/tag-drift";
import { ConsistencyHeatmap } from "@/components/stats/consistency-heatmap";
import { HabitMatrix } from "@/components/stats/habit-matrix";
import { SalahPanel } from "@/components/stats/salah-panel";
import { ReadingPanel } from "@/components/stats/reading-panel";
import { WellbeingPanel } from "@/components/stats/wellbeing-panel";
import { GoalsPanel } from "@/components/stats/goals-panel";
import { LibraryPanel } from "@/components/stats/library-panel";
import { useLibraryPrefs } from "@/components/books/library-prefs";
import { buildReadingHistory } from "@/components/books/reading-history";
import { readDaysIndex } from "@/components/books/pace";

/**
 * A ghost series only makes sense when it lines up index for index. Weekly
 * buckets can come out one longer, so the oldest extra is dropped rather than
 * drawn against the wrong week.
 */
function alignPrevious<T>(now: T[], before: T[]): T[] | null {
  if (!now.length || !before.length) return null;
  if (before.length === now.length) return before;
  if (before.length > now.length) return before.slice(before.length - now.length);
  return null;
}

export default function StatsPage() {
  const [range, setRange] = React.useState<RangeKey>("30d");
  const [compare, setCompare] = React.useState(false);
  const [activeTags, setActiveTags] = React.useState<string[]>([]);

  const allTasks = useStore((s) => s.tasks);
  const allSessions = useStore((s) => s.focusSessions);
  const habits = useStore((s) => s.habits);
  const habitLogs = useStore((s) => s.habitLogs);
  const prayers = useStore((s) => s.prayers);
  const books = useStore((s) => s.books);
  const media = useStore((s) => s.media);
  const goals = useStore((s) => s.goals);
  const projects = useStore((s) => s.projects);
  const dayLogs = useStore((s) => s.dayLogs);
  const tagRows = useStore((s) => s.tags);
  // Sittings ride along in the profile's prefs bag rather than in a table.
  const { sessions: readingSessions } = useLibraryPrefs();
  const weekStart = useStore((s) => s.profile?.week_start ?? 1);
  const hour12 = useStore((s) => s.hour12);
  const toast = useStore((s) => s.toast);

  const today = todayISO();
  const days = React.useMemo(() => rangeDates(range, today), [range, today]);
  const previous = React.useMemo(() => previousDates(days), [days]);
  const dateSet = React.useMemo(() => new Set(days), [days]);

  const tagColors = React.useMemo(
    () => new Map(tagRows.map((t) => [t.name, t.color])),
    [tagRows],
  );

  // ---- the tag filter narrows every task-shaped series ----
  const filtered = React.useMemo(
    () => applyTagFilter(allTasks, allSessions, activeTags),
    [allTasks, allSessions, activeTags],
  );
  const tasks = filtered.tasks;
  const focusSessions = filtered.sessions;

  const toggleTag = React.useCallback((tag: string) => {
    setActiveTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  }, []);

  // ---- tasks & time ----
  const stats = React.useMemo(
    () => buildDayStats(days, tasks, focusSessions),
    [days, tasks, focusSessions],
  );
  const prevStats = React.useMemo(
    () => buildDayStats(previous, tasks, focusSessions),
    [previous, tasks, focusSessions],
  );
  const doneMap = React.useMemo(() => doneByDate(tasks), [tasks]);
  const average = React.useMemo(() => trailingAverage(days, doneMap, 7), [days, doneMap]);

  const grain: "day" | "week" = days.length > 31 ? "week" : "day";
  const buckets = React.useMemo(() => bucketize(stats, grain, weekStart), [stats, grain, weekStart]);
  const prevBuckets = React.useMemo(
    () => bucketize(prevStats, grain, weekStart),
    [prevStats, grain, weekStart],
  );

  const byTag = React.useMemo(
    () => focusByTag(focusSessions, tasks, dateSet, tagColors),
    [focusSessions, tasks, dateSet, tagColors],
  );
  const byTask = React.useMemo(
    () => focusByTask(focusSessions, tasks, dateSet),
    [focusSessions, tasks, dateSet],
  );

  // The tag surfaces always read everything, so the filter can be changed from
  // inside them rather than only from the bar at the top.
  const tagList = React.useMemo(
    () => tagUsage(days, allTasks, allSessions, tagColors),
    [days, allTasks, allSessions, tagColors],
  );
  const tagDrift = React.useMemo(
    () => buildTagDrift(days, previous, allTasks, allSessions, tagColors),
    [days, previous, allTasks, allSessions, tagColors],
  );

  // ---- rhythms ----
  const weekdays = React.useMemo(() => buildWeekdayStats(stats, weekStart), [stats, weekStart]);
  const prevWeekdays = React.useMemo(
    () => buildWeekdayStats(prevStats, weekStart),
    [prevStats, weekStart],
  );
  const hours = React.useMemo(
    () => buildHourStats(days, tasks, focusSessions),
    [days, tasks, focusSessions],
  );
  const prevHours = React.useMemo(
    () => buildHourStats(previous, tasks, focusSessions),
    [previous, tasks, focusSessions],
  );

  // ---- estimates ----
  const samples = React.useMemo(
    () => estimateSamples(days, tasks, allSessions),
    [days, tasks, allSessions],
  );
  const prevSamples = React.useMemo(
    () => estimateSamples(previous, tasks, allSessions),
    [previous, tasks, allSessions],
  );
  const estimatePoints = React.useMemo(
    () => bucketEstimates(days, samples, grain, weekStart),
    [days, samples, grain, weekStart],
  );
  const prevEstimatePoints = React.useMemo(
    () => bucketEstimates(previous, prevSamples, grain, weekStart),
    [previous, prevSamples, grain, weekStart],
  );
  const estimate = React.useMemo(() => summariseEstimates(samples), [samples]);

  // ---- consistency, habits, salah, reading ----
  const scores = React.useMemo(
    () => buildDayScores(days, tasks, habits, habitLogs, prayers, weekStart),
    [days, tasks, habits, habitLogs, prayers, weekStart],
  );
  const habitSeries = React.useMemo(
    () => buildHabitSeries(days, habits, habitLogs, weekStart, today),
    [days, habits, habitLogs, weekStart, today],
  );
  const prayerStats = React.useMemo(() => buildPrayerStats(days, prayers), [days, prayers]);
  // Reading always reads the whole task list: a tag filter narrowing "pages read"
  // would quietly answer a different question than the one the panel asks.
  const readingSrc = React.useMemo(
    () => ({ sessions: readingSessions, tasks: allTasks, books, dayLogs }),
    [readingSessions, allTasks, books, dayLogs],
  );
  const readingHistory = React.useMemo(
    () => buildReadingHistory(days, readingSrc),
    [days, readingSrc],
  );
  const readIndex = React.useMemo(
    () => readDaysIndex(allTasks, readingSessions),
    [allTasks, readingSessions],
  );
  const weeks = React.useMemo(
    () => pagesPerWeek(readingHistory, weekStart),
    [readingHistory, weekStart],
  );
  const projections = React.useMemo(
    () => projectBooks(books, readIndex, days),
    [books, readIndex, days],
  );

  // ---- wellbeing, goals, shelves ----
  const wellbeing = React.useMemo(() => buildWellbeing(days, dayLogs), [days, dayLogs]);
  const goalStats = React.useMemo(
    () => buildGoalStats(days, goals, projects, allTasks),
    [days, goals, projects, allTasks],
  );
  const shelfStats = React.useMemo(
    () => buildShelfStats(days, books, media, allTasks),
    [days, books, media, allTasks],
  );

  // ---- insights ----
  const insights = React.useMemo(
    () => buildInsights({
      stats, prayers, habits, habitLogs, weekdays, hours, estimate, weekStart, hour12,
    }),
    [stats, prayers, habits, habitLogs, weekdays, hours, estimate, weekStart, hour12],
  );

  const totalDone = stats.reduce((s, d) => s + d.done, 0);
  const totalPlanned = stats.reduce((s, d) => s + d.planned, 0);
  const focusTotal = stats.reduce((s, d) => s + d.focusMin, 0);
  const sessionCount = React.useMemo(
    () => focusSessions.filter((s) => isFocus(s) && dateSet.has(sessionDate(s))).length,
    [focusSessions, dateSet],
  );
  const salahStreak = prayerStreak(prayers, today);

  /**
   * Four headline numbers, one idea each. Everything the old hint lines said is
   * now said once, in the summary of the panel that owns it — and the tile
   * still speaks it, so nothing is lost to a screen reader.
   */
  const tiles = React.useMemo<Tile[]>(() => {
    const prevDone = prevStats.reduce((s, d) => s + d.done, 0);
    const prevFocus = prevStats.reduce((s, d) => s + d.focusMin, 0);

    return [
      {
        key: "done",
        label: "Tasks done",
        value: String(totalDone),
        hint: totalPlanned
          ? `of ${totalPlanned} planned, ${pctOf(totalDone, totalPlanned)}% closed`
          : "nothing planned yet",
        delta: changePct(totalDone, prevDone),
        deltaOf: "tasks done",
        spark: stats.map((d) => d.done),
        target: "panel-completion",
        targetLabel: "the completion trend",
      },
      {
        key: "focus",
        label: "Focus",
        value: fmt(focusTotal / 60, 1),
        unit: "hours",
        hint: sessionCount
          ? `across ${sessionCount} session${sessionCount === 1 ? "" : "s"}`
          : "no sessions logged",
        delta: changePct(focusTotal, prevFocus),
        deltaOf: "focus time",
        spark: stats.map((d) => d.focusMin),
        target: "panel-focus",
        targetLabel: "where the time went",
      },
      {
        key: "estimate",
        label: "Estimates",
        value: estimate.ratio != null ? `${Math.round(estimate.ratio * 100)}` : "—",
        unit: estimate.ratio != null ? "% of plan" : undefined,
        hint: estimate.n
          ? `${estimate.n} measured task${estimate.n === 1 ? "" : "s"}, ${estimate.over} ran over`
          : "no task carries both numbers",
        spark: estimatePoints.filter((p) => p.ratio != null).map((p) => p.ratio!),
        target: "panel-estimates",
        targetLabel: "estimate accuracy",
      },
      {
        key: "perfect",
        label: "Perfect days",
        value: String(perfectDays(scores)),
        hint: "days where everything tracked was closed out",
        spark: scores.map((s) => s.score ?? 0),
        target: "panel-consistency",
        targetLabel: "the consistency heatmap",
      },
      // The second row exists because each of these leads somewhere that had no
      // way in from the top of the page at all.
      {
        key: "pages",
        label: "Pages read",
        value: String(readingHistory.pages + readingHistory.quranPages),
        hint: readingHistory.daysRead
          ? `over ${readingHistory.daysRead} reading day${readingHistory.daysRead === 1 ? "" : "s"}`
          : "nothing logged yet",
        spark: readingHistory.days.map((d) => d.pages + d.quranPages),
        target: "panel-reading",
        targetLabel: "reading",
      },
      {
        key: "books",
        label: "Books finished",
        value: String(readingHistory.booksFinished),
        hint: readingHistory.booksFinished
          ? readingHistory.books.filter((b) => b.finishedOn).map((b) => b.book.title).join(", ")
          : "none closed out in this window",
        target: "panel-reading",
        targetLabel: "reading",
      },
      {
        key: "mood",
        label: "Mood",
        value: wellbeing.mood != null ? fmt(wellbeing.mood, 1) : "—",
        unit: wellbeing.mood != null ? "of 5" : undefined,
        hint: wellbeing.loggedDays
          ? `${wellbeing.loggedDays} day${wellbeing.loggedDays === 1 ? "" : "s"} logged`
          : "no day rated yet",
        spark: wellbeing.days.map((d) => d.mood ?? 0),
        target: "panel-wellbeing",
        targetLabel: "mood and energy",
      },
      {
        key: "goals",
        label: "Goals moved",
        value: String(goalStats.advanced),
        hint: goalStats.active
          ? `of ${goalStats.active} active, ${goalStats.untouched} untouched`
          : "no goals tracked yet",
        target: "panel-goals",
        targetLabel: "goals and projects",
      },
    ];
  }, [
    stats, prevStats, totalDone, totalPlanned, focusTotal, sessionCount, scores, estimate,
    estimatePoints, readingHistory, wellbeing, goalStats,
  ]);

  const hasAnything =
    allTasks.length + allSessions.length + habits.length + prayers.length + books.length
    + media.length + goals.length + dayLogs.length > 0;

  const previousLabel = `Previous ${days.length} days`;
  const label = rangeLabel(days);

  // ---- export ----
  const exportCsv = React.useCallback(() => {
    const sections: CsvSection[] = [
      {
        title: `Qalamchi stats · ${label}${activeTags.length ? ` · filtered by ${activeTags.join(" + ")}` : ""}`,
        columns: ["Measure", "Value"],
        rows: [
          ["Days in window", days.length],
          ["Tasks done", stats.reduce((s, d) => s + d.done, 0)],
          ["Tasks planned", stats.reduce((s, d) => s + d.planned, 0)],
          ["Focus minutes", Math.round(focusTotal)],
          ["Focus sessions", sessionCount],
          ["Perfect days", perfectDays(scores)],
          ["Salah streak (days)", salahStreak],
          ["Measured estimates", estimate.n],
          ["Median actual / planned", estimate.ratio != null ? estimate.ratio.toFixed(2) : ""],
        ],
      },
      {
        title: "By day",
        columns: ["Date", "Done", "Planned", "Planned minutes", "Focus minutes", "Day score %"],
        rows: stats.map((d, i) => [
          d.date, d.done, d.planned, Math.round(d.plannedMin), Math.round(d.focusMin),
          scores[i]?.score == null ? "" : Math.round((scores[i].score ?? 0) * 100),
        ]),
      },
      {
        title: "By weekday",
        columns: ["Weekday", "Days", "Done", "Planned", "Focus minutes"],
        rows: weekdays.map((r) => [r.label, r.days, r.done, r.planned, Math.round(r.focusMin)]),
      },
      {
        title: "By hour",
        columns: ["Hour", "Focus minutes", "Sessions", "Tasks finished"],
        rows: hours.map((h) => [h.hour, Math.round(h.focusMin), h.sessions, h.completed]),
      },
      {
        title: "Estimates",
        columns: ["Date", "Task", "Planned minutes", "Actual minutes", "Ratio"],
        rows: samples.map((s) => [
          s.date, s.title, Math.round(s.planned), Math.round(s.actual), s.ratio.toFixed(2),
        ]),
      },
      {
        title: "Tags",
        columns: ["Tag", "Focus minutes", "Focus minutes before", "Tasks", "Tasks before"],
        rows: tagDrift.map((r) => [
          r.name, Math.round(r.minutes), Math.round(r.minutesBefore), r.tasks, r.tasksBefore,
        ]),
      },
      {
        title: "Habits",
        columns: ["Habit", "Kept", "Due", "Rate %", "Streak"],
        rows: habitSeries.map((s) => [
          s.habit.name, s.hit, s.due, pctOf(s.hit, s.due), s.streak,
        ]),
      },
      {
        title: "Salah",
        columns: ["Prayer", "Jamaah", "On time", "Late", "Qadha", "Not logged", "On time %"],
        rows: prayerStats.map((p) => [
          PRAYER_LABELS[p.name], p.jamaah, p.prayed, p.late, p.qadha, p.missing,
          pctOf(onTime(p), p.total),
        ]),
      },
      {
        title: "Reading",
        columns: ["Week", "Book pages", "Qur'an pages", "Minutes"],
        rows: weeks.map((w) => [w.key, w.pages, w.quranPages, Math.round(w.minutes)]),
      },
      {
        title: "Books read",
        columns: ["Book", "Pages", "Minutes", "Progress %", "Finished"],
        rows: readingHistory.books.map((b) => [
          b.book.title, b.pages, Math.round(b.minutes), b.progress, b.finishedOn ?? "",
        ]),
      },
      {
        title: "Wellbeing",
        columns: ["Date", "Mood", "Energy", "Focus", "Sleep hours", "Water", "Steps"],
        rows: wellbeing.days.filter((d) => d.logged).map((d) => [
          d.date, d.mood ?? "", d.energy ?? "", d.focus ?? "", d.sleep ?? "", d.water, d.steps ?? "",
        ]),
      },
      {
        title: "Goals",
        columns: ["Goal", "Tasks closed", "Progress %", "Status"],
        rows: goalStats.rows.map((r) => [
          r.goal.title, r.closed, r.pct ?? "", r.goal.status,
        ]),
      },
    ];

    downloadCsv(csvFilename(label, activeTags), toCsv(sections));
    toast({
      title: "Stats exported",
      description: `${days.length} days${activeTags.length ? `, filtered by ${activeTags.join(" + ")}` : ""}.`,
      tone: "success",
    });
  }, [
    label, activeTags, days.length, stats, focusTotal, sessionCount, salahStreak, scores, estimate,
    weekdays, hours, samples, tagDrift, habitSeries, prayerStats, weeks, toast,
    readingHistory, wellbeing, goalStats,
  ]);

  const filteredNote = activeTags.length
    ? `Tasks, focus, estimates, rhythm and the day scores are narrowed to ${activeTags.join(" + ")}. ` +
      `Habits, salah and tag drift are not tag-scoped, so they still show everything.`
    : null;

  return (
    <>
      <PageHeader
        title="Stats"
        subtitle={label}
        actions={<Segmented value={range} onChange={setRange} options={RANGE_OPTIONS} size="sm" />}
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
          <div className="flex flex-col gap-8">
            {/* The headline: one control, four numbers, and the page in sentences. */}
            <div className="flex flex-col gap-5">
              <FilterBar
                tags={tagList}
                active={activeTags}
                onToggle={toggleTag}
                onClear={() => setActiveTags([])}
                compare={compare}
                onCompare={setCompare}
                compareLabel={`Compare with the previous ${days.length} days`}
                onExport={exportCsv}
                filteredNote={filteredNote}
              />

              <StatTiles tiles={tiles} />
              <InsightLines insights={insights} />
            </div>

            {/* Everything below reads as a list of findings. Open one for the
                chart behind it; the summary line stands on its own until then. */}
            <div className="divide-y divide-line">
              <CompletionTrend
                stats={stats}
                average={average}
                previous={compare ? alignPrevious(stats, prevStats) : null}
                previousLabel={previousLabel}
              />

              <EstimateAccuracy
                points={estimatePoints}
                samples={samples}
                summary={estimate}
                grain={grain}
                previous={compare ? alignPrevious(estimatePoints, prevEstimatePoints) : null}
                previousLabel={previousLabel}
              />

              <PlannedVsActual
                buckets={buckets}
                grain={grain}
                previous={compare ? alignPrevious(buckets, prevBuckets) : null}
                previousLabel={previousLabel}
              />

              <WeekdayPanel
                rows={weekdays}
                previous={compare ? prevWeekdays : null}
                previousLabel={previousLabel}
              />

              <HourPanel
                hours={hours}
                hour12={hour12}
                previous={compare ? prevHours : null}
                previousLabel={previousLabel}
              />

              <TimeBreakdown
                byTag={byTag}
                byTask={byTask}
                totalMinutes={focusTotal}
                sessions={sessionCount}
                activeTags={activeTags}
                onToggleTag={toggleTag}
              />

              <TagDrift
                rows={tagDrift}
                activeTags={activeTags}
                onToggleTag={toggleTag}
                previousLabel={previousLabel}
              />

              <ConsistencyHeatmap scores={scores} weekStart={weekStart} />

              <HabitMatrix series={habitSeries} days={days} />

              <SalahPanel
                stats={prayerStats}
                streak={salahStreak}
                days={days.length}
              />

              <ReadingPanel weeks={weeks} projections={projections} history={readingHistory} />

              <WellbeingPanel data={wellbeing} />

              <GoalsPanel data={goalStats} days={days.length} />

              <LibraryPanel shelves={shelfStats} days={days.length} />
            </div>

            <p className="max-w-[76ch] text-[11.5px] leading-relaxed text-ink-4">
              Every figure here is computed from your own records across these{" "}
              <span className="tnum">{days.length}</span> days. Nothing is estimated, smoothed or
              filled in for you — where a reading would need a bigger sample to be honest, it says so
              instead of guessing.
            </p>
          </div>
        )}
      </PageBody>
    </>
  );
}
