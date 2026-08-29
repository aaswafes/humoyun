"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import {
  addDays, addMonths, daysBetween, dayNameOf, dayNumber, endOfMonth, formatDate,
  monthName, startOfMonth, weekday, weekDates, yearOf,
} from "@/lib/date";
import { PRAYER_LABELS, PRAYER_NAMES, type PrayerName, type PrayerStatus } from "@/lib/types";
import { Button, IconButton, Segmented } from "@/components/ui/primitives";
import { MiniEmpty, VisuallyHidden } from "@/components/ui/form";
import {
  CompositionBar, CompositionLegend, PRAYER_STATE, StateMark,
} from "./prayer-state";
import {
  COMPOSITION, countsFor, countsTotal, dailyHandled, handledOf,
  perPrayerCounts, statusAt, statusIndex,
} from "./salah-stats";

type Range = "week" | "month";

/**
 * The shape of a stretch of days: how much was jamaah, how much was alone,
 * how much was made up afterwards. No target, no grade — just the pattern.
 * Borderless: the fold above it is the only frame it needs.
 */
export function PatternView({ today }: { today: string }) {
  const prayers = useStore((s) => s.prayers);
  const cyclePrayer = useStore((s) => s.cyclePrayer);
  const weekStart = useStore((s) => s.profile?.week_start ?? 1);

  const [range, setRange] = React.useState<Range>("week");
  const [offset, setOffset] = React.useState(0);
  const [picked, setPicked] = React.useState<string | null>(null);

  const dates = React.useMemo(() => {
    if (range === "week") return weekDates(addDays(today, offset * 7), weekStart);
    const month = startOfMonth(addMonths(today, offset));
    return daysBetween(month, endOfMonth(month));
  }, [range, offset, today, weekStart]);

  const label = React.useMemo(() => {
    if (range === "week") {
      const start = dates[0];
      const end = dates[dates.length - 1];
      return `${formatDate(start, { weekday: false })} – ${formatDate(end, { weekday: false })}`;
    }
    return `${monthName(dates[0])} ${yearOf(dates[0])}`;
  }, [range, dates]);

  const index = React.useMemo(() => statusIndex(prayers), [prayers]);
  const elapsed = React.useMemo(() => dates.filter((d) => d <= today), [dates, today]);
  const counts = React.useMemo(() => countsFor(index, elapsed), [index, elapsed]);
  const per = React.useMemo(() => perPrayerCounts(index, elapsed), [index, elapsed]);
  const daily = React.useMemo(() => dailyHandled(index, dates), [index, dates]);

  // Selection is derived, so moving the range never leaves a stale day behind.
  const selected = picked && dates.includes(picked) ? picked : null;

  const total = countsTotal(counts);
  const handled = handledOf(counts);
  const rate = total ? Math.round((handled / total) * 100) : 0;
  const summaryId = "salah-pattern-summary";

  return (
    <div>
      <header className="flex flex-wrap items-center gap-2">
        <p className="flex-1 text-[12.5px] text-ink-3">{label}</p>
        <Segmented
          size="sm"
          value={range}
          onChange={(v) => { setRange(v); setOffset(0); }}
          options={[{ value: "week", label: "Week" }, { value: "month", label: "Month" }]}
        />
        <div className="flex items-center gap-0.5">
          <IconButton label={range === "week" ? "Previous week" : "Previous month"} onClick={() => setOffset(offset - 1)}>
            <ChevronLeft />
          </IconButton>
          <IconButton
            label={range === "week" ? "Next week" : "Next month"}
            disabled={offset >= 0}
            onClick={() => setOffset(offset + 1)}
          >
            <ChevronRight />
          </IconButton>
        </div>
        {offset !== 0 && (
          <Button size="sm" variant="ghost" onClick={() => setOffset(0)}>
            {range === "week" ? "This week" : "This month"}
          </Button>
        )}
      </header>

      {elapsed.length === 0 ? (
        <MiniEmpty className="py-8">Nothing has happened in this stretch yet.</MiniEmpty>
      ) : (
        <>
          <div className="mt-4 flex items-end gap-4">
            <div>
              <p className="display-serif tnum text-[32px] leading-none text-ink">{rate}%</p>
              <p className="mt-2 text-[12px] text-ink-3">recorded</p>
            </div>
            <p className="flex-1 pb-1 text-[11.5px] leading-relaxed text-ink-3">
              <span className="tnum">{handled}</span> of <span className="tnum">{total}</span> prayers across{" "}
              <span className="tnum">{elapsed.length}</span> {elapsed.length === 1 ? "day" : "days"}.
            </p>
          </div>

          <CompositionBar className="mt-3" counts={counts} order={COMPOSITION} height={10} />
          <CompositionLegend className="mt-2.5" counts={counts} order={COMPOSITION} />

          <VisuallyHidden id={summaryId}>
            {label}: {COMPOSITION.map((k) => `${counts[k]} ${PRAYER_STATE[k].label}`).join(", ")}.
          </VisuallyHidden>

          {/* Day by day — the height is what was recorded, the darker foot is jamaah. */}
          <div className="hairline-t mt-6 pt-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">Day by day</p>
            <div
              role="group"
              aria-label="Prayers recorded each day"
              aria-describedby={summaryId}
              className="mt-2.5 flex items-end gap-[3px]"
            >
              {daily.map((day) => {
                const future = day.date > today;
                const other = day.handled - day.jamaah;
                const isSelected = day.date === selected;
                return (
                  <button
                    key={day.date}
                    type="button"
                    aria-pressed={isSelected}
                    aria-label={`${formatDate(day.date)} — ${day.handled} of 5 recorded, ${day.jamaah} in jamaah`}
                    onClick={() => setPicked(isSelected ? null : day.date)}
                    className={cn(
                      "flex h-12 flex-1 cursor-pointer flex-col justify-end overflow-hidden rounded-[3px] bg-hover",
                      "transition-[box-shadow,opacity] duration-150 ease-[var(--ease-out-apple)]",
                      future && "opacity-40",
                      isSelected && "ring-2 ring-accent-line",
                    )}
                  >
                    <span className="w-full bg-accent" style={{ height: `${(other / 5) * 100}%` }} />
                    <span className="w-full bg-success" style={{ height: `${(day.jamaah / 5) * 100}%` }} />
                  </button>
                );
              })}
            </div>
            <div className="mt-1 flex gap-[3px]">
              {daily.map((day, i) => (
                <span
                  key={day.date}
                  className={cn(
                    "tnum flex-1 text-center text-[10.5px]",
                    day.date === today ? "font-semibold text-ink-2" : "text-ink-4",
                  )}
                >
                  {range === "week"
                    ? dayNameOf(weekday(day.date), "min")
                    : i % 5 === 0 || day.date === today
                      ? dayNumber(day.date)
                      : ""}
                </span>
              ))}
            </div>
          </div>

          {selected && <DayDetail date={selected} index={index} onCycle={cyclePrayer} />}

          {/* Per prayer — the row that shows which one carries the qadha. */}
          <div className="hairline-t mt-6 pt-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">By prayer</p>
            <ul className="mt-2.5 space-y-2.5">
              {PRAYER_NAMES.map((name) => {
                const c = per[name];
                const t = countsTotal(c);
                return (
                  <li key={name} className="grid grid-cols-[68px_minmax(0,1fr)] items-center gap-3">
                    <span className="text-[12.5px] font-medium text-ink-2">{PRAYER_LABELS[name]}</span>
                    <span>
                      <CompositionBar counts={c} order={COMPOSITION} height={8} />
                      <span className="mt-1 block text-[11px] text-ink-4">
                        <span className="tnum text-ink-3">{c.jamaah}</span> jamaah ·{" "}
                        <span className="tnum text-ink-3">{c.prayed + c.late}</span> alone ·{" "}
                        <span className="tnum text-ink-3">{c.qadha}</span> qadha ·{" "}
                        <span className="tnum text-ink-3">{t - handledOf(c)}</span> not recorded
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

/** A day pulled out of the strip, still editable — backfilling is the point. */
function DayDetail({
  date, index, onCycle,
}: {
  date: string;
  index: Map<string, PrayerStatus>;
  onCycle: (date: string, name: PrayerName) => void;
}) {
  return (
    <div className="anim-fade mt-3 rounded-lg bg-sunken p-3">
      <p className="text-[12px] font-medium text-ink-2">{formatDate(date, { year: true })}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {PRAYER_NAMES.map((name) => {
          const status = statusAt(index, date, name);
          return (
            <button
              key={name}
              type="button"
              onClick={() => onCycle(date, name)}
              aria-label={`${PRAYER_LABELS[name]} on ${formatDate(date)}, ${PRAYER_STATE[status].label}. Activate to cycle.`}
              className={cn(
                "inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-full border border-line px-2 text-[11.5px]",
                "transition-[background-color,border-color,transform] duration-150 ease-[var(--ease-out-apple)]",
                "hover:border-line-strong active:scale-[0.97]",
              )}
            >
              <StateMark status={status} size={16} />
              <span className="text-ink-2">{PRAYER_LABELS[name]}</span>
              <span className={PRAYER_STATE[status].text}>{PRAYER_STATE[status].label}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-[11px] text-ink-4">Tap to cycle. Qadha counts as handled.</p>
    </div>
  );
}
