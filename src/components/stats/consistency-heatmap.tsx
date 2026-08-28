"use client";

import * as React from "react";
import { CalendarCheck } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  formatDate, isToday, monthName, startOfWeek, weekday, weekdayHeaders,
} from "@/lib/date";
import { EmptyState } from "@/components/ui/primitives";
import { Chart, Legend, Panel, PanelNote, type TableSpec, type TipState } from "./chart-kit";
import { useOpenDay } from "./open-day";
import type { DayScore } from "./derive";

// Five steps of one accent — anything more becomes decoration.
const LEVEL_OPACITY = [0.14, 0.32, 0.5, 0.72, 1];
const STRONG = 0.8;

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
  const [cursor, setCursor] = React.useState<number | null>(null);
  const openDay = useOpenDay();

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

    // Longest unbroken run of strong days — the number a streak page would show,
    // but measured across everything tracked, not one habit.
    let run = 0;
    let longest = 0;
    for (const s of scores) {
      if (s.score != null && s.score >= STRONG) { run++; longest = Math.max(longest, run); }
      else run = 0;
    }

    // Which part is dragging the average down.
    const partTotals = new Map<string, { done: number; total: number }>();
    for (const s of scores) {
      for (const p of s.parts) {
        const row = partTotals.get(p.label) ?? { done: 0, total: 0 };
        row.done += p.done;
        row.total += p.total;
        partTotals.set(p.label, row);
      }
    }
    const weakest = [...partTotals.entries()]
      .filter(([, v]) => v.total > 0)
      .sort((a, b) => a[1].done / a[1].total - b[1].done / b[1].total)[0];

    return {
      tracked: tracked.length,
      mean,
      best,
      longest,
      perfect: tracked.filter((s) => (s.score ?? 0) > 0.9999).length,
      weakest: weakest
        ? { label: weakest[0], rate: weakest[1].done / weakest[1].total }
        : null,
    };
  }, [scores]);

  const summary = digest.tracked
    ? `${digest.tracked} tracked days at ${Math.round(digest.mean * 100)}% average completion, ` +
      `${digest.perfect} of them clean sweeps, longest strong run ${digest.longest} days. ` +
      (digest.weakest
        ? `${digest.weakest.label} is the part holding the average down, at ${Math.round(digest.weakest.rate * 100)}%.`
        : "Each cell blends that day's tasks, habits and salah.")
    : "Nothing has been tracked in this window yet.";

  const dowHeaders = weekdayHeaders(weekStart, "min");
  const orientation = weeks.list.length <= 14 ? "calendar" : "github";

  const describe = React.useCallback((i: number) => {
    const s = scores[i];
    if (!s) return "";
    if (s.score == null) return `${formatDate(s.date, { year: true })}: nothing tracked.`;
    const parts = s.parts.map((p) => `${p.label} ${p.done} of ${p.total}`).join(", ");
    return `${formatDate(s.date, { year: true })}: ${Math.round(s.score * 100)}% — ${parts}.`;
  }, [scores]);

  const table: TableSpec = {
    caption: "Day score, and the parts behind it.",
    columns: ["Date", "Score %", "Tasks", "Habits", "Salah"],
    rows: scores.map((s) => {
      const at = (label: string) => {
        const p = s.parts.find((x) => x.label === label);
        return p ? `${p.done}/${p.total}` : "—";
      };
      return [
        formatDate(s.date, { year: true }),
        s.score == null ? "—" : Math.round(s.score * 100),
        at("Tasks"),
        at("Habits"),
        at("Salah"),
      ];
    }),
  };

  return (
    <Panel id="panel-consistency" title="Consistency" subtitle={summary} table={table}>
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
          <div className={cn("min-w-0 flex-1", orientation === "calendar" && "sm:max-w-[430px]")}>
            <Chart
              height={(w) => layoutFor(w, weeks.list.length).height}
              animateKey={`${scores.length}-${orientation}`}
              label={`Daily consistency heatmap. ${summary}`}
              description="Each cell is one day, shaded by how much of that day's tasks, habits and salah you closed out."
              tip={({ w }) => {
                if (cursor == null || !scores[cursor]) return null;
                const L = layoutFor(w, weeks.list.length);
                const step = L.cell + L.gap;
                const gut = L.offsetX + L.gutter;
                const s = scores[cursor];
                const wi = weeks.index.get(startOfWeek(s.date, weekStart)) ?? 0;
                const di = (weekday(s.date) - weekStart + 7) % 7;
                const pos = L.orientation === "calendar"
                  ? { x: gut + di * step, y: L.headerH + wi * step }
                  : { x: gut + wi * step, y: L.headerH + di * step };
                const tip: TipState = {
                  x: pos.x + L.cell / 2,
                  y: pos.y,
                  title: formatDate(s.date),
                  rows: s.parts.length
                    ? [
                        ...s.parts.map((p) => ({ label: p.label, value: `${p.done}/${p.total}` })),
                        {
                          label: "Day score",
                          value: `${Math.round((s.score ?? 0) * 100)}%`,
                          color: "var(--accent)",
                        },
                      ]
                    : [{ label: "Nothing tracked", value: "—" }],
                };
                return tip;
              }}
              nav={{
                n: scores.length,
                index: cursor,
                onIndex: setCursor,
                describe,
                onActivate: (i) => openDay(scores[i].date),
                activateLabel: "open that day",
                step: orientation === "calendar"
                  ? { horizontal: 1, vertical: 7 }
                  : { horizontal: 7, vertical: 1 },
                hint: orientation === "calendar"
                  ? "Arrow keys move a day, up and down move a week"
                  : "Arrow keys move a week, up and down move a day",
              }}
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
                      <g aria-hidden>
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
                      </g>
                    ) : (
                      <g aria-hidden>
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
                      </g>
                    )}

                    {scores.map((s, i) => {
                      const p = posOf(s.date);
                      const level = s.score == null ? -1 : levelOf(s.score);
                      const today = isToday(s.date);
                      const isCursor = cursor === i;
                      return (
                        <g key={s.date} className="cursor-pointer">
                          <rect
                            x={p.x} y={p.y} width={L.cell} height={L.cell}
                            rx={Math.min(4, L.cell / 3)}
                            fill={level <= 0 ? "var(--hover)" : "var(--accent)"}
                            fillOpacity={level <= 0 ? (level < 0 ? 0.4 : 1) : LEVEL_OPACITY[level - 1]}
                            stroke={isCursor ? "var(--accent)" : today ? "var(--ink-3)" : "none"}
                            strokeWidth={isCursor ? 2 : 1}
                            onMouseEnter={() => setCursor(i)}
                            onMouseLeave={() => setCursor((c) => (c === i ? null : c))}
                            onClick={() => openDay(s.date)}
                          >
                            <title>{describe(i)}</title>
                          </rect>
                          {/* An untracked day is a shape, not just a paler square. */}
                          {level < 0 && L.cell >= 8 && (
                            <line
                              x1={p.x + 2.5} y1={p.y + L.cell - 2.5}
                              x2={p.x + L.cell - 2.5} y2={p.y + 2.5}
                              stroke="var(--line-strong)" strokeWidth={1}
                              pointerEvents="none"
                            />
                          )}
                        </g>
                      );
                    })}
                  </>
                );
              }}
            </Chart>

            <PanelNote>
              Click a day — or press Enter on it — to open the calendar there.
            </PanelNote>
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
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">
                Longest strong run
              </p>
              <p className="mt-1 text-[15px] font-medium text-ink tnum">
                {digest.longest}
                <span className="ml-1 text-[12px] text-ink-4">
                  {digest.longest === 1 ? "day" : "days"} at 80%+
                </span>
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
            <Legend
              items={[
                { key: "untracked", label: "Nothing tracked", color: "var(--hover)", pattern: "back-hatch", mark: "var(--line-strong)" },
              ]}
            />
          </div>
        </div>
      )}
    </Panel>
  );
}
