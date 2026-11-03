"use client";

import * as React from "react";
import { PageBody, PageHeader } from "@/components/shell/page-header";
import { Segmented, Skeleton } from "@/components/ui/primitives";
import { useNow } from "@/hooks/use-hotkeys";
import { addDays, formatTime, toISO } from "@/lib/date";
import { prayerTimesFor } from "@/lib/prayer";
import { useStore } from "@/lib/store";
import type { TimesTriple } from "@/components/salah/windows";
import { NightCard } from "@/components/tahajjud/night-card";
import { NightMonth } from "@/components/tahajjud/night-month";
import { TahajjudStats } from "@/components/tahajjud/tahajjud-stats";
import { buildNightIndex, nightClock } from "@/components/tahajjud/night-data";

type View = "night" | "stats";

const VIEWS: { value: View; label: string; title: string }[] = [
  { value: "night", label: "Night", title: "Tonight's times and the record of each night" },
  { value: "stats", label: "Stats", title: "How often, how many rakat, and which nights" },
];

// minmax(0,1fr) rather than auto below lg, so nothing inside can push the
// page past a phone's edge — the same rail the Salah page uses.
const RAIL = "grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[minmax(0,1fr)_296px] lg:gap-8";

/**
 * Tahajjud has its own page, its own record and its own numbers. It sits
 * beside Salah in the sidebar and borrows Salah's clock, but nothing here is
 * folded into the five — a voluntary night prayer is not a sixth fard.
 */
export default function TahajjudPage() {
  const ready = useStore((s) => s.ready);
  const profile = useStore((s) => s.profile);
  const dayLogs = useStore((s) => s.dayLogs);
  const hour12 = useStore((s) => s.hour12);
  const weekStart = profile?.week_start ?? 1;

  const [view, setView] = React.useState<View>("night");
  const [picked, setPicked] = React.useState<string | null>(null);

  const nowTs = useNow(20_000);
  const today = React.useMemo(() => toISO(new Date(nowTs)), [nowTs]);
  const nowMin = React.useMemo(() => {
    const d = new Date(nowTs);
    return d.getHours() * 60 + d.getMinutes();
  }, [nowTs]);

  // Three days: a night starts on one day's Maghrib and ends on the next
  // day's Fajr, and this morning still belongs to last night.
  const times = React.useMemo<TimesTriple | null>(() => {
    if (!profile) return null;
    const config = {
      latitude: profile.latitude,
      longitude: profile.longitude,
      method: profile.calc_method,
      madhab: profile.madhab,
    };
    return {
      prev: prayerTimesFor(addDays(today, -1), config),
      today: prayerTimesFor(today, config),
      next: prayerTimesFor(addDays(today, 1), config),
    };
  }, [today, profile]);

  const clock = times ? nightClock(today, times, nowMin) : null;
  // In the day the night that can be recorded has ended; the one worth
  // planning for starts at Maghrib.
  const ahead = times && clock?.phase === "over" ? nightClock(today, times, times.today.maghrib) : clock;
  const index = React.useMemo(() => buildNightIndex(dayLogs), [dayLogs]);

  const current = clock?.key ?? today;
  const pickedNight = picked ?? current;

  return (
    <>
      <PageHeader
        title="Tahajjud"
        subtitle={
          ahead ? (
            <span className="tnum">
              Last third {formatTime(ahead.lastThird, hour12)} · Fajr {formatTime(ahead.fajr, hour12)}
            </span>
          ) : undefined
        }
      >
        <Segmented
          size="sm"
          value={view}
          onChange={setView}
          options={VIEWS.map((v) => ({ value: v.value, label: v.label, title: v.title }))}
          className="max-md:flex max-md:w-full max-md:[&>button]:h-7 max-md:[&>button]:flex-1 max-md:[&>button]:text-[13px]"
        />
      </PageHeader>

      <PageBody className="max-w-[1120px]">
        {!ready || !clock || !ahead ? (
          <LoadingTahajjud />
        ) : view === "night" ? (
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
              onPick={(date) => setPicked(date === current ? null : date)}
            />
          </div>
        ) : (
          <TahajjudStats
            current={current}
            index={index}
            weekStart={weekStart}
            onRecord={() => setView("night")}
          />
        )}
      </PageBody>
    </>
  );
}

function LoadingTahajjud() {
  return (
    <div className={RAIL}>
      <div className="surface p-5">
        <div className="flex justify-between">
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-9 w-24" />
        </div>
        <div className="mt-5 space-y-2">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      </div>
      <div>
        <Skeleton className="h-5 w-28" />
        <div className="mt-4 grid grid-cols-7 gap-1.5">
          {Array.from({ length: 35 }, (_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
