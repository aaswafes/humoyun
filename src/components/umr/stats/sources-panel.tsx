"use client";

import * as React from "react";
import { Panel, PanelNote, type TableSpec } from "@/components/stats/chart-kit";
import { MINUTES_IN_DAY } from "@/lib/umr";
import { fmtMin, pct, type SourceRow, type UmrSummary } from "../derive";

// =========================================================
// How measured this window really is.
//
// Every other panel is a share of what was recorded. This one says how much
// that is — and how much of it a clock measured rather than a person declared.
// Without it, a page of confident percentages would be quietly dishonest.
// =========================================================

const MEASURED = new Set(["session"]);

export function SourcesPanel({
  sources, summary,
}: {
  sources: SourceRow[];
  summary: UmrSummary;
}) {
  const total = sources.reduce((n, s) => n + s.minutes, 0);
  const measured = sources.filter((s) => MEASURED.has(s.source)).reduce((n, s) => n + s.minutes, 0);
  const span = Math.max(1, summary.days.length);
  const clock = span * MINUTES_IN_DAY;

  const table: TableSpec = {
    caption: "Where the minutes in this window came from.",
    columns: ["Source", "Minutes", "Entries", "Share"],
    rows: sources.map((s) => [s.label, s.minutes, s.entries, pct(s.share)]),
  };

  const subtitle = total === 0
    ? "Nothing recorded in this window."
    : `${fmtMin(total)} recorded out of ${fmtMin(clock)} of wall clock — ${pct(total / clock)} of the window. ${
      measured > 0
        ? `${pct(measured / total)} of it was measured by a timer; the rest was written down after the fact.`
        : "None of it came from a timer, so every figure is a declaration rather than a measurement."
    }`;

  return (
    <Panel id="umr-sources" title="How much of this is measured" subtitle={subtitle} table={table}>
      <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
        {[
          { label: "Recorded", value: fmtMin(total), sub: `${pct(summary.coverage)} of the clock` },
          { label: "Timed", value: fmtMin(measured), sub: total ? `${pct(measured / total)} of the ledger` : "nothing timed" },
          {
            label: "Days with data",
            value: String(summary.daysLogged),
            sub: `of ${span} · ${pct(summary.daysLogged / span)}`,
          },
          {
            label: "Uncategorised",
            value: fmtMin(summary.unassigned),
            sub: total ? `${pct(summary.unassigned / total)} of the ledger` : "nothing waiting",
          },
        ].map((cell) => (
          <div key={cell.label} className="min-w-0">
            <div className="text-[11.5px] text-ink-3">{cell.label}</div>
            <div className="display-serif mt-1 text-[22px] leading-none text-ink tnum">{cell.value}</div>
            <p className="mt-1 truncate text-[11px] text-ink-4 tnum">{cell.sub}</p>
          </div>
        ))}
      </div>

      {sources.length > 0 && (
        <ul className="mt-5 flex flex-col gap-1.5 hairline-t pt-4">
          {sources.map((s) => (
            <li key={s.source} className="flex items-center gap-2.5">
              <span className="w-[38%] min-w-0 truncate text-[12.5px] text-ink">{s.label}</span>
              <span
                className="h-1.5 min-w-[2px] rounded-full bg-accent"
                style={{ width: `${Math.max(2, s.share * 42)}%` }}
                aria-hidden
              />
              <span className="ml-auto shrink-0 text-[11.5px] text-ink-3 tnum">{fmtMin(s.minutes)}</span>
              <span className="w-[38px] shrink-0 text-right text-[11px] text-ink-4 tnum">{pct(s.share)}</span>
            </li>
          ))}
        </ul>
      )}

      <PanelNote>
        Nothing on this page is estimated or smoothed. A minute is here because a timer measured it,
        a row records it, or you said so — and prayers are the one declared figure, at whatever you
        set a prayer to be worth. The gap between what is recorded and the clock is not idle time;
        it is time nothing wrote down.
      </PanelNote>
    </Panel>
  );
}
