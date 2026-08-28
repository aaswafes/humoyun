"use client";

import * as React from "react";
import { CalendarClock, Sparkles } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import { formatDate, formatDuration } from "@/lib/date";
import { Button, Progress } from "@/components/ui/primitives";
import { Section } from "./section";
import { Delta, Sparkline } from "./sparkline";
import { habitTally, formatHours, metricsFor, pct, plural, type MetricSource, type Metrics } from "./metrics";
import { plannedMinutes } from "./derive";
import { historySeries, measurementNote, SCOPE_NOUN, type Period } from "./period";

/** How far back the sparkline looks. A year of years is expensive and dull. */
const HISTORY: Record<Period["scope"], number> = { week: 8, month: 6, year: 4 };

interface StatDef {
  key: string;
  label: string;
  /** The comparable number — drives the value, the sparkline and the delta. */
  read: (m: Metrics) => number;
  format: (n: number) => string;
  detail: (m: Metrics) => string;
  /** Optional denominator, drawn as a hairline meter under the number. */
  ratio?: (m: Metrics) => { part: number; whole: number } | null;
}

const STATS: StatDef[] = [
  {
    key: "tasks",
    label: "Tasks done",
    read: (m) => m.tasksDone,
    format: (n) => String(n),
    detail: (m) => (m.tasksPlanned ? `of ${m.tasksPlanned} planned · ${pct(m.tasksDone, m.tasksPlanned)}%` : "nothing was planned"),
    ratio: (m) => (m.tasksPlanned ? { part: m.tasksDone, whole: m.tasksPlanned } : null),
  },
  {
    key: "focus",
    label: "Focus",
    read: (m) => m.focusMinutes,
    format: formatHours,
    detail: (m) =>
      m.sessionCount
        ? `${m.sessionCount} ${plural(m.sessionCount, "session")} · ${formatDuration(Math.round(m.focusMinutes / m.sessionCount))} each`
        : "no timer runs",
  },
  {
    key: "habits",
    label: "Habits hit",
    read: (m) => m.habitsHit,
    format: (n) => String(n),
    detail: (m) => (m.habitsDue ? `of ${m.habitsDue} due · ${pct(m.habitsHit, m.habitsDue)}%` : "no habits tracked"),
    ratio: (m) => (m.habitsDue ? { part: m.habitsHit, whole: m.habitsDue } : null),
  },
  {
    key: "salah",
    label: "Salah",
    read: (m) => m.salahDone,
    format: (n) => String(n),
    detail: (m) =>
      m.salahJamaah
        ? `of ${m.salahDue} · ${m.salahJamaah} in jamaah`
        : `of ${m.salahDue} prayers · ${pct(m.salahDone, m.salahDue)}%`,
    ratio: (m) => (m.salahDue ? { part: m.salahDone, whole: m.salahDue } : null),
  },
  {
    key: "pages",
    label: "Pages read",
    read: (m) => m.pagesRead,
    format: (n) => String(n),
    detail: (m) =>
      m.booksRead ? `across ${m.booksRead} ${plural(m.booksRead, "book")}` : "from reading blocks",
  },
  {
    key: "goals",
    label: "Goals advanced",
    read: (m) => m.goalsAdvanced,
    format: (n) => String(n),
    detail: (m) => (m.goalsActive ? `of ${m.goalsActive} active` : "no active goals"),
    ratio: (m) => (m.goalsActive ? { part: m.goalsAdvanced, whole: m.goalsActive } : null),
  },
];

export function useMetricSource(): MetricSource {
  const tasks = useStore((s) => s.tasks);
  const habits = useStore((s) => s.habits);
  const habitLogs = useStore((s) => s.habitLogs);
  const prayers = useStore((s) => s.prayers);
  const focusSessions = useStore((s) => s.focusSessions);
  const goals = useStore((s) => s.goals);
  const books = useStore((s) => s.books);
  return React.useMemo(
    () => ({ tasks, habits, habitLogs, prayers, focusSessions, goals, books }),
    [tasks, habits, habitLogs, prayers, focusSessions, goals, books],
  );
}

export function useRecap(period: Period, weekStartDay: number) {
  const src = useMetricSource();
  return React.useMemo(() => {
    const series = historySeries(period, HISTORY[period.scope]);
    const history = series.map((s) => metricsFor(s.days, src, weekStartDay));
    return {
      current: history[history.length - 1],
      previous: history[history.length - 2],
      history,
      labels: series.map((s) => s.label),
    };
  }, [period, src, weekStartDay]);
}

