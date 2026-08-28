"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import { addDays, daysBetween, formatDuration, formatTime } from "@/lib/date";
import { PRAYER_LABELS, type PrayerName } from "@/lib/types";
import { Segmented } from "@/components/ui/primitives";
import { MiniEmpty } from "@/components/ui/form";
import { CompositionBar } from "./prayer-state";
import { COMPOSITION, buildInsights, extremes, lagStats, statusIndex, type Counts } from "./salah-stats";
import { partOfDay, prayerWindows, windowLength, type TimesTriple } from "./windows";

const SPANS = [
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
] as const;

/**
 * Which prayer slips, and when in the day it happens. Written to be read
 * once and acted on — never to hand out a score.
 */
export function PrayerInsights({ today, t }: { today: string; t: TimesTriple }) {
  const prayers = useStore((s) => s.prayers);
  const hour12 = useStore((s) => s.hour12);
  const profile = useStore((s) => s.profile);
  const [span, setSpan] = React.useState<"30" | "90">("30");

  const days = Number(span);
  const dates = React.useMemo(() => daysBetween(addDays(today, -(days - 1)), today), [today, days]);
  const index = React.useMemo(() => statusIndex(prayers), [prayers]);

  const config = React.useMemo(
    () => ({
      latitude: profile?.latitude ?? 0,
      longitude: profile?.longitude ?? 0,
      method: profile?.calc_method ?? "MuslimWorldLeague",
      madhab: profile?.madhab ?? "hanafi",
    }),
    [profile?.latitude, profile?.longitude, profile?.calc_method, profile?.madhab],
  );

  const lag = React.useMemo(
    () => lagStats(prayers, new Set(dates), config),
    [prayers, dates, config],
  );

  const insights = React.useMemo(() => buildInsights(index, dates, lag), [index, dates, lag]);
  const windows = prayerWindows(t);
  const anyRecords = insights.some((i) => i.handled > 0);
  const { weakest, strongest } = extremes(insights);

  return (
    <section className="surface p-5">
      <header className="flex flex-wrap items-center gap-2">
        <h2 className="flex-1 text-[13px] font-semibold text-ink">Per prayer</h2>
        <Segmented
          size="sm"
          value={span}
          onChange={setSpan}
          options={SPANS.map((s) => ({ value: s.value, label: s.label }))}
        />
      </header>

      {!anyRecords ? (
        <MiniEmpty className="py-8">
          Mark a few prayers and the pattern shows up here — which one slips, and when in the day it happens.
        </MiniEmpty>
      ) : (
        <>
          <p className="mt-3 text-[13px] leading-relaxed text-ink-2">
            Over the last <span className="tnum">{days}</span> days,{" "}
            <span className="font-medium text-ink">{PRAYER_LABELS[weakest.name]}</span> is the one that most
            often gets handled later —{" "}
            <span className="tnum">{weakest.counts.qadha}</span> made up afterwards and{" "}
            <span className="tnum">{weakest.counts.none + weakest.counts.missed}</span> left unrecorded. Its
            window falls in {partOfDay(windows[weakest.name].start)},{" "}
            <span className="tnum">{formatTime(windows[weakest.name].start, hour12)}</span> to{" "}
            <span className="tnum">{formatTime(windows[weakest.name].end, hour12)}</span>.
          </p>
          {strongest.name !== weakest.name && strongest.counts.jamaah > 0 && (
            <p className="mt-1.5 text-[13px] leading-relaxed text-ink-3">
              <span className="font-medium text-ink-2">{PRAYER_LABELS[strongest.name]}</span> is the steadiest:{" "}
              <span className="tnum">{strongest.counts.jamaah}</span> of{" "}
              <span className="tnum">{strongest.total}</span> in jamaah.
            </p>
          )}

          <ul className="mt-4 grid gap-2.5 sm:grid-cols-2">
            {insights.map((insight) => (
              <InsightCard
                key={insight.name}
                name={insight.name}
                start={windows[insight.name].start}
                end={windows[insight.name].end}
                length={windowLength(windows[insight.name])}
                counts={insight.counts}
                handledRate={insight.handledRate}
                lagMedian={insight.lag.median}
                lagSamples={insight.lag.samples}
                lateInWindow={insight.lag.lateInWindow}
                hour12={hour12}
                highlight={insight.name === weakest.name}
              />
            ))}
          </ul>

          <p className="mt-3 text-[11.5px] leading-relaxed text-ink-4">
            &ldquo;Usually marked&rdquo; is the median gap between the adhan and the moment you tapped it, counting
            only marks made on the day itself and inside the window. Anything filled in later is left out
            rather than guessed at.
          </p>
        </>
      )}
    </section>
  );
}

function InsightCard({
  name, start, end, length, counts, handledRate, lagMedian, lagSamples, lateInWindow, hour12, highlight,
}: {
  name: PrayerName;
  start: number;
  end: number;
  length: number;
  counts: Counts;
  handledRate: number;
  lagMedian: number | null;
  lagSamples: number;
  lateInWindow: number;
  hour12: boolean;
  highlight: boolean;
}) {
  return (
    <li
      className={cn(
        "rounded-lg border p-3",
        highlight ? "border-line bg-warn-soft" : "border-line",
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[13px] font-medium text-ink">{PRAYER_LABELS[name]}</span>
        <span className="tnum text-[11.5px] text-ink-3">
          {formatTime(start, hour12)} – {formatTime(end, hour12)}
        </span>
      </div>

      <CompositionBar className="mt-2" counts={counts} order={COMPOSITION} height={6} />

      <p className="mt-2 text-[11.5px] leading-relaxed text-ink-3">
        <span className="tnum font-medium text-ink-2">{Math.round(handledRate * 100)}%</span> recorded ·{" "}
        <span className="tnum">{counts.jamaah}</span> jamaah ·{" "}
        <span className="tnum">{counts.qadha}</span> qadha
      </p>

      <p className="mt-1 text-[11.5px] leading-relaxed text-ink-4">
        {lagMedian == null || lagSamples < 3 ? (
          <>Window runs {formatDuration(length)} — not enough marks yet to see a habit.</>
        ) : (
          <>
            Usually marked <span className="tnum">{formatDuration(lagMedian)}</span> after the adhan
            {lateInWindow > 0 && (
              <>
                , with <span className="tnum">{lateInWindow}</span> in the last quarter of the window
              </>
            )}
            .
          </>
        )}
      </p>
    </li>
  );
}
