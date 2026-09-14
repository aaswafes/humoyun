"use client";

import * as React from "react";
import { Check, ChevronDown, MoonStar, Sun, Sunrise } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import { dayName, dayNumber, formatTime, monthName } from "@/lib/date";
import { prayerLabel } from "@/lib/prayer";
import { PRAYER_NAMES, type PrayerName, type PrayerStatus } from "@/lib/types";
import { IconButton, Progress } from "@/components/ui/primitives";
import { HANDLED_STATUSES, PRAYER_STATE, StateMark } from "./prayer-state";
import { Countdown, WindowCountdown, useWindowUrgent } from "./countdown";
import { LocationLine } from "./location-line";
import { PrayerPanel } from "./prayer-panel";
import { formatHijri, hijriFor, hijriNote } from "./hijri";
import {
  NAFL_BY_ID, allSunnahIds, rawatibFor, salahDataOf, toggleInList, withSalahData,
  type SunnahDef,
} from "./day-data";
import {
  duhaWindow, nextPrayer, openWindow, tahajjudRowMinute, type TimesTriple,
} from "./windows";

type Row =
  | { kind: "prayer"; key: string; min: number; name: PrayerName }
  | {
      kind: "marker";
      key: string;
      min: number;
      label: string;
      note: string;
      icon: React.ComponentType<{ className?: string }>;
    }
  | {
      kind: "nafl";
      key: string;
      min: number;
      def: SunnahDef;
      icon: React.ComponentType<{ className?: string }>;
    };

/**
 * The one thing the page is for: the five prayers, and how much of the open
 * window is left. It is the only bordered card on the surface and the only
 * place a 44px numeral appears — everything else steps down or folds away.
 */
