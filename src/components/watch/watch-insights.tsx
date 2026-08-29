"use client";

import * as React from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { addMonths, monthName, todayISO, yearOf } from "@/lib/date";
import { VisuallyHidden } from "@/components/ui/form";
import { monthWatched, watchStreak, type WatchDay } from "./media-table";

/**
 * One remembered open/closed answer, keyed per surface.
 * localStorage does not exist while the page is rendered on the server, so the
 * stored answer arrives one paint later rather than as a hydration mismatch.
 * It cannot be derived from anything — it is the user's memory.
 */
function useSticky(key: string, fallback: boolean): [boolean, (next: boolean) => void] {
  const [open, setOpen] = React.useState(fallback);

  React.useEffect(() => {
    try {
      const stored = window.localStorage.getItem(key);
      if (stored === "1" || stored === "0") setOpen(stored === "1");
    } catch { /* private mode: the default stands */ }
  }, [key]);

  const set = React.useCallback((next: boolean) => {
    setOpen(next);
    try { window.localStorage.setItem(key, next ? "1" : "0"); } catch { /* ignore */ }
  }, [key]);

  return [open, set];
}

function Stat({
  label, display, positive, unit, footnote,
}: {
  label: string;
  display: string;
  /** greys the numeral out when there is nothing to show */
  positive: boolean;
  unit: string;
  footnote: string;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[11.5px] text-ink-3">{label}</p>
      <p className="mt-1 flex items-baseline gap-1.5">
        <span className={cn("display-serif text-[22px] leading-none tnum", positive ? "text-ink" : "text-ink-4")}>
          {display}
        </span>
        <span className="text-[11.5px] text-ink-4">{unit}</span>
      </p>
      <p className="mt-0.5 truncate text-[11px] text-ink-4 tnum">{footnote}</p>
    </div>
  );
}

/**
 * The analysis layer of the shelf — the year, the month, the streak, the hours
 * — behind one line that already answers "how much am I watching?". The shelf
 * is what the page is for; this supports it.
 */
export function WatchInsights({
  days, finished, className,
}: {
  /** merged watch history across every title */
  days: WatchDay[];
  /** titles finished this calendar year */
  finished: number;
  className?: string;
}) {
  const [open, setOpen] = useSticky("humoyun.watch.insightsOpen", false);

  const today = todayISO();
  const month = today.slice(0, 7);
  const prevMonth = addMonths(today, -1).slice(0, 7);

  const thisMonth = React.useMemo(() => monthWatched(days, month), [days, month]);
  const lastMonth = React.useMemo(() => monthWatched(days, prevMonth), [days, prevMonth]);
  const streak = React.useMemo(() => watchStreak(days, today), [days, today]);

  // Runtime is optional, so hours only exist once a title carries one.
  const hours = Math.round((thisMonth.minutes / 60) * 10) / 10;

  const bits: string[] = [
    `${finished} ${finished === 1 ? "title" : "titles"} this year`,
  ];
  if (thisMonth.episodes > 0) bits.push(`${thisMonth.episodes} ep this month`);
  if (hours > 0) bits.push(`${hours}h watched`);
  if (streak.current > 0) bits.push(`${streak.current}-day streak`);

  const summary = finished > 0 || thisMonth.episodes > 0 || streak.current > 0
    ? bits.join(" · ")
    : "Finished titles, episodes and streak — nothing watched yet";

  return (
    <section className={className}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className={cn(
          "-mx-1 flex w-full min-w-0 cursor-pointer items-center gap-2 rounded-md px-1 py-2 text-left",
          "transition-colors duration-150 hover:bg-hover",
        )}
      >
        <ChevronRight
          aria-hidden
          className={cn(
            "size-3 shrink-0 text-ink-4 transition-transform duration-200 ease-[var(--ease-out-apple)]",
            open && "rotate-90",
          )}
        />
        <span className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">
          Insights
        </span>
        <span className="min-w-0 flex-1 truncate text-[12px] text-ink-3 tnum">{summary}</span>
      </button>

      {open && (
        <div
          className="pb-6 pt-1"
          style={{ animation: "hm-slide-up 200ms var(--ease-out-apple) both" }}
        >
          <div className={cn("grid grid-cols-2 gap-x-6 gap-y-5", hours > 0 ? "sm:grid-cols-4" : "sm:grid-cols-3")}>
            <VisuallyHidden>
              {`${finished} titles finished in ${yearOf(today)}. `}
              {`${thisMonth.episodes} episodes in ${monthName(today)}`}
              {hours > 0 ? `, ${hours} hours watched. ` : ". "}
              {`Current watch streak ${streak.current} days, best ${streak.best}.`}
            </VisuallyHidden>

            <Stat
              label="Finished"
              display={finished.toLocaleString()}
              positive={finished > 0}
              unit={finished === 1 ? "title" : "titles"}
              footnote={`In ${yearOf(today)}`}
            />
            <Stat
              label="Episodes"
              display={thisMonth.episodes.toLocaleString()}
              positive={thisMonth.episodes > 0}
              unit="watched"
              footnote={
                lastMonth.episodes > 0
                  ? `${monthName(today)} · ${lastMonth.episodes} last month`
                  : monthName(today)
              }
            />
            <Stat
              label="Streak"
              display={streak.current.toLocaleString()}
              positive={streak.current > 0}
              unit={streak.current === 1 ? "day" : "days"}
              footnote={streak.best > 0 ? `Best run ${streak.best} days` : "Days watched in a row"}
            />
            {hours > 0 && (
              <Stat
                label="Hours"
                display={String(hours)}
                positive
                unit="hours"
                footnote={`${monthName(today)} · ${thisMonth.activeDays} ${thisMonth.activeDays === 1 ? "day" : "days"}`}
              />
            )}
          </div>
        </div>
      )}
    </section>
  );
}
