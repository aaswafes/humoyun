"use client";

import * as React from "react";
import {
  AxisText, Chart, GridY, Panel, PanelNote, areaPath, axisTicks, linePath,
  type TableSpec,
} from "@/components/stats/chart-kit";
import { UMR_CATEGORIES, UMR_META } from "@/lib/umr";
import { balanceIndex, dominant, fmtMin, pct, trailing, type CategoryStreak, type UmrSummary } from "../derive";
import { TintGroup } from "./shared";

// =========================================================
// How evenly the five are spread, and how that moved.
//
// The number is Shannon evenness over the five categories: 1 is a perfectly
// even split, 0 is everything in one. It is a DESCRIPTION, not a score — a
// week of hard study reads low and should. The panel says so out loud, because
// a bare 0–100 number on a page about your life invites being read as a grade.
// =========================================================

const PAD = { top: 10, right: 6, bottom: 20, left: 34 };

export function BalancePanel({
  summary, streaks,
}: {
  summary: UmrSummary;
  streaks: CategoryStreak[];
}) {
  const index = balanceIndex(summary.totals);
  const top = dominant(summary.totals);

  // A single day is too noisy to mean anything, so the line is the trailing
  // week — the same reason the completion trend on Stats draws an average.
  const daily = summary.days.map((d) => balanceIndex(d.totals) ?? 0);
  const smooth = React.useMemo(() => trailing(daily, 7), [daily]);

  const table: TableSpec = {
    caption: "Balance across the five kinds of living, day by day.",
    columns: ["Date", "Balance", "7-day", "Recorded (min)"],
    rows: summary.days.map((d, i) => [
      d.date,
      daily[i].toFixed(2),
      smooth[i].toFixed(2),
      d.accounted,
    ]),
  };

  const subtitle = index == null
    ? "Nothing recorded in this window."
    : `Balance sits at ${Math.round(index * 100)} out of 100${
      top ? `, with ${UMR_META[top.category].label} taking ${pct(summary.share[top.category])} of everything recorded` : ""
    }. A high number means the five kinds of living got similar amounts of time — it is a description of the split, not a verdict on it.`;

  return (
    <Panel id="umr-balance" title="Balance" subtitle={subtitle} table={table}>
      <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
        {[
          {
            label: "Balance",
            value: index == null ? "—" : String(Math.round(index * 100)),
            sub: "0 is all one kind, 100 is even",
          },
          {
            label: "Largest share",
            value: top ? UMR_META[top.category].label : "—",
            sub: top ? `${fmtMin(top.minutes)} · ${pct(summary.share[top.category])}` : "nothing recorded",
          },
          {
            label: "Kinds touched",
            value: String(streaks.filter((s) => s.daysTouched > 0).length),
            sub: "of five, in this window",
          },
          {
            label: "Days with all five",
            value: String(summary.days.filter((d) => UMR_CATEGORIES.every((c) => d.totals[c] > 0)).length),
            sub: `of ${summary.days.length}`,
          },
        ].map((cell) => (
          <div key={cell.label} className="min-w-0">
            <div className="text-[11.5px] text-ink-3">{cell.label}</div>
            <div className="display-serif mt-1 text-[22px] leading-none text-ink tnum">{cell.value}</div>
            <p className="mt-1 truncate text-[11px] text-ink-4">{cell.sub}</p>
          </div>
        ))}
      </div>

      {summary.days.length > 2 && (
        <Chart
          className="mt-5"
          height={(w) => Math.max(120, Math.min(180, w * 0.2))}
          label="Balance across the five kinds of living, seven-day trailing average"
          description={table.caption}
        >
          {({ w, h }) => {
            const plotW = Math.max(1, w - PAD.left - PAD.right);
            const plotH = Math.max(1, h - PAD.top - PAD.bottom);
            const x = (i: number) => PAD.left + (i / Math.max(1, smooth.length - 1)) * plotW;
            const y = (v: number) => PAD.top + plotH - v * plotH;
            const pts = smooth.map((v, i): [number, number] => [x(i), y(v)]);

            return (
              <>
                <GridY
                  x0={PAD.left}
                  x1={PAD.left + plotW}
                  ticks={axisTicks(1, 2)}
                  y={y}
                  format={(v) => String(Math.round(v * 100))}
                />
                <TintGroup category="talim">
                  <path d={areaPath(pts, PAD.top + plotH)} fill="var(--tint)" opacity={0.12} />
                  <path
                    d={linePath(pts)}
                    fill="none"
                    stroke="var(--tint)"
                    strokeWidth={1.5}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                </TintGroup>
                <AxisText x={PAD.left} y={h - 5} anchor="start">{summary.days[0]?.date.slice(5)}</AxisText>
                <AxisText x={PAD.left + plotW} y={h - 5} anchor="end">
                  {summary.days[summary.days.length - 1]?.date.slice(5)}
                </AxisText>
              </>
            );
          }}
        </Chart>
      )}

      {/* ---- streaks, per kind ---- */}
      <ul className="mt-5 flex flex-col gap-1.5 hairline-t pt-4">
        {streaks.map((s) => (
          <li key={s.category} className="flex items-center gap-2.5 text-[12.5px]">
            <span className={`tint-${UMR_META[s.category].tint} shrink-0`}>
              <span className="block size-2 rounded-full" style={{ background: "var(--tint)" }} aria-hidden />
            </span>
            <span className="w-[74px] shrink-0 text-ink">{UMR_META[s.category].label}</span>
            <span className="min-w-0 flex-1 truncate text-[11.5px] text-ink-4 tnum">
              {s.daysTouched} {s.daysTouched === 1 ? "day" : "days"} touched ·{" "}
              {s.current > 0 ? `${s.current}-day run now` : "no run right now"} · best {s.best}
            </span>
            <span className="shrink-0 text-[11.5px] text-ink-3 tnum">{fmtMin(summary.totals[s.category])}</span>
          </li>
        ))}
      </ul>

      <PanelNote>
        Balance is Shannon evenness over the five kinds, normalised to 0–100. It says how similar
        the five amounts were and nothing about whether that was right: a week spent almost entirely
        on Taʼlim scores low, and might be exactly the week you meant to have.
      </PanelNote>
    </Panel>
  );
}
