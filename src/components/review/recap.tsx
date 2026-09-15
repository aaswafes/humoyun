"use client";

import * as React from "react";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import { formatDate, formatDuration } from "@/lib/date";
import { Button } from "@/components/ui/primitives";
import { useLibraryPrefs } from "@/components/books/library-prefs";
import { Fold, Section } from "./section";
import { Delta, Sparkline } from "./sparkline";
import { habitTally, formatHours, metricsFor, pct, plural, type MetricSource, type Metrics } from "./metrics";
import { plannedMinutes } from "./derive";
import { historySeries, measurementNote, SCOPE_NOUN, type Period } from "./period";

/** How far back the sparkline looks. A year of years is expensive and dull. */
const HISTORY: Record<Period["scope"], number> = { week: 8, month: 6, year: 4 };

/** The four the review opens on. The rest are one click away, not gone. */
const LEAD_COUNT = 4;

interface StatDef {
  key: string;
  label: string;
  /** The comparable number — drives the value, the sparkline and the delta. */
  read: (m: Metrics) => number;
  format: (n: number) => string;
  detail: (m: Metrics) => string;
}

const STATS: StatDef[] = [
  {
    key: "tasks",
    label: "Tasks done",
    read: (m) => m.tasksDone,
    format: (n) => String(n),
    detail: (m) => (m.tasksPlanned ? `of ${m.tasksPlanned} planned · ${pct(m.tasksDone, m.tasksPlanned)}%` : "nothing was planned"),
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
  },
  {
    key: "pages",
    label: "Pages read",
    read: (m) => m.pagesRead,
    format: (n) => String(n),
    detail: (m) => {
      if (!m.pagesRead) return "nothing logged";
      const across = m.reading.books.length
        ? `across ${m.reading.books.length} ${plural(m.reading.books.length, "book")}`
        : "from reading blocks";
      // Settled pages are the ones no dated record carried. Saying so is the
      // difference between a number you can trust and one that merely looks right.
      return m.pagesSettled
        ? `${across} · ${m.pagesSettled} carried from a finish`
        : across;
    },
  },
  {
    key: "books",
    label: "Books finished",
    read: (m) => m.booksFinished,
    format: (n) => String(n),
    detail: (m) => {
      const titles = m.reading.books.filter((b) => b.finishedOn).map((b) => b.book.title);
      if (!titles.length) return "none closed out";
      return titles.length <= 2 ? titles.join(", ") : `${titles[0]} and ${titles.length - 1} more`;
    },
  },
  {
    key: "quran",
    label: "Qur'an",
    read: (m) => m.quranPages,
    format: (n) => String(n),
    detail: (m) => (m.quranPages ? `pages · ${Math.round(m.quranPages / 20 * 10) / 10} juz` : "no pages logged"),
  },
  {
    key: "reading-time",
    label: "Reading time",
    read: (m) => m.readingMinutes,
    format: formatHours,
    detail: (m) =>
      m.reading.daysRead
        ? `on ${m.reading.daysRead} ${plural(m.reading.daysRead, "day")}`
        : "no sitting timed",
  },
  {
    key: "goals",
    label: "Goals advanced",
    read: (m) => m.goalsAdvanced,
    format: (n) => String(n),
    detail: (m) => (m.goalsActive ? `of ${m.goalsActive} active` : "no active goals"),
  },
  {
    key: "notes",
    label: "Notes written",
    read: (m) => m.notesWritten,
    format: (n) => String(n),
    detail: (m) => (m.notesWritten ? "captured in this period" : "nothing written down"),
  },
  {
    key: "mood",
    label: "Mood",
    read: (m) => m.mood ?? 0,
    format: (n) => (n ? n.toFixed(1) : "—"),
    detail: (m) =>
      m.mood == null
        ? "no day logged"
        : `out of 5 · ${m.daysLogged} ${plural(m.daysLogged, "day")} logged`,
  },
  {
    key: "energy",
    label: "Energy",
    read: (m) => m.energy ?? 0,
    format: (n) => (n ? n.toFixed(1) : "—"),
    detail: (m) =>
      m.energy == null
        ? "no day logged"
        : m.sleepHours != null
          ? `out of 5 · ${m.sleepHours}h sleep`
          : "out of 5",
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
  const dayLogs = useStore((s) => s.dayLogs);
  const notes = useStore((s) => s.notes);
  // Sittings are not a table — they ride along in the profile's prefs bag.
  const { sessions } = useLibraryPrefs();
  return React.useMemo(
    () => ({ tasks, habits, habitLogs, prayers, focusSessions, goals, books, sessions, dayLogs, notes }),
    [tasks, habits, habitLogs, prayers, focusSessions, goals, books, sessions, dayLogs, notes],
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

// ---------------------------------------------------------
// One number, its trend, and the sentence that puts it in context. The
// ratio is stated in words rather than drawn as a meter as well — the same
// fact twice is what made this page loud.
// ---------------------------------------------------------
function StatTile({
  stat, current, previous, history, labels,
}: {
  stat: StatDef;
  current: Metrics;
  previous: Metrics;
  history: Metrics[];
  labels: string[];
}) {
  const value = stat.read(current);
  const before = stat.read(previous);

  return (
    <div className="min-w-0">
      <div className="text-[12px] text-ink-3">{stat.label}</div>
      <div className="mt-1.5 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <span className={cn("display-serif text-[32px] leading-none tnum", value ? "text-ink" : "text-ink-4")}>
              {stat.format(value)}
            </span>
            <Delta value={value - before} previous={before} format={stat.format} />
          </div>
          <p className="mt-1.5 truncate text-[12px] text-ink-4 tnum">{stat.detail(current)}</p>
        </div>
        <Sparkline
          values={history.map(stat.read)}
          labels={labels}
          format={stat.format}
          width={62}
          className="mb-1"
        />
      </div>
    </div>
  );
}

const STAT_GRID = "grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-4";

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

  const lead = STATS.slice(0, LEAD_COUNT);
  const rest = STATS.slice(LEAD_COUNT);
  const tile = (stat: StatDef) => (
    <StatTile
      key={stat.key}
      stat={stat}
      current={current}
      previous={previous}
      history={history}
      labels={labels}
    />
  );

  return (
    <Section
      id="review-recap"
      label="Recap"
      note={measurementNote(period)}
      action={<span className="text-[11px] text-ink-4 tnum">vs {labels[labels.length - 2] ?? "before"}</span>}
    >
      <div className={STAT_GRID}>{lead.map(tile)}</div>

      <Fold
        tone="inline"
        storageKey="recapMore"
        label="More numbers"
        // Naming all six would run past the row it has to fit on.
        summary={`${rest.slice(0, 3).map((s) => s.label.toLowerCase()).join(", ")} and ${rest.length - 3} more`}
      >
        <div className={STAT_GRID}>{rest.map(tile)}</div>
      </Fold>
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
      <p className="max-w-[62ch] text-[13.5px] leading-relaxed text-ink-2">
        {period.title} {period.relative.toLowerCase().startsWith("starts") ? period.relative.toLowerCase() : "has not started"}.
        {" "}
        {booked.tasks
          ? `${booked.tasks} ${plural(booked.tasks, "task")} already booked.`
          : "Nothing is booked yet."}
        {" "}
        A review measures what happened — until then this is a plan, not a record.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-x-8 gap-y-5 sm:grid-cols-4">
        {[
          { label: "Booked", value: String(booked.tasks), sub: `${booked.timed} timed` },
          { label: "Planned time", value: formatHours(booked.minutes), sub: "from durations" },
          { label: "Habits due", value: String(booked.habitsDue), sub: `across ${period.days.length} days` },
          { label: "Reading blocks", value: String(booked.reading), sub: booked.reading ? "scheduled" : "none yet" },
        ].map((cell) => (
          <div key={cell.label} className="min-w-0">
            <div className="text-[12px] text-ink-3">{cell.label}</div>
            <div className="display-serif mt-1 text-[22px] leading-none text-ink tnum">{cell.value}</div>
            <p className="mt-1 truncate text-[11.5px] text-ink-4 tnum">{cell.sub}</p>
          </div>
        ))}
      </div>

      {booked.busiest && booked.busiest.n > 0 && (
        <p className="mt-5 inline-flex items-center gap-1.5 text-[12px] text-ink-4">
          <Sparkles className="size-3.5" />
          Heaviest day so far: {formatDate(booked.busiest.date)} with {booked.busiest.n} {plural(booked.busiest.n, "task")}.
        </p>
      )}
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
