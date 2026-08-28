"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import { PRAYER_LABELS, type PrayerName, type PrayerStatus } from "@/lib/types";
import { Button } from "@/components/ui/primitives";
import { StatusPicker } from "./prayer-state";
import {
  ADHKAR, ADHKAR_IDS, adhkarFor, rawatibFor, salahDataOf, setAdhkar,
  toggleInList, withSalahData, type SunnahDef,
} from "./day-data";

/**
 * One tick. A whole button rather than a checkbox next to a label, so the
 * row is a single 28px target and the name is the accessible name.
 */
export function TickRow({
  checked, onToggle, title, detail, className,
}: {
  checked: boolean;
  onToggle: () => void;
  title: string;
  detail?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={onToggle}
      className={cn(
        "flex min-h-[28px] w-full cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-left",
        "transition-[background-color,transform] duration-150 ease-[var(--ease-out-apple)] active:scale-[0.99]",
        "hover:bg-hover",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "grid size-[15px] shrink-0 place-items-center rounded-[5px] border",
          "transition-[background-color,border-color] duration-150 ease-[var(--ease-out-apple)]",
          checked ? "border-transparent bg-accent text-accent-ink" : "border-line-strong",
        )}
      >
        {checked && <Check className="size-2.5 stroke-[3.5]" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn("block truncate text-[12.5px]", checked ? "text-ink" : "text-ink-2")}>{title}</span>
        {detail && <span className="block truncate text-[11px] text-ink-4">{detail}</span>}
      </span>
    </button>
  );
}

/**
 * The optional half of a prayer, folded away until asked for: the exact
 * status, the rawatib around it, and the adhkar that follow it.
 */
export function PrayerPanel({
  id, date, name, status, showSunnah, madhab,
}: {
  id: string;
  date: string;
  name: PrayerName;
  status: PrayerStatus;
  showSunnah: boolean;
  madhab: string;
}) {
  const dayLogs = useStore((s) => s.dayLogs);
  const setDayLog = useStore((s) => s.setDayLog);
  const setPrayer = useStore((s) => s.setPrayer);

  const log = React.useMemo(() => dayLogs.find((d) => d.date === date), [dayLogs, date]);
  const data = React.useMemo(() => salahDataOf(log), [log]);
  const done = adhkarFor(data, name);
  const label = PRAYER_LABELS[name];

  const rawatib = rawatibFor(madhab)[name];
  const sunnahDefs = [rawatib.before, rawatib.after].filter((d): d is SunnahDef => !!d);

  function writeAdhkar(ids: string[]) {
    setDayLog(date, { data: withSalahData(log, setAdhkar(data, name, ids)) });
  }

  function toggleSunnah(sunnahId: string) {
    setDayLog(date, { data: withSalahData(log, { ...data, sunnah: toggleInList(data.sunnah, sunnahId) }) });
  }

  const allDone = done.length === ADHKAR.length;

  return (
    <div id={id} className="anim-fade mt-1 rounded-lg bg-sunken p-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">How it went</p>
      <StatusPicker
        className="mt-2"
        status={status}
        label={label}
        onPick={(next) => setPrayer(date, name, next)}
      />

      {showSunnah && sunnahDefs.length > 0 && (
        <div className="hairline-t mt-3 pt-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">
            Rawatib
          </p>
          <div className="mt-1 -mx-2">
            {sunnahDefs.map((def) => (
              <TickRow
                key={def.id}
                checked={data.sunnah.includes(def.id)}
                onToggle={() => toggleSunnah(def.id)}
                title={`${def.label} · ${def.rakat}`}
                detail={def.detail}
              />
            ))}
          </div>
        </div>
      )}

      <div className="hairline-t mt-3 pt-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">
            Adhkar after {label}
          </p>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => writeAdhkar(allDone ? [] : [...ADHKAR_IDS])}
          >
            {allDone ? "Clear" : "Tick all"}
          </Button>
        </div>

        <div className="mt-1 -mx-2 grid gap-x-2 sm:grid-cols-2">
          {ADHKAR.map((dhikr) => (
            <TickRow
              key={dhikr.id}
              checked={done.includes(dhikr.id)}
              onToggle={() => writeAdhkar(toggleInList(done, dhikr.id))}
              title={dhikr.label}
              detail={dhikr.detail}
            />
          ))}
        </div>

        <p className="mt-1.5 px-0.5 text-[11.5px] text-ink-4">
          Optional, and never counted against you — <span className="tnum">{done.length}</span> of{" "}
          <span className="tnum">{ADHKAR.length}</span> ticked today.
        </p>
      </div>
    </div>
  );
}
