"use client";

import * as React from "react";
import { ChevronDown, Minus, Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/cn";
import { MiniEmpty } from "@/components/ui/form";
import type { Insight } from "./derive";

const TONE_ICON = {
  up: TrendingUp,
  down: TrendingDown,
  flat: Minus,
} as const;

const TONE_CLASS = {
  up: "text-success",
  down: "text-danger",
  flat: "text-ink-3",
} as const;

const SHOW = 4;

/**
 * Sentences derived from the window. A finding is only printed once its own
 * sample clears the bar it declares; everything else is listed by name with the
 * reason, because a silent omission reads as "there is nothing here".
 */
export function InsightLines({ insights }: { insights: Insight[] }) {
  const [showHeld, setShowHeld] = React.useState(false);

  const solid = insights.filter((i) => i.ok).slice(0, SHOW);
  const held = insights.filter((i) => !i.ok);

  return (
    <section className="surface p-4 md:px-5" aria-label="What the numbers say">
      <div className="flex items-center gap-2">
        <Sparkles className="size-3.5 text-ink-3" aria-hidden />
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">
          What the numbers say
        </h2>
        {held.length > 0 && (
          <button
            type="button"
            onClick={() => setShowHeld((v) => !v)}
            aria-expanded={showHeld}
            className={cn(
              "ml-auto inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11.5px] font-medium",
              "cursor-pointer transition-colors duration-150",
              showHeld ? "bg-accent-soft text-accent" : "text-ink-3 hover:bg-hover hover:text-ink",
            )}
          >
            <ChevronDown
              className={cn("size-3 transition-transform duration-200", showHeld && "rotate-180")}
              aria-hidden
            />
            <span className="tnum">{held.length}</span> held back
          </button>
        )}
      </div>

      {solid.length === 0 ? (
        <MiniEmpty className="py-4">
          Nothing here clears its own sample size yet. Keep logging and the first honest reading
          appears on its own — the reasons are listed above.
        </MiniEmpty>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {solid.map((insight) => {
            const Icon = TONE_ICON[insight.tone];
            return (
              <li key={insight.key} className="flex items-start gap-2">
                <Icon
                  className={cn("mt-[3px] size-3.5 shrink-0", TONE_CLASS[insight.tone])}
                  aria-hidden
                />
                <p className="text-[13px] leading-[1.5] text-ink">
                  {insight.text}{" "}
                  <span className="text-[11.5px] text-ink-4 tnum">
                    ({insight.evidence})
                  </span>
                </p>
              </li>
            );
          })}
        </ul>
      )}

      {showHeld && held.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1.5 hairline-t pt-3">
          {held.map((insight) => (
            <li key={insight.key} className="text-[11.5px] leading-snug text-ink-4">
              {insight.shortfall}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
