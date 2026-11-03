"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import {
  addDays, dayNameOf, daysBetween, formatDate, formatTime, monthName, startOfWeek, weekday,
} from "@/lib/date";
import { Button } from "@/components/ui/primitives";
import { MiniEmpty, VisuallyHidden } from "@/components/ui/form";
import { Fold, useFold } from "@/components/salah/fold";
import { currentStreak, summarize, type TahajjudNight } from "./night-data";

const WEEKS = 53;
const HISTORY_PAGE = 30;

/**
 * Tahajjud's own numbers, kept apart from the five on purpose: a night prayer
 * is voluntary, so nothing here is a score or a debt — only what was kept,
 * how often, and when.
 */
export function TahajjudStats({
  current, index, weekStart,
}: {
  current: string;
  index: Map<string, TahajjudNight>;
  weekStart: number;
}) {
  const hour12 = useStore((s) => s.hour12);
  const [historyOpen, setHistoryOpen] = useFold("tahajjud.history", false);
  const [shown, setShown] = React.useState(HISTORY_PAGE);
  const summaryId = React.useId();
  const yearRef = React.useRef<HTMLDivElement>(null);

  // The night in play may simply not be logged yet; it only counts once it is.
  const settled = index.has(current) ? current : addDays(current, -1);
  const keys = React.useMemo(() => [...index.keys()].sort(), [index]);
  const first = keys[0] ?? null;

  const month = React.useMemo(() => summarize(index, daysBetween(addDays(settled, -29), settled)), [index, settled]);
  const lifetime = React.useMemo(
    () => (first && first <= settled ? summarize(index, daysBetween(first, settled)) : null),
    [index, first, settled],
  );
  const streak = React.useMemo(() => currentStreak(index, current), [index, current]);

  // Every weekday's share is out of how many of that weekday there have been
  // since the first kept night — not since the account was made.
  const weekdayRows = React.useMemo(() => {
    if (!lifetime || !first) return [];
    const seen = Array.from({ length: 7 }, () => 0);
    daysBetween(first, settled).forEach((d) => { seen[weekday(d)] += 1; });
    return Array.from({ length: 7 }, (_, i) => {
      const wd = (i + weekStart) % 7;
      return { wd, kept: lifetime.byWeekday[wd], of: seen[wd] };
    });
  }, [lifetime, first, settled, weekStart]);

  const weeks = React.useMemo(() => {
    const start = startOfWeek(addDays(current, -(WEEKS - 1) * 7), weekStart);
    return Array.from({ length: WEEKS }, (_, w) =>
      Array.from({ length: 7 }, (_, d) => addDays(start, w * 7 + d)),
    );
  }, [current, weekStart]);
  const yearKept = weeks.flat().filter((d) => index.has(d)).length;

  // When the year is wider than the screen, open on the recent weeks rather
  // than on a year ago. Where it fits, there is nothing to scroll.
  const hasNights = !!lifetime;
  React.useLayoutEffect(() => {
    const el = yearRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [hasNights]);

  // The toggle that fills this in sits right above it, so a short line is
  // enough — a full empty state would only repeat that button.
  if (!lifetime) {
    return (
      <MiniEmpty>
        No nights recorded yet. Mark one above and the count starts here — how often, how many
        rakat, and which nights you tend to wake.
      </MiniEmpty>
    );
  }

  const strongest = [...weekdayRows].sort((a, b) => b.kept / Math.max(1, b.of) - a.kept / Math.max(1, a.of))[0];
  const tiles = [
    {
      label: "Last 30 nights",
      value: String(month.nights),
      sub: `of 30 · ${Math.round((month.nights / 30) * 100)}%`,
    },
    {
      label: "In a row",
      value: String(streak),
      sub: `longest run ${lifetime.longest}`,
    },
    {
      label: "Rakat a night",
      value: lifetime.avgRakat == null ? "—" : (Math.round(lifetime.avgRakat * 10) / 10).toString(),
      sub: lifetime.counted ? `${lifetime.rakat} in all` : "no counts written down",
    },
    {
      label: "Usually rise at",
      value: lifetime.typical == null ? "—" : formatTime(lifetime.typical, hour12),
      sub: lifetime.timed ? `middle of ${lifetime.timed} timed ${lifetime.timed === 1 ? "night" : "nights"}` : "add a time to a night",
    },
  ];

  const history = [...keys].reverse();

  return (
    <div className="flex flex-col gap-8">
      <section aria-label="Tahajjud at a glance" className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
        {tiles.map((tile) => (
          <div key={tile.label} className="min-w-0">
            <p className="text-[11.5px] text-ink-3">{tile.label}</p>
            <p className="display-serif tnum mt-1.5 text-[32px] leading-none text-ink">{tile.value}</p>
            <p className="tnum mt-1.5 truncate text-[11.5px] text-ink-4">{tile.sub}</p>
          </div>
        ))}
      </section>

      <section className="hairline-t pt-5">
        <h2 className="text-[13px] font-medium text-ink">The last year</h2>
        <p className="mt-1 text-[12px] text-ink-3">
          <span className="tnum">{yearKept}</span> {yearKept === 1 ? "night" : "nights"} kept across{" "}
          <span className="tnum">{WEEKS}</span> weeks.
        </p>
        <VisuallyHidden id={summaryId}>
          {yearKept} nights kept in the last {WEEKS} weeks, {lifetime.nights} since the first one on {formatDate(first as string)}.
        </VisuallyHidden>

        {/* Wide on purpose: on a phone it scrolls inside its own box and the page stays put. */}
        <div ref={yearRef} className="mt-4 overflow-x-auto overscroll-x-contain pb-1">
          <div role="img" aria-describedby={summaryId} className="flex w-max gap-[3px]">
            <div className="mr-1.5 flex flex-col gap-[3px] pt-[18px]">
              {Array.from({ length: 7 }, (_, i) => (
                <span key={i} className="h-[11px] text-[10.5px] leading-[11px] text-ink-4">
                  {i % 2 ? dayNameOf((i + weekStart) % 7, "short") : ""}
                </span>
              ))}
            </div>
            {weeks.map((week) => {
              const opensMonth = week.find((d) => d.endsWith("-01"));
              return (
                <div key={week[0]} className="flex flex-col gap-[3px]">
                  <span className="h-[15px] w-[11px] overflow-visible whitespace-nowrap text-[10.5px] leading-[15px] text-ink-4">
                    {opensMonth ? monthName(opensMonth, true) : ""}
                  </span>
                  {week.map((day) => {
                    const kept = index.get(day);
                    const future = day > current;
                    return (
                      <span
                        key={day}
                        title={future ? undefined : `${formatDate(day)} · ${kept ? `kept${kept.rakat ? `, ${kept.rakat} rakat` : ""}` : "not kept"}`}
                        className={cn(
                          "size-[11px] rounded-[3px]",
                          kept ? "bg-accent" : future ? "bg-transparent" : "bg-hover",
                          day === current && "ring-1 ring-line-strong",
                        )}
                      />
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="hairline-t pt-5">
        <h2 className="text-[13px] font-medium text-ink">Which nights you rise</h2>
        <p className="mt-1 text-[12px] text-ink-3">
          {strongest && strongest.kept > 0 ? (
            <>
              Most often the night into {dayNameOf(strongest.wd, "long")}, counting since{" "}
              {formatDate(first as string)}.
            </>
          ) : (
            <>Counting since {formatDate(first as string)}.</>
          )}
        </p>
        <ul className="mt-4 flex max-w-[520px] flex-col gap-2">
          {weekdayRows.map((row) => {
            const pct = row.of ? Math.round((row.kept / row.of) * 100) : 0;
            return (
              <li key={row.wd} className="grid grid-cols-[40px_minmax(0,1fr)_88px] items-center gap-3">
                <span className="text-[12px] text-ink-2">{dayNameOf(row.wd, "short")}</span>
                <span className="h-2 overflow-hidden rounded-full bg-hover" aria-hidden>
                  <span className="block h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
                </span>
                <span className="tnum text-right text-[12px] text-ink-3">
                  {row.kept} of {row.of} <span className="text-ink-4">· {pct}%</span>
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <Fold
        id="tahajjud-history"
        title="Every night recorded"
        summary={
          <>
            <span className="tnum">{lifetime.nights}</span> since {formatDate(first as string, { year: true })}
          </>
        }
        open={historyOpen}
        onOpenChange={setHistoryOpen}
      >
        <ul className="flex max-w-[520px] flex-col">
          {history.slice(0, shown).map((date) => {
            const night = index.get(date) as TahajjudNight;
            return (
              <li key={date} className="hairline-b flex items-baseline justify-between gap-3 py-2 text-[12.5px]">
                <span className="text-ink-2">{formatDate(date, { year: date.slice(0, 4) !== current.slice(0, 4) })}</span>
                <span className="tnum text-ink-3">
                  {night.rakat != null ? `${night.rakat} rakat` : "—"}
                  {night.at != null && <span className="text-ink-4"> · {formatTime(night.at, hour12)}</span>}
                </span>
              </li>
            );
          })}
        </ul>
        {history.length > shown && (
          <Button size="sm" variant="ghost" className="mt-2" onClick={() => setShown(shown + HISTORY_PAGE)}>
            Show <span className="tnum">{Math.min(HISTORY_PAGE, history.length - shown)}</span> more
          </Button>
        )}
      </Fold>
    </div>
  );
}
