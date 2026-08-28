"use client";

import * as React from "react";
import { PageBody, PageHeader } from "@/components/shell/page-header";
import { Skeleton } from "@/components/ui/primitives";
import { useNow } from "@/hooks/use-hotkeys";
import { toISO } from "@/lib/date";
import { currentPrayer, prayerTimesFor } from "@/lib/prayer";
import { useStore } from "@/lib/store";
import { NextPrayerSubtitle } from "@/components/salah/countdown";
import { MonthGrid } from "@/components/salah/month-grid";
import { QuranTracker } from "@/components/salah/quran-tracker";
import { TodayCard } from "@/components/salah/today-card";

export default function SalahPage() {
  const ready = useStore((s) => s.ready);
  const profile = useStore((s) => s.profile);

  // One slow tick drives both the current-window highlight and the day rollover;
  // the per-second countdowns keep their own faster clocks.
  const nowTs = useNow(20_000);
  const today = React.useMemo(() => toISO(new Date(nowTs)), [nowTs]);
  const nowMin = React.useMemo(() => {
    const d = new Date(nowTs);
    return d.getHours() * 60 + d.getMinutes();
  }, [nowTs]);

  const times = React.useMemo(() => {
    if (!profile) return null;
    return prayerTimesFor(today, {
      latitude: profile.latitude,
      longitude: profile.longitude,
      method: profile.calc_method,
      madhab: profile.madhab,
    });
  }, [today, profile]);

  const next = times ? currentPrayer(times, nowMin) : null;

  return (
    <>
      <PageHeader
        title="Salah"
        subtitle={next ? <NextPrayerSubtitle name={next.next} at={next.nextAt} /> : undefined}
      />

      <PageBody className="max-w-[1000px]">
        {!ready || !times ? (
          <LoadingSalah />
        ) : (
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_280px] lg:gap-8">
            <div className="flex flex-col gap-6">
              <TodayCard date={today} times={times} nowMin={nowMin} />
              <QuranTracker today={today} />
            </div>
            <MonthGrid today={today} />
          </div>
        )}
      </PageBody>
    </>
  );
}

function LoadingSalah() {
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_280px] lg:gap-8">
      <div className="flex flex-col gap-6">
        <div className="surface p-5">
          <div className="flex justify-between">
            <Skeleton className="h-9 w-40" />
            <Skeleton className="h-9 w-24" />
          </div>
          <div className="mt-5 space-y-2">
            {Array.from({ length: 7 }, (_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        </div>
        <div className="surface p-5">
          <Skeleton className="h-9 w-32" />
          <Skeleton className="mt-5 h-1.5 w-full" />
          <Skeleton className="mt-3 h-4 w-2/3" />
        </div>
      </div>
      <div className="surface p-4">
        <Skeleton className="h-5 w-28" />
        <Skeleton className="mt-4 h-8 w-full" />
        <div className="mt-4 space-y-1.5">
          {Array.from({ length: 12 }, (_, i) => (
            <Skeleton key={i} className="h-5 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
