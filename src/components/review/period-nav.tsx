"use client";

import * as React from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { IconButton } from "@/components/ui/primitives";
import { Popover } from "@/components/ui/overlays";
import { MiniCalendar } from "@/components/ui/mini-calendar";
import type { Period } from "./period";

/**
 * Step through periods, or land on one directly. The label doubles as the jump
 * trigger, because that is where the eye already is.
 */
export function PeriodNav({
  period, weekStartDay, canGoForward, onPrev, onNext, onJump,
}: {
  period: Period;
  weekStartDay: number;
  /** One step past the current period is planning; two is fiction. */
  canGoForward: boolean;
  onPrev: () => void;
  onNext: () => void;
  onJump: (iso: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const noun = period.scope;

  return (
    <div className="flex items-center gap-0.5">
      <IconButton label={`Previous ${noun}`} onClick={onPrev}>
        <ChevronLeft />
      </IconButton>

      <Popover
        open={open}
        onOpenChange={setOpen}
        align="center"
        className="w-[268px] p-2"
        trigger={
          <button
            aria-label={`${period.title}, ${period.rangeLabel} — jump to another ${noun}`}
            aria-haspopup="dialog"
            aria-expanded={open}
            className={
              "inline-flex h-7 min-w-[112px] items-center justify-center gap-1.5 rounded-md px-2 " +
              "text-[13px] font-medium text-ink tnum cursor-pointer hover:bg-hover " +
              "transition-colors duration-150"
            }
          >
            <CalendarDays className="size-3.5 shrink-0 text-ink-3" />
            {period.navLabel}
          </button>
        }
      >
        {(close) => (
          <MiniCalendar
            value={period.start}
            weekStart={weekStartDay}
            onChange={(iso) => { onJump(iso); close(); }}
          />
        )}
      </Popover>

      <IconButton
        label={canGoForward ? `Next ${noun}` : `The ${noun} ahead is as far as the review goes`}
        onClick={onNext}
        disabled={!canGoForward}
      >
        <ChevronRight />
      </IconButton>
    </div>
  );
}
