"use client";

import * as React from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { cn } from "@/lib/cn";
import { Sparkline, useReducedMotion } from "./chart-kit";
import { openSection } from "./sections";

export interface Tile {
  key: string;
  label: string;
  value: string;
  unit?: string;
  /**
   * The sentence behind the number. It is spoken and shown on hover rather than
   * printed — the panel this tile points at states the same thing in full.
   */
  hint: string;
  /** Percentage change against the equally long window before this one. */
  delta?: number | null;
  /** What the delta counts, e.g. "tasks done". Read out with the direction. */
  deltaOf?: string;
  /** The same measure across the window, drawn small beside the number. */
  spark?: number[];
  /** Panel id this tile summarises — the tile becomes a jump button. */
  target?: string;
  targetLabel?: string;
}

/**
 * Direction of travel. Grey on purpose: a week with fewer tasks closed is
 * information, not a failure, so the arrow carries the meaning and no colour
 * competes with the accent.
 */
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
      className="inline-flex items-center gap-0.5 text-[11px] text-ink-4 tnum"
    >
      <Icon className="size-3" aria-hidden />
      {flat ? "flat" : `${Math.abs(Math.round(value))}%`}
    </span>
  );
}

function TileBody({ tile }: { tile: Tile }) {
  return (
    <>
      <span className="flex items-baseline gap-2">
        <span className="text-[11.5px] text-ink-3">{tile.label}</span>
        {tile.delta != null && (
          <span className="ml-auto shrink-0">
            <Delta value={tile.delta} of={tile.deltaOf} />
          </span>
        )}
      </span>

      <span className="mt-3 flex items-end justify-between gap-2">
        <span className="flex items-baseline gap-1">
          <span className="display-serif text-[32px] leading-none text-ink tnum">{tile.value}</span>
          {tile.unit && <span className="text-[12.5px] text-ink-4">{tile.unit}</span>}
        </span>
        {tile.spark && tile.spark.length > 1 && (
          <span className="shrink-0 pb-1">
            <Sparkline values={tile.spark} width={64} height={18} color="var(--ink-4)" />
          </span>
        )}
      </span>
    </>
  );
}

/**
 * Four numbers, one bordered surface, hairlines between them. Each one is a
 * button onto the section that explains it — and because that section may be
 * folded, opening it is part of the jump.
 */
export function StatTiles({ tiles }: { tiles: Tile[] }) {
  const reduced = useReducedMotion();

  function jump(id: string) {
    openSection(id);
    // The panel body mounts on the next frame; scroll once it has height.
    requestAnimationFrame(() => {
      const panel = document.getElementById(id);
      if (!panel) return;
      panel.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
      panel.querySelector<HTMLButtonElement>("[data-panel-toggle]")?.focus({ preventScroll: true });
    });
  }

  return (
    <div className="surface overflow-hidden">
      <div className="grid grid-cols-2 gap-px bg-line lg:grid-cols-4">
        {tiles.map((t) => {
          if (!t.target) {
            return (
              <div key={t.key} className="flex flex-col justify-between bg-raised p-4 md:p-5">
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
              title={t.hint}
              aria-label={
                `${t.label}: ${t.value}${t.unit ? ` ${t.unit}` : ""}. ${t.hint}. ` +
                `Go to ${t.targetLabel ?? t.label}.`
              }
              className={cn(
                "flex flex-col justify-between bg-raised p-4 text-left cursor-pointer md:p-5",
                "transition-colors duration-150 ease-[var(--ease-out-apple)] hover:bg-hover",
              )}
            >
              <TileBody tile={t} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
