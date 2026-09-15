"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { addDays, formatDate } from "@/lib/date";
import { Button, IconButton, Progress, Segmented } from "@/components/ui/primitives";
import { MiniEmpty, VisuallyHidden } from "@/components/ui/form";
import { groupNumber, shortNumber, type ZikrItem } from "./zikr-data";
import {
  heatGrid, historyRows, PERIOD_LABELS, perZikrBetween, rangeFor,
  type Period, type ZikrStats,
} from "./zikr-stats";

const PERIODS: Period[] = ["week", "month", "year", "all"];
const HISTORY_PAGE = 14;

/**
 * The record.
 *
 * Four questions in the order people ask them: how much this week, how much
 * this month, how the year looks, and what it all comes to. Nothing here is a
 * grade — a quiet week is a fact about a week, not a failure, so none of it is
 * coloured like a warning.
 */
export function ZikrReport({
  stats, today, items, weekStart,
}: {
  stats: ZikrStats;
  today: string;
  items: ZikrItem[];
  weekStart: number;
}) {
  const [period, setPeriod] = React.useState<Period>("week");
  const [offset, setOffset] = React.useState(0);
  const [shown, setShown] = React.useState(HISTORY_PAGE);

  const byId = React.useMemo(
    () => Object.fromEntries(items.map((i) => [i.id, i])) as Record<string, ZikrItem>,
    [items],
  );
  // A count outlives the button that made it, on purpose: deleting a zikr
  // must never quietly subtract from a total that was true.
  const labelOf = (id: string) => byId[id]?.label ?? "Deleted zikr";
  const tintOf = (id: string) => byId[id]?.tint ?? "slate";

  const range = React.useMemo(
    () => rangeFor(stats, period, offset, today, weekStart),
    [stats, period, offset, today, weekStart],
  );

  const scoped = React.useMemo(
    () => perZikrBetween(stats, range.from, range.to),
    [stats, range.from, range.to],
  );

  const ranked = React.useMemo(
    () => Object.entries(scoped.perZikr)
      .map(([id, count]) => ({ id, count }))
      .sort((a, b) => b.count - a.count),
    [scoped.perZikr],
  );

  const history = React.useMemo(
    () => historyRows(stats, range.from, range.to),
    [stats, range.from, range.to],
  );

  if (stats.total === 0) {
    return (
      <MiniEmpty className="py-10">
        Press a button and the record starts here — the week, the month, the year, and what it all comes to.
      </MiniEmpty>
    );
  }

  const top = ranked[0]?.count ?? 0;
  const perDay = scoped.days ? Math.round(scoped.total / scoped.days) : 0;

  return (
    <div>
      <header className="flex flex-wrap items-center gap-2">
        <Segmented
          size="sm"
          value={period}
          onChange={(next) => { setPeriod(next); setOffset(0); setShown(HISTORY_PAGE); }}
          options={PERIODS.map((p) => ({ value: p, label: PERIOD_LABELS[p] }))}
        />
        <p className="min-w-0 flex-1 truncate text-[12.5px] text-ink-3">{range.label}</p>
        {period !== "all" && (
          <div className="flex items-center gap-0.5">
            <IconButton label="Previous" onClick={() => setOffset(offset - 1)}>
              <ChevronLeft />
            </IconButton>
            <IconButton label="Next" disabled={offset >= 0} onClick={() => setOffset(offset + 1)}>
              <ChevronRight />
            </IconButton>
          </div>
        )}
        {offset !== 0 && (
          <Button size="sm" variant="ghost" onClick={() => setOffset(0)}>Now</Button>
        )}
      </header>

      <div className="mt-4 flex flex-wrap items-end gap-x-6 gap-y-2">
        <div>
          <p className="display-serif tnum text-[32px] leading-none text-ink">
            {groupNumber(scoped.total)}
          </p>
          <p className="mt-2 text-[12px] text-ink-3">recorded</p>
        </div>
        <p className="flex-1 pb-1 text-[11.5px] leading-relaxed text-ink-3">
          across <span className="tnum">{groupNumber(scoped.days)}</span>{" "}
          {scoped.days === 1 ? "day" : "days"}
          {perDay > 0 && (
            <> · <span className="tnum">{groupNumber(perDay)}</span> on a day you counted</>
          )}
        </p>
      </div>

      <Bars buckets={range.buckets} period={period} />

      <section className="hairline-t mt-6 pt-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">Which ones</p>
        {ranked.length === 0 ? (
          <MiniEmpty className="py-6">Nothing recorded in this stretch.</MiniEmpty>
        ) : (
          <ul className="mt-3 space-y-2.5">
            {ranked.map((row) => (
              <li key={row.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3">
                <span className="truncate text-[12.5px] text-ink-2">{labelOf(row.id)}</span>
                <span className="tnum text-[12px] text-ink-3">
                  {groupNumber(row.count)}
                  <span className="ml-1.5 text-ink-4">
                    {Math.round((row.count / (scoped.total || 1)) * 100)}%
                  </span>
                </span>
                <span className="col-span-2 mt-1">
                  <Progress value={row.count} max={top || 1} tint={tintOf(row.id)} height={6} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Heatmap perDay={stats.perDay} today={today} weekStart={weekStart} />

      <section className="hairline-t mt-6 pt-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">History</p>
        {history.length === 0 ? (
          <MiniEmpty className="py-6">No day in this stretch holds anything.</MiniEmpty>
        ) : (
          <>
            <ul className="mt-1">
              {history.slice(0, shown).map((row) => (
                <li key={row.date} className="hairline-t py-2.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[12.5px] text-ink-2">{formatDate(row.date, { year: true })}</span>
                    <span className="tnum text-[12.5px] font-medium text-ink">{groupNumber(row.total)}</span>
                  </div>
                  <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-4">
                    {Object.entries(row.counts)
                      .sort((a, b) => b[1] - a[1])
                      .map(([id, n]) => `${labelOf(id)} ${groupNumber(n)}`)
                      .join(" · ")}
                  </p>
                </li>
              ))}
            </ul>
            {history.length > shown && (
              <Button size="sm" variant="ghost" className="mt-2" onClick={() => setShown(shown + HISTORY_PAGE)}>
                Show {Math.min(HISTORY_PAGE, history.length - shown)} more
              </Button>
            )}
          </>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------
// Bars — days, months or years, depending on the period
// ---------------------------------------------------------

function Bars({
  buckets, period,
}: {
  buckets: { key: string; label: string; count: number }[];
  period: Period;
}) {
  const peak = Math.max(1, ...buckets.map((b) => b.count));
  const summaryId = `zikr-bars-${period}`;
  // A month draws thirty-one bars; labelling every one turns the axis to mush.
  const crowded = buckets.length > 16;

  return (
    <section className="mt-4">
      <div className="flex items-end gap-[3px]" role="img" aria-describedby={summaryId}>
        {buckets.map((bucket, i) => (
          <div key={bucket.key} className="flex min-w-0 flex-1 flex-col items-center gap-1">
            {!crowded && (
              <span className="tnum text-[10px] text-ink-4">
                {bucket.count > 0 ? shortNumber(bucket.count) : ""}
              </span>
            )}
            <span
              title={`${bucket.label} — ${groupNumber(bucket.count)}`}
              className="flex h-20 w-full items-end overflow-hidden rounded-[3px] bg-hover"
            >
              <span
                className="w-full bg-accent transition-[height] duration-300 ease-[var(--ease-out-apple)]"
                style={{ height: `${(bucket.count / peak) * 100}%` }}
              />
            </span>
            <span className="tnum truncate text-[10.5px] text-ink-4">
              {crowded && i % 2 === 1 ? "" : bucket.label}
            </span>
          </div>
        ))}
      </div>
      <VisuallyHidden id={summaryId}>
        {buckets.map((b) => `${b.label}: ${b.count}`).join(", ")}.
      </VisuallyHidden>
    </section>
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

// The same ladder the focus heatmap uses: one painted token at four opacities,
// so both themes are handled by the token rather than by a second palette.
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
  // extraordinary sitting would otherwise flatten a year to the palest step.
  const busy = React.useMemo(() => {
    const counts = [...perDay.values()].filter((n) => n > 0).sort((a, b) => a - b);
    if (!counts.length) return 1;
    return Math.max(1, counts[Math.floor(counts.length * 0.75)]);
  }, [perDay]);

  const summaryId = "zikr-heat-summary";

  return (
    <section className="hairline-t mt-6 pt-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">The last year</p>
      <div className="mt-3 overflow-x-auto pb-1">
        <div className="flex min-w-[560px] gap-[3px]" role="img" aria-describedby={summaryId}>
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

      <div className="mt-2 flex items-center gap-1.5 text-[11px] text-ink-4">
        <span>Less</span>
        {LEVEL_OPACITY.map((_, level) => (
          <Swatch key={level} level={level} />
        ))}
        <span>More</span>
      </div>

      <VisuallyHidden id={summaryId}>
        A year of daily totals, ending today. The darkest squares are days above {groupNumber(busy)}.
      </VisuallyHidden>
    </section>
  );
}

// ---------------------------------------------------------
// The rail
// ---------------------------------------------------------

/** The long view. The one 32px numeral in the rail, and no second copy of it. */
export function ZikrLifetime({ stats, today }: { stats: ZikrStats; today: string }) {
  const last30 = React.useMemo(
    () => perZikrBetween(stats, addDays(today, -29), today).total,
    [stats, today],
  );
  const perDay = stats.activeDays ? Math.round(stats.total / stats.activeDays) : 0;

  return (
    <section className="surface p-4">
      <h2 className="text-[13px] font-medium text-ink">Lifetime</h2>

      <p className="display-serif tnum mt-3 text-[32px] leading-none text-ink">
        {groupNumber(stats.total)}
      </p>
      <p className="mt-2 text-[11.5px] leading-relaxed text-ink-3">
        recorded in all
        {stats.firstDate && <> since {formatDate(stats.firstDate, { year: true })}</>}
      </p>

      <dl className="hairline-t mt-4 grid grid-cols-2 gap-x-3 gap-y-3 pt-4">
        <Stat label="Streak" value={groupNumber(stats.streak)} suffix={stats.streak === 1 ? "day" : "days"} />
        <Stat
          label="Longest"
          value={groupNumber(stats.longestStreak)}
          suffix={stats.longestStreak === 1 ? "day" : "days"}
        />
        <Stat label="Days counted" value={groupNumber(stats.activeDays)} />
        <Stat label="Usual day" value={groupNumber(perDay)} />
        <Stat label="Last 30 days" value={groupNumber(last30)} />
        <Stat
          label="Best day"
          value={stats.bestDay ? groupNumber(stats.bestDay.count) : "—"}
          suffix={stats.bestDay ? formatDate(stats.bestDay.date) : undefined}
        />
      </dl>
    </section>
  );
}

function Stat({ label, value, suffix }: { label: string; value: string; suffix?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-ink-4">{label}</dt>
      <dd className="mt-0.5 flex flex-wrap items-baseline gap-x-1">
        <span className="tnum text-[15px] font-medium text-ink">{value}</span>
        {suffix && <span className="truncate text-[11px] text-ink-4">{suffix}</span>}
      </dd>
    </div>
  );
}
