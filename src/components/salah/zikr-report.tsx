"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { addDays, formatDate, monthName, monthNameOf, weekdayHeaders, yearOf } from "@/lib/date";
import { Progress, Segmented } from "@/components/ui/primitives";
import { MiniEmpty, VisuallyHidden } from "@/components/ui/form";
import { groupNumber, shortNumber, type ZikrDef } from "./zikr-data";
import {
  heatGrid, monthlyTotals, passedMilestones, perZikrBetween, seriesFor, type ZikrStats,
} from "./zikr-stats";

type Span = "30" | "365" | "all";

const SPANS: { value: Span; label: string }[] = [
  { value: "30", label: "30 days" },
  { value: "365", label: "This year" },
  { value: "all", label: "All time" },
];

/**
 * The long record.
 *
 * Three questions, in the order people actually ask them: how much, of what,
 * and how steadily. Nothing here is a grade — a quiet month is a fact about
 * a month, not a failure, so none of it is coloured like a warning.
 */
export function ZikrReport({
  stats, today, byId, weekStart,
}: {
  stats: ZikrStats;
  today: string;
  byId: Record<string, ZikrDef>;
  weekStart: number;
}) {
  const [span, setSpan] = React.useState<Span>("365");

  const from = span === "all"
    ? stats.firstDate ?? today
    : addDays(today, -(Number(span) - 1));

  // One pass answers the headline and the table together, so they can never
  // disagree about which days they counted.
  const scoped = React.useMemo(() => perZikrBetween(stats, from, today), [stats, from, today]);

  const ranked = React.useMemo(
    () => Object.entries(scoped.perZikr)
      .map(([id, count]) => ({ id, count, def: byId[id] }))
      .filter((r) => r.count > 0)
      .sort((a, b) => b.count - a.count),
    [scoped.perZikr, byId],
  );

  const top = ranked[0]?.count ?? 0;
  const milestones = passedMilestones(stats.total);

  if (stats.total === 0) {
    return (
      <MiniEmpty className="py-10">
        Count something and the record starts here — what you say most, how steady the days are, and what it
        adds up to.
      </MiniEmpty>
    );
  }

  return (
    <div>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="display-serif tnum text-[32px] leading-none text-ink">
            {groupNumber(scoped.total)}
          </p>
          <p className="mt-2 text-[12px] text-ink-3">
            counted across <span className="tnum">{groupNumber(scoped.days)}</span>{" "}
            {scoped.days === 1 ? "day" : "days"}
            {span !== "all" && <> in the last {span === "30" ? "30 days" : "year"}</>}
          </p>
        </div>
        <Segmented size="sm" value={span} onChange={setSpan} options={SPANS} />
      </header>

      <Heatmap perDay={stats.perDay} today={today} weekStart={weekStart} />

      <section className="hairline-t mt-6 pt-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">Which ones</p>
        {ranked.length === 0 ? (
          <MiniEmpty className="py-6">Nothing counted in this stretch.</MiniEmpty>
        ) : (
          <ul className="mt-3 space-y-2.5">
            {ranked.map((row) => (
              <li key={row.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3">
                <span className="truncate text-[12.5px] text-ink-2">
                  {row.def?.label ?? row.id}
                </span>
                <span className="tnum text-[12px] text-ink-3">{groupNumber(row.count)}</span>
                <span className="col-span-2 mt-1">
                  <Progress value={row.count} max={top || 1} tint={row.def?.tint ?? "slate"} height={6} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <MonthlyBars perDay={stats.perDay} today={today} />

      <section className="hairline-t mt-6 pt-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">Milestones</p>
        {milestones.length === 0 ? (
          <p className="mt-2 text-[12px] text-ink-4">
            The first one is <span className="tnum">100</span>.
          </p>
        ) : (
          <ul className="mt-2.5 flex flex-wrap gap-1.5">
            {milestones.map((m) => (
              <li
                key={m}
                className="tnum inline-flex h-7 items-center rounded-full bg-hover px-2.5 text-[11.5px] text-ink-2"
              >
                {groupNumber(m)}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2.5 text-[11.5px] leading-relaxed text-ink-4">
          Best day so far:{" "}
          {stats.bestDay ? (
            <>
              <span className="tnum text-ink-3">{groupNumber(stats.bestDay.count)}</span> on{" "}
              {formatDate(stats.bestDay.date, { year: true })}
            </>
          ) : (
            "not yet"
          )}
          .
        </p>
      </section>
    </div>
  );
}

// ---------------------------------------------------------
// The year, one square per day
// ---------------------------------------------------------

const WEEKS = 53;

/** Four steps, because five is more than an eye reads off a legend. */
function levelOf(count: number, busy: number): number {
  if (count <= 0) return 0;
  if (count >= busy) return 4;
  const ratio = count / busy;
  if (ratio > 0.6) return 3;
  if (ratio > 0.3) return 2;
  return 1;
}

// Same ladder the focus heatmap uses: one painted token, four opacities, so
// both themes are handled by the token rather than by a second palette.
const LEVEL_OPACITY = [0, 0.22, 0.45, 0.72, 1] as const;

function Swatch({ level, className }: { level: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("block size-[11px] rounded-[2px]", level === 0 && "bg-hover", className)}
      style={level ? { background: "var(--accent)", opacity: LEVEL_OPACITY[level] } : undefined}
    />
  );
}

function Heatmap({
  perDay, today, weekStart,
}: {
  perDay: Map<string, number>;
  today: string;
  weekStart: number;
}) {
  const grid = React.useMemo(() => heatGrid(perDay, today, WEEKS, weekStart), [perDay, today, weekStart]);

  // The scale is set by a busy day rather than the best day ever: one
  // extraordinary sitting would otherwise flatten a whole year to the palest step.
  const busy = React.useMemo(() => {
    const counts = [...perDay.values()].filter((n) => n > 0).sort((a, b) => a - b);
    if (!counts.length) return 1;
    return Math.max(1, counts[Math.floor(counts.length * 0.75)]);
  }, [perDay]);

  const headers = weekdayHeaders(weekStart, "min");
  const summaryId = "zikr-heat-summary";

  return (
    <section className="mt-5">
      <div className="overflow-x-auto pb-1">
        <div className="min-w-[620px]">
          <MonthLabels grid={grid} />
          <div className="flex gap-[3px]" role="img" aria-describedby={summaryId}>
            <div className="mr-1 flex w-6 shrink-0 flex-col gap-[3px] pt-[1px]">
              {headers.map((h, i) => (
                <span key={h} className="h-[11px] text-[9.5px] leading-[11px] text-ink-4">
                  {i % 2 === 1 ? h : ""}
                </span>
              ))}
            </div>
            {grid.map((week, wi) => (
              <div key={wi} className="flex flex-col gap-[3px]">
                {week.days.map((day, di) => (
                  <span
                    key={di}
                    title={day ? `${formatDate(day.date, { year: true })} — ${groupNumber(day.count)}` : undefined}
                    className={cn("block size-[11px]", !day && "opacity-0")}
                  >
                    <Swatch
                      level={day ? levelOf(day.count, busy) : 0}
                      className={day?.date === today ? "ring-1 ring-ink-3" : undefined}
                    />
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-2 flex items-center gap-1.5 text-[11px] text-ink-4">
        <span>Less</span>
        {LEVEL_OPACITY.map((_, level) => (
          <Swatch key={level} level={level} />
        ))}
        <span>More</span>
      </div>

      <VisuallyHidden id={summaryId}>
        A year of daily totals. Darkest squares are days above {groupNumber(busy)}.
      </VisuallyHidden>
    </section>
  );
}

/**
 * A label only where the month turns over. Pure and outside the component:
 * a column cannot know what the column before it said, so the whole row is
 * worked out in one pass before anything renders.
 */
function monthLabelsOf(grid: ReturnType<typeof heatGrid>): string[] {
  const labels: string[] = [];
  let previous = "";
  for (const week of grid) {
    const first = week.days.find(Boolean);
    const label = first ? monthName(first.date, true).slice(0, 3) : "";
    labels.push(label !== "" && label !== previous ? label : "");
    if (label) previous = label;
  }
  return labels;
}

function MonthLabels({ grid }: { grid: ReturnType<typeof heatGrid> }) {
  const labels = React.useMemo(() => monthLabelsOf(grid), [grid]);

  return (
    <div className="mb-1 flex gap-[3px] pl-7">
      {labels.map((label, i) => (
        <span key={i} className="w-[11px] text-[9.5px] leading-none text-ink-4">
          {label}
        </span>
      ))}
    </div>
  );
}

// ---------------------------------------------------------
// Twelve months
// ---------------------------------------------------------

function MonthlyBars({ perDay, today }: { perDay: Map<string, number>; today: string }) {
  const months = React.useMemo(() => monthlyTotals(perDay, today, 12), [perDay, today]);
  const peak = Math.max(1, ...months.map((m) => m.count));
  const summaryId = "zikr-months-summary";

  return (
    <section className="hairline-t mt-6 pt-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">Month by month</p>
      <div className="mt-3 flex items-end gap-1.5" role="img" aria-describedby={summaryId}>
        {months.map((m) => (
          <div key={m.month} className="flex min-w-0 flex-1 flex-col items-center gap-1">
            <span className="tnum text-[10.5px] text-ink-4">
              {m.count > 0 ? shortNumber(m.count) : ""}
            </span>
            <span
              title={`${monthName(m.month)} ${yearOf(m.month)} — ${groupNumber(m.count)}`}
              className="flex h-16 w-full items-end overflow-hidden rounded-[3px] bg-hover"
            >
              <span className="w-full bg-accent" style={{ height: `${(m.count / peak) * 100}%` }} />
            </span>
            <span className="text-[10.5px] text-ink-4">
              {monthNameOf(Number(m.month.slice(5, 7)) - 1, true).slice(0, 3)}
            </span>
          </div>
        ))}
      </div>
      <VisuallyHidden id={summaryId}>
        {months.map((m) => `${monthName(m.month)}: ${m.count}`).join(", ")}.
      </VisuallyHidden>
    </section>
  );
}

/** Kept for the day strip under the counter — a fortnight at a glance. */
export function RecentStrip({ perDay, today }: { perDay: Map<string, number>; today: string }) {
  const series = React.useMemo(() => seriesFor(perDay, addDays(today, -13), today), [perDay, today]);
  const peak = Math.max(1, ...series.map((d) => d.count));
  return (
    <div className="flex items-end gap-[3px]">
      {series.map((d) => (
        <span
          key={d.date}
          title={`${formatDate(d.date)} — ${groupNumber(d.count)}`}
          className="flex h-8 flex-1 items-end overflow-hidden rounded-[2px] bg-hover"
        >
          <span
            className={cn("w-full", d.date === today ? "bg-accent" : "bg-line-strong")}
            style={{ height: `${(d.count / peak) * 100}%` }}
          />
        </span>
      ))}
    </div>
  );
}
