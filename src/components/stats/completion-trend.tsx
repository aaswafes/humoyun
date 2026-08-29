"use client";

import * as React from "react";
import { CheckCircle2 } from "lucide-react";
import { formatDate } from "@/lib/date";
import { Button, EmptyState } from "@/components/ui/primitives";
import { openQuickAdd } from "@/components/shell/quick-add";
import {
  AxisText, Chart, Crosshair, GridY, HoverSurface, Legend, Panel, UnitLabel,
  areaPath, axisTicks, fmt, linePath, niceMax, pctOf, signedPct,
  type LegendItem, type TableSpec, type TipState,
} from "./chart-kit";
import { useOpenDay } from "./open-day";
import type { DayStat } from "./derive";

const PAD = { l: 30, r: 8, t: 18, b: 20 };
const H = 208;

export function CompletionTrend({
  stats, average, previous, previousLabel,
}: {
  stats: DayStat[];
  average: number[];
  /** The equally long window before this one, index-aligned. Ghosted when given. */
  previous?: DayStat[] | null;
  previousLabel?: string;
}) {
  const [cursor, setCursor] = React.useState<number | null>(null);
  const openDay = useOpenDay();
  const ghost = previous && previous.length === stats.length ? previous : null;

  const totals = React.useMemo(() => {
    const done = stats.reduce((s, d) => s + d.done, 0);
    const planned = stats.reduce((s, d) => s + d.planned, 0);
    let bestIdx = 0;
    stats.forEach((d, i) => { if (d.done > stats[bestIdx].done) bestIdx = i; });
    return {
      done,
      planned,
      perDay: stats.length ? done / stats.length : 0,
      best: stats[bestIdx],
      now: average[average.length - 1] ?? 0,
      before: ghost ? ghost.reduce((s, d) => s + d.done, 0) : 0,
    };
  }, [stats, average, ghost]);

  const summary = totals.done
    ? `${totals.done} tasks completed` +
      (totals.planned
        ? ` of ${totals.planned} planned, ${pctOf(totals.done, totals.planned)}% closed`
        : "") +
      ` — ${fmt(totals.perDay, 1)} a day on average, best day ${totals.best.done} on ` +
      `${formatDate(totals.best.date)}. The 7-day average now sits at ${fmt(totals.now, 1)} a day.` +
      (ghost
        ? ` The window before it closed ${totals.before}, so this one is ` +
          `${signedPct(totals.before > 0 ? ((totals.done - totals.before) / totals.before) * 100 : null)}.`
        : "")
    : "Nothing has been ticked off inside this window yet.";

  const geom = React.useCallback((w: number) => {
    const n = stats.length;
    const plotW = Math.max(1, w - PAD.l - PAD.r);
    const plotH = H - PAD.t - PAD.b;
    const max = niceMax(
      Math.max(1, ...stats.map((d) => d.done), ...average, ...(ghost ? ghost.map((d) => d.done) : [])),
    );
    return {
      n, plotW, plotH, max,
      x: (i: number) => PAD.l + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW),
      y: (v: number) => PAD.t + plotH - (v / max) * plotH,
    };
  }, [stats, average, ghost]);

  const describe = React.useCallback((i: number) => {
    const d = stats[i];
    if (!d) return "";
    const parts = [
      `${formatDate(d.date)}: ${d.done} of ${d.planned} planned tasks done`,
      `7-day average ${fmt(average[i] ?? 0, 1)}`,
    ];
    if (ghost) parts.push(`previous window ${ghost[i].done}`);
    return `${parts.join(", ")}.`;
  }, [stats, average, ghost]);

  const tipAt = (w: number): TipState | null => {
    if (cursor == null || !stats[cursor]) return null;
    const g = geom(w);
    const d = stats[cursor];
    return {
      x: g.x(cursor),
      y: g.y(d.done),
      title: formatDate(d.date),
      rows: [
        { label: "Completed", value: String(d.done), color: "var(--accent)" },
        { label: "Planned", value: String(d.planned) },
        { label: "7-day avg", value: fmt(average[cursor] ?? 0, 1), color: "var(--ink-3)" },
        ...(ghost
          ? [{ label: previousLabel ?? "Previous", value: String(ghost[cursor].done), color: "var(--ink-4)", muted: true }]
          : []),
      ],
    };
  };

  const table: TableSpec = {
    caption: "Tasks completed and planned, per day.",
    columns: ["Date", "Done", "Planned", "Rate %", "7-day avg", ...(ghost ? ["Previous"] : [])],
    rows: stats.map((d, i) => [
      formatDate(d.date, { year: true }),
      d.done,
      d.planned,
      pctOf(d.done, d.planned),
      fmt(average[i] ?? 0, 1),
      ...(ghost ? [ghost[i].done] : []),
    ]),
  };

  const legend: LegendItem[] = [
    { key: "done", label: "Completed", color: "var(--accent)" },
    { key: "avg", label: "7-day average", color: "var(--ink-3)", pattern: "hatch", mark: "var(--raised)" },
    ...(ghost
      ? [{ key: "prev", label: previousLabel ?? "Previous window", color: "var(--ink-4)", pattern: "dots" as const, mark: "var(--raised)" }]
      : []),
  ];

  return (
    <Panel id="panel-completion" title="Completion trend" subtitle={summary} table={table}>
      {!totals.done ? (
        <EmptyState
          className="py-8"
          icon={CheckCircle2}
          title="No completed tasks in this window"
          description="Every tick you make lands on this curve. Add something you plan to finish today and the line starts."
          action={<Button variant="primary" size="sm" onClick={openQuickAdd}>Add a task</Button>}
        />
      ) : (
        <>
          <Chart
            height={H}
            animateKey={`${stats.length}-${ghost ? 1 : 0}`}
            label={`Tasks completed per day. ${summary}`}
            tip={({ w }) => tipAt(w)}
            nav={{
              n: stats.length,
              index: cursor,
              onIndex: setCursor,
              describe,
              onActivate: (i) => openDay(stats[i].date),
              activateLabel: "open that day",
            }}
          >
            {({ w }) => {
              const g = geom(w);
              const pts = stats.map((d, i) => [g.x(i), g.y(d.done)] as [number, number]);
              const avgPts = average.map((v, i) => [g.x(i), g.y(v)] as [number, number]);
              const ghostPts = ghost?.map((d, i) => [g.x(i), g.y(d.done)] as [number, number]);
              const labelStep = Math.max(1, Math.ceil(g.n / 6));

              return (
                <>
                  <UnitLabel x={0} y={9}>tasks</UnitLabel>
                  <GridY
                    x0={PAD.l}
                    x1={PAD.l + g.plotW}
                    ticks={axisTicks(g.max)}
                    y={g.y}
                    format={(v) => fmt(v, g.max <= 4 ? 1 : 0)}
                  />

                  {ghostPts && (
                    <path
                      d={linePath(ghostPts)} fill="none" stroke="var(--ink-4)"
                      strokeWidth={1.25} strokeDasharray="1 3" strokeLinecap="round"
                    >
                      <title>{previousLabel ?? "Previous window"}</title>
                    </path>
                  )}

                  <path d={areaPath(pts, PAD.t + g.plotH)} fill="var(--accent)" opacity={0.1} />
                  <path
                    d={linePath(pts)} fill="none" stroke="var(--accent)"
                    strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round"
                  >
                    <title>Tasks completed each day</title>
                  </path>
                  <path
                    d={linePath(avgPts)} fill="none" stroke="var(--ink-3)"
                    strokeWidth={1.25} strokeDasharray="3 3" strokeLinecap="round"
                  >
                    <title>Trailing 7-day average</title>
                  </path>

                  {g.n <= 16 && pts.map((p, i) => (
                    <circle
                      key={stats[i].date}
                      cx={p[0]} cy={p[1]} r={2.5}
                      fill="var(--canvas)" stroke="var(--accent)" strokeWidth={1.5}
                    >
                      <title>{describe(i)}</title>
                    </circle>
                  ))}

                  {stats.map((d, i) =>
                    i % labelStep === 0 || i === g.n - 1 ? (
                      <AxisText key={d.date} x={g.x(i)} y={H - 5}>
                        {formatDate(d.date, { weekday: false })}
                      </AxisText>
                    ) : null,
                  )}

                  {cursor != null && stats[cursor] && (
                    <Crosshair
                      x={g.x(cursor)}
                      y={g.y(stats[cursor].done)}
                      top={PAD.t}
                      bottom={PAD.t + g.plotH}
                    />
                  )}

                  <HoverSurface
                    x={PAD.l} y={PAD.t} w={g.plotW} h={g.plotH} n={g.n}
                    onIndex={setCursor}
                    onLeave={() => setCursor(null)}
                    onActivate={(i) => openDay(stats[i].date)}
                  />
                </>
              );
            }}
          </Chart>

          <Legend className="mt-3" items={legend} />
        </>
      )}
    </Panel>
  );
}