export function Recap({
  period, weekStartDay, onGoToCurrent,
}: {
  period: Period;
  weekStartDay: number;
  onGoToCurrent: () => void;
}) {
  const src = useMetricSource();
  const { current, previous, history, labels } = useRecap(period, weekStartDay);

  if (period.phase === "future") {
    return <BookedPreview period={period} src={src} weekStartDay={weekStartDay} onGoToCurrent={onGoToCurrent} />;
  }

  return (
    <Section
      id="review-recap"
      label="Recap"
      note={measurementNote(period)}
      action={<span className="text-[11px] text-ink-4">vs {labels[labels.length - 2] ?? "before"}</span>}
    >
      <div className="grid grid-cols-1 gap-px overflow-hidden rounded-lg bg-line sm:grid-cols-2 lg:grid-cols-3">
        {STATS.map((stat) => {
          const value = stat.read(current);
          const before = stat.read(previous);
          const ratio = stat.ratio?.(current) ?? null;
          return (
            <div key={stat.key} className="bg-canvas px-4 py-3.5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">
                {stat.label}
              </div>
              <div className="mt-2 flex items-end justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className={cn("display-serif text-[32px] leading-none tnum", value ? "text-ink" : "text-ink-4")}>
                      {stat.format(value)}
                    </span>
                    <Delta value={value - before} previous={before} format={stat.format} />
                  </div>
                  <p className="mt-1.5 truncate text-[12px] text-ink-3 tnum">{stat.detail(current)}</p>
                </div>
                <Sparkline
                  values={history.map(stat.read)}
                  labels={labels}
                  format={stat.format}
                  className="mb-1"
                />
              </div>
              {ratio && (
                <Progress
                  value={ratio.part}
                  max={ratio.whole}
                  height={3}
                  className="mt-2.5"
                />
              )}
            </div>
          );
        })}
      </div>
    </Section>
  );
}

// ---------------------------------------------------------
// A period that has not started has nothing to measure — so it shows what is
// already on the calendar instead of pretending the numbers mean something.
// ---------------------------------------------------------
function BookedPreview({
  period, src, weekStartDay, onGoToCurrent,
}: {
  period: Period;
  src: MetricSource;
  weekStartDay: number;
  onGoToCurrent: () => void;
}) {
  const booked = React.useMemo(() => {
    const inRange = new Set(period.days);
    const scoped = src.tasks.filter(
      (t) => !!t.date && inRange.has(t.date) && !t.parent_id && t.status !== "dropped",
    );
    const minutes = scoped.reduce((sum, t) => sum + plannedMinutes(t), 0);
    const habits = habitTally(period.days, src.habits, src.habitLogs, weekStartDay);
    return {
      tasks: scoped.length,
      timed: scoped.filter((t) => t.start_min != null).length,
      minutes,
      reading: scoped.filter((t) => t.book_id).length,
      habitsDue: habits.due,
      busiest: period.days
        .map((d) => ({ date: d, n: scoped.filter((t) => t.date === d).length }))
        .sort((a, b) => b.n - a.n)[0],
    };
  }, [period.days, src, weekStartDay]);

  return (
    <Section
      id="review-recap"
      label="Not started yet"
      note={measurementNote(period)}
      action={
        <Button size="sm" variant="secondary" onClick={onGoToCurrent}>
          Back to this {SCOPE_NOUN[period.scope]}
        </Button>
      }
    >
      <div className="surface p-4">
        <div className="flex items-start gap-3">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">
            <CalendarClock className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="text-[13.5px] text-ink">
              {period.title} {period.relative.toLowerCase().startsWith("starts") ? period.relative.toLowerCase() : "has not started"}.
              {" "}
              {booked.tasks
                ? `${booked.tasks} ${plural(booked.tasks, "task")} already booked.`
                : "Nothing is booked yet."}
            </p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-ink-3">
              A review measures what happened. Until then this is a plan, not a record —
              write the reflection now only if you want to set the intention early.
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-md bg-line sm:grid-cols-4">
          {[
            { label: "Booked", value: String(booked.tasks), sub: `${booked.timed} timed` },
            { label: "Planned time", value: formatHours(booked.minutes), sub: "from durations" },
            { label: "Habits due", value: String(booked.habitsDue), sub: `across ${period.days.length} days` },
            { label: "Reading blocks", value: String(booked.reading), sub: booked.reading ? "scheduled" : "none yet" },
          ].map((cell) => (
            <div key={cell.label} className="bg-canvas px-3 py-2.5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">{cell.label}</div>
              <div className="display-serif mt-1 text-[22px] leading-none text-ink tnum">{cell.value}</div>
              <p className="mt-1 truncate text-[11.5px] text-ink-4 tnum">{cell.sub}</p>
            </div>
          ))}
        </div>

        {booked.busiest && booked.busiest.n > 0 && (
          <p className="mt-3 inline-flex items-center gap-1.5 text-[12px] text-ink-3">
            <Sparkles className="size-3.5 text-ink-4" />
            Heaviest day so far: {formatDate(booked.busiest.date)} with {booked.busiest.n} {plural(booked.busiest.n, "task")}.
          </p>
        )}
      </div>
    </Section>
  );
}

/** Shared by the summary builder so the text and the tiles never disagree. */
export function statLines(m: Metrics, previous?: Metrics): string[] {
  return STATS.map((s) => {
    const value = s.format(s.read(m));
    const delta = previous ? s.read(m) - s.read(previous) : 0;
    const chip = !previous || delta === 0 ? "even" : `${delta > 0 ? "+" : "-"}${s.format(Math.abs(delta))}`;
    return `- ${s.label}: ${value} (${chip}) — ${s.detail(m)}`;
  });
}
