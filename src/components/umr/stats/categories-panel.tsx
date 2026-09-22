"use client";

import * as React from "react";
import { Panel, PanelNote, Sparkline, type TableSpec } from "@/components/stats/chart-kit";
import { cn } from "@/lib/cn";
import { UMR_CATEGORIES, UMR_META, type UmrCategory } from "@/lib/umr";
import { MiniEmpty } from "@/components/ui/form";
import type { UmrEntry } from "@/lib/umr";
import {
  activitiesIn, changePct, fmtMin, pct, project,
  type CategoryStreak, type UmrSummary,
} from "../derive";
import { CategoryPicker } from "../category-picker";

// =========================================================
// One kind of living at a time: how much, how often, what filled it, and where
// it is heading if nothing changes.
//
// A picker rather than five panels — the five read identically, and stacking
// them would make the page a list nobody reaches the bottom of.
// =========================================================

export function CategoriesPanel({
  summary, previous, entries, streaks,
}: {
  summary: UmrSummary;
  previous: UmrSummary | null;
  entries: UmrEntry[];
  streaks: CategoryStreak[];
}) {
  const [selected, setSelected] = React.useState<UmrCategory>("talim");
  const meta = UMR_META[selected];
  const span = Math.max(1, summary.days.length);

  const minutes = summary.totals[selected];
  const streak = streaks.find((s) => s.category === selected);
  const activities = React.useMemo(
    () => activitiesIn(entries, selected),
    [entries, selected],
  );
  const projection = project(summary.totals, selected, span);
  const delta = previous ? changePct(minutes, previous.totals[selected]) : null;
  const series = summary.days.map((d) => d.totals[selected]);

  const table: TableSpec = {
    caption: "Every kind of living, side by side.",
    columns: ["Kind", "Total (min)", "Per day (min)", "Share", "Days touched", "Best run"],
    rows: UMR_CATEGORIES.map((c) => {
      const s = streaks.find((x) => x.category === c);
      return [
        UMR_META[c].label,
        summary.totals[c],
        Math.round(summary.perDay[c]),
        pct(summary.share[c]),
        s?.daysTouched ?? 0,
        s?.best ?? 0,
      ];
    }),
  };

  const subtitle = `${meta.label} — ${meta.gloss}. ${
    minutes > 0
      ? `${fmtMin(minutes)} across these ${span} days, about ${fmtMin(summary.perDay[selected])} a day and ${pct(summary.share[selected])} of everything recorded.`
      : `Nothing recorded in these ${span} days.`
  }`;

  return (
    <Panel id="umr-categories" title="Each kind of living" subtitle={subtitle} table={table}>
      <CategoryPicker
        value={selected}
        onChange={(c) => { if (c) setSelected(c); }}
        size="sm"
        label="Which kind of living to look at"
      />

      <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
        {[
          { label: "Total", value: fmtMin(minutes), sub: `${pct(summary.share[selected])} of what was recorded` },
          { label: "Per day", value: fmtMin(summary.perDay[selected]), sub: `over ${span} days` },
          {
            label: "Days touched",
            value: String(streak?.daysTouched ?? 0),
            sub: `of ${span} · best run ${streak?.best ?? 0}`,
          },
          {
            label: "Against before",
            value: delta == null ? "—" : `${delta > 0 ? "+" : ""}${Math.round(delta)}%`,
            sub: previous ? `was ${fmtMin(previous.totals[selected])}` : "no window before this",
          },
        ].map((cell) => (
          <div key={cell.label} className="min-w-0">
            <div className="text-[11.5px] text-ink-3">{cell.label}</div>
            <div className="display-serif mt-1 text-[22px] leading-none text-ink tnum">{cell.value}</div>
            <p className="mt-1 truncate text-[11px] text-ink-4 tnum">{cell.sub}</p>
          </div>
        ))}
      </div>

      <div className={cn(`tint-${meta.tint}`, "mt-4")}>
        <Sparkline values={series} width={520} height={38} color="var(--tint)" className="w-full" />
      </div>

      {/* ---- what actually filled it ---- */}
      <div className="mt-5 hairline-t pt-4">
        <p className="text-[11.5px] font-medium text-ink-3">What filled it</p>
        {activities.length === 0 ? (
          <MiniEmpty className="mt-2">Nothing recorded under {meta.label} yet.</MiniEmpty>
        ) : (
          <ul className="mt-2.5 flex flex-col gap-1.5">
            {activities.map((a) => (
              <li key={a.label} className="flex items-center gap-2.5">
                <span className="w-[42%] min-w-0 truncate text-[12.5px] text-ink">{a.label}</span>
                <span className={cn(`tint-${meta.tint}`, "h-1.5 min-w-[2px] rounded-full")}
                  style={{ width: `${Math.max(2, a.share * 40)}%`, background: "var(--tint)" }}
                  aria-hidden
                />
                <span className="ml-auto shrink-0 text-[11.5px] text-ink-3 tnum">{fmtMin(a.minutes)}</span>
                <span className="w-[38px] shrink-0 text-right text-[11px] text-ink-4 tnum">
                  {pct(a.share)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ---- where it leads ---- */}
      <div className="mt-5 hairline-t pt-4">
        <p className="text-[11.5px] font-medium text-ink-3">At this rate</p>
        <dl className="mt-2 flex flex-wrap gap-x-7 gap-y-2">
          {[
            { k: "a week", v: fmtMin(projection.perWeek) },
            { k: "a year", v: fmtMin(projection.perYear) },
            { k: "of a year", v: `${projection.daysOfLifePerYear.toFixed(1)} days` },
          ].map((row) => (
            <span key={row.k} className="flex items-baseline gap-1.5">
              <dd className="text-[15px] text-ink tnum">{row.v}</dd>
              <dt className="text-[11.5px] text-ink-4">{row.k}</dt>
            </span>
          ))}
        </dl>
      </div>

      <PanelNote>
        {meta.label} covers {meta.examples}. A projection is arithmetic on this window and nothing
        more — it assumes the next year looks like these {span} days, which it will not.
      </PanelNote>
    </Panel>
  );
}
