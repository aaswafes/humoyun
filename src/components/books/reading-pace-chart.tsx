"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { dayNumber, monthName } from "@/lib/date";
import { SectionLabel, Segmented } from "@/components/ui/primitives";
import { VisuallyHidden } from "@/components/ui/form";
import { weeklyBuckets, type ReadDay } from "./pace";
import { shortDate } from "./plan";

type Range = "8" | "12" | "26";

const RANGES: { value: Range; label: string; title: string }[] = [
  { value: "8", label: "8w", title: "Last eight weeks" },
  { value: "12", label: "12w", title: "Last twelve weeks" },
  { value: "26", label: "26w", title: "Last twenty-six weeks" },
];

// viewBox units — the SVG scales to whatever width the column gives it.
const W = 248;
const H = 74;
const BASE_Y = 66;
const PLOT_H = 58;

/**
 * Pages finished a week, counting logged sittings as well as ticked blocks.
 * The dashed line is the mean, so a bar above it is a good week without
 * anyone having to do the arithmetic.
 */
export function ReadingPaceChart({
  days, weekStart, className,
}: {
  days: ReadDay[];
  weekStart: number;
  className?: string;
}) {
  const [hover, setHover] = React.useState<number | null>(null);
  const [range, setRange] = React.useState<Range>("8");
  const count = Number(range);

  const weeks = React.useMemo(
    () => weeklyBuckets(days, count, weekStart), [days, count, weekStart]);

  const total = weeks.reduce((s, w) => s + w.pages, 0);
  const minutes = weeks.reduce((s, w) => s + w.minutes, 0);
  const max = Math.max(...weeks.map((w) => w.pages), 1);
  const mean = total / count;
  const best = weeks.reduce((b, w) => (w.pages > b.pages ? w : b), weeks[0]);

  const slot = W / count;
  const barW = Math.max(3, Math.min(15, slot * 0.62));

  const active = hover != null ? weeks[hover] : null;
  const caption = active
    ? `${active.pages.toLocaleString()} ${active.pages === 1 ? "page" : "pages"}${active.minutes ? ` · ${Math.round(active.minutes / 60 * 10) / 10}h` : ""} · ${shortDate(active.start)} – ${shortDate(active.end)}`
    : total > 0
      ? `${total.toLocaleString()} pages · ${Math.round(mean).toLocaleString()} a week`
      : "Nothing finished yet";

  const summaryId = React.useId();

  return (
    <section className={cn("min-w-0", className)}>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <SectionLabel>Reading pace</SectionLabel>
        <Segmented<Range>
          size="sm"
          value={range}
          onChange={(v) => { setRange(v); setHover(null); }}
          options={RANGES}
        />
      </div>

      <p className="mb-1.5 truncate text-[11.5px] text-ink-3 tnum" aria-live="polite">{caption}</p>

      <VisuallyHidden id={summaryId}>
        {total > 0
          ? `${total} pages over ${count} weeks, ${Math.round(mean)} a week on average. Best week ${shortDate(best.start)} with ${best.pages} pages.${minutes ? ` ${Math.round(minutes / 60)} hours logged.` : ""}`
          : `No pages finished in the last ${count} weeks.`}
      </VisuallyHidden>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={`Pages finished per week over the last ${count} weeks`}
        aria-describedby={summaryId}
        onMouseLeave={() => setHover(null)}
      >
        {total > 0 && (
          <line
            x1={0} x2={W}
            y1={BASE_Y - (mean / max) * PLOT_H} y2={BASE_Y - (mean / max) * PLOT_H}
            stroke="var(--line-strong)"
            strokeWidth={1}
            strokeDasharray="2 3"
          />
        )}

        {weeks.map((w, i) => {
          const h = w.pages > 0 ? Math.max(3, (w.pages / max) * PLOT_H) : 0;
          const x = i * slot + (slot - barW) / 2;
          const on = hover === i;
          return (
            <g key={w.start}>
              <rect
                x={x} y={BASE_Y - PLOT_H} width={barW} height={PLOT_H}
                rx={Math.min(3, barW / 2)}
                fill="var(--hover)"
              />
              {h > 0 && (
                <rect
                  x={x} y={BASE_Y - h} width={barW} height={h}
                  rx={Math.min(3, barW / 2)}
                  fill="var(--accent)"
                  opacity={hover == null || on ? 1 : 0.42}
                  style={{ transition: "opacity 160ms var(--ease-out-apple)" }}
                />
              )}
              <rect
                x={i * slot} y={0} width={slot} height={H}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
              >
                <title>{`${shortDate(w.start)} – ${shortDate(w.end)}: ${w.pages} pages`}</title>
              </rect>
            </g>
          );
        })}

        <line x1={0} x2={W} y1={BASE_Y + 0.5} y2={BASE_Y + 0.5} stroke="var(--line)" strokeWidth={1} />
      </svg>

      <div className="mt-1 flex">
        {weeks.map((w, i) => {
          const firstOfMonth = i === 0 || monthName(w.start, true) !== monthName(weeks[i - 1].start, true);
          // Past twelve buckets the day numbers collide, so only months are named.
          const label = firstOfMonth ? monthName(w.start, true) : count > 12 ? "" : String(dayNumber(w.start));
          return (
            <span
              key={w.start}
              className={cn(
                "flex-1 overflow-hidden text-center text-[10.5px] tnum transition-colors duration-150",
                hover === i ? "text-ink-2" : "text-ink-4",
              )}
            >
              {label}
            </span>
          );
        })}
      </div>

      {total === 0 && (
        <p className="mt-2 text-[11.5px] leading-relaxed text-ink-3">
          Tick off a reading block or log a session, and the pages you finished each week land here.
        </p>
      )}
    </section>
  );
}
