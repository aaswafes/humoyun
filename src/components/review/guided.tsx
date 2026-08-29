"use client";

import * as React from "react";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button, Kbd } from "@/components/ui/primitives";
import { SectionChrome } from "./section";

export interface GuidedStep {
  id: string;
  label: string;
  /** One line saying what this step is for — the ritual's instruction. */
  hint: string;
  /** Whether this part of the ritual is settled, shown as a tick. */
  done?: boolean;
  content: React.ReactNode;
}

/**
 * One step at a time, with the shape of the whole thing still visible. The
 * chips are the progress and the navigation at once — a bar and a "step 2 of
 * 5" beside them would be the same fact three times — and the same content is
 * rendered by the page when the user would rather see it all at once.
 */
export function Guided({
  steps, index, onIndex, onFinish,
}: {
  steps: GuidedStep[];
  index: number;
  onIndex: (next: number) => void;
  onFinish: () => void;
}) {
  const clamped = Math.max(0, Math.min(steps.length - 1, index));
  const step = steps[clamped];
  const last = clamped === steps.length - 1;

  return (
    <div>
      <nav
        aria-label="Review steps"
        className="flex flex-wrap items-center gap-1 hairline-b pb-3"
      >
        {steps.map((s, i) => (
          <button
            key={s.id}
            onClick={() => onIndex(i)}
            aria-current={i === clamped ? "step" : undefined}
            aria-label={`Step ${i + 1} of ${steps.length}: ${s.label}${s.done ? " — done" : ""}`}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-medium cursor-pointer",
              "transition-[background-color,color] duration-150 ease-[var(--ease-out-apple)]",
              // The accent is spent on the one action and the one selection
              // further down the page, so the current step is marked by fill.
              i === clamped
                ? "bg-active text-ink"
                : "text-ink-4 hover:bg-hover hover:text-ink-2",
            )}
          >
            {s.done ? (
              <Check className="size-3" strokeWidth={3} />
            ) : (
              <span className="size-1.5 rounded-full bg-line-strong" />
            )}
            <span className="hidden sm:inline">{s.label}</span>
            <span className="sm:hidden tnum">{i + 1}</span>
          </button>
        ))}
      </nav>

      <div key={step.id} className="anim-fade mt-7">
        <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">{step.label}</h2>
        <p className="mt-1 max-w-[70ch] text-[12.5px] leading-relaxed text-ink-4">{step.hint}</p>

        {/* The step heading has already named this part, so the section inside drops its label. */}
        <div className="mt-6">
          <SectionChrome headless>{step.content}</SectionChrome>
        </div>
      </div>

      <div className="mt-10 flex items-center gap-2 hairline-t pt-4">
        <Button
          size="sm"
          variant="ghost"
          disabled={clamped === 0}
          onClick={() => onIndex(clamped - 1)}
        >
          <ArrowLeft className="size-3.5" />
          Back
        </Button>
        <span className="hidden items-center gap-1 text-[11px] text-ink-4 sm:inline-flex">
          <Kbd>K</Kbd> back · <Kbd>J</Kbd> next
        </span>
        <div className="flex-1" />
        {last ? (
          <Button size="sm" variant="primary" onClick={onFinish}>
            <Check className="size-3.5" />
            Finish review
          </Button>
        ) : (
          <Button size="sm" variant="primary" onClick={() => onIndex(clamped + 1)}>
            Next
            <ArrowRight className="size-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}
