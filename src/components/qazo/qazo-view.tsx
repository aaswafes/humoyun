"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight, Minus, Plus } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import {
  addDays, addMonths, dayNumber, diffDays, endOfMonth, formatDate, monthName,
  startOfMonth, yearOf,
} from "@/lib/date";
import { Button, IconButton, Progress } from "@/components/ui/primitives";
import { StateDot } from "@/components/salah/prayer-state";
import { PageTour } from "@/components/tour/tour";
import { SALAH_QAZO_TOUR } from "@/components/tour/tours/salah";
import { QazoSetup } from "./qazo-setup";
import {
  QAZO_LABELS, qazoOf, spanLabel, summarize, useQazoConfig, withQazo,
  type QazoConfig, type QazoCounts, type QazoPrayer, type QazoSummary,
} from "./qazo-data";

const RAIL = "grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[minmax(0,1fr)_296px] lg:gap-8";

const n = (v: number) => v.toLocaleString();
const longDate = (iso: string) => formatDate(iso, { weekday: false, year: true });

/** The Qazo tab: the lifetime debt, today's payments, and where you've got to. */
export function QazoView({ today }: { today: string }) {
  const [config, setConfig] = useQazoConfig();
  const [editing, setEditing] = React.useState(false);

  if (!config || editing) {
    return (
      <>
        <PageTour id="salah.qazo" steps={SALAH_QAZO_TOUR} />
        <QazoSetup
          today={today}
          initial={config}
          onSave={(next) => { setConfig(next); setEditing(false); }}
          onCancel={config ? () => setEditing(false) : undefined}
        />
      </>
    );
  }
  return <QazoBoard today={today} config={config} setConfig={setConfig} onEdit={() => setEditing(true)} />;
}

