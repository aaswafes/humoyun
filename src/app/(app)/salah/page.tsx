"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { PageBody, PageHeader } from "@/components/shell/page-header";
import { Segmented, Skeleton } from "@/components/ui/primitives";
import { useNow } from "@/hooks/use-hotkeys";
import { addDays, toISO } from "@/lib/date";
import { prayerTimesFor } from "@/lib/prayer";
import { useStore } from "@/lib/store";
import { HeaderStatus } from "@/components/salah/countdown";
import { MonthGrid } from "@/components/salah/month-grid";
import { QuranTracker } from "@/components/salah/quran-tracker";
import { RhythmView } from "@/components/salah/rhythm-view";
import { TodayCard } from "@/components/salah/today-card";
import { ZikrView } from "@/components/salah/zikr-view";
import { UpcomingReadings } from "@/components/salah/upcoming-readings";
import { TahajjudView } from "@/components/tahajjud/tahajjud-view";
import { QazoView } from "@/components/qazo/qazo-view";
import { useSalahPrefs } from "@/components/salah/prefs";
import { nextPrayer, openWindow, type TimesTriple } from "@/components/salah/windows";

type View = "today" | "tahajjud" | "qazo" | "rhythm" | "quran" | "zikr";

const VIEWS: { value: View; label: string; title: string }[] = [
  { value: "today", label: "Today", title: "The five, their windows and what follows them" },
  { value: "tahajjud", label: "Tahajjud", title: "The night prayer — its own record and its own numbers" },
  { value: "qazo", label: "Qazo", title: "The prayers missed before you prayed regularly, and paying them back" },
  { value: "rhythm", label: "Rhythm", title: "Jamaah, alone and qadha — with the month of times, the Hijri date and the qibla" },
  { value: "quran", label: "Quran", title: "Khatm progress, juz by juz, and the reading plan" },
  { value: "zikr", label: "Zikr", title: "The counter, what this hour asks for, and a lifetime of counts" },
];

// The one column below lg is minmax(0,1fr), not the implicit auto: an auto
// track grows to the widest nowrap line inside it (a sunnah row, the times
// table), and on a phone that pushed the whole page past the screen edge.
const RAIL = "grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[minmax(0,1fr)_296px] lg:gap-8";

const isView = (v: string | null): v is View => VIEWS.some((x) => x.value === v);

// Reading the tab from the URL means the tree under it can only render on the
// client; the boundary keeps the rest of the route prerenderable and shows
// the same skeleton the page shows while the store loads.
export default function SalahPage() {
  return (
    <React.Suspense
      fallback={
        <>
          <PageHeader title="Salah" />
          <PageBody className="max-w-[1120px]">
            <LoadingSalah />
          </PageBody>
        </>
      }
    >
      <SalahScreen />
    </React.Suspense>
  );
}

function SalahScreen() {
  const ready = useStore((s) => s.ready);
  const profile = useStore((s) => s.profile);
  const [prefs, setPrefs] = useSalahPrefs();

  // The tab lives in the URL, so /salah?view=tahajjud can be linked to and
  // survives a reload. replaceState, not the router: Next keeps
  // useSearchParams in step with it, and switching a tab needs no server trip.
  const params = useSearchParams();
  const requested = params.get("view");
  const view: View = isView(requested) ? requested : "today";
  const setView = (next: View) => {
    window.history.replaceState(null, "", next === "today" ? "/salah" : `/salah?view=${next}`);
  };
  const [planning, setPlanning] = React.useState(false);

  // One slow tick drives the current-window highlight and the day rollover;
  // the per-second countdowns keep their own faster clocks.
  const nowTs = useNow(20_000);
  const today = React.useMemo(() => toISO(new Date(nowTs)), [nowTs]);
  const nowMin = React.useMemo(() => {
    const d = new Date(nowTs);
    return d.getHours() * 60 + d.getMinutes();
  }, [nowTs]);

  // Three days, because Isha's window runs past midnight into tomorrow's Fajr
  // and this morning still belongs to last night's.
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

  const open = times ? openWindow(times, nowMin) : null;
  const next = times ? nextPrayer(times, nowMin) : null;

  return (
    <>
      <PageHeader
        title="Salah"
        subtitle={next ? <HeaderStatus open={open} next={next} /> : undefined}
      >
        {/* The five views are this section's navigation, so on a phone they
            span the row like an iOS segmented control: thumb-sized, and
            "Zikr" no longer a 38px sliver at the end. */}
        {/* The wrapper only carries the tour's anchor; Segmented takes no
            extra attributes. flex keeps it from adding a line box. */}
        <div data-tour="salah.tabs" className="flex max-md:w-full">
          <Segmented
            size="sm"
            value={view}
            onChange={setView}
            options={VIEWS.map((v) => ({ value: v.value, label: v.label, title: v.title }))}
            className="max-md:flex max-md:w-full max-md:[&>button]:h-7 max-md:[&>button]:flex-1 max-md:[&>button]:px-1 max-md:[&>button]:text-[12.5px] touch:[&>button]:min-w-10"
          />
        </div>
      </PageHeader>

      <PageBody className="max-w-[1120px]">
        {!ready || !times ? (
          <LoadingSalah />
        ) : view === "today" ? (
          <div className={RAIL}>
            <TodayCard
              date={today}
              t={times}
              nowMin={nowMin}
              showSunnah={prefs.sunnah}
              onToggleSunnah={() => setPrefs({ sunnah: !prefs.sunnah })}
              hijriOffset={prefs.hijriOffset}
            />
            <MonthGrid today={today} />
          </div>
        ) : view === "tahajjud" ? (
          <TahajjudView today={today} t={times} nowMin={nowMin} />
        ) : view === "qazo" ? (
          <QazoView today={today} />
        ) : view === "rhythm" ? (
          <RhythmView
            today={today}
            t={times}
            nowMin={nowMin}
            hijriOffset={prefs.hijriOffset}
            onHijriOffset={(hijriOffset) => setPrefs({ hijriOffset })}
          />
        ) : view === "quran" ? (
          <div className={RAIL}>
            <QuranTracker today={today} planning={planning} onPlanning={setPlanning} />
            <UpcomingReadings today={today} onPlan={() => setPlanning(true)} />
          </div>
        ) : (
          <ZikrView today={today} />
        )}
      </PageBody>
    </>
  );
}

function LoadingSalah() {
  return (
    <div className={RAIL}>
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
