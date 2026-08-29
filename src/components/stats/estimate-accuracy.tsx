"use client";

import * as React from "react";
import { Gauge } from "lucide-react";
import { formatDate, formatDuration } from "@/lib/date";
import { Button, EmptyState } from "@/components/ui/primitives";
import { useStore } from "@/lib/store";
import {
  AxisText, Chart, GridY, HoverSurface, Legend, Panel, PanelNote, SeriesPatterns, UnitLabel,
  axisTicks, fillOf, linePath, niceMax, pctOf, useSvgId,
  type SeriesStyle, type TableSpec, type TipState,
} from "./chart-kit";
import { useOpenDay } from "./open-day";
import type { EstimatePoint, EstimateSample, EstimateSummary } from "./derive";

const PAD = { l: 38, r: 8, t: 20, b: 22 };
const H = 200;
const DIST_H = 10;

/** Three ways an estimate can land. Each one carries a shape as well as a colour. */
const SPREAD: readonly SeriesStyle[] = [
  { key: "under", label: "Came in under", color: "var(--accent)", pattern: "dots", mark: "var(--raised)" },
  { key: "close", label: "Within 15%", color: "var(--success)", pattern: "solid" },
  { key: "over", label: "Ran over", color: "var(--warn)", pattern: "hatch", mark: "var(--raised)" },
] as const;

/** Consecutive stretches of measured buckets, so a quiet week breaks the line. */
function runsOf(points: EstimatePoint[]): number[][] {
  const runs: number[][] = [];
  let current: number[] = [];
  points.forEach((p, i) => {
    if (p.ratio == null) {
      if (current.length) runs.push(current);
      current = [];
      return;
    }
    current.push(i);
  });
  if (current.length) runs.push(current);
  return runs;
}

