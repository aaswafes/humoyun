"use client";

import { Minus, Plus } from "lucide-react";
import { formatDate } from "@/lib/date";
import { IconButton } from "@/components/ui/primitives";
import { HIJRI_MONTHS, hijriFor, hijriNote } from "./hijri";

/**
 * The tabular calendar is arithmetic, not a sighting. Rather than hide that,
 * the card says so and hands over a two-day adjustment either way.
 */
export function HijriCard({
  date, afterMaghrib, offset, onOffset,
}: {
  date: string;
  afterMaghrib: boolean;
  offset: number;
  onOffset: (next: number) => void;
}) {
  const hijri = hijriFor(date, offset, afterMaghrib);
  const note = hijriNote(hijri);

  return (
    <div>
      <p className="display-serif text-[22px] leading-tight text-ink">
        <span className="tnum">{hijri.day}</span> {HIJRI_MONTHS[hijri.month - 1]}
      </p>
      <p className="mt-1 text-[12px] text-ink-3">
        <span className="tnum">{hijri.year}</span> AH · {formatDate(date, { year: true })}
        {note && <span className="text-ink-2"> · {note}</span>}
      </p>

      <p className="mt-3 text-[11.5px] leading-relaxed text-ink-4">
        {afterMaghrib
          ? "Maghrib has passed, so the Hijri date has already turned over to the next day."
          : "The Hijri day turns at maghrib — this date advances this evening."}
      </p>

      <div className="hairline-t mt-4 flex items-center gap-2 pt-3">
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-medium text-ink-2">Sighting offset</p>
          <p className="mt-0.5 text-[11.5px] leading-snug text-ink-4">
            Computed arithmetically. Shift it to match your local moon sighting.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <IconButton
            label="Shift the Hijri date a day earlier"
            onClick={() => onOffset(Math.max(-2, offset - 1))}
            disabled={offset <= -2}
          >
            <Minus />
          </IconButton>
          <span className="tnum w-7 text-center text-[12.5px] font-medium text-ink">
            {offset > 0 ? `+${offset}` : offset}
          </span>
          <IconButton
            label="Shift the Hijri date a day later"
            onClick={() => onOffset(Math.min(2, offset + 1))}
            disabled={offset >= 2}
          >
            <Plus />
          </IconButton>
        </div>
      </div>
    </div>
  );
}
