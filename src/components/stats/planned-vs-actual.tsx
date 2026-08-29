"use client";

import * as React from "react";
import { Timer } from "lucide-react";
import { formatDuration } from "@/lib/date";
import { useStore } from "@/lib/store";
import { Button, EmptyState } from "@/components/ui/primitives";
import {
  AxisText, Chart, GridY, HoverSurface, Legend, Panel, UnitLabel,
  axisTicks, fmt, niceMax, pctOf, signedPct,
  type LegendItem, type TableSpec, type TipState,
} from "./chart-kit";
import type { Bucket } from "./derive";

const PAD = { l: 34, r: 8, t: 22, b: 22 };
const H = 220;

export function PlannedVsActual({
  buckets, grain, previous, previousLabel,
}: {
  buckets: Bucket[];
  grain: "day" | "week";
  /** Index-aligned buckets from the window before this one. */
  previous?: Bucket[] | null;
  previousLabel?: string;
}) {
  const startTimer = useStore((s) => s.startTimer);
  const [cursor, setCursor] = React.useState<number | null>(null);
  const ghost = previous && previous.length === buckets.length ? previous : null;

  const totals = React.useMemo(() => {
    const planned = buckets.reduce((s, b) => s + b.plannedMin, 0);
    const focus = buckets.reduce((s, b) => s + b.focusMin, 0);
    const over = buckets.filter((b) => b.focusMin > b.plannedMin && b.focusMin > 0).length;
    const before = ghost ? ghost.reduce((s, b) => s + b.focusMin, 0) : 0;
    return { planned, focus, over, before };
  }, [buckets, ghost]);

  const hasData = totals.planned > 0 || totals.focus > 0;
  const ratio = pctOf(totals.focus, totals.planned);
  const unitWord = grain === "day" ? "day" : "week";

  const summary = !hasData
    ? "Nothing planned and nothing logged in this window."
    : totals.planned === 0
      ? `${formatDuration(Math.round(totals.focus))} of focus logged against nothing planned — the estimates are missing, not the work.`
      : `You planned ${formatDuration(Math.round(totals.planned))} and logged ${formatDuration(Math.round(totals.focus))} of focus — ` +
        `${ratio}% of the estimate. ${totals.over} ${unitWord}${totals.over === 1 ? "" : "s"} ran over plan.` +
        (ghost
          ? ` Focus is ${signedPct(totals.before > 0 ? ((totals.focus - totals.before) / totals.before) * 100 : null)} on the window before.`
          : "");

  const geom = React.useCallback((w: number) => {
    const n = Math.max(1, buckets.length);
    const plotW = Math.max(1, w - PAD.l - PAD.r);
    const plotH = H - PAD.t - PAD.b;
    const rawMax = Math.max(
      1,
      ...buckets.map((b) => Math.max(b.plannedMin, b.focusMin)),
      ...(ghost ? ghost.map((b) => b.focusMin) : []),
    );
    const max = niceMax(rawMax);
    const band = plotW / n;
    return {
      n, plotW, plotH, max, band,
      barW: Math.max(1.5, Math.min(15, (band - 4) / 2)),
      gap: band > 10 ? 1.5 : 0.5,
      baseY: PAD.t + plotH,
      asHours: max >= 150,
      y: (v: number) => PAD.t + plotH - (v / max) * plotH,
      cx: (i: number) => PAD.l + band * i + band / 2,
    };
  }, [buckets, ghost]);

  const describe = React.useCallback((i: number) => {
    const b = buckets[i];
    if (!b) return "";
    const share = b.plannedMin > 0 ? `${pctOf(b.focusMin, b.plannedMin)}% of plan` : "nothing planned";
    return (
      `${b.title}: planned ${formatDuration(Math.round(b.plannedMin))}, ` +
      `logged ${formatDuration(Math.round(b.focusMin))}, ${share}` +
      (ghost ? `, previous window ${formatDuration(Math.round(ghost[i].focusMin))}` : "") + "."
    );
  }, [buckets, ghost]);

  const tipAt = (w: number): TipState | null => {
    if (cursor == null || !buckets[cursor]) return null;
    const g = geom(w);
    const b = buckets[cursor];
    return {
      x: g.cx(cursor),
      y: g.y(Math.max(b.plannedMin, b.focusMin)),
      title: b.title,
      rows: [
        { label: "Planned", value: formatDuration(Math.round(b.plannedMin)), color: "var(--accent)", pattern: "hatch", mark: "var(--raised)" },
        { label: "Logged", value: formatDuration(Math.round(b.focusMin)), color: "var(--accent)" },
        {
          label: "Of plan",
          value: b.plannedMin > 0 ? `${pctOf(b.focusMin, b.plannedMin)}%` : "—",
        },
        ...(ghost
          ? [{ label: previousLabel ?? "Previous", value: formatDuration(Math.round(ghost[cursor].focusMin)), color: "var(--ink-4)", muted: true }]
          : []),
      ],
    };
  };

  const table: TableSpec = {
    caption: `Planned minutes against logged focus minutes, per ${unitWord}.`,
    columns: [grain === "day" ? "Day" : "Week", "Planned (min)", "Logged (min)", "Of plan %", ...(ghost ? ["Previous (min)"] : [])],
    rows: buckets.map((b, i) => [
      b.title,
      Math.round(b.plannedMin),
      Math.round(b.focusMin),
      b.plannedMin > 0 ? pctOf(b.focusMin, b.plannedMin) : "—",
      ...(ghost ? [Math.round(ghost[i].focusMin)] : []),
    ]),
  };

  const legend: LegendItem[] = [
    { key: "planned", label: "Planned", color: "var(--accent)", pattern: "hatch", mark: "var(--raised)" },
    { key: "focus", label: "Focus logged", color: "var(--accent)" },
    { key: "over", label: `Ran over plan (${totals.over})`, color: "var(--ink-3)" },
    ...(ghost
      ? [{ key: "prev", label: previousLabel ?? "Previous window", color: "var(--ink-4)", pattern: "dots" as const, mark: "var(--raised)" }]
      : []),
  ];

  return (
    <Panel
      id="panel-plan"
      title="Planned vs actual"
      subtitle={summary}
      table={table}
      actions={
        <span className="rounded-full bg-hover px-2 py-1 text-[11px] font-medium text-ink-3">
          {grain === "day" ? "per day" : "per week"}
        </span>
      }
    >
      {!hasData ? (
        <EmptyState
          className="py-8"
          icon={Timer}
          title="No time to compare yet"
          description="Give your tasks a duration and run the focus timer while you work. This chart then shows the gap between what you booked and what you actually spent."
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
            animateKey={`${buckets.length}-${grain}-${ghost ? 1 : 0}`}
            label={`Planned minutes against logged focus minutes, per ${unitWord}. ${summary}`}
            tip={({ w }) => tipAt(w)}
            nav={{ n: buckets.length, index: cursor, onIndex: setCursor, describe }}
          >
            {({ w }) => {
              const g = geom(w);
              const labelStep = Math.max(1, Math.ceil(g.n / 8));

              return (
                <>
                  <UnitLabel x={0} y={9}>{g.asHours ? "hours" : "minutes"}</UnitLabel>
                  <GridY
                    x0={PAD.l}
                    x1={PAD.l + g.plotW}
                    ticks={axisTicks(g.max)}
                    y={g.y}
                    format={(v) => (g.asHours ? fmt(v / 60, v % 60 === 0 ? 0 : 1) : fmt(v))}
                  />

                  {buckets.map((b, i) => {
                    const cx = g.cx(i);
                    const plannedH = Math.max(b.plannedMin > 0 ? 1.5 : 0, g.baseY - g.y(b.plannedMin));
                    const focusH = Math.max(b.focusMin > 0 ? 1.5 : 0, g.baseY - g.y(b.focusMin));
                    const active = cursor === i;
                    const over = b.focusMin > b.plannedMin && b.focusMin > 0 && b.plannedMin > 0;
                    return (
                      <g key={b.key} opacity={cursor != null && !active ? 0.55 : 1}>
                        <title>{describe(i)}</title>
                        <rect
                          x={cx - g.barW - g.gap} y={g.baseY - plannedH}
                          width={g.barW} height={plannedH}
                          rx={Math.min(2, g.barW / 2)}
                          fill="var(--accent)" opacity={0.24}
                        />
                        <rect
                          x={cx + g.gap} y={g.baseY - focusH}
                          width={g.barW} height={focusH}
                          rx={Math.min(2, g.barW / 2)}
                          fill="var(--accent)"
                        />
                        {/* Overrun gets a shape of its own, not just a taller bar. */}
                        {over && (
                          <path
                            d={`M${cx + g.gap + g.barW / 2} ${g.baseY - focusH - 7} l3.2 5 h-6.4 Z`}
                            fill="var(--ink-3)"
                          />
                        )}
                        {ghost && ghost[i].focusMin > 0 && (
                          <line
                            x1={cx + g.gap - 0.5} x2={cx + g.gap + g.barW + 0.5}
                            y1={g.y(ghost[i].focusMin)} y2={g.y(ghost[i].focusMin)}
                            stroke="var(--ink-4)" strokeWidth={1.25} strokeDasharray="2 2"
                          />
                        )}
                      </g>
                    );
                  })}

                  {buckets.map((b, i) =>
                    i % labelStep === 0 || i === g.n - 1 ? (
                      <AxisText key={b.key} x={g.cx(i)} y={H - 6}>
                        {b.label}
                      </AxisText>
                    ) : null,
                  )}

                  <HoverSurface
                    x={PAD.l} y={PAD.t} w={g.plotW} h={g.plotH} n={g.n} mode="band"
                    onIndex={setCursor}
                    onLeave={() => setCursor(null)}
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
