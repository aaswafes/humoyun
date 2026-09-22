"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { UMR_CATEGORIES, UMR_META, sumTotals, type UmrCategory, type UmrTotals } from "@/lib/umr";
import { fmtMin, pct } from "./derive";

// =========================================================
// The one picture the section is about: a length of time, cut into the five
// kinds of living. Used on the Umr page for a day, on the stats page for a
// window, and on Today for the strip.
// =========================================================

export interface BarProps {
  totals: UmrTotals;
  /** recorded but uncategorised — drawn hatched, never silently dropped */
  unassigned?: number;
  /**
   * Draw against the whole window rather than against what was recorded, so
   * the hours nothing knows about stay visible as empty space. That honesty
   * is the point: a bar that always fills would say the day was fully known.
   */
  capacity?: number;
  height?: number;
  className?: string;
  onSelect?: (category: UmrCategory) => void;
}

export function CategoryBar({
  totals, unassigned = 0, capacity, height = 10, className, onSelect,
}: BarProps) {
  const accounted = sumTotals(totals) + unassigned;
  const span = Math.max(accounted, capacity ?? 0, 1);

  const parts = UMR_CATEGORIES
    .filter((c) => totals[c] > 0)
    .map((c) => ({ key: c as string, category: c, minutes: totals[c] }));

  return (
    <div
      className={cn("flex w-full overflow-hidden rounded-full bg-hover", className)}
      style={{ height }}
      role="img"
      aria-label={
        accounted > 0
          ? `${fmtMin(accounted)} recorded: ${parts.map((p) => `${UMR_META[p.category].label} ${fmtMin(p.minutes)}`).join(", ")}`
          : "Nothing recorded"
      }
    >
      {parts.map((p) => {
        const width = `${(p.minutes / span) * 100}%`;
        const title = `${UMR_META[p.category].label} · ${fmtMin(p.minutes)} · ${pct(p.minutes / Math.max(1, accounted))} of what was recorded`;
        return onSelect ? (
          <button
            key={p.key}
            type="button"
            title={title}
            aria-label={title}
            onClick={() => onSelect(p.category)}
            style={{ width, background: "var(--tint)" }}
            className={cn(`tint-${UMR_META[p.category].tint}`, "h-full cursor-pointer transition-opacity hover:opacity-80")}
          />
        ) : (
          <span
            key={p.key}
            title={title}
            style={{ width, background: "var(--tint)" }}
            className={cn(`tint-${UMR_META[p.category].tint}`, "h-full")}
          />
        );
      })}

      {unassigned > 0 && (
        <span
          title={`Uncategorised · ${fmtMin(unassigned)}`}
          style={{
            width: `${(unassigned / span) * 100}%`,
            backgroundImage:
              "repeating-linear-gradient(45deg, var(--ink-4) 0 2px, transparent 2px 5px)",
          }}
          className="h-full opacity-50"
        />
      )}
    </div>
  );
}

/** The key under a bar: name, minutes, share. */
export function CategoryLegend({
  totals, unassigned = 0, onSelect, active, className,
}: {
  totals: UmrTotals;
  unassigned?: number;
  onSelect?: (category: UmrCategory) => void;
  active?: UmrCategory | null;
  className?: string;
}) {
  const accounted = sumTotals(totals) + unassigned;

  return (
    <ul className={cn("flex flex-wrap gap-x-4 gap-y-1.5", className)}>
      {UMR_CATEGORIES.map((c) => {
        const minutes = totals[c];
        const meta = UMR_META[c];
        const body = (
          <>
            <span
              className={cn(`tint-${meta.tint}`, "size-2 shrink-0 rounded-full")}
              style={{ background: "var(--tint)" }}
              aria-hidden
            />
            <span className={cn("text-[12.5px]", active === c ? "font-medium text-ink" : "text-ink-2")}>
              {meta.label}
            </span>
            <span className="text-[12px] text-ink-4 tnum">{fmtMin(minutes)}</span>
            {accounted > 0 && (
              <span className="text-[11px] text-ink-4 tnum">{pct(minutes / accounted)}</span>
            )}
          </>
        );
        return (
          <li key={c}>
            {onSelect ? (
              <button
                type="button"
                onClick={() => onSelect(c)}
                aria-pressed={active === c}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-1.5 py-0.5 cursor-pointer",
                  "transition-colors hover:bg-hover",
                  active === c && "bg-active",
                )}
              >
                {body}
              </button>
            ) : (
              <span className="flex items-center gap-1.5 px-1.5 py-0.5">{body}</span>
            )}
          </li>
        );
      })}
      {unassigned > 0 && (
        <li className="flex items-center gap-1.5 px-1.5 py-0.5">
          <span
            className="size-2 shrink-0 rounded-full opacity-60"
            style={{
              backgroundImage: "repeating-linear-gradient(45deg, var(--ink-4) 0 1px, transparent 1px 3px)",
            }}
            aria-hidden
          />
          <span className="text-[12.5px] text-ink-3">Uncategorised</span>
          <span className="text-[12px] text-ink-4 tnum">{fmtMin(unassigned)}</span>
        </li>
      )}
    </ul>
  );
}
