"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight, ClipboardCopy, FileText } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import {
  addMonths, dayNameOf, dayNumber, daysBetween, endOfMonth, formatTime,
  monthName, startOfMonth, weekday, yearOf,
} from "@/lib/date";
import { CALC_METHODS, prayerTimesFor } from "@/lib/prayer";
import { Button, IconButton } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/overlays";
import { formatHijri, hijriFor } from "./hijri";

const COLUMNS = ["Fajr", "Sunrise", "Dhuhr", "Asr", "Maghrib", "Isha"] as const;

interface DayRow {
  date: string;
  hijri: string;
  friday: boolean;
  values: number[];
}

/** Pads every cell to the widest in its column, so the export lines up. */
function toTable(header: string[], rows: string[][]): string {
  const widths = header.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length)),
  );
  const line = (cells: string[]) =>
    cells.map((c, i) => (i === cells.length - 1 ? c : c.padEnd(widths[i] + 2))).join("").trimEnd();
  return [line(header), ...rows.map(line)].join("\n");
}

/**
 * A month of times you can read at a glance, print, or paste into a message
 * for whoever asked when Fajr is.
 */
export function TimesCalendar({ today, hijriOffset }: { today: string; hijriOffset: number }) {
  const profile = useStore((s) => s.profile);
  const hour12 = useStore((s) => s.hour12);
  const toast = useStore((s) => s.toast);

  const [month, setMonth] = React.useState(() => startOfMonth(today));
  const [exporting, setExporting] = React.useState(false);

  const config = React.useMemo(
    () => ({
      latitude: profile?.latitude ?? 0,
      longitude: profile?.longitude ?? 0,
      method: profile?.calc_method ?? "MuslimWorldLeague",
      madhab: profile?.madhab ?? "hanafi",
    }),
    [profile?.latitude, profile?.longitude, profile?.calc_method, profile?.madhab],
  );

  const rows = React.useMemo<DayRow[]>(() => {
    return daysBetween(month, endOfMonth(month)).map((date) => {
      const t = prayerTimesFor(date, config);
      return {
        date,
        hijri: formatHijri(hijriFor(date, hijriOffset), { short: true, year: false }),
        friday: weekday(date) === 5,
        values: [t.fajr, t.sunrise, t.dhuhr, t.asr, t.maghrib, t.isha],
      };
    });
  }, [month, config, hijriOffset]);

  const methodLabel = CALC_METHODS.find((m) => m.id === config.method)?.label ?? config.method;
  const isCurrentMonth = month === startOfMonth(today);

  const text = React.useMemo(() => {
    const head = [
      `Prayer times — ${profile?.city ?? "your location"}`,
      `${monthName(month)} ${yearOf(month)}`,
      `${methodLabel} · ${config.madhab === "hanafi" ? "Hanafi" : "Shafi'i"} asr`,
      `${config.latitude.toFixed(4)}, ${config.longitude.toFixed(4)}`,
      "",
    ].join("\n");
    const header = ["Date", "Hijri", ...COLUMNS];
    const body = rows.map((row) => [
      `${dayNameOf(weekday(row.date), "short")} ${String(dayNumber(row.date)).padStart(2, " ")}`,
      row.hijri,
      ...row.values.map((v) => formatTime(v, hour12)),
    ]);
    return `${head}${toTable(header, body)}\n`;
  }, [rows, month, profile?.city, methodLabel, config, hour12]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: "Copied", description: `${monthName(month)} prayer times are on your clipboard.`, tone: "success" });
    } catch {
      // Clipboard access can be blocked outright; the textarea is still there.
      toast({ title: "Select the text and copy it", description: "Your browser blocked the clipboard.", tone: "danger" });
    }
  }

  return (
    <section className="surface p-4">
      <header className="flex flex-wrap items-center gap-2">
        <h2 className="flex-1 text-[13px] font-semibold text-ink">
          {monthName(month)} <span className="tnum text-ink-3">{yearOf(month)}</span>
        </h2>
        {!isCurrentMonth && (
          <Button size="sm" variant="ghost" onClick={() => setMonth(startOfMonth(today))}>
            This month
          </Button>
        )}
        <IconButton label="Previous month" onClick={() => setMonth(addMonths(month, -1))}>
          <ChevronLeft />
        </IconButton>
        <IconButton label="Next month" onClick={() => setMonth(addMonths(month, 1))}>
          <ChevronRight />
        </IconButton>
        <Button size="sm" onClick={() => setExporting(true)}>
          <FileText className="size-3.5" />
          Export
        </Button>
      </header>

      <p className="mt-1 text-[11.5px] text-ink-3">
        {methodLabel} · {config.madhab === "hanafi" ? "Hanafi" : "Shafi'i"} asr · calculated on this device
      </p>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse text-[12px]">
          <thead>
            <tr className="hairline-b">
              <th scope="col" className="py-1.5 pr-2 text-left text-[10.5px] font-semibold uppercase tracking-[0.06em] text-ink-3">
                Day
              </th>
              <th scope="col" className="py-1.5 pr-2 text-left text-[10.5px] font-semibold uppercase tracking-[0.06em] text-ink-3">
                Hijri
              </th>
              {COLUMNS.map((c) => (
                <th
                  key={c}
                  scope="col"
                  className="py-1.5 text-right text-[10.5px] font-semibold uppercase tracking-[0.06em] text-ink-3"
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isToday = row.date === today;
              return (
                <tr
                  key={row.date}
                  className={cn(
                    "transition-colors duration-150",
                    isToday ? "bg-selected" : "hover:bg-hover",
                  )}
                >
                  <th
                    scope="row"
                    className={cn(
                      "whitespace-nowrap py-1 pr-2 text-left font-medium",
                      isToday ? "text-accent" : row.friday ? "text-ink" : "text-ink-2",
                    )}
                  >
                    <span className="tnum">{String(dayNumber(row.date)).padStart(2, "0")}</span>{" "}
                    <span className="text-ink-3">{dayNameOf(weekday(row.date), "short")}</span>
                    {row.friday && <span className="ml-1 text-[10.5px] text-ink-4">Jumu&rsquo;ah</span>}
                  </th>
                  <td className="tnum whitespace-nowrap py-1 pr-2 text-left text-[11.5px] text-ink-3">
                    {row.hijri}
                  </td>
                  {row.values.map((value, i) => (
                    <td
                      key={COLUMNS[i]}
                      className={cn("tnum py-1 text-right", i === 1 ? "text-ink-3" : "text-ink-2")}
                    >
                      {formatTime(value, hour12)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-2.5 text-[11.5px] leading-relaxed text-ink-4">
        Sunrise is not a prayer — it is where the Fajr window closes. Fridays carry the Jumu&rsquo;ah mark
        because Dhuhr moves to the masjid that day.
      </p>

      <Modal
        open={exporting}
        onClose={() => setExporting(false)}
        title={`${monthName(month)} ${yearOf(month)} as text`}
        width={560}
      >
        <div className="p-4">
          <p className="text-[12.5px] leading-relaxed text-ink-3">
            Plain text, aligned in columns. Copy it, or select it here if your browser blocks the clipboard.
          </p>
          <textarea
            readOnly
            value={text}
            aria-label={`${monthName(month)} prayer times as plain text`}
            onFocus={(e) => e.currentTarget.select()}
            className={cn(
              "mt-3 h-[320px] w-full resize-none rounded-lg border border-line bg-sunken p-3",
              "font-mono text-[11.5px] leading-relaxed text-ink-2",
              "focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-soft",
            )}
          />
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setExporting(false)}>Close</Button>
            <Button variant="primary" onClick={copy}>
              <ClipboardCopy className="size-3.5" />
              Copy
            </Button>
          </div>
        </div>
      </Modal>
    </section>
  );
}
