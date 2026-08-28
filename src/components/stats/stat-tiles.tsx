"use client";

import * as React from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { cn } from "@/lib/cn";

export interface Tile {
  key: string;
  label: string;
  value: string;
  unit?: string;
  hint: string;
  /** Percentage change against the equally long window before this one. */
  delta?: number | null;
}

function Delta({ value }: { value: number }) {
  const flat = Math.abs(value) < 1;
  const Icon = flat ? Minus : value > 0 ? ArrowUpRight : ArrowDownRight;

  const words = flat
    ? "flat against the previous window"
    : `${Math.abs(Math.round(value))}% ${value > 0 ? "up on" : "down on"} the previous window`;

  return (
    <span
      title={words}
      aria-label={words}
      className={cn(
        "inline-flex items-center gap-0.5 text-[11px] font-medium tnum",
        flat ? "text-ink-4" : value > 0 ? "text-success" : "text-danger",
      )}
    >
      <Icon className="size-3" aria-hidden />
      {flat ? "flat" : `${Math.abs(Math.round(value))}%`}
    </span>
  );
}

export function StatTiles({ tiles }: { tiles: Tile[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {tiles.map((t) => (
        <div key={t.key} className="surface flex flex-col justify-between p-4">
          <div className="flex items-start gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">
              {t.label}
            </p>
            {t.delta != null && (
              <span className="ml-auto shrink-0">
                <Delta value={t.delta} />
              </span>
            )}
          </div>

          <p className="mt-3 flex items-baseline gap-1">
            <span className="display-serif text-[32px] leading-none text-ink tnum">{t.value}</span>
            {t.unit && <span className="text-[12.5px] text-ink-3">{t.unit}</span>}
          </p>

          <p className="mt-2 text-[11.5px] leading-snug text-ink-4">{t.hint}</p>
        </div>
      ))}
    </div>
  );
}
