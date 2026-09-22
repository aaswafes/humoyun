"use client";

import * as React from "react";
import {
  AxisText, Chart, GridY, HoverSurface, Panel, PanelNote, axisTicks, niceMax,
  type TableSpec, type TipState,
} from "@/components/stats/chart-kit";
import { UMR_CATEGORIES, UMR_META, type UmrCategory } from "@/lib/umr";
import { CategoryLegend } from "../category-bar";
import { fmtAxis, fmtMin, pct, type UmrBucket, type UmrSummary } from "../derive";
import { TintGroup } from "./shared";

// =========================================================
// The shape of the window: every bucket, cut five ways.
//
// Stacked rather than five lines, because the question is "what did that time
// go to", not "how did taʼlim move". The order is fixed — taʼlim at the
// bottom — so the eye can compare the same band across bars.
// =========================================================

const PAD = { top: 10, right: 6, bottom: 20, left: 38 };

export function FlowPanel({
  buckets, summary, grain, capacity,
}: {
  buckets: UmrBucket[];
  summary: UmrSummary;
  grain: "day" | "week" | "month";
  /** minutes of wall clock in one bucket, so "unaccounted" can be drawn */
  capacity: number;
}) {
  const [cursor, setCursor] = React.useState<number | null>(null);

  const max = React.useMemo(
    () => niceMax(Math.max(1, ...buckets.map((b) => b.accounted))),
    [buckets],
  );

  const grainWord = grain === "day" ? "day" : grain === "week" ? "week" : "month";

  const subtitle = summary.accounted > 0
    ? `${fmtMin(summary.accounted)} recorded across ${summary.days.length} days — about ${fmtMin(summary.accounted / Math.max(1, summary.days.length))} a day, which is ${pct(summary.coverage)} of the clock. The rest is not idle; it is time nothing wrote down.`
    : "Nothing recorded in this window.";

  const table: TableSpec = {
    caption: `Minutes per ${grainWord}, by kind of living.`,
    columns: [grainWord === "day" ? "Date" : grainWord, ...UMR_CATEGORIES.map((c) => UMR_META[c].label), "Uncategorised", "Total"],
    rows: buckets.map((b) => [
      b.key,
      ...UMR_CATEGORIES.map((c) => b.totals[c]),
      b.unassigned,
      b.accounted,
    ]),
  };

  const active = cursor != null ? buckets[cursor] : null;

  const tip: TipState | null = active
    ? {
      title: active.key,
      rows: [
        ...UMR_CATEGORIES
          .filter((c) => active.totals[c] > 0)
          .map((c) => ({
            label: UMR_META[c].label,
            value: fmtMin(active.totals[c]),
            color: "var(--ink-3)",
          })),
        ...(active.unassigned > 0
          ? [{ label: "Uncategorised", value: fmtMin(active.unassigned), color: "var(--ink-4)" }]
          : []),
        { label: "Recorded", value: fmtMin(active.accounted), color: "var(--ink-2)" },
      ],
      x: 0,
      y: 0,
      wide: true,
    }
    : null;

  return (
    <Panel id="umr-flow" title="Where the time goes" subtitle={subtitle} table={table}>
      <Chart
        height={(w) => Math.max(180, Math.min(280, w * 0.3))}
        label={`Minutes per ${grainWord}, stacked by kind of living`}
        description={table.caption}
        nav={{
          n: buckets.length,
          index: cursor,
          onIndex: setCursor,
          describe: (i) => {
            const b = buckets[i];
            const parts = UMR_CATEGORIES
              .filter((c) => b.totals[c] > 0)
              .map((c) => `${UMR_META[c].label} ${fmtMin(b.totals[c])}`);
            return `${b.key}: ${fmtMin(b.accounted)} recorded${parts.length ? `, ${parts.join(", ")}` : ""}`;
          },
        }}
        tip={tip ? ({ w }) => ({ ...tip, x: bandCentre(cursor ?? 0, buckets.length, w), y: PAD.top }) : null}
        animateKey={`${grain}-${buckets.length}`}
      >
        {({ w, h }) => {
          const plotW = Math.max(1, w - PAD.left - PAD.right);
          const plotH = Math.max(1, h - PAD.top - PAD.bottom);
          const y = (v: number) => PAD.top + plotH - (v / max) * plotH;
          const band = plotW / Math.max(1, buckets.length);
          const barW = Math.max(2, Math.min(28, band * 0.72));

          return (
            <>
              <GridY
                x0={PAD.left}
                x1={PAD.left + plotW}
                ticks={axisTicks(max, 2)}
                y={y}
                format={(v) => fmtAxis(v)}
              />

              {/* The 24h line, so a bar that fills the day is visibly full. */}
              {capacity <= max && (
                <line
                  x1={PAD.left} x2={PAD.left + plotW}
                  y1={y(capacity)} y2={y(capacity)}
                  stroke="var(--ink-4)" strokeWidth={1} strokeDasharray="3 3" opacity={0.6}
                />
              )}

              {buckets.map((b, i) => {
                const cx = PAD.left + band * i + band / 2;
                let cursorY = PAD.top + plotH;
                const dim = cursor != null && cursor !== i;

                return (
                  <g key={b.key} opacity={dim ? 0.4 : 1}>
                    {UMR_CATEGORIES.map((c: UmrCategory) => {
                      const v = b.totals[c];
                      if (v <= 0) return null;
                      const segH = (v / max) * plotH;
                      cursorY -= segH;
                      return (
                        <TintGroup key={c} category={c}>
                          <rect
                            x={cx - barW / 2}
                            y={cursorY}
                            width={barW}
                            height={Math.max(0.8, segH)}
                            fill="var(--tint)"
                            rx={0.5}
                          />
                        </TintGroup>
                      );
                    })}
                    {b.unassigned > 0 && (() => {
                      const segH = (b.unassigned / max) * plotH;
                      cursorY -= segH;
                      return (
                        <rect
                          x={cx - barW / 2}
                          y={cursorY}
                          width={barW}
                          height={Math.max(0.8, segH)}
                          fill="var(--ink-4)"
                          opacity={0.35}
                          rx={0.5}
                        />
                      );
                    })()}
                  </g>
                );
              })}

              {/* Only a handful of labels: one per bar is unreadable past a
                  month. The last one is worth drawing, but only when it would
                  not land on top of the one before it. */}
              {buckets.map((b, i) => {
                if (!labelled(i, buckets.length)) return null;
                return (
                  <AxisText key={b.key} x={PAD.left + band * i + band / 2} y={h - 6}>
                    {b.label}
                  </AxisText>
                );
              })}

              <HoverSurface
                x={PAD.left} y={PAD.top} w={plotW} h={plotH}
                n={buckets.length}
                mode="band"
                onIndex={setCursor}
                onLeave={() => setCursor(null)}
              />
            </>
          );
        }}
      </Chart>

      <CategoryLegend totals={summary.totals} unassigned={summary.unassigned} className="mt-3" />

      <PanelNote>
        The dashed line is a full {grainWord} of wall clock. A bar falls short of it by the amount
        nothing recorded, which is almost always most of a day — so read each band as a share of
        what was counted, not of your life.
      </PanelNote>
    </Panel>
  );
}

/** The pixel centre of a bar, which is where its card points. */
/**
 * Which bars get a date under them. Every `step`th one, plus the last — but
 * the last is dropped when it would sit on top of its neighbour, which is what
 * put "09-21" and "09-22" through each other.
 */
function labelled(i: number, n: number): boolean {
  const step = Math.max(1, Math.ceil(n / 8));
  if (i % step === 0) return true;
  if (i !== n - 1) return false;
  return n - 1 - Math.floor((n - 1) / step) * step >= step * 0.6;
}

function bandCentre(i: number, n: number, w: number): number {
  const plotW = Math.max(1, w - PAD.left - PAD.right);
  const band = plotW / Math.max(1, n);
  return PAD.left + band * i + band / 2;
}
