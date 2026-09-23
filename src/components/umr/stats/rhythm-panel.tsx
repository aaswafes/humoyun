"use client";

import * as React from "react";
import { AxisText, Chart, Panel, PanelNote, type TableSpec } from "@/components/stats/chart-kit";
import { hourLabel } from "@/components/stats/derive";
import { UMR_CATEGORIES, UMR_META, ZERO_TOTALS, sumTotals } from "@/lib/umr";
import { CategoryLegend } from "../category-bar";
import { fmtMin, pct, type HourRow, type WeekdayRow } from "../derive";
import { TintGroup } from "./shared";

// =========================================================
// When in the week, and when in the day.
//
// Two small charts rather than one big one: a week has seven slots and a day
// has twenty-four, and forcing them into the same shape would make both
// harder to read than either alone.
// =========================================================

export function RhythmPanel({
  weekdays, hours, placed, total, hour12,
}: {
  weekdays: WeekdayRow[];
  hours: HourRow[];
  /** minutes that knew what time they happened */
  placed: number;
  total: number;
  hour12: boolean;
}) {
  const weekMax = Math.max(1, ...weekdays.map((r) => (r.days ? r.accounted / r.days : 0)));
  const hourMax = Math.max(1, ...hours.map((r) => r.accounted));

  const busiest = [...weekdays]
    .filter((r) => r.days > 0)
    .sort((a, b) => b.accounted / b.days - a.accounted / a.days)[0];
  const peakHour = [...hours].sort((a, b) => b.accounted - a.accounted)[0];

  const subtitle = total === 0
    ? "Nothing recorded yet."
    : `${busiest ? `${busiest.label} carries the most recorded time — ${fmtMin(busiest.accounted / busiest.days)} on an average ${busiest.label}. ` : ""}${
      peakHour && peakHour.accounted > 0
        ? `The busiest hour is ${hourLabel(peakHour.hour, hour12)}. `
        : ""
    }Only ${pct(total > 0 ? placed / total : 0)} of the window knows what time it happened, and the hour chart draws that part alone.`;

  const weekTable: TableSpec = {
    caption: "Average minutes per weekday, by kind of living.",
    columns: ["Weekday", ...UMR_CATEGORIES.map((c) => UMR_META[c].label), "Total", "Days"],
    rows: weekdays.map((r) => [
      r.label,
      ...UMR_CATEGORIES.map((c) => (r.days ? Math.round(r.totals[c] / r.days) : 0)),
      r.days ? Math.round(r.accounted / r.days) : 0,
      r.days,
    ]),
  };

  const weekTotals = React.useMemo(() => {
    const t = ZERO_TOTALS();
    for (const r of weekdays) for (const c of UMR_CATEGORIES) t[c] += r.totals[c];
    return t;
  }, [weekdays]);

  return (
    <Panel id="umr-rhythm" title="Rhythm" subtitle={subtitle} table={weekTable}>
      {/* ---- the week ---- */}
      <p className="text-[11.5px] font-medium text-ink-3">An average day of the week</p>
      <Chart
        className="mt-2"
        height={140}
        label="Average minutes per weekday, stacked by kind of living"
        description={weekTable.caption}
      >
        {({ w, h }) => {
          const left = 4;
          const bottom = 18;
          const plotW = Math.max(1, w - left * 2);
          const plotH = Math.max(1, h - bottom);
          const band = plotW / 7;
          const barW = Math.max(6, Math.min(44, band * 0.6));

          return (
            <>
              {weekdays.map((r, i) => {
                const cx = left + band * i + band / 2;
                let y = plotH;
                const scale = r.days ? 1 / r.days : 0;
                return (
                  <g key={r.index}>
                    {UMR_CATEGORIES.map((c) => {
                      const v = r.totals[c] * scale;
                      if (v <= 0) return null;
                      const segH = (v / weekMax) * plotH;
                      y -= segH;
                      return (
                        <TintGroup key={c} category={c}>
                          <rect
                            x={cx - barW / 2} y={y} width={barW}
                            height={Math.max(0.8, segH)} fill="var(--tint)" rx={0.5}
                          />
                        </TintGroup>
                      );
                    })}
                    <AxisText x={cx} y={h - 5}>{r.label}</AxisText>
                  </g>
                );
              })}
            </>
          );
        }}
      </Chart>

      <CategoryLegend totals={weekTotals} className="mt-2.5" />

      {/* ---- the day ---- */}
      <p className="mt-6 text-[11.5px] font-medium text-ink-3">
        Across the clock
        <span className="ml-2 font-normal text-ink-4">
          {fmtMin(placed)} of {fmtMin(total)} knows its hour
        </span>
      </p>

      {placed === 0 ? (
        <p className="mt-2 text-[12px] text-ink-4">
          Nothing in this window recorded a time of day. Timed sittings, prayers and anything logged
          with the clock will fill this in.
        </p>
      ) : (
        <Chart
          className="mt-2"
          height={132}
          label="Minutes by hour of the day, stacked by kind of living"
          description="Only entries that recorded a clock time appear here."
        >
          {({ w, h }) => {
            const left = 4;
            const bottom = 18;
            const plotW = Math.max(1, w - left * 2);
            const plotH = Math.max(1, h - bottom);
            const band = plotW / 24;
            const barW = Math.max(3, band * 0.66);

            return (
              <>
                {hours.map((r, i) => {
                  const cx = left + band * i + band / 2;
                  let y = plotH;
                  return (
                    <g key={r.hour}>
                      {UMR_CATEGORIES.map((c) => {
                        const v = r.totals[c];
                        if (v <= 0) return null;
                        const segH = (v / hourMax) * plotH;
                        y -= segH;
                        return (
                          <TintGroup key={c} category={c}>
                            <rect
                              x={cx - barW / 2} y={y} width={barW}
                              height={Math.max(0.8, segH)} fill="var(--tint)" rx={0.5}
                            />
                          </TintGroup>
                        );
                      })}
                      {i % 6 === 0 && <AxisText x={cx} y={h - 5}>{hourLabel(r.hour, hour12)}</AxisText>}
                    </g>
                  );
                })}
              </>
            );
          }}
        </Chart>
      )}

      <PanelNote>
        The weekday chart divides by how many of that weekday fell in the window, so a short window
        does not make Monday look small. The hour chart draws only the{" "}
        {pct(total > 0 ? placed / total : 0)} of minutes that recorded a clock time — sleep and habit
        ticks belong to a day and to no finer a slot, and spreading them evenly would invent a shape
        that was never there. Totals: {fmtMin(sumTotals(weekTotals))}.
      </PanelNote>
    </Panel>
  );
}
