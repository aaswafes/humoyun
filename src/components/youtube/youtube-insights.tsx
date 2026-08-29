"use client";

import * as React from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { addMonths, monthName, todayISO } from "@/lib/date";
import { VisuallyHidden } from "@/components/ui/form";
import { monthWatched, watchStreak, type WatchDay } from "@/components/watch/media-table";
import { useSticky } from "@/components/watch/watch-fields";

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
 * The analysis layer of the shelf — videos finished this month, hours spent,
 * the streak — behind one line that already answers "how much am I watching?".
 * The queue is what the page is for; this supports it.
 */
export function YoutubeInsights({
  days, className,
}: {
  /** merged watch history across every video and playlist */
  days: WatchDay[];
  className?: string;
}) {
  const [open, setOpen] = useSticky("humoyun.youtube.insightsOpen", false);

  const today = todayISO();
  const month = today.slice(0, 7);
  const prevMonth = addMonths(today, -1).slice(0, 7);

  const thisMonth = React.useMemo(() => monthWatched(days, month), [days, month]);
  const lastMonth = React.useMemo(() => monthWatched(days, prevMonth), [days, prevMonth]);
  const streak = React.useMemo(() => watchStreak(days, today), [days, today]);

  // Runtime is optional, so hours only exist once a video carries one.
  const hours = Math.round((thisMonth.minutes / 60) * 10) / 10;

  const bits: string[] = [];
  if (thisMonth.episodes > 0) {
    bits.push(`${thisMonth.episodes} ${thisMonth.episodes === 1 ? "video" : "videos"} this month`);
  }
  if (hours > 0) bits.push(`${hours}h watched`);
  if (streak.current > 0) bits.push(`${streak.current}-day streak`);

  const summary = bits.length
    ? bits.join(" · ")
    : "Videos, hours and streak — nothing ticked off yet";

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
          <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3">
            <VisuallyHidden>
              {`${thisMonth.episodes} videos finished in ${monthName(today)}`}
              {hours > 0 ? `, ${hours} hours watched. ` : ". "}
              {`Current watch streak ${streak.current} days, best ${streak.best}.`}
            </VisuallyHidden>

            <Stat
              label="Videos"
              display={thisMonth.episodes.toLocaleString()}
              positive={thisMonth.episodes > 0}
              unit="finished"
              footnote={
                lastMonth.episodes > 0
                  ? `${monthName(today)} · ${lastMonth.episodes} last month`
                  : monthName(today)
              }
            />
            <Stat
              label="Hours"
              display={hours > 0 ? String(hours) : "0"}
              positive={hours > 0}
              unit="watched"
              footnote={
                hours > 0
                  ? `${monthName(today)} · ${thisMonth.activeDays} ${thisMonth.activeDays === 1 ? "day" : "days"}`
                  : "Set a length to count hours"
              }
            />
            <Stat
              label="Streak"
              display={streak.current.toLocaleString()}
              positive={streak.current > 0}
              unit={streak.current === 1 ? "day" : "days"}
              footnote={streak.best > 0 ? `Best run ${streak.best} days` : "Days watched in a row"}
            />
          </div>
        </div>
      )}
    </section>
  );
}
