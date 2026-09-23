"use client";

import * as React from "react";
import Link from "next/link";
import { BarChart3, ChevronLeft, ChevronRight, Hourglass, Settings2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import { addDays, formatDate, friendlyDate, startOfWeek, todayISO } from "@/lib/date";
import {
  MINUTES_IN_DAY, UMR_CATEGORIES, UMR_META, damBalance, ratioPhrase, sumTotals, totalsOf,
} from "@/lib/umr";
import { PageBody, PageHeader } from "@/components/shell/page-header";
import { Button, IconButton, Skeleton } from "@/components/ui/primitives";
import { CategoryBar, CategoryLegend } from "@/components/umr/category-bar";
import { DamMeter } from "@/components/umr/dam-meter";
import { QuickLog } from "@/components/umr/quick-log";
import { UmrTriage } from "@/components/umr/triage";
import { UmrEntryList } from "@/components/umr/entry-list";
import { useUmrLedger } from "@/components/umr/use-umr";
import { SessionEditor } from "@/components/focus/session-editor";
import { fmtMin, pct } from "@/components/umr/derive";

// =========================================================
// Umr — where the life is going, one day at a time.
//
// The day is the unit because the rule is: ten minutes of Taʼlim buys one
// minute of Dam, and a rule you cannot check today is a rule you will not
// keep. Everything longer than a day lives on the stats page.
// =========================================================

export default function UmrPage() {
  const ready = useStore((s) => s.ready);
  const hour12 = useStore((s) => s.hour12);
  const weekStart = useStore((s) => s.profile?.week_start ?? 1);

  const today = todayISO();
  const [date, setDate] = React.useState(today);
  // A runaway timer is noticed here, so it is corrected here — the same editor
  // the Focus page opens, hosted on whichever day you are reading.
  const [editingSession, setEditingSession] = React.useState<string | null>(null);

  // The window the Dam budget settles over — one day, or the week so far.
  const { prefs } = useUmrLedger(React.useMemo(() => [date], [date]));

  const budgetDays = React.useMemo(() => {
    if (prefs.damWindow === "day") return [date];
    const from = startOfWeek(date, weekStart);
    const out: string[] = [];
    for (let d = from; d <= date; d = addDays(d, 1)) out.push(d);
    return out;
  }, [prefs.damWindow, date, weekStart]);

  // One ledger covering both the day being read and the budget window, so the
  // page never builds two and never has to reconcile them.
  const span = React.useMemo(
    () => (budgetDays.includes(date) ? budgetDays : [...budgetDays, date]),
    [budgetDays, date],
  );
  const { entries } = useUmrLedger(span);

  const dayEntries = React.useMemo(() => entries.filter((e) => e.date === date), [entries, date]);
  const day = React.useMemo(() => totalsOf(dayEntries), [dayEntries]);

  const budgetTotals = React.useMemo(() => {
    const set = new Set(budgetDays);
    return totalsOf(entries.filter((e) => set.has(e.date))).totals;
  }, [entries, budgetDays]);

  const balance = damBalance(budgetTotals.talim, budgetTotals.dam, prefs);

  const accounted = sumTotals(day.totals) + day.unassigned;
  const unaccounted = Math.max(0, MINUTES_IN_DAY - accounted);
  const isToday = date === today;

  const subtitle = accounted > 0
    ? `${fmtMin(accounted)} of the day accounted for · ${pct(accounted / MINUTES_IN_DAY)}`
    : "Nothing recorded for this day yet";

  return (
    <>
      <PageHeader
        title="Umr"
        subtitle={subtitle}
        actions={
          <div className="flex items-center gap-1.5">
            <Link href="/umr/stats">
              <Button size="sm" variant="secondary">
                <BarChart3 className="size-3.5" />
                Stats
              </Button>
            </Link>
            <Link href="/settings?tab=umr">
              <IconButton label="Umr settings" size="sm">
                <Settings2 />
              </IconButton>
            </Link>
          </div>
        }
      >
        <div className="mr-1 flex items-center gap-0.5">
          <IconButton label="Previous day" size="sm" onClick={() => setDate(addDays(date, -1))}>
            <ChevronLeft />
          </IconButton>
          <button
            type="button"
            onClick={() => setDate(today)}
            title="Jump to today"
            className={cn(
              "h-7 rounded-md px-2 text-[12.5px] cursor-pointer transition-colors",
              isToday ? "text-ink-3" : "text-ink hover:bg-hover",
            )}
          >
            {friendlyDate(date)}
          </button>
          <IconButton
            label="Next day"
            size="sm"
            disabled={date >= today}
            onClick={() => setDate(addDays(date, 1))}
          >
            <ChevronRight />
          </IconButton>
        </div>
      </PageHeader>

      <PageBody>
        {!ready ? (
          <div className="space-y-3">
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* ---- the day, cut five ways ---- */}
            <section className="surface p-4" aria-label="The day">
              <div className="flex items-baseline gap-2">
                <h2 className="text-[12.5px] font-medium text-ink">
                  {formatDate(date, { weekday: true })}
                </h2>
                <span className="flex-1" />
                <span className="text-[11.5px] text-ink-4 tnum">
                  {fmtMin(unaccounted)} unaccounted
                </span>
              </div>

              {/* Against the whole 24 hours, not against what was recorded —
                  so the gap stays visible instead of being normalised away. */}
              <CategoryBar
                totals={day.totals}
                unassigned={day.unassigned}
                capacity={MINUTES_IN_DAY}
                height={14}
                className="mt-3"
              />

              <CategoryLegend totals={day.totals} unassigned={day.unassigned} className="mt-3" />

              <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-6">
                {UMR_CATEGORIES.map((c) => (
                  <div key={c} className="min-w-0">
                    <p className="truncate text-[11.5px] text-ink-3">{UMR_META[c].label}</p>
                    <p className="display-serif mt-1 text-[22px] leading-none text-ink tnum">
                      {fmtMin(day.totals[c])}
                    </p>
                    <p className="mt-1 truncate text-[11px] text-ink-4">{UMR_META[c].gloss}</p>
                  </div>
                ))}
              </div>
            </section>

            {/* ---- the rule ---- */}
            <div className="grid gap-4 md:grid-cols-2">
              <DamMeter balance={balance} prefs={prefs} />
              <QuickLog date={date} totals={budgetTotals} prefs={prefs} />
            </div>

            <UmrTriage entries={dayEntries} />

            {/* ---- what the day was made of ---- */}
            <section className="surface p-4" aria-label="Entries">
              <div className="flex items-baseline gap-2">
                <h2 className="text-[12.5px] font-medium text-ink">Where it went</h2>
                <p className="min-w-0 flex-1 truncate text-[11.5px] text-ink-4">
                  timed sittings, minutes written on tasks, prayers, habits and what you logged
                </p>
              </div>
              <UmrEntryList
                entries={dayEntries}
                hour12={hour12}
                onEditSession={setEditingSession}
                className="mt-2"
                emptyLabel="Nothing recorded on this day. Run a timer, or log it above."
              />
            </section>

            <p className="flex items-start gap-2 pb-2 text-[11.5px] leading-relaxed text-ink-4">
              <Hourglass className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              <span>
                {ratioPhrase(prefs)}, settled {prefs.damWindow === "day" ? "each day" : "across the week"}.
                Nothing here is estimated — a minute appears only because a timer measured it, a row
                records it, or you said so. Prayers are the one declared figure, at{" "}
                <span className="tnum">{prefs.prayerMinutes}</span> minutes each, which you can change
                in Settings.
              </span>
            </p>
          </div>
        )}
      </PageBody>

      <SessionEditor sessionId={editingSession} onClose={() => setEditingSession(null)} />
    </>
  );
}