export function EstimateAccuracy({
  points, samples, summary: stats, grain, previous, previousLabel,
}: {
  points: EstimatePoint[];
  samples: EstimateSample[];
  summary: EstimateSummary;
  grain: "day" | "week";
  previous?: EstimatePoint[] | null;
  previousLabel?: string;
}) {
  const [cursor, setCursor] = React.useState<number | null>(null);
  const openDay = useOpenDay();
  const startTimer = useStore((s) => s.startTimer);
  const patternId = useSvgId("est");
  const ghost = previous && previous.length === points.length ? previous : null;

  const off = stats.ratio != null ? Math.round(Math.abs(stats.ratio - 1) * 100) : 0;
  const summary =
    stats.n === 0
      ? "No finished task in this window carries both a booked duration and a measured time, so there is nothing to check an estimate against."
      : `${stats.n} finished ${stats.n === 1 ? "task has" : "tasks have"} both an estimate and a measured time. ` +
        (stats.ratio == null
          ? ""
          : off < 5
            ? `The middle one landed within ${off}% of plan — your estimates are honest.`
            : `The middle one ran ${off}% ${stats.ratio > 1 ? "over" : "under"} — an hour you book takes about ${Math.round(60 * stats.ratio)} minutes.`) +
        (stats.drift != null
          ? ` They are getting ${stats.drift < -0.02 ? "closer" : stats.drift > 0.02 ? "further off" : "no better and no worse"} across the window.`
          : "");

  const geom = React.useCallback((w: number) => {
    const n = Math.max(1, points.length);
    const plotW = Math.max(1, w - PAD.l - PAD.r);
    const plotH = H - PAD.t - PAD.b;
    const highest = Math.max(
      1.5,
      ...points.map((p) => p.ratio ?? 0),
      ...(ghost ? ghost.map((p) => p.ratio ?? 0) : []),
    );
    const max = niceMax(highest);
    return {
      n, plotW, plotH, max,
      x: (i: number) => PAD.l + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW),
      y: (v: number) => PAD.t + plotH - (Math.min(v, max) / max) * plotH,
    };
  }, [points, ghost]);

  const describe = React.useCallback((i: number) => {
    const p = points[i];
    if (!p) return "";
    if (p.ratio == null) return `${p.title}: no task with both an estimate and a measured time.`;
    const delta = Math.round(Math.abs(p.ratio - 1) * 100);
    return (
      `${p.title}: ${p.n} ${p.n === 1 ? "task" : "tasks"}, ` +
      `${Math.round(p.ratio * 100)}% of estimate — ${delta}% ${p.ratio >= 1 ? "over" : "under"}. ` +
      `Booked ${formatDuration(Math.round(p.plannedMin))}, spent ${formatDuration(Math.round(p.actualMin))}.`
    );
  }, [points]);

  const tipAt = (w: number): TipState | null => {
    if (cursor == null || !points[cursor]) return null;
    const g = geom(w);
    const p = points[cursor];
    if (p.ratio == null) {
      return {
        x: g.x(cursor), y: g.y(1), title: p.title,
        rows: [{ label: "Nothing measured", value: "—" }],
      };
    }
    return {
      x: g.x(cursor),
      y: g.y(p.ratio),
      title: p.title,
      rows: [
        { label: "Of estimate", value: `${Math.round(p.ratio * 100)}%`, color: "var(--accent)" },
        { label: "Booked", value: formatDuration(Math.round(p.plannedMin)) },
        { label: "Spent", value: formatDuration(Math.round(p.actualMin)) },
        { label: "Tasks", value: String(p.n) },
        ...(ghost && ghost[cursor].ratio != null
          ? [{ label: previousLabel ?? "Previous", value: `${Math.round(ghost[cursor].ratio! * 100)}%`, color: "var(--ink-4)", muted: true }]
          : []),
      ],
    };
  };

  const table: TableSpec = {
    caption: "Median actual time as a share of the booked estimate.",
    columns: [grain === "day" ? "Day" : "Week", "Tasks", "Of estimate %", "Booked (min)", "Spent (min)"],
    rows: points
      .filter((p) => p.n > 0)
      .map((p) => [
        p.title,
        p.n,
        p.ratio != null ? Math.round(p.ratio * 100) : "—",
        Math.round(p.plannedMin),
        Math.round(p.actualMin),
      ]),
  };

  const spreadTotal = stats.under + stats.close + stats.over;
  const worstFew = React.useMemo(
    () => [...samples].sort((a, b) => Math.abs(b.ratio - 1) - Math.abs(a.ratio - 1)).slice(0, 3),
    [samples],
  );

  return (
    <Panel id="panel-estimates" title="Estimate accuracy" subtitle={summary} table={table}>
      {stats.n === 0 ? (
        <EmptyState
          className="py-8"
          icon={Gauge}
          title="Nothing to check your estimates against"
          description="Give a task a duration, run the timer while you do it, then tick it off. Once a handful have both numbers this panel shows how far off your guesses run, and whether they are improving."
          action={
            <Button
              variant="primary"
              size="sm"
              onClick={() => startTimer({ label: "Focus", mode: "pomodoro" })}
            >
              Start a focus session
            </Button>
          }
        />
      ) : (
        <>
          <Chart
            height={H}
            animateKey={`${points.length}-${grain}-${ghost ? 1 : 0}`}
            label={`Median time spent as a share of the booked estimate, per ${grain}. ${summary}`}
            tip={({ w }) => tipAt(w)}
            nav={{
              n: points.length,
              index: cursor,
              onIndex: setCursor,
              describe,
              onActivate: (i) => { if (grain === "day") openDay(points[i].key); },
              activateLabel: grain === "day" ? "open that day" : undefined,
            }}
          >
            {({ w }) => {
              const g = geom(w);
              const labelStep = Math.max(1, Math.ceil(g.n / 6));
              const baseline = g.y(1);

              return (
                <>
                  <UnitLabel x={0} y={9}>% of estimate</UnitLabel>
                  <GridY
                    x0={PAD.l} x1={PAD.l + g.plotW}
                    ticks={axisTicks(g.max, 2)} y={g.y}
                    format={(v) => `${Math.round(v * 100)}`}
                  />

                  {/* Everything is read against "exactly as planned". */}
                  <line
                    x1={PAD.l} x2={PAD.l + g.plotW} y1={baseline} y2={baseline}
                    stroke="var(--success)" strokeWidth={1.25} strokeDasharray="4 3"
                  >
                    <title>Exactly as planned</title>
                  </line>
                  <UnitLabel x={PAD.l + g.plotW} y={baseline - 4} anchor="end" fill="var(--success)">
                    as planned
                  </UnitLabel>

                  {ghost && runsOf(ghost).map((run) => (
                    <path
                      key={`ghost-${run[0]}`}
                      d={linePath(run.map((i) => [g.x(i), g.y(ghost[i].ratio!)] as [number, number]))}
                      fill="none" stroke="var(--ink-4)" strokeWidth={1.25} strokeDasharray="1 3"
                    >
                      <title>{previousLabel ?? "Previous window"}</title>
                    </path>
                  ))}

                  {runsOf(points).map((run) => (
                    <path
                      key={`run-${run[0]}`}
                      d={linePath(run.map((i) => [g.x(i), g.y(points[i].ratio!)] as [number, number]))}
                      fill="none" stroke="var(--accent)" strokeWidth={1.75}
                      strokeLinejoin="round" strokeLinecap="round"
                    />
                  ))}

                  {points.map((p, i) =>
                    p.ratio == null ? null : (
                      <circle
                        key={p.key}
                        cx={g.x(i)} cy={g.y(p.ratio)}
                        r={Math.min(4.5, 2 + Math.log2(1 + p.n))}
                        fill={cursor === i ? "var(--accent)" : "var(--canvas)"}
                        stroke="var(--accent)" strokeWidth={1.5}
                      >
                        <title>{describe(i)}</title>
                      </circle>
                    ),
                  )}

                  {points.map((p, i) =>
                    i % labelStep === 0 || i === g.n - 1 ? (
                      <AxisText key={p.key} x={g.x(i)} y={H - 6}>{p.label}</AxisText>
                    ) : null,
                  )}

                  {cursor != null && (
                    <line
                      x1={g.x(cursor)} x2={g.x(cursor)} y1={PAD.t} y2={PAD.t + g.plotH}
                      stroke="var(--line-strong)" strokeWidth={1} pointerEvents="none"
                    />
                  )}

                  <HoverSurface
                    x={PAD.l} y={PAD.t} w={g.plotW} h={g.plotH} n={g.n}
                    onIndex={setCursor}
                    onLeave={() => setCursor(null)}
                  />
                </>
              );
            }}
          </Chart>

          <div className="mt-4 hairline-t pt-3">
            <Chart
              height={DIST_H}
              label={
                `How the ${spreadTotal} measured tasks landed: ${stats.under} came in under, ` +
                `${stats.close} within 15%, ${stats.over} ran over.`
              }
            >
              {({ w }) => {
                let cursorX = 0;
                return (
                  <>
                    <SeriesPatterns prefix={patternId} series={SPREAD} />
                    {SPREAD.map((s) => {
                      const value = s.key === "under" ? stats.under : s.key === "close" ? stats.close : stats.over;
                      const width = spreadTotal > 0 ? (value / spreadTotal) * w : 0;
                      const x = cursorX;
                      cursorX += width;
                      if (width <= 0) return null;
                      return (
                        <rect
                          key={s.key}
                          x={x} y={0} width={Math.max(1, width - 1)} height={DIST_H}
                          rx={2}
                          fill={fillOf(patternId, s)}
                        >
                          <title>{`${s.label}: ${value} of ${spreadTotal} tasks (${pctOf(value, spreadTotal)}%)`}</title>
                        </rect>
                      );
                    })}
                  </>
                );
              }}
            </Chart>
            <Legend
              className="mt-2"
              items={SPREAD.map((s) => ({
                key: s.key,
                label: s.label,
                color: s.color,
                pattern: s.pattern,
                mark: s.mark,
                value: String(s.key === "under" ? stats.under : s.key === "close" ? stats.close : stats.over),
              }))}
            />
          </div>

          {worstFew.length > 0 && (
            <div className="mt-4 hairline-t pt-3">
              <p className="text-[11.5px] font-medium text-ink-3">Furthest off</p>
              <ul className="mt-2 flex flex-col gap-1.5">
                {worstFew.map((s) => (
                  <li key={s.taskId} className="flex items-baseline gap-2">
                    <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">{s.title}</span>
                    <span className="shrink-0 text-[11.5px] text-ink-3 tnum">
                      {formatDuration(Math.round(s.planned))} → {formatDuration(Math.round(s.actual))}
                    </span>
                    <span className="shrink-0 text-[11.5px] font-medium text-ink-2 tnum">
                      {Math.round(s.ratio * 100)}%
                    </span>
                    <span className="shrink-0 text-[11px] text-ink-4">
                      {formatDate(s.date, { weekday: false })}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <PanelNote>
            Measured time is whichever is larger: the minutes the timer wrote onto the task, or the
            focus sessions attached to it. A task missing either number is left out rather than
            guessed at — <span className="tnum">{stats.n}</span> made the cut, and a point is drawn
            only where at least one did.
          </PanelNote>
        </>
      )}
    </Panel>
  );
}
