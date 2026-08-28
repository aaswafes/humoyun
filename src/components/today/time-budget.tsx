"use client";

import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatDuration, formatTime } from "@/lib/date";
import { VisuallyHidden } from "@/components/ui/form";
import type { Budget } from "./day-math";

/**
 * Planned work against the hours actually left. The bar is scaled to whichever
 * of the two is larger, so an overcommitted day reads as an overflow rather
 * than a full bar that could mean anything.
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
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="text-[13px] font-medium text-ink tnum">
          {planned > 0 ? `${formatDuration(planned)} planned` : "Nothing estimated yet"}
        </span>
        <span className={cn("text-[12.5px] tnum", over > 0 ? "font-medium text-warn" : "text-ink-2")}>
          {over > 0 ? (
            <span className="inline-flex items-center gap-1">
              <AlertTriangle className="size-3" aria-hidden />
              over by {formatDuration(over)}
            </span>
          ) : (
            `${formatDuration(left)} left`
          )}
        </span>
        <span className="text-[11.5px] text-ink-4 tnum">
          before {formatTime(dayEnd, hour12)}
        </span>
        {spent > 0 && (
          <span className="text-[11.5px] text-ink-4 tnum">· {formatDuration(spent)} already done</span>
        )}
        {unestimated > 0 && (
          <span className="text-[11.5px] text-ink-4 tnum">
            · {unestimated} without an estimate
          </span>
        )}
      </div>

      <div
        role="img"
        aria-describedby={id}
        className="relative mt-2 h-1.5 w-full overflow-visible rounded-full bg-hover"
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-500 ease-[var(--ease-out-apple)]",
            over > 0 ? "bg-warn" : "bg-accent",
          )}
          style={{ width: `${plannedPct}%` }}
        />
        {/* where the day actually runs out */}
        <span
          aria-hidden
          title={`End of day — ${formatTime(dayEnd, hour12)}`}
          className="absolute -top-1 h-[14px] w-[2px] rounded-full bg-ink-3"
          style={{ left: `calc(${leftPct}% - 1px)` }}
        />
      </div>

      <VisuallyHidden id={id}>{summary}</VisuallyHidden>

      {over > 0 && (
        <p className="mt-1.5 text-[11.5px] leading-snug text-ink-3">
          Something has to move. Drop an estimate, push a task to tomorrow, or accept the late finish.
        </p>
      )}
    </div>
  );
}
