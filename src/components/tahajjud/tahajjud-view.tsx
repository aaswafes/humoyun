"use client";

import * as React from "react";
import { useStore } from "@/lib/store";
import type { TimesTriple } from "@/components/salah/windows";
import { NightCard } from "./night-card";
import { NightMonth } from "./night-month";
import { TahajjudStats } from "./tahajjud-stats";
import { buildNightIndex, freshNight, nightClock, withTahajjud } from "./night-data";

// The same rail as the Today tab beside it: minmax(0,1fr) below lg, so
// nothing inside can push the page past a phone's edge.
const RAIL = "grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[minmax(0,1fr)_296px] lg:gap-8";

/**
 * The Tahajjud tab on Salah. It borrows Salah's clock and nothing else: its
 * record, its month and its numbers are its own, and none of them are added
 * into the five — a voluntary night prayer is not a sixth fard.
 */
export function TahajjudView({ today, t, nowMin }: { today: string; t: TimesTriple; nowMin: number }) {
  const dayLogs = useStore((s) => s.dayLogs);
  const setDayLog = useStore((s) => s.setDayLog);
  const weekStart = useStore((s) => s.profile?.week_start ?? 1);
  const [picked, setPicked] = React.useState<string | null>(null);

  const clock = nightClock(today, t, nowMin);
  // In the day the night that can be recorded has ended; the one worth
  // planning for starts at Maghrib.
  const ahead = clock.phase === "over" ? nightClock(today, t, t.today.maghrib) : clock;
  const index = React.useMemo(() => buildNightIndex(dayLogs), [dayLogs]);
  const current = clock.key;
  const pickedNight = picked ?? current;

  // A square is the obvious place to say "I rose that night", so a tap on one
  // not yet kept marks it. A kept one only opens: it carries a count and a
  // time, and a stray tap should never erase them — the card's tick does that.
  function pick(date: string) {
    if (!index.has(date)) {
      const log = dayLogs.find((d) => d.date === date);
      setDayLog(date, { data: withTahajjud(log, freshNight(index, clock, date, nowMin)) });
    }
    setPicked(date === current ? null : date);
  }

  return (
    <div className="flex flex-col gap-8">
      <div className={RAIL}>
        <NightCard
          clock={clock}
          ahead={ahead}
          nowMin={nowMin}
          picked={pickedNight}
          index={index}
          onBack={() => setPicked(null)}
        />
        <NightMonth
          current={current}
          picked={pickedNight}
          index={index}
          weekStart={weekStart}
          onPick={pick}
        />
      </div>

      <div className="hairline-t pt-6">
        <TahajjudStats current={current} index={index} weekStart={weekStart} />
      </div>
    </div>
  );
}
