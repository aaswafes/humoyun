"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { dayNumber, monthName } from "@/lib/date";
import type { Task } from "@/lib/types";
import { SectionLabel } from "@/components/ui/primitives";
import { weeklyPages } from "./metrics";
import { shortDate } from "./plan";

const WEEKS = 8;

// viewBox units — the SVG scales to whatever width the column gives it.
const W = 248;
const H = 74;
const BASE_Y = 66;
const PLOT_H = 58;
const SLOT = W / WEEKS;
const BAR_W = 15;

export function ReadingPaceChart({
  tasks, weekStart, className,
}: {
  tasks: Task[];
  weekStart: number;
  className?: string;
}) {
  const [hover, setHover] = React.useState<number | null>(null);

  const weeks = React.useMemo(() => weeklyPages(tasks, WEEKS, weekStart), [tasks, weekStart]);
  const total = weeks.reduce((s, w) => s + w.pages, 0);
  const max = Math.max(...weeks.map((w) => w.pages), 1);
  const mean = total / WEEKS;

  const active = hover != null ? weeks[hover] : null;
  const caption = active
    ? `${active.pages.toLocaleString()} ${active.pages === 1 ? "page" : "pages"} · ${shortDate(active.start)} – ${shortDate(active.end)}`
    : total > 0
      ? `${total.toLocaleString()} pages · ${Math.round(mean).toLocaleString()} a week`
      : "Nothing finished yet";

  return (
    <section className={cn("min-w-0", className)}>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <SectionLabel>Reading pace</SectionLabel>
        <span className="truncate text-[11.5px] text-ink-3 tnum" aria-live="polite">{caption}</span>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={`Pages finished per week over the last ${WEEKS} weeks. ${total} pages in total.`}
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
          const x = i * SLOT + (SLOT - BAR_W) / 2;
          const on = hover === i;
          return (
            <g key={w.start}>
              <rect
                x={x} y={BASE_Y - PLOT_H} width={BAR_W} height={PLOT_H}
                rx={3}
                fill="var(--hover)"
              />
              {h > 0 && (
                <rect
                  x={x} y={BASE_Y - h} width={BAR_W} height={h}
                  rx={3}
                  fill="var(--accent)"
                  opacity={hover == null || on ? 1 : 0.42}
                  style={{ transition: "opacity 160ms var(--ease-out-apple)" }}
                />
              )}
              <rect
                x={i * SLOT} y={0} width={SLOT} height={H}
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
          return (
            <span
              key={w.start}
              className={cn(
                "flex-1 text-center text-[10.5px] tnum transition-colors duration-150",
                hover === i ? "text-ink-2" : "text-ink-4",
              )}
            >
              {firstOfMonth ? monthName(w.start, true) : dayNumber(w.start)}
            </span>
          );
        })}
      </div>

      {total === 0 && (
        <p className="mt-2 text-[11.5px] leading-relaxed text-ink-3">
          Tick off a reading block and the pages you finished each week land here.
        </p>
      )}
    </section>
  );
}
