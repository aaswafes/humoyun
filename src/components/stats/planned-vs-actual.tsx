"use client";

import * as React from "react";
import { Timer } from "lucide-react";
import { formatDuration } from "@/lib/date";
import { useStore } from "@/lib/store";
import { Button, EmptyState } from "@/components/ui/primitives";
import {
  AxisText, Chart, GridY, HoverSurface, Legend, Panel, UnitLabel,
  axisTicks, fmt, niceMax, pctOf, type HoverPoint, type TipState,
} from "./chart-kit";
import type { Bucket } from "./derive";

const PAD = { l: 34, r: 8, t: 18, b: 22 };
const H = 216;

export function PlannedVsActual({ buckets, grain }: { buckets: Bucket[]; grain: "day" | "week" }) {
  const startTimer = useStore((s) => s.startTimer);
  const [hover, setHover] = React.useState<HoverPoint | null>(null);

  const totals = React.useMemo(() => {
    const planned = buckets.reduce((s, b) => s + b.plannedMin, 0);
    const focus = buckets.reduce((s, b) => s + b.focusMin, 0);
    const over = buckets.filter((b) => b.focusMin > b.plannedMin && b.focusMin > 0).length;
    return { planned, focus, over };
  }, [buckets]);

  const hasData = totals.planned > 0 || totals.focus > 0;
  const ratio = pctOf(totals.focus, totals.planned);

  const summary = !hasData
    ? "Nothing planned and nothing logged in this window."
    : totals.planned === 0
      ? `${formatDuration(Math.round(totals.focus))} of focus logged against nothing planned — the estimates are missing, not the work.`
      : `You planned ${formatDuration(Math.round(totals.planned))} and logged ${formatDuration(Math.round(totals.focus))} of focus — ` +
        `${ratio}% of the estimate. ${totals.over} ${grain === "day" ? "day" : "week"}${totals.over === 1 ? "" : "s"} ran over plan.`;

  const tip: TipState | null = hover && buckets[hover.i]
    ? {
        x: hover.x,
        y: hover.y,
        title: buckets[hover.i].title,
        rows: [
          { label: "Planned", value: formatDuration(Math.round(buckets[hover.i].plannedMin)), color: "var(--accent-soft)" },
          { label: "Logged", value: formatDuration(Math.round(buckets[hover.i].focusMin)), color: "var(--accent)" },
          {
            label: "Of plan",
            value: buckets[hover.i].plannedMin > 0
              ? `${pctOf(buckets[hover.i].focusMin, buckets[hover.i].plannedMin)}%`
              : "—",
          },
        ],
      }
    : null;

  return (
    <Panel
      title="Planned vs actual"
      subtitle={summary}
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
          <Chart height={H} label={`Planned minutes against logged focus minutes, ${grain === "day" ? "per day" : "per week"}. ${summary}`} tip={tip}>
            {({ w }) => {
              const n = buckets.length;
              const plotW = Math.max(1, w - PAD.l - PAD.r);
              const plotH = H - PAD.t - PAD.b;
              const rawMax = Math.max(1, ...buckets.map((b) => Math.max(b.plannedMin, b.focusMin)));
              const max = niceMax(rawMax);
              const asHours = max >= 150;

              const band = plotW / n;
              const barW = Math.max(1.5, Math.min(15, (band - 4) / 2));
              const gap = band > 10 ? 1.5 : 0.5;
              const y = (v: number) => PAD.t + plotH - (v / max) * plotH;
              const baseY = PAD.t + plotH;
              const labelStep = Math.max(1, Math.ceil(n / 8));

              return (
                <>
                  <UnitLabel x={0} y={9}>{asHours ? "hours" : "minutes"}</UnitLabel>
                  <GridY
                    x0={PAD.l}
                    x1={PAD.l + plotW}
                    ticks={axisTicks(max)}
                    y={y}
                    format={(v) => (asHours ? fmt(v / 60, v % 60 === 0 ? 0 : 1) : fmt(v))}
                  />

                  {buckets.map((b, i) => {
                    const cx = PAD.l + band * i + band / 2;
                    const plannedH = Math.max(b.plannedMin > 0 ? 1.5 : 0, baseY - y(b.plannedMin));
                    const focusH = Math.max(b.focusMin > 0 ? 1.5 : 0, baseY - y(b.focusMin));
                    const active = hover?.i === i;
                    return (
                      <g key={b.key} opacity={hover && !active ? 0.55 : 1}>
                        <rect
                          x={cx - barW - gap} y={baseY - plannedH}
                          width={barW} height={plannedH}
                          rx={Math.min(2, barW / 2)}
                          fill="var(--accent)" opacity={0.24}
                        />
                        <rect
                          x={cx + gap} y={baseY - focusH}
                          width={barW} height={focusH}
                          rx={Math.min(2, barW / 2)}
                          fill="var(--accent)"
                        />
                      </g>
                    );
                  })}

                  {buckets.map((b, i) =>
                    i % labelStep === 0 || i === n - 1 ? (
                      <AxisText key={b.key} x={PAD.l + band * i + band / 2} y={H - 6}>
                        {b.label}
                      </AxisText>
                    ) : null,
                  )}

                  <HoverSurface
                    x={PAD.l} y={PAD.t} w={plotW} h={plotH} n={n} mode="band"
                    onIndex={(i) =>
                      setHover({
                        i,
                        x: PAD.l + band * i + band / 2,
                        y: y(Math.max(buckets[i].plannedMin, buckets[i].focusMin)),
                      })
                    }
                    onLeave={() => setHover(null)}
                  />
                </>
              );
            }}
          </Chart>

          <Legend
            className="mt-3"
            items={[
              { label: "Planned", color: "var(--accent)", opacity: 0.24 },
              { label: "Focus logged", color: "var(--accent)" },
            ]}
          />
        </>
      )}
    </Panel>
  );
}
