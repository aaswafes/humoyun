"use client";

import * as React from "react";
import { Hourglass } from "lucide-react";
import { MINUTES_IN_DAY, UMR_CATEGORIES, UMR_META, damBalance, sumTotals, totalsOf } from "@/lib/umr";
import { CategoryBar } from "@/components/umr/category-bar";
import { useUmrLedger } from "@/components/umr/use-umr";
import { fmtMin, pct } from "@/components/umr/derive";
import { RailCard, RailEmpty, RailLink, RailMeta } from "./rail-card";

// =========================================================
// Umr on the rail.
//
// The cap only works if it is in front of you before the evening, not found
// on a stats page afterwards — so the day's split and the Dam balance sit
// beside salah and habits, where the day is actually read.
// =========================================================

export function UmrCard({ date }: { date: string }) {
  const days = React.useMemo(() => [date], [date]);
  const { entries, prefs } = useUmrLedger(days);

  const { totals, unassigned } = React.useMemo(() => totalsOf(entries), [entries]);
  const accounted = sumTotals(totals) + unassigned;
  const balance = damBalance(totals.talim, totals.dam, prefs);

  const summary = accounted === 0
    ? "nothing recorded yet"
    : balance.over
      ? `${fmtMin(accounted)} recorded · Dam ${fmtMin(-balance.left)} over`
      : `${fmtMin(accounted)} recorded · Dam ${fmtMin(balance.left)} left`;

  return (
    <RailCard
      icon={Hourglass}
      title="Umr"
      summary={summary}
      foldKey="umr"
      href="/umr"
      hrefLabel="Open Umr"
    >
      {accounted === 0 ? (
        <RailEmpty action={<RailLink href="/umr">Log some time</RailLink>}>
          Nothing has been recorded today. Umr counts timed sittings, minutes written on tasks,
          prayers and habits on its own — the rest you tell it.
        </RailEmpty>
      ) : (
        <div className="px-2 pb-1.5 pt-0.5">
          <CategoryBar
            totals={totals}
            unassigned={unassigned}
            capacity={MINUTES_IN_DAY}
            height={8}
          />

          <ul className="mt-2.5 flex flex-col gap-1">
            {UMR_CATEGORIES.filter((c) => totals[c] > 0).map((c) => (
              <li key={c} className="flex items-center gap-2 text-[12.5px]">
                <span className={`tint-${UMR_META[c].tint} shrink-0`}>
                  <span className="block size-2 rounded-full" style={{ background: "var(--tint)" }} aria-hidden />
                </span>
                <span className="min-w-0 flex-1 truncate text-ink-2">{UMR_META[c].label}</span>
                <span className="shrink-0 text-ink-3 tnum">{fmtMin(totals[c])}</span>
                <span className="w-[34px] shrink-0 text-right text-[11px] text-ink-4 tnum">
                  {pct(totals[c] / accounted)}
                </span>
              </li>
            ))}
          </ul>

          <RailMeta
            className="mt-2.5"
            value={balance.over ? `${fmtMin(-balance.left)} over` : fmtMin(balance.left)}
          >
            {balance.over
              ? `Dam past its budget — Taʼlim earned ${fmtMin(balance.budget)}`
              : `Dam left of the ${fmtMin(balance.budget)} Taʼlim earned`}
          </RailMeta>
        </div>
      )}
    </RailCard>
  );
}
