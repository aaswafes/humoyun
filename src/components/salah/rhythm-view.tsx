"use client";

import { formatTime } from "@/lib/date";
import { useStore } from "@/lib/store";
import { Fold, useFold } from "./fold";
import { HijriCard } from "./hijri-card";
import { LocationLine } from "./location-line";
import { PatternView } from "./pattern-view";
import { PrayerInsights } from "./insights";
import { QiblaCompass } from "./qibla-compass";
import { qiblaBearing } from "./qibla";
import { TimesCalendar } from "./times-calendar";
import type { TimesTriple } from "./windows";

const RAIL = "grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_296px] lg:gap-8";

/**
 * Rhythm — the shape of a week or a month, then what slips and when.
 *
 * The month of times, the Hijri date and the qibla live here too, folded:
 * they are reference rather than practice, looked up a few times a year and
 * in the way every other day. Folding keeps every one of them one tap from
 * the page that already owns the clock.
 */
export function RhythmView({
  today, t, nowMin, hijriOffset, onHijriOffset,
}: {
  today: string;
  t: TimesTriple;
  nowMin: number;
  hijriOffset: number;
  onHijriOffset: (next: number) => void;
}) {
  const hour12 = useStore((s) => s.hour12);
  const profile = useStore((s) => s.profile);
  const [timesOpen, setTimesOpen] = useFold("rhythm.times", false);

  const bearing = profile ? Math.round(qiblaBearing(profile.latitude, profile.longitude)) : null;

  return (
    <div className="flex flex-col gap-6">
      <PatternView today={today} />
      <PrayerInsights today={today} t={t} />

      <Fold
        id="times"
        title="Times, Hijri date and qibla"
        summary={
          <>
            Fajr <span className="tnum">{formatTime(t.today.fajr, hour12)}</span> · Maghrib{" "}
            <span className="tnum">{formatTime(t.today.maghrib, hour12)}</span>
            {bearing !== null && (
              <>
                {" "}· qibla <span className="tnum">{bearing}°</span>
              </>
            )}
          </>
        }
        open={timesOpen}
        onOpenChange={setTimesOpen}
      >
        <div className={RAIL}>
          <TimesCalendar today={today} hijriOffset={hijriOffset} />
          <div className="flex flex-col gap-6">
            <HijriCard
              date={today}
              afterMaghrib={nowMin >= t.today.maghrib}
              offset={hijriOffset}
              onOffset={onHijriOffset}
            />
            <QiblaCompass />
            <div className="surface p-4">
              <LocationLine />
            </div>
          </div>
        </div>
      </Fold>
    </div>
  );
}
