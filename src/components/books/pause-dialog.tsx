"use client";

import * as React from "react";
import { PauseCircle } from "lucide-react";
import { addDays, formatDate, todayISO } from "@/lib/date";
import { Button } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/overlays";
import { MiniCalendar } from "@/components/ui/mini-calendar";
import { cn } from "@/lib/cn";

const PRESETS: { label: string; days: number }[] = [
  { label: "A week", days: 7 },
  { label: "Two weeks", days: 14 },
  { label: "A month", days: 30 },
  { label: "Three months", days: 90 },
];

/**
 * Pausing is a scheduling decision, not a status change: the blocks between
 * now and the resume date come off the calendar, and resuming re-lays the plan
 * from the day you come back. So it gets a date picker, not a menu item.
 */
export function PauseDialog({
  open, onClose, onConfirm, bookTitle, upcoming, initialDate, weekStart,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (resumeDate: string) => void;
  bookTitle: string;
  upcoming: number;
  initialDate?: string | null;
  weekStart: number;
}) {
  const today = todayISO();
  const [date, setDate] = React.useState(() =>
    initialDate && initialDate > today ? initialDate : addDays(today, 14));

  return (
    <Modal open={open} onClose={onClose} title="Pause this book" width={330}>
      <div className="px-4 py-4">
        <p className="text-[13px] leading-relaxed text-ink-2">
          {bookTitle} goes quiet until the day you pick.
          {upcoming > 0 && (
            <>
              {" "}The {upcoming} unfinished {upcoming === 1 ? "block" : "blocks"} ahead of it come off
              the calendar; ticked ones stay.
            </>
          )}
        </p>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {PRESETS.map((p) => {
            const iso = addDays(today, p.days);
            const active = iso === date;
            return (
              <button
                key={p.days}
                type="button"
                aria-pressed={active}
                onClick={() => setDate(iso)}
                className={cn(
                  "h-7 cursor-pointer rounded-full border px-2.5 text-[12px] transition-colors",
                  active
                    ? "border-accent-line bg-accent-soft text-accent font-medium"
                    : "border-line text-ink-2 hover:bg-hover hover:text-ink",
                )}
              >
                {p.label}
              </button>
            );
          })}
        </div>

        <div className="mt-3 rounded-lg border border-line p-2">
          <MiniCalendar value={date} weekStart={weekStart} onChange={setDate} />
        </div>

        <p className="mt-2.5 flex items-start gap-1.5 text-[11.5px] leading-relaxed text-ink-3">
          <PauseCircle className="mt-px size-3.5 shrink-0 text-warn" aria-hidden />
          Resuming on {formatDate(date)} rebuilds the plan from that day at the same pace.
        </p>
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-line px-4 py-3">
        <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
        <Button
          variant="primary"
          size="sm"
          disabled={date <= today}
          onClick={() => { onConfirm(date); onClose(); }}
        >
          Pause until {formatDate(date, { weekday: false })}
        </Button>
      </div>
    </Modal>
  );
}