export function TodayCard({
  date, t, nowMin, showSunnah, onToggleSunnah, hijriOffset,
}: {
  date: string;
  t: TimesTriple;
  nowMin: number;
  showSunnah: boolean;
  onToggleSunnah: () => void;
  hijriOffset: number;
}) {
  const prayers = useStore((s) => s.prayers);
  const dayLogs = useStore((s) => s.dayLogs);
  const cyclePrayer = useStore((s) => s.cyclePrayer);
  const setDayLog = useStore((s) => s.setDayLog);
  const hour12 = useStore((s) => s.hour12);
  const madhab = useStore((s) => s.profile?.madhab ?? "hanafi");

  const [expanded, setExpanded] = React.useState<PrayerName | null>(null);

  const statuses = React.useMemo(() => {
    const map = new Map<PrayerName, PrayerStatus>();
    prayers.forEach((p) => { if (p.date === date) map.set(p.name, p.status); });
    return map;
  }, [prayers, date]);

  const log = React.useMemo(() => dayLogs.find((d) => d.date === date), [dayLogs, date]);
  const data = React.useMemo(() => salahDataOf(log), [log]);
  const rawatib = React.useMemo(() => rawatibFor(madhab), [madhab]);

  const open = openWindow(t, nowMin);
  const next = nextPrayer(t, nowMin);
  const urgent = useWindowUrgent(open?.window.end ?? Number.POSITIVE_INFINITY, 20);

  // Sunrise, duha and the last third sit in the same timeline as the five, so
  // the day reads top to bottom in clock order instead of in a footnote.
  const rows = React.useMemo<Row[]>(() => {
    const list: Row[] = [
      ...PRAYER_NAMES.map((name) => ({ kind: "prayer" as const, key: name, name, min: t.today[name] })),
      { kind: "marker", key: "sunrise", min: t.today.sunrise, label: "Sunrise", note: "Fajr window closes", icon: Sunrise },
    ];
    const lastThird = tahajjudRowMinute(t);
    if (showSunnah) {
      list.push(
        { kind: "nafl", key: "duha", min: duhaWindow(t).start, def: NAFL_BY_ID["nafl:duha"], icon: Sun },
        { kind: "nafl", key: "witr", min: t.today.isha + 45, def: NAFL_BY_ID["nafl:witr"], icon: MoonStar },
        { kind: "nafl", key: "tahajjud", min: lastThird, def: NAFL_BY_ID["nafl:tahajjud"], icon: MoonStar },
      );
    } else {
      list.push({ kind: "marker", key: "lastThird", min: lastThird, label: "Last third", note: "Tahajjud", icon: MoonStar });
    }
    return list.sort((a, b) => a.min - b.min);
  }, [t, showSunnah]);

  const recorded = PRAYER_NAMES.filter((n) => HANDLED_STATUSES.includes(statuses.get(n) ?? "none")).length;
  const sunnahTotal = React.useMemo(() => allSunnahIds(madhab).length, [madhab]);

  const hijri = hijriFor(date, hijriOffset, nowMin >= t.today.maghrib);
  const note = hijriNote(hijri);

  function toggleNafl(id: string) {
    setDayLog(date, { data: withSalahData(log, { ...data, sunnah: toggleInList(data.sunnah, id) }) });
  }

  return (
    <section className="surface p-5">
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[13.5px] font-medium text-ink">
            Today{" "}
            <span className="font-normal text-ink-3">
              · {dayName(date)} <span className="tnum">{dayNumber(date)}</span> {monthName(date)}
            </span>
          </p>
          <p className="mt-1 text-[12px] text-ink-3">
            <span className="tnum">{formatHijri(hijri)}</span>
            {note && <span className="text-ink-2"> · {note}</span>}
          </p>
        </div>

        {/* The one hero on the surface: how much of the open window is left. */}
        <div className="shrink-0 text-right">
          <p className="text-[11.5px] text-ink-3">
            {open ? `Left in ${prayerLabel(open.name, date)}` : `${prayerLabel(next.name, date)} in`}
          </p>
          <p className="display-serif mt-1 text-[44px] leading-none text-ink">
            {open ? <WindowCountdown end={open.window.end} /> : <Countdown at={next.at % 1440} />}
          </p>
          {open?.dayOffset === -1 && (
            <p className="mt-1 text-[11.5px] text-ink-4">carried from last night</p>
          )}
        </div>
      </header>

      {open ? (
        <div className="mt-5">
          <Progress value={open.progress * 100} height={4} />
          <div className="mt-1.5 flex items-baseline justify-between gap-2 text-[11px]">
            <span className="tnum text-ink-4">{formatTime(open.window.start, hour12)}</span>
            {urgent && <span className="font-medium text-ink-2">Closing soon</span>}
            <span className="tnum text-ink-4">{formatTime(open.window.end, hour12)}</span>
          </div>
        </div>
      ) : (
        <p className="mt-4 text-[12px] leading-relaxed text-ink-3">
          Nothing is open between sunrise and Dhuhr. That stretch belongs to duha, if you want one.
        </p>
      )}

      <div className="mt-6 flex items-center justify-between gap-3">
        <p className="text-[12px] text-ink-3">
          <span className="tnum">{recorded}</span> of <span className="tnum">5</span> recorded
        </p>
        <button
          type="button"
          aria-pressed={showSunnah}
          onClick={onToggleSunnah}
          className={cn(
            "h-7 cursor-pointer rounded-full border px-2.5 text-[11.5px] font-medium",
            "transition-[background-color,border-color,color] duration-150 ease-[var(--ease-out-apple)]",
            showSunnah
              ? "border-transparent bg-selected text-ink"
              : "border-line text-ink-3 hover:border-line-strong hover:text-ink-2",
          )}
        >
          Sunnah &amp; nafl
          {showSunnah && (
            <span className="tnum ml-1.5 text-ink-3">
              {data.sunnah.length}/{sunnahTotal}
            </span>
          )}
        </button>
      </div>

      <ul className="-mx-2.5 mt-1.5">
        {rows.map((row) => {
          if (row.kind === "marker") {
            const Icon = row.icon;
            return (
              <li key={row.key} className="flex items-center gap-3 rounded-lg px-2.5 py-1.5">
                <span className="grid size-[22px] shrink-0 place-items-center text-ink-4">
                  <Icon className="size-3.5" />
                </span>
                <span className="min-w-0 flex-1 truncate text-[12px] text-ink-3">
                  {row.label}
                  <span className="text-ink-4"> · {row.note}</span>
                </span>
                <span className="tnum shrink-0 text-[12px] text-ink-4">{formatTime(row.min, hour12)}</span>
              </li>
            );
          }

          if (row.kind === "nafl") {
            const Icon = row.icon;
            const ticked = data.sunnah.includes(row.def.id);
            return (
              <li key={row.key}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={ticked}
                  onClick={() => toggleNafl(row.def.id)}
                  className={cn(
                    "flex w-full cursor-pointer items-center gap-3 rounded-lg px-2.5 py-1.5 text-left",
                    "transition-[background-color,transform] duration-150 ease-[var(--ease-out-apple)]",
                    "hover:bg-hover active:scale-[0.99]",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "grid size-[22px] shrink-0 place-items-center rounded-full border border-dashed",
                      "transition-[background-color,border-color,color] duration-150",
                      ticked
                        ? "border-solid border-transparent bg-accent-soft text-accent"
                        : "border-line-strong text-ink-4",
                    )}
                  >
                    {ticked ? <Check className="size-3 stroke-[2.75]" /> : <Icon className="size-3" />}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[12px]">
                    <span className={ticked ? "text-ink-2" : "text-ink-3"}>{row.def.label}</span>
                    <span className="text-ink-4"> · {row.def.rakat} · {row.def.detail}</span>
                  </span>
                  <span className="tnum shrink-0 text-[12px] text-ink-4">{formatTime(row.min, hour12)}</span>
                </button>
              </li>
            );
          }

          const status = statuses.get(row.name) ?? "none";
          const state = PRAYER_STATE[status];
          const isNow = open?.name === row.name && open.dayOffset === 0;
          const isOpen = expanded === row.name;
          const panelId = `salah-panel-${row.name}`;
          const adhkarDone = (data.adhkar[row.name] ?? []).length;
          const slots = [rawatib[row.name].before, rawatib[row.name].after].filter(Boolean) as SunnahDef[];
          const slotsDone = slots.filter((s) => data.sunnah.includes(s.id)).length;

          return (
            <li key={row.key}>
              {/* The open window is marked once — a tinted row and the word Now.
                  The closing time lives under the progress bar, not here too. */}
              <div className={cn("flex items-center gap-0.5 rounded-lg", isNow && "bg-selected")}>
                <button
                  type="button"
                  onClick={() => cyclePrayer(date, row.name)}
                  aria-label={`${prayerLabel(row.name, date)} at ${formatTime(row.min, hour12)}, ${state.label}. Activate to cycle the status.`}
                  className={cn(
                    "flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 text-left",
                    "transition-[background-color,transform] duration-200 ease-[var(--ease-out-apple)] active:scale-[0.985]",
                    !isNow && "hover:bg-hover",
                  )}
                >
                  <StateMark status={status} />

                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="text-[13.5px] font-medium text-ink">{prayerLabel(row.name, date)}</span>
                      {isNow && (
                        <span className="rounded-full bg-accent-soft px-1.5 text-[10.5px] font-semibold uppercase leading-[15px] tracking-[0.06em] text-accent">
                          Now
                        </span>
                      )}
                    </span>
                    <span className={cn("mt-px block truncate text-[11.5px]", state.text)}>
                      {state.label}
                      {adhkarDone > 0 && (
                        <span className="text-ink-4">
                          {" · "}
                          <span className="tnum">{adhkarDone}</span> adhkar
                        </span>
                      )}
                      {showSunnah && slots.length > 0 && (
                        <span className="text-ink-4">
                          {" · sunnah "}
                          <span className="tnum">{slotsDone}/{slots.length}</span>
                        </span>
                      )}
                    </span>
                  </span>

                  <span className={cn("tnum shrink-0 text-[13.5px]", isNow ? "font-medium text-ink" : "text-ink-2")}>
                    {formatTime(row.min, hour12)}
                  </span>
                </button>

                <IconButton
                  size="md"
                  label={`${prayerLabel(row.name, date)} details`}
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  onClick={() => setExpanded(isOpen ? null : row.name)}
                >
                  <ChevronDown
                    className={cn(
                      "transition-transform duration-200 ease-[var(--ease-out-apple)]",
                      isOpen && "rotate-180",
                    )}
                  />
                </IconButton>
              </div>

              {isOpen && (
                <PrayerPanel
                  id={panelId}
                  date={date}
                  name={row.name}
                  status={status}
                  showSunnah={showSunnah}
                  madhab={madhab}
                />
              )}
            </li>
          );
        })}
      </ul>

      <p className="mt-3 text-[11.5px] leading-relaxed text-ink-4">
        Tap a prayer to cycle it: not marked, prayed, jamaah, qadha. Open a row for late,
        missed, the rawatib around it and the adhkar after it.
      </p>

      <div className="hairline-t mt-4 pt-3">
        <LocationLine />
      </div>
    </section>
  );
}
