"use client";

import * as React from "react";
import {
  AxisText, Chart, GridY, HoverSurface, Panel, PanelNote, axisTicks, linePath, niceMax,
  type TableSpec, type TipState,
} from "@/components/stats/chart-kit";
import { UMR_META, ratioPhrase, type UmrPrefs } from "@/lib/umr";
import { fmtAxis, fmtMin, pct, type DamDay, type DamDiscipline } from "../derive";
import { TintGroup } from "./shared";

// =========================================================
// The cap, day by day.
//
// Bars are Dam spent; the line is what Taʼlim earned that day. A bar above the
// line is a day that went over, and it is drawn in the danger colour — the one
// place in this app where red means what it says.
// =========================================================

const PAD = { top: 12, right: 6, bottom: 20, left: 38 };

export function DamPanel({
  rows, discipline, prefs,
}: {
  rows: DamDay[];
  discipline: DamDiscipline;
  prefs: UmrPrefs;
}) {
  const [cursor, setCursor] = React.useState<number | null>(null);

  const max = React.useMemo(
    () => niceMax(Math.max(1, ...rows.map((r) => Math.max(r.spent, r.budget)))),
    [rows],
  );

  const { overall, daysOver, currentStreak, bestStreak, debt, actualRatio } = discipline;

  const subtitle = rows.length === 0
    ? "Nothing to weigh yet."
    : overall.over
      ? `Dam ran ${fmtMin(-overall.left)} past its budget across this window: ${fmtMin(overall.spent)} spent against ${fmtMin(overall.budget)} earned by ${fmtMin(overall.earned)} of Taʼlim. ${daysOver} of ${rows.length} days went over.`
      : `Dam stayed inside its budget: ${fmtMin(overall.spent)} spent of ${fmtMin(overall.budget)} earned, with ${fmtMin(overall.left)} unspent. ${daysOver === 0 ? "No day went over." : `${daysOver} of ${rows.length} days went over.`}`;

  const table: TableSpec = {
    caption: "Dam spent against the budget Taʼlim earned, per day.",
    columns: ["Date", "Taʼlim (min)", "Budget (min)", "Dam spent (min)", "Over by (min)"],
    rows: rows.map((r) => [r.date, r.talim, r.budget, r.spent, Math.max(0, r.spent - r.budget)]),
  };

  const active = cursor != null ? rows[cursor] : null;
  const tip: TipState | null = active
    ? {
      title: active.date,
      wide: true,
      rows: [
        { label: "Taʼlim", value: fmtMin(active.talim), color: "var(--ink-3)" },
        { label: "Budget", value: fmtMin(active.budget), color: "var(--ink-4)" },
        {
          label: "Dam spent",
          value: fmtMin(active.spent),
          color: active.over ? "var(--danger)" : "var(--ink-2)",
        },
        ...(active.over
          ? [{ label: "Over by", value: fmtMin(active.spent - active.budget), color: "var(--danger)" }]
          : []),
      ],
      x: 0,
      y: 0,
    }
    : null;

  return (
    <Panel id="umr-dam" title="The Dam cap" subtitle={subtitle} table={table}>
      <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
        {[
          {
            label: "Days within",
            value: String(discipline.daysWithin),
            sub: rows.length ? `of ${rows.length} · ${pct(discipline.daysWithin / rows.length)}` : "no days",
          },
          {
            label: "Clean run now",
            value: String(currentStreak),
            sub: `best was ${bestStreak} ${bestStreak === 1 ? "day" : "days"}`,
          },
          {
            label: "Minutes over",
            value: debt ? fmtMin(debt) : "0",
            sub: debt ? "past the cap, all told" : "never past the cap",
          },
          {
            label: "Dam per Taʼlim",
            value: actualRatio == null ? "—" : `${(actualRatio * 100).toFixed(0)}%`,
            sub: `cap is ${(prefs.damRatio * 100).toFixed(0)}%`,
          },
        ].map((cell) => (
          <div key={cell.label} className="min-w-0">
            <div className="text-[11.5px] text-ink-3">{cell.label}</div>
            <div className="display-serif mt-1 text-[22px] leading-none text-ink tnum">{cell.value}</div>
            <p className="mt-1 truncate text-[11px] text-ink-4 tnum">{cell.sub}</p>
          </div>
        ))}
      </div>

      <Chart
        className="mt-5"
        height={(w) => Math.max(160, Math.min(240, w * 0.26))}
        label="Dam spent each day against the budget Taʼlim earned"
        description={table.caption}
        nav={{
          n: rows.length,
          index: cursor,
          onIndex: setCursor,
          describe: (i) => {
            const r = rows[i];
            return r.over
              ? `${r.date}: ${fmtMin(r.spent)} of Dam against a ${fmtMin(r.budget)} budget — ${fmtMin(r.spent - r.budget)} over`
              : `${r.date}: ${fmtMin(r.spent)} of Dam against a ${fmtMin(r.budget)} budget`;
          },
        }}
        tip={tip ? ({ w }) => ({ ...tip, x: bandCentre(cursor ?? 0, rows.length, w), y: PAD.top }) : null}
        animateKey={rows.length}
      >
        {({ w, h }) => {
          const plotW = Math.max(1, w - PAD.left - PAD.right);
          const plotH = Math.max(1, h - PAD.top - PAD.bottom);
          const y = (v: number) => PAD.top + plotH - (Math.min(v, max) / max) * plotH;
          const band = plotW / Math.max(1, rows.length);
          const barW = Math.max(2, Math.min(24, band * 0.68));

          const budgetPts = rows.map((r, i): [number, number] => [
            PAD.left + band * i + band / 2,
            y(r.budget),
          ]);

          return (
            <>
              <GridY
                x0={PAD.left}
                x1={PAD.left + plotW}
                ticks={axisTicks(max, 2)}
                y={y}
                format={(v) => fmtAxis(v)}
              />

              {rows.map((r, i) => {
                const cx = PAD.left + band * i + band / 2;
                const top = y(r.spent);
                const dim = cursor != null && cursor !== i;
                if (r.spent <= 0) return null;
                return r.over ? (
                  <rect
                    key={r.date}
                    x={cx - barW / 2}
                    y={top}
                    width={barW}
                    height={Math.max(1, PAD.top + plotH - top)}
                    fill="var(--danger)"
                    opacity={dim ? 0.4 : 0.85}
                    rx={1}
                  />
                ) : (
                  <TintGroup key={r.date} category="dam" opacity={dim ? 0.4 : 1}>
                    <rect
                      x={cx - barW / 2}
                      y={top}
                      width={barW}
                      height={Math.max(1, PAD.top + plotH - top)}
                      fill="var(--tint)"
                      rx={1}
                    />
                  </TintGroup>
                );
              })}

              {/* What Taʼlim earned — the ceiling each bar is measured against. */}
              {budgetPts.length > 1 && (
                <TintGroup category="talim">
                  <path
                    d={linePath(budgetPts)}
                    fill="none"
                    stroke="var(--tint)"
                    strokeWidth={1.5}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                </TintGroup>
              )}

              {rows.map((r, i) => {
                if (!labelled(i, rows.length)) return null;
                return (
                  <AxisText key={r.date} x={PAD.left + band * i + band / 2} y={h - 6}>
                    {r.date.slice(5)}
                  </AxisText>
                );
              })}

              <HoverSurface
                x={PAD.left} y={PAD.top} w={plotW} h={plotH}
                n={rows.length}
                mode="band"
                onIndex={setCursor}
                onLeave={() => setCursor(null)}
              />
            </>
          );
        }}
      </Chart>

      <PanelNote>
        {ratioPhrase(prefs)}. The line is the budget {UMR_META.talim.label} earned that day; a bar
        above it is a day that went over. The budget does not roll over — an unspent hour on Monday
        buys nothing on Tuesday, which is the only version of this rule that cannot be gamed.
      </PanelNote>
    </Panel>
  );
}

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
