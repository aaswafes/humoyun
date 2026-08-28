"use client";

import * as React from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { cn } from "@/lib/cn";
import { Sparkline, useReducedMotion } from "./chart-kit";

export interface Tile {
  key: string;
  label: string;
  value: string;
  unit?: string;
  hint: string;
  /** Percentage change against the equally long window before this one. */
  delta?: number | null;
  /** What the delta counts, e.g. "tasks done". Read out with the direction. */
  deltaOf?: string;
  /** The same measure across the window, drawn small behind the number. */
  spark?: number[];
  /** Panel id this tile summarises — the tile becomes a jump button. */
  target?: string;
  targetLabel?: string;
}

function Delta({ value, of }: { value: number; of?: string }) {
  const flat = Math.abs(value) < 1;
  const Icon = flat ? Minus : value > 0 ? ArrowUpRight : ArrowDownRight;
  const subject = of ? `${of} ` : "";

  const words = flat
    ? `${subject}flat against the previous window`
    : `${subject}${Math.abs(Math.round(value))} percent ${value > 0 ? "up on" : "down on"} the previous window`;

  return (
    // role="img" is what makes aria-label legal here — on a bare span it is
    // ignored, which left the direction of change carried by colour alone.
    <span
      role="img"
      aria-label={words}
      title={words}
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

function TileBody({ tile }: { tile: Tile }) {
  return (
    <>
      <div className="flex items-start gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">
          {tile.label}
        </p>
        {tile.delta != null && (
          <span className="ml-auto shrink-0">
            <Delta value={tile.delta} of={tile.deltaOf} />
          </span>
        )}
      </div>

      <div className="mt-3 flex items-end justify-between gap-2">
        <p className="flex items-baseline gap-1">
          <span className="display-serif text-[32px] leading-none text-ink tnum">{tile.value}</span>
          {tile.unit && <span className="text-[12.5px] text-ink-3">{tile.unit}</span>}
        </p>
        {tile.spark && tile.spark.length > 1 && (
          <span className="shrink-0 pb-0.5 opacity-70">
            <Sparkline values={tile.spark} width={72} height={20} />
          </span>
        )}
      </div>

      <p className="mt-2 text-[11.5px] leading-snug text-ink-4">{tile.hint}</p>
    </>
  );
}

export function StatTiles({ tiles }: { tiles: Tile[] }) {
  const reduced = useReducedMotion();

  /** Scroll the panel into view and hand it focus, so the keyboard follows too. */
  function jump(id: string) {
    const panel = document.getElementById(id);
    if (!panel) return;
    panel.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
    panel.querySelector<HTMLHeadingElement>("h2")?.focus({ preventScroll: true });
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {tiles.map((t) => {
        if (!t.target) {
          return (
            <div key={t.key} className="surface flex flex-col justify-between p-4">
              <TileBody tile={t} />
            </div>
          );
        }
        const target = t.target;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => jump(target)}
            aria-label={
              `${t.label}: ${t.value}${t.unit ? ` ${t.unit}` : ""}. ${t.hint}. ` +
              `Go to ${t.targetLabel ?? t.label}.`
            }
            className={cn(
              "surface flex flex-col justify-between p-4 text-left cursor-pointer",
              "transition-[background-color,transform] duration-150 ease-[var(--ease-out-apple)]",
              "hover:bg-hover active:scale-[0.985]",
            )}
          >
            <TileBody tile={t} />
          </button>
        );
      })}
    </div>
  );
}
