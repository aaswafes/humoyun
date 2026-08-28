"use client";

import * as React from "react";
import { CalendarCheck } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  formatDate, isToday, monthName, startOfWeek, weekday, weekdayHeaders,
} from "@/lib/date";
import { EmptyState } from "@/components/ui/primitives";
import { Chart, Panel, type HoverPoint, type TipState } from "./chart-kit";
import type { DayScore } from "./derive";

// Five steps of one accent — anything more becomes decoration.
const LEVEL_OPACITY = [0.14, 0.32, 0.5, 0.72, 1];

function levelOf(score: number): number {
  if (score <= 0) return 0;
  if (score <= 0.25) return 1;
  if (score <= 0.5) return 2;
  if (score <= 0.75) return 3;
  if (score < 0.999) return 4;
  return 5;
}

interface Layout {
  orientation: "calendar" | "github";
  cell: number;
  gap: number;
  gutter: number;
  headerH: number;
  offsetX: number;
  height: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Short ranges read as a calendar; a whole year only fits as week columns. */
function layoutFor(w: number, weeks: number): Layout {
  if (weeks <= 14) {
    const gap = 3;
    const gutter = 46;
    const headerH = 18;
    const cell = clamp(Math.floor((w - gutter) / 7) - gap, 12, 40);
    return {
      orientation: "calendar",
      cell, gap, gutter, headerH,
      offsetX: Math.max(0, (w - (gutter + 7 * (cell + gap))) / 2),
      height: headerH + weeks * (cell + gap),
    };
  }
  const gap = 2;
  const gutter = 26;
  const headerH = 16;
  const cell = clamp(Math.floor((w - gutter) / weeks) - gap, 5, 15);
  return {
    orientation: "github",
    cell, gap, gutter, headerH,
    offsetX: Math.max(0, (w - (gutter + weeks * (cell + gap))) / 2),
    height: headerH + 7 * (cell + gap),
  };
}

export function ConsistencyHeatmap({
  scores, weekStart,
}: {
  scores: DayScore[];
  weekStart: number;
}) {
  const [hover, setHover] = React.useState<HoverPoint | null>(null);

  const weeks = React.useMemo(() => {
    const list: string[] = [];
    const index = new Map<string, number>();
    for (const s of scores) {
      const key = startOfWeek(s.date, weekStart);
      if (!index.has(key)) { index.set(key, list.length); list.push(key); }
    }
    return { list, index };
  }, [scores, weekStart]);

  const digest = React.useMemo(() => {
    const tracked = scores.filter((s) => s.score !== null);
    const mean = tracked.length
      ? tracked.reduce((sum, s) => sum + (s.score ?? 0), 0) / tracked.length
      : 0;
    const best = tracked.reduce<DayScore | null>(
      (acc, s) => (!acc || (s.score ?? 0) > (acc.score ?? 0) ? s : acc),
      null,
    );
    return {
      tracked: tracked.length,
      mean,
      best,
      perfect: tracked.filter((s) => (s.score ?? 0) > 0.9999).length,
    };
  }, [scores]);

  const summary = digest.tracked
    ? `${digest.tracked} tracked days at ${Math.round(digest.mean * 100)}% average completion, ` +
      `${digest.perfect} of them clean sweeps. Each cell blends that day's tasks, habits and salah.`
    : "Nothing has been tracked in this window yet.";

  const dowHeaders = weekdayHeaders(weekStart, "min");

  const tip: TipState | null = hover && scores[hover.i]
    ? {
        x: hover.x,
        y: hover.y,
        title: formatDate(scores[hover.i].date),
        rows: scores[hover.i].parts.length
          ? [
              ...scores[hover.i].parts.map((p) => ({ label: p.label, value: `${p.done}/${p.total}` })),
              {
                label: "Day score",
                value: `${Math.round((scores[hover.i].score ?? 0) * 100)}%`,
                color: "var(--accent)",
              },
            ]
          : [{ label: "Nothing tracked", value: "—" }],
      }
    : null;

  return (
    <Panel title="Consistency" subtitle={summary}>
      {!digest.tracked ? (
        <EmptyState
          className="py-8"
          icon={CalendarCheck}
          title="Nothing to colour in yet"
          description="Plan tasks, keep a habit or log your salah, and every day here fills in with how much of it you actually closed out."
        />
      ) : (
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          {/* A month of squares shouldn't stretch to fill a 1300px panel. */}
          <div className={cn("min-w-0 flex-1", weeks.list.length <= 14 && "sm:max-w-[430px]")}>
            <Chart
              height={(w) => layoutFor(w, weeks.list.length).height}
              label={`Daily consistency heatmap. ${summary}`}
              tip={tip}
            >
              {({ w }) => {
                const L = layoutFor(w, weeks.list.length);
                const step = L.cell + L.gap;
                const gut = L.offsetX + L.gutter;

                const posOf = (date: string) => {
                  const wi = weeks.index.get(startOfWeek(date, weekStart)) ?? 0;
                  const di = (weekday(date) - weekStart + 7) % 7;
                  return L.orientation === "calendar"
                    ? { x: gut + di * step, y: L.headerH + wi * step }
                    : { x: gut + wi * step, y: L.headerH + di * step };
                };

                return (
                  <>
                    {L.orientation === "calendar" ? (
                      <>
                        {dowHeaders.map((d, i) => (
                          <text
                            key={`${d}-${i}`}
                            x={gut + i * step + L.cell / 2} y={11}
                            textAnchor="middle" className="text-[10.5px]" fill="var(--ink-4)"
                          >
                            {d}
                          </text>
                        ))}
                        {L.cell >= 15 && weeks.list.map((wk, i) => (
                          <text
                            key={wk}
                            x={gut - 8} y={L.headerH + i * step + L.cell / 2 + 3.5}
                            textAnchor="end" className="text-[10.5px] tnum" fill="var(--ink-4)"
                          >
                            {formatDate(wk, { weekday: false })}
                          </text>
                        ))}
                      </>
                    ) : (
                      <>
                        {weeks.list.map((wk, i) =>
                          i === 0 || monthName(wk) !== monthName(weeks.list[i - 1]) ? (
                            <text
                              key={wk} x={gut + i * step} y={10}
                              className="text-[10.5px]" fill="var(--ink-4)"
                            >
                              {monthName(wk, true)}
                            </text>
                          ) : null,
                        )}
                        {[1, 3, 5].map((di) => (
                          <text
                            key={di}
                            x={gut - 6} y={L.headerH + di * step + L.cell / 2 + 3.5}
                            textAnchor="end" className="text-[10.5px]" fill="var(--ink-4)"
                          >
                            {dowHeaders[di]}
                          </text>
                        ))}
                      </>
                    )}

                    {scores.map((s, i) => {
                      const p = posOf(s.date);
                      const level = s.score == null ? -1 : levelOf(s.score);
                      const today = isToday(s.date);
                      return (
                        <rect
                          key={s.date}
                          x={p.x} y={p.y} width={L.cell} height={L.cell}
                          rx={Math.min(4, L.cell / 3)}
                          fill={level <= 0 ? "var(--hover)" : "var(--accent)"}
                          fillOpacity={level <= 0 ? (level < 0 ? 0.4 : 1) : LEVEL_OPACITY[level - 1]}
                          stroke={today ? "var(--ink-3)" : hover?.i === i ? "var(--ink-4)" : "none"}
                          strokeWidth={1}
                          onMouseEnter={() => setHover({ i, x: p.x + L.cell / 2, y: p.y })}
                          onMouseLeave={() => setHover((h) => (h?.i === i ? null : h))}
                        />
                      );
                    })}
                  </>
                );
              }}
            </Chart>
          </div>

          <div className="flex shrink-0 flex-row flex-wrap gap-x-8 gap-y-4 sm:w-[164px] sm:flex-col">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">
                Average day
              </p>
              <p className="mt-1 text-[15px] font-medium text-ink tnum">
                {Math.round(digest.mean * 100)}%
              </p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">
                Perfect days
              </p>
              <p className="mt-1 text-[15px] font-medium text-ink tnum">
                {digest.perfect}
                <span className="ml-1 text-[12px] text-ink-4">of {digest.tracked}</span>
              </p>
            </div>
            {digest.best && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">
                  Best day
                </p>
                <p className="mt-1 text-[13px] text-ink tnum">
                  {formatDate(digest.best.date, { weekday: false })}
                  <span className="ml-1.5 text-[12px] text-ink-3">
                    {Math.round((digest.best.score ?? 0) * 100)}%
                  </span>
                </p>
              </div>
            )}
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-ink-4">Less</span>
              <span className="size-2.5 rounded-[3px] bg-hover" />
              {LEVEL_OPACITY.map((o) => (
                <span
                  key={o}
                  className="size-2.5 rounded-[3px]"
                  style={{ background: "var(--accent)", opacity: o }}
                />
              ))}
              <span className="text-[11px] text-ink-4">More</span>
            </div>
          </div>
        </div>
      )}
    </Panel>
  );
}
