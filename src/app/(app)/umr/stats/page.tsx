"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Download, Hourglass } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import { todayISO } from "@/lib/date";
import {
  MINUTES_IN_DAY, UMR_CATEGORIES, UMR_META, ratioPhrase, sumTotals,
} from "@/lib/umr";
import { PageBody, PageHeader } from "@/components/shell/page-header";
import { Button, EmptyState, Segmented, Skeleton } from "@/components/ui/primitives";
import { csvFilename, downloadCsv, toCsv, type CsvSection } from "@/components/stats/csv";
import { StatTiles, type Tile } from "@/components/stats/stat-tiles";
import { CategoryBar, CategoryLegend } from "@/components/umr/category-bar";
import { FlowPanel } from "@/components/umr/stats/flow-panel";
import { DamPanel } from "@/components/umr/stats/dam-panel";
import { RhythmPanel } from "@/components/umr/stats/rhythm-panel";
import { CategoriesPanel } from "@/components/umr/stats/categories-panel";
import { SourcesPanel } from "@/components/umr/stats/sources-panel";
import { BalancePanel } from "@/components/umr/stats/balance-panel";
import { useUmrLedger } from "@/components/umr/use-umr";
import {
  UMR_RANGES, balanceIndex, bucketise, buildUmrInsights, categoryStreaks, changePct,
  damDays, damDiscipline, fmtMin, grainFor, hourProfile, pct, previousWindow, sourceBreakdown,
  summarise, umrRangeDates, weekdayProfile, type UmrRangeKey,
} from "@/components/umr/derive";

// =========================================================
// Umr, at length.
//
// The Umr page answers "what about today". This one answers everything else,
// and is deliberately long: the section exists to be examined, not glanced at.
// Every figure comes from the same ledger the day page reads, so the two can
// never disagree about a minute.
// =========================================================

