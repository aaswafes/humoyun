"use client";

import * as React from "react";
import { ChevronDown, Minus, TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/cn";
import { MiniEmpty } from "@/components/ui/form";
import type { Insight } from "./derive";

const TONE_ICON = {
  up: TrendingUp,
  down: TrendingDown,
  flat: Minus,
} as const;

const SHOW = 4;

/**
 * The page in sentences. This is what the screen is for — the charts below are
 * the evidence, so these lines sit on spacing alone with nothing around them.
 * A finding is only printed once its own sample clears the bar it declares;
 * everything else is listed by name with the reason, because a silent omission
 * reads as "there is nothing here".
 */
export function InsightLines({ insights }: { insights: Insight[] }) {
  const [showHeld, setShowHeld] = React.useState(false);

  const solid = insights.filter((i) => i.ok).slice(0, SHOW);
  const held = insights.filter((i) => !i.ok);

  return (
    <section aria-label="What the numbers say">
      {solid.length === 0 ? (
        <MiniEmpty className="py-2">
          Nothing here clears its own sample size yet. Keep logging and the first honest reading
          appears on its own.
        </MiniEmpty>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {solid.map((insight) => {
            const Icon = TONE_ICON[insight.tone];
            return (
              <li key={insight.key} className="flex items-start gap-2.5">
                <Icon className="mt-[4px] size-3.5 shrink-0 text-ink-4" aria-hidden />
                <p className="text-[13.5px] leading-[1.55] text-ink">
                  {insight.text}{" "}
                  <span className="text-[11.5px] text-ink-4 tnum">({insight.evidence})</span>
                </p>
              </li>
            );
          })}
        </ul>
      )}

      {held.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setShowHeld((v) => !v)}
            aria-expanded={showHeld}
            className={cn(
              "mt-3 -ml-1.5 inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-[11.5px]",
              "cursor-pointer text-ink-4 transition-colors duration-150 hover:bg-hover hover:text-ink-2",
            )}
          >
            <ChevronDown
              className={cn("size-3 transition-transform duration-200", showHeld && "rotate-180")}
              aria-hidden
            />
            <span className="tnum">{held.length}</span> reading
            {held.length === 1 ? "" : "s"} held back for a thin sample
          </button>

          {showHeld && (
            <ul
              className="mt-2 flex flex-col gap-1.5"
              style={{ animation: "hm-pop-in 200ms var(--ease-out-apple) both" }}
            >
              {held.map((insight) => (
                <li key={insight.key} className="pl-6 text-[11.5px] leading-snug text-ink-4">
                  {insight.shortfall}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
