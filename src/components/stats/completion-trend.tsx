"use client";

import * as React from "react";
import { CheckCircle2 } from "lucide-react";
import { formatDate } from "@/lib/date";
import { Button, EmptyState } from "@/components/ui/primitives";
import { openQuickAdd } from "@/components/shell/quick-add";
import {
  AxisText, Chart, GridY, HoverSurface, Legend, Panel, UnitLabel,
  areaPath, axisTicks, fmt, linePath, niceMax,
  type HoverPoint, type TipState,
} from "./chart-kit";
import type { DayStat } from "./derive";

const PAD = { l: 30, r: 8, t: 18, b: 20 };
const H = 208;

export function CompletionTrend({ stats, average }: { stats: DayStat[]; average: number[] }) {
  const [hover, setHover] = React.useState<HoverPoint | null>(null);

  const totals = React.useMemo(() => {
    const done = stats.reduce((s, d) => s + d.done, 0);
    let bestIdx = 0;
    stats.forEach((d, i) => { if (d.done > stats[bestIdx].done) bestIdx = i; });
    return {
      done,
      perDay: stats.length ? done / stats.length : 0,
      best: stats[bestIdx],
      now: average[average.length - 1] ?? 0,
    };
  }, [stats, average]);

  const summary = totals.done
    ? `${totals.done} tasks completed — ${fmt(totals.perDay, 1)} a day on average, best day ${totals.best.done} on ` +
      `${formatDate(totals.best.date)}. The 7-day average now sits at ${fmt(totals.now, 1)} a day.`
    : "Nothing has been ticked off inside this window yet.";

  const tip: TipState | null = hover && stats[hover.i]
    ? {
        x: hover.x,
        y: hover.y,
        title: formatDate(stats[hover.i].date),
        rows: [
          { label: "Completed", value: String(stats[hover.i].done), color: "var(--accent)" },
          { label: "Planned", value: String(stats[hover.i].planned) },
          { label: "7-day avg", value: fmt(average[hover.i] ?? 0, 1), color: "var(--ink-3)" },
        ],
      }
    : null;

  return (
    <Panel title="Completion trend" subtitle={summary}>
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
          <Chart height={H} label={`Tasks completed per day. ${summary}`} tip={tip}>
            {({ w }) => {
              const n = stats.length;
              const plotW = Math.max(1, w - PAD.l - PAD.r);
              const plotH = H - PAD.t - PAD.b;
              const max = niceMax(Math.max(1, ...stats.map((d) => d.done), ...average));
              const x = (i: number) => PAD.l + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
              const y = (v: number) => PAD.t + plotH - (v / max) * plotH;

              const pts = stats.map((d, i) => [x(i), y(d.done)] as [number, number]);
              const avgPts = average.map((v, i) => [x(i), y(v)] as [number, number]);
              const labelStep = Math.max(1, Math.ceil(n / 6));

              return (
                <>
                  <UnitLabel x={0} y={9}>tasks</UnitLabel>
                  <GridY
                    x0={PAD.l}
                    x1={PAD.l + plotW}
                    ticks={axisTicks(max)}
                    y={y}
                    format={(v) => fmt(v, max <= 4 ? 1 : 0)}
                  />

                  <path d={areaPath(pts, PAD.t + plotH)} fill="var(--accent)" opacity={0.1} />
                  <path
                    d={linePath(pts)} fill="none" stroke="var(--accent)"
                    strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round"
                  />
                  <path
                    d={linePath(avgPts)} fill="none" stroke="var(--ink-3)"
                    strokeWidth={1.25} strokeDasharray="3 3" strokeLinecap="round"
                  />

                  {n <= 16 && pts.map((p, i) => (
                    <circle
                      key={stats[i].date}
                      cx={p[0]} cy={p[1]} r={2.5}
                      fill="var(--canvas)" stroke="var(--accent)" strokeWidth={1.5}
                    />
                  ))}

                  {stats.map((d, i) =>
                    i % labelStep === 0 || i === n - 1 ? (
                      <AxisText key={d.date} x={x(i)} y={H - 5}>
                        {formatDate(d.date, { weekday: false })}
                      </AxisText>
                    ) : null,
                  )}

                  {hover && (
                    <g pointerEvents="none">
                      <line
                        x1={hover.x} x2={hover.x} y1={PAD.t} y2={PAD.t + plotH}
                        stroke="var(--line-strong)" strokeWidth={1}
                      />
                      <circle cx={hover.x} cy={hover.y} r={3.5} fill="var(--accent)" />
                    </g>
                  )}

                  <HoverSurface
                    x={PAD.l} y={PAD.t} w={plotW} h={plotH} n={n}
                    onIndex={(i) => setHover({ i, x: x(i), y: y(stats[i].done) })}
                    onLeave={() => setHover(null)}
                  />
                </>
              );
            }}
          </Chart>

          <Legend
            className="mt-3"
            items={[
              { label: "Completed", color: "var(--accent)" },
              { label: "7-day average", color: "var(--ink-3)" },
            ]}
          />
        </>
      )}
    </Panel>
  );
}
