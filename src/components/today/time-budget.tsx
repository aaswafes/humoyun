"use client";

import { cn } from "@/lib/cn";
import { formatDuration, formatTime } from "@/lib/date";
import { VisuallyHidden } from "@/components/ui/form";
import type { Budget } from "./day-math";

/**
 * Planned work against the hours actually left. The bar is scaled to whichever
 * of the two is larger, so an overcommitted day reads as an overflow rather
 * than a full bar that could mean anything.
 *
 * Being over-planned is information, not an emergency: it is stated in grey,
 * with the end of the day marked on the bar, and no warning colour anywhere.
 */
export function TimeBudget({
  budget, hour12, className, id,
}: {
  budget: Budget;
  hour12: boolean;
  className?: string;
  id?: string;
}) {
  const { planned, left, over, unestimated, dayEnd, spent } = budget;
  const scale = Math.max(planned, left, 1);
  const plannedPct = Math.round((planned / scale) * 100);
  const leftPct = Math.round((left / scale) * 100);

  const summary = over
    ? `${formatDuration(planned)} planned against ${formatDuration(left)} left — over by ${formatDuration(over)}.`
    : `${formatDuration(planned)} planned, ${formatDuration(left)} left before ${formatTime(dayEnd, hour12)}.`;

  return (
    <div className={cn("min-w-0", className)}>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 tnum">
        <span className="text-[12.5px] font-medium text-ink">
          {planned > 0 ? `${formatDuration(planned)} planned` : "Nothing estimated yet"}
        </span>
        <span className="text-[12px] text-ink-3">
          {over > 0 ? `over by ${formatDuration(over)}` : `${formatDuration(left)} left`}
        </span>
        <span className="text-[11.5px] text-ink-4">before {formatTime(dayEnd, hour12)}</span>
        {/* On a phone these two take a line of their own: wrapped in among
            the rest, the line they started on began with a stray "·". */}
        {(spent > 0 || unestimated > 0) && (
          <span className="contents max-md:block max-md:basis-full">
            {spent > 0 && (
              <span className="text-[11.5px] text-ink-4">
                <span className="max-md:hidden">· </span>{formatDuration(spent)} already done
              </span>
            )}
            {unestimated > 0 && (
              <span className={cn("text-[11.5px] text-ink-4", spent > 0 && "max-md:ml-1")}>
                <span className={cn(spent === 0 && "max-md:hidden")}>· </span>{unestimated} without an estimate
              </span>
            )}
          </span>
        )}
      </div>

      <div
        role="img"
        aria-describedby={id}
        className="relative mt-2 h-1.5 w-full overflow-visible rounded-full bg-hover"
      >
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-500 ease-[var(--ease-out-apple)]"
          style={{ width: `${plannedPct}%` }}
        />
        {/* where the day actually runs out */}
        <span
          aria-hidden
          title={`End of day — ${formatTime(dayEnd, hour12)}`}
          className="absolute -top-1 h-[14px] w-[2px] rounded-full bg-ink-4"
          style={{ left: `calc(${leftPct}% - 1px)` }}
        />
      </div>

      <VisuallyHidden id={id}>{summary}</VisuallyHidden>

      {over > 0 && (
        <p className="mt-1.5 text-[11.5px] leading-snug text-ink-4">
          Something has to move. Drop an estimate, push a task to tomorrow, or accept the late finish.
        </p>
      )}
    </div>
  );
}