function QazoBoard({
  today, config, setConfig, onEdit,
}: {
  today: string;
  config: QazoConfig;
  setConfig: (c: QazoConfig) => void;
  onEdit: () => void;
}) {
  const dayLogs = useStore((s) => s.dayLogs);
  const setDayLog = useStore((s) => s.setDayLog);
  const s = React.useMemo(() => summarize(config, dayLogs, today), [config, dayLogs, today]);

  // Every tap lands on today's log, so the day's total, the pace and the
  // streak all come from the same place.
  function bump(changes: Partial<Record<QazoPrayer, number>>) {
    const log = dayLogs.find((d) => d.date === today);
    const current = qazoOf(log);
    const next: QazoCounts = { ...current };
    for (const [p, delta] of Object.entries(changes) as [QazoPrayer, number][]) {
      next[p] = Math.max(0, (current[p] ?? 0) + delta);
    }
    setDayLog(today, { data: withQazo(log, next) });
  }

  // A dot in the grid is the same as + and −. An empty dot fills that prayer
  // up to and including it, counted as made up today. A filled dot empties
  // back to it, taking from today's count first and the rest from the
  // prayer's correction, so earlier days' records are never rewritten.
  function setDot(p: QazoPrayer, idx: number) {
    const done = s.done[p];
    if (idx >= done) {
      bump({ [p]: idx + 1 - done });
      return;
    }
    const back = done - idx;
    const fromToday = Math.min(back, s.today[p] ?? 0);
    if (fromToday) bump({ [p]: -fromToday });
    if (back > fromToday) {
      setConfig({ ...config, adjust: { ...config.adjust, [p]: (config.adjust[p] ?? 0) - (back - fromToday) } });
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <PageTour id="salah.qazo" steps={SALAH_QAZO_TOUR} />
      <div className={RAIL}>
        <div className="flex flex-col gap-6">
          <Headline s={s} config={config} onEdit={onEdit} />
          <TodayPanel s={s} onBump={bump} />
        </div>
        <QazoGrid s={s} config={config} onDot={setDot} />
      </div>
      <div data-tour="salah.qazo.stats" className="hairline-t pt-6">
        <QazoStats s={s} today={today} />
      </div>
    </div>
  );
}

function Headline({ s, config, onEdit }: { s: QazoSummary; config: QazoConfig; onEdit: () => void }) {
  const pct = s.owedTotal ? (s.doneTotal / s.owedTotal) * 100 : 100;
  return (
    <section data-tour="salah.qazo.total" className="surface p-5">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[12px] text-ink-3">Qazo left</p>
          <p className="display-serif tnum mt-1.5 text-[44px] leading-none text-ink">{n(s.remaining)}</p>
          <p className="tnum mt-2 text-[12.5px] text-ink-3">
            of {n(s.owedTotal)} · {n(s.doneTotal)} made up ({pct < 10 ? pct.toFixed(1) : Math.round(pct)}%)
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={onEdit}>
          Edit dates
        </Button>
      </div>
      <Progress className="mt-4" value={s.doneTotal} max={Math.max(1, s.owedTotal)} height={6} />
      <p className="mt-4 text-[13px] leading-relaxed text-ink-2">
        {s.frontier ? (
          s.frontier.through ? (
            <>
              You&rsquo;re up to <b className="font-semibold text-ink">{longDate(s.frontier.through)}</b>
              {s.wholeDays ? <> — every prayer is made up for the first {n(s.wholeDays)} days.</> : "."}
            </>
          ) : (
            <>
              Starting from <b className="font-semibold text-ink">{longDate(s.frontier.next)}</b>, the first day owed.
            </>
          )
        ) : s.owedDays ? (
          <>All of it is made up. Alhamdulillah.</>
        ) : (
          <>Nothing is owed between these dates.</>
        )}
      </p>
      <p className="mt-1 text-[12px] text-ink-4">
        Fard since {longDate(config.farz)}, regular since {longDate(config.regular)} ({spanLabel(s.owedDays)}).
      </p>
    </section>
  );
}

function TodayPanel({ s, onBump }: { s: QazoSummary; onBump: (c: Partial<Record<QazoPrayer, number>>) => void }) {
  const todayTotal = Object.values(s.today).reduce((a, v) => a + (v ?? 0), 0);
  const open = s.prayers.filter((p) => s.done[p] < s.owedDays);

  return (
    <section data-tour="salah.qazo.today" className="surface p-5">
      <header className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-[14px] font-semibold text-ink">Made up today</h2>
          <p className="tnum text-[12px] text-ink-3">{todayTotal} {todayTotal === 1 ? "prayer" : "prayers"}</p>
        </div>
        <Button
          variant="primary"
          size="sm"
          disabled={!open.length}
          onClick={() => onBump(Object.fromEntries(open.map((p) => [p, 1])))}
        >
          <Plus className="size-3.5" aria-hidden /> One whole day
        </Button>
      </header>

      <ul className="mt-4 flex flex-col">
        {s.prayers.map((p) => {
          const left = s.owedDays - s.done[p];
          const mine = s.today[p] ?? 0;
          return (
            <li key={p} className="hairline-t flex items-center gap-3 py-2.5 first:border-t-0">
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-medium text-ink">{QAZO_LABELS[p]}</p>
                <p className="tnum text-[11.5px] text-ink-4">
                  {left > 0
                    ? `${n(left)} left · next ${formatDate(s.nextFor[p] as string, { weekday: false, year: true })}`
                    : "all made up"}
                </p>
              </div>
              <IconButton label={`Undo one ${QAZO_LABELS[p]}`} disabled={!mine} onClick={() => onBump({ [p]: -1 })}>
                <Minus />
              </IconButton>
              <span className="tnum w-6 text-center text-[15px] font-semibold text-ink">{mine}</span>
              <IconButton label={`Made up one ${QAZO_LABELS[p]}`} disabled={left <= 0} onClick={() => onBump({ [p]: 1 })}>
                <Plus />
              </IconButton>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-[11.5px] leading-relaxed text-ink-4">
        Tap + after each qazo you pray, or “One whole day” after all of a day&rsquo;s prayers.
      </p>
    </section>
  );
}

/**
 * The owed days as rows, one dot per prayer — the same grid as the Today
 * tab. A diamond is made up, a hollow dot is still owed, and tapping a dot is
 * the same as + or −. It opens on the month of the next day to make up, so
 * coming back never means paging through the years again.
 */
function QazoGrid({
  s, config, onDot,
}: {
  s: QazoSummary;
  config: QazoConfig;
  onDot: (p: QazoPrayer, idx: number) => void;
}) {
  const lastOwed = addDays(config.regular, -1);
  // The month where the furthest-behind prayer still has an empty dot.
  const anchor = s.frontier?.next ?? (s.owedDays ? lastOwed : config.farz);
  const anchorMonth = startOfMonth(anchor);
  const [month, setMonth] = React.useState(anchorMonth);

  // When the pointer crosses into a new month, follow it there.
  const [followed, setFollowed] = React.useState(anchorMonth);
  if (followed !== anchorMonth) {
    setFollowed(anchorMonth);
    setMonth(anchorMonth);
  }

  // Only the owed part of the month: the first and last months are partial.
  const days = React.useMemo(() => {
    const out: string[] = [];
    const from = month < config.farz ? config.farz : month;
    const end = endOfMonth(month) > lastOwed ? lastOwed : endOfMonth(month);
    for (let d = from; d <= end; d = addDays(d, 1)) out.push(d);
    return out;
  }, [month, config.farz, lastOwed]);

  const firstMonth = startOfMonth(config.farz);
  const lastMonth = startOfMonth(s.owedDays ? lastOwed : config.farz);
  const columns = { gridTemplateColumns: `24px repeat(${s.prayers.length}, minmax(0, 1fr))` };
  const madeHere = days.reduce((sum, d) => {
    const idx = diffDays(d, config.farz);
    return sum + s.prayers.filter((p) => idx < s.done[p]).length;
  }, 0);

  return (
    <div data-tour="salah.qazo.month">
      <header className="flex items-center gap-1">
        <p className="flex-1 text-[12.5px] font-medium text-ink-2">
          {monthName(month)} <span className="tnum text-ink-3">{yearOf(month)}</span>
        </p>
        {month !== anchorMonth && (
          <Button size="sm" variant="ghost" onClick={() => setMonth(anchorMonth)}>
            Where I am
          </Button>
        )}
        <IconButton label="Previous month" disabled={month <= firstMonth} onClick={() => setMonth(addMonths(month, -1))}>
          <ChevronLeft />
        </IconButton>
        <IconButton label="Next month" disabled={month >= lastMonth} onClick={() => setMonth(addMonths(month, 1))}>
          <ChevronRight />
        </IconButton>
      </header>

      <p className="tnum mt-1 text-[11.5px] text-ink-3">
        {madeHere} of {days.length * s.prayers.length} made up this month
      </p>

      <div className="mt-3">
        <div className="grid pb-1.5" style={columns}>
          <span />
          {s.prayers.map((p) => (
            <span key={p} title={QAZO_LABELS[p]} className="text-center text-[10.5px] font-medium text-ink-4">
              {QAZO_LABELS[p].charAt(0)}
            </span>
          ))}
        </div>

        {days.map((day) => {
          const idx = diffDays(day, config.farz);
          const isNext = day === s.frontier?.next;
          return (
            <div key={day} className={cn("grid items-center rounded-md", isNext && "bg-selected")} style={columns}>
              <span className={cn("tnum text-center text-[10.5px]", isNext ? "font-semibold text-ink" : "text-ink-4")}>
                {dayNumber(day)}
              </span>
              {s.prayers.map((p) => {
                const made = idx < s.done[p];
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => onDot(p, idx)}
                    title={`${QAZO_LABELS[p]} · ${formatDate(day, { year: true })} · ${made ? "made up" : "owed"}`}
                    aria-label={`${QAZO_LABELS[p]} on ${formatDate(day, { year: true })}, ${made ? "made up" : "still owed"}`}
                    aria-pressed={made}
                    className={cn(
                      "grid h-7 cursor-pointer place-items-center rounded-md touch:h-10",
                      "transition-[background-color,transform] duration-150 ease-[var(--ease-out-apple)]",
                      "hover:bg-hover active:scale-90",
                    )}
                  >
                    {idx === s.done[p] ? (
                      // Each prayer's next one to make up, so the column you are
                      // working through is plain at a glance.
                      <span aria-hidden className="block size-[9px] rounded-full border-[1.5px] border-accent" />
                    ) : (
                      <StateDot status={made ? "qadha" : "none"} />
                    )}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-[11.5px] leading-relaxed text-ink-4">
        Diamonds are made up; the blue ring in each column is that prayer&rsquo;s next one. Tap a dot to mark it
        made up — the same as +. Tap a filled one to take it back.
      </p>
    </div>
  );
}

function QazoStats({ s, today }: { s: QazoSummary; today: string }) {
  const last30Days = React.useMemo(
    () => Array.from({ length: 30 }, (_, i) => addDays(today, i - 29)),
    [today],
  );
  const peak = Math.max(1, ...last30Days.map((d) => s.byDate.get(d) ?? 0));

  const tiles = [
    { label: "Last 30 days", value: n(s.last30), sub: `${s.pace >= 10 ? Math.round(s.pace) : s.pace.toFixed(1)} a day` },
    { label: "In a row", value: String(s.streak), sub: s.streak === 1 ? "day" : "days with qazo" },
    {
      label: "Done by",
      value: s.eta ? yearOf(s.eta).toString() : s.remaining ? "—" : "✓",
      sub: s.eta ? `about ${formatDate(s.eta, { weekday: false, year: true })}` : s.remaining ? "keep a pace to see" : "all paid",
    },
    {
      label: "Best day",
      value: s.bestDay ? n(s.bestDay.count) : "—",
      sub: s.bestDay ? formatDate(s.bestDay.date, { weekday: false, year: true }) : "nothing yet",
    },
  ];

  return (
    <div className="flex flex-col gap-8">
      <section aria-label="Qazo at a glance" className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="min-w-0">
            <p className="text-[11.5px] text-ink-3">{t.label}</p>
            <p className="display-serif tnum mt-1.5 text-[32px] leading-none text-ink">{t.value}</p>
            <p className="tnum mt-1.5 truncate text-[11.5px] text-ink-4">{t.sub}</p>
          </div>
        ))}
      </section>

      <section className="hairline-t pt-5">
        <h2 className="text-[13px] font-medium text-ink">The last 30 days</h2>
        <div
          role="img"
          aria-label={`${s.last30} qazo prayers made up in the last 30 days`}
          className="mt-4 flex h-24 items-end gap-[3px]"
        >
          {last30Days.map((d) => {
            const v = s.byDate.get(d) ?? 0;
            return (
              <div
                key={d}
                title={`${formatDate(d)}: ${v}`}
                className={cn("flex-1 rounded-sm", v ? "bg-accent" : "bg-hover")}
                style={{ height: v ? `${Math.max(6, (v / peak) * 100)}%` : 3 }}
              />
            );
          })}
        </div>
      </section>

      <section className="hairline-t pt-5">
        <h2 className="text-[13px] font-medium text-ink">Prayer by prayer</h2>
        <ul className="mt-3 grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
          {s.prayers.map((p) => (
            <li key={p}>
              <div className="flex items-baseline justify-between text-[12.5px]">
                <span className="font-medium text-ink-2">{QAZO_LABELS[p]}</span>
                <span className="tnum text-ink-3">
                  {n(s.done[p])} / {n(s.owedDays)}
                </span>
              </div>
              <Progress className="mt-1.5" value={s.done[p]} max={Math.max(1, s.owedDays)} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