export default function UmrStatsPage() {
  const ready = useStore((s) => s.ready);
  const hour12 = useStore((s) => s.hour12);
  const weekStart = useStore((s) => s.profile?.week_start ?? 1);
  const toast = useStore((s) => s.toast);

  const [range, setRange] = React.useState<UmrRangeKey>("30d");
  const today = todayISO();

  // "All" needs to know how far back anything goes, and only a ledger can say.
  // A cheap one over the last year is enough to find the floor without
  // building ten years of days to ask the question.
  const probeDays = React.useMemo(() => umrRangeDates("year", null, today), [today]);
  const { earliest } = useUmrLedger(probeDays);

  const days = React.useMemo(
    () => umrRangeDates(range, earliest, today),
    [range, earliest, today],
  );
  const prevDays = React.useMemo(() => previousWindow(days), [days]);
  const bothDays = React.useMemo(() => [...prevDays, ...days], [prevDays, days]);

  const { entries: allEntries, prefs } = useUmrLedger(bothDays);

  const inWindow = React.useMemo(() => {
    const set = new Set(days);
    return allEntries.filter((e) => set.has(e.date));
  }, [allEntries, days]);

  const inPrevious = React.useMemo(() => {
    const set = new Set(prevDays);
    return allEntries.filter((e) => set.has(e.date));
  }, [allEntries, prevDays]);

  const summary = React.useMemo(() => summarise(days, inWindow), [days, inWindow]);
  const previous = React.useMemo(
    () => (prevDays.length ? summarise(prevDays, inPrevious) : null),
    [prevDays, inPrevious],
  );

  const grain = grainFor(days.length);
  const buckets = React.useMemo(
    () => bucketise(summary.days, grain, weekStart),
    [summary.days, grain, weekStart],
  );
  const bucketCapacity = grain === "day"
    ? MINUTES_IN_DAY
    : MINUTES_IN_DAY * Math.max(1, Math.round(days.length / Math.max(1, buckets.length)));

  const dam = React.useMemo(() => damDays(summary.days, prefs), [summary.days, prefs]);
  const discipline = React.useMemo(
    () => damDiscipline(dam, summary.totals, prefs),
    [dam, summary.totals, prefs],
  );

  const weekdays = React.useMemo(
    () => weekdayProfile(summary.days, weekStart),
    [summary.days, weekStart],
  );
  const hours = React.useMemo(() => hourProfile(inWindow), [inWindow]);
  const sources = React.useMemo(() => sourceBreakdown(inWindow), [inWindow]);
  const streaks = React.useMemo(() => categoryStreaks(summary.days), [summary.days]);

  const insights = React.useMemo(
    () => buildUmrInsights({ summary, discipline, previous, prefs, weekdays, streaks }),
    [summary, discipline, previous, prefs, weekdays, streaks],
  );

  // ---- the headline row ----
  const tiles: Tile[] = React.useMemo(() => {
    const span = Math.max(1, days.length);
    const balance = balanceIndex(summary.totals);

    const rows: Tile[] = [
      {
        key: "accounted",
        label: "Recorded",
        value: fmtMin(summary.accounted),
        hint: `${fmtMin(summary.accounted)} of ${fmtMin(span * MINUTES_IN_DAY)} of wall clock — ${pct(summary.coverage)} of the window.`,
        delta: previous ? changePct(summary.accounted, previous.accounted) : null,
        deltaOf: "recorded minutes",
        spark: summary.days.map((d) => d.accounted),
        target: "umr-sources",
        targetLabel: "how measured this is",
      },
      ...UMR_CATEGORIES.map((c): Tile => ({
        key: c,
        label: UMR_META[c].label,
        value: fmtMin(summary.totals[c]),
        hint: `${UMR_META[c].gloss}. ${fmtMin(summary.totals[c])} across ${span} days — ${fmtMin(summary.perDay[c])} a day, ${pct(summary.share[c])} of everything recorded.`,
        delta: previous ? changePct(summary.totals[c], previous.totals[c]) : null,
        deltaOf: `${UMR_META[c].label} minutes`,
        spark: summary.days.map((d) => d.totals[c]),
        target: "umr-categories",
        targetLabel: "break it down",
      })),
      {
        key: "dam-left",
        label: discipline.overall.over ? "Dam over by" : "Dam left",
        value: fmtMin(Math.abs(discipline.overall.left)),
        hint: `${fmtMin(discipline.overall.spent)} of Dam against a ${fmtMin(discipline.overall.budget)} budget earned by ${fmtMin(discipline.overall.earned)} of Taʼlim. ${discipline.daysOver} of ${span} days went over.`,
        spark: dam.map((d) => Math.max(0, d.spent - d.budget)),
        target: "umr-dam",
        targetLabel: "see the cap",
      },
      {
        key: "balance",
        label: "Balance",
        value: balance == null ? "—" : String(Math.round(balance * 100)),
        hint: "How evenly the five kinds of living shared the recorded time. 100 is an even split; it describes the split rather than judging it.",
        target: "umr-balance",
        targetLabel: "see the spread",
      },
    ];
    return rows;
  }, [summary, previous, days.length, discipline, dam]);

  // ---- export ----
  const exportCsv = React.useCallback(() => {
    const sections: CsvSection[] = [
      {
        title: "Days",
        columns: ["Date", ...UMR_CATEGORIES.map((c) => UMR_META[c].label), "Uncategorised", "Recorded"],
        rows: summary.days.map((d) => [
          d.date, ...UMR_CATEGORIES.map((c) => d.totals[c]), d.unassigned, d.accounted,
        ]),
      },
      {
        title: "Dam budget",
        columns: ["Date", "Talim", "Budget", "Dam spent", "Over by"],
        rows: dam.map((d) => [d.date, d.talim, d.budget, d.spent, Math.max(0, d.spent - d.budget)]),
      },
      {
        title: "Weekday profile",
        columns: ["Weekday", ...UMR_CATEGORIES.map((c) => UMR_META[c].label), "Days"],
        rows: weekdays.map((r) => [r.label, ...UMR_CATEGORIES.map((c) => r.totals[c]), r.days]),
      },
      {
        title: "Hour profile",
        columns: ["Hour", ...UMR_CATEGORIES.map((c) => UMR_META[c].label), "Total"],
        rows: hours.rows.map((r) => [r.hour, ...UMR_CATEGORIES.map((c) => r.totals[c]), r.accounted]),
      },
      {
        title: "Sources",
        columns: ["Source", "Minutes", "Entries"],
        rows: sources.map((s) => [s.label, s.minutes, s.entries]),
      },
      {
        title: "Entries",
        columns: ["Date", "Start minute", "Kind", "Minutes", "Source", "Label"],
        rows: inWindow.map((e) => [
          e.date, e.startMin ?? "", e.category ?? "unset", e.minutes, e.source, e.label,
        ]),
      },
    ];

    downloadCsv(csvFilename(`umr-${range}`, []), toCsv(sections));
    toast({
      title: "Umr exported",
      description: `${days.length} days, ${inWindow.length} entries.`,
      tone: "success",
    });
  }, [summary.days, dam, weekdays, hours, sources, inWindow, range, days.length, toast]);

  const hasAnything = summary.accounted > 0;

  return (
    <>
      <PageHeader
        title="Umr — stats"
        subtitle={
          hasAnything
            ? `${fmtMin(summary.accounted)} recorded across ${days.length} days · ${pct(summary.coverage)} of the clock`
            : "Nothing recorded in this window"
        }
        actions={
          <div className="flex items-center gap-1.5">
            <Button size="sm" variant="secondary" onClick={exportCsv} disabled={!hasAnything}>
              <Download className="size-3.5" />
              Export
            </Button>
            <Link href="/umr">
              <Button size="sm" variant="ghost">
                <ArrowLeft className="size-3.5" />
                Today
              </Button>
            </Link>
          </div>
        }
      >
        <Segmented<UmrRangeKey>
          size="sm"
          value={range}
          onChange={setRange}
          options={UMR_RANGES.map((r) => ({ value: r.value, label: r.label, title: r.title }))}
          className="mr-1"
        />
      </PageHeader>

      <PageBody wide>
        {!ready ? (
          <div className="space-y-4">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-64 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : !hasAnything ? (
          <EmptyState
            icon={Hourglass}
            title="Nothing to weigh yet"
            description="Umr counts the time this app already knows about — timed sittings, minutes written on tasks, prayers, habits — plus whatever you log by hand. Record a little and this page fills itself."
            action={<Link href="/umr"><Button variant="primary" size="sm">Open Umr</Button></Link>}
          />
        ) : (
          <div className="flex flex-col gap-2">
            {/* ---- the window at a glance ---- */}
            <section aria-label="The window" className="surface p-4">
              <div className="flex items-baseline gap-2">
                <h2 className="text-[12.5px] font-medium text-ink">
                  {days[0]} → {days[days.length - 1]}
                </h2>
                <span className="flex-1" />
                <span className="text-[11.5px] text-ink-4 tnum">
                  {fmtMin(summary.unaccounted)} nothing recorded
                </span>
              </div>
              <CategoryBar
                totals={summary.totals}
                unassigned={summary.unassigned}
                capacity={days.length * MINUTES_IN_DAY}
                height={14}
                className="mt-3"
              />
              <CategoryLegend totals={summary.totals} unassigned={summary.unassigned} className="mt-3" />
            </section>

            <StatTiles tiles={tiles} />

            {/* ---- the page, in sentences ---- */}
            {insights.length > 0 && (
              <section aria-label="What the numbers say" className="py-1">
                <ul className="flex flex-col gap-2.5">
                  {insights.map((i) => (
                    <li key={i.id} className="flex items-start gap-2.5">
                      <span
                        aria-hidden
                        className={cn(
                          "mt-[7px] size-1.5 shrink-0 rounded-full",
                          i.tone === "warn" ? "bg-danger" : i.tone === "good" ? "bg-success" : "bg-ink-4",
                        )}
                      />
                      <p className="text-[13.5px] leading-[1.55] text-ink">{i.text}</p>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <div className="divide-y divide-line">
              <FlowPanel
                buckets={buckets}
                summary={summary}
                grain={grain}
                capacity={bucketCapacity}
              />

              <DamPanel rows={dam} discipline={discipline} prefs={prefs} />

              <CategoriesPanel
                summary={summary}
                previous={previous}
                entries={inWindow}
                streaks={streaks}
              />

              <RhythmPanel
                weekdays={weekdays}
                hours={hours.rows}
                placed={hours.placed}
                total={hours.total}
                hour12={hour12}
              />

              <BalancePanel summary={summary} streaks={streaks} />

              <SourcesPanel sources={sources} summary={summary} />
            </div>

            <p className="max-w-[76ch] pb-2 text-[11.5px] leading-relaxed text-ink-4">
              {ratioPhrase(prefs)}, settled {prefs.damWindow === "day" ? "each day" : "across the week"}.
              Every figure on this page is computed from your own records across these{" "}
              <span className="tnum">{days.length}</span> days —{" "}
              <span className="tnum">{fmtMin(sumTotals(summary.totals) + summary.unassigned)}</span> of
              recorded time in all. Nothing is estimated, smoothed or filled in for you.
            </p>
          </div>
        )}
      </PageBody>
    </>
  );
}
