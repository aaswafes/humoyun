"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/primitives";
import { VisuallyHidden } from "@/components/ui/form";
import { JUZ_COUNT, juzBreakdown } from "./quran";

/**
 * The mushaf as thirty cells. A khatm stops being an abstract page count the
 * moment you can see which third of it you are standing in.
 */
export function JuzGrid({
  pagesRead, onLog, className,
}: {
  pagesRead: number;
  /** Offered on the juz you are inside, to close it out in one tap. */
  onLog?: (pages: number) => void;
  className?: string;
}) {
  const cells = React.useMemo(() => juzBreakdown(pagesRead), [pagesRead]);
  const current = cells.find((c) => c.state === "current")?.juz ?? null;
  const [picked, setPicked] = React.useState<number | null>(null);

  const selected = cells[(picked ?? current ?? 1) - 1];
  const doneCount = cells.filter((c) => c.state === "done").length;
  const summaryId = "salah-juz-summary";

  return (
    <div className={className}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">By juz</p>
        <p className="text-[11.5px] text-ink-3">
          <span className="tnum">{doneCount}</span> of <span className="tnum">{JUZ_COUNT}</span> complete
        </p>
      </div>

      <div
        role="group"
        aria-label="Progress by juz"
        aria-describedby={summaryId}
        className="mt-2 grid grid-cols-10 gap-1"
      >
        {cells.map((cell) => {
          const isSelected = cell.juz === selected.juz;
          return (
            <button
              key={cell.juz}
              type="button"
              aria-pressed={isSelected}
              aria-label={`Juz ${cell.juz}, pages ${cell.from} to ${cell.to}, ${cell.pagesDone} of ${cell.pages} pages read`}
              onClick={() => setPicked(cell.juz)}
              className={cn(
                "relative grid h-8 cursor-pointer place-items-center overflow-hidden rounded-md bg-hover",
                "transition-[box-shadow,transform] duration-150 ease-[var(--ease-out-apple)] active:scale-95",
                isSelected && "ring-2 ring-accent-line",
              )}
            >
              <span
                aria-hidden
                className="absolute inset-x-0 bottom-0 bg-accent-soft transition-[height] duration-500 ease-[var(--ease-out-apple)]"
                style={{ height: `${Math.round(cell.fill * 100)}%` }}
              />
              <span
                className={cn(
                  "tnum relative text-[11.5px]",
                  cell.state === "done" ? "font-semibold text-accent"
                    : cell.state === "current" ? "font-semibold text-ink"
                      : "text-ink-4",
                )}
              >
                {cell.juz}
              </span>
            </button>
          );
        })}
      </div>

      <VisuallyHidden id={summaryId}>
        {doneCount} of {JUZ_COUNT} juz complete.
        {current ? ` Juz ${current} is in progress.` : " No juz is part-way through."}
      </VisuallyHidden>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <p className="text-[12px] text-ink-2">
          <span className="font-medium text-ink">Juz {selected.juz}</span>
          <span className="text-ink-3">
            {" · pages "}
            <span className="tnum">{selected.from}</span>–<span className="tnum">{selected.to}</span>
            {" · "}
            {selected.state === "done"
              ? "complete"
              : selected.state === "todo"
                ? "not started"
                : `${selected.pagesDone} of ${selected.pages} pages`}
          </span>
        </p>
        {onLog && selected.state === "current" && selected.pages > selected.pagesDone && (
          <Button size="sm" onClick={() => onLog(selected.pages - selected.pagesDone)}>
            Log the remaining {selected.pages - selected.pagesDone}
          </Button>
        )}
      </div>
    </div>
  );
}
