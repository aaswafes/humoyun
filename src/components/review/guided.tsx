"use client";

import * as React from "react";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button, Kbd, Progress } from "@/components/ui/primitives";

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
 * dots are real buttons so any step is one click away, and the same content is
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
  const doneCount = steps.filter((s) => s.done).length;

  return (
    <div>
      <div className="surface px-4 py-3">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3 tnum">
            Step {clamped + 1} of {steps.length}
          </span>
          <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">{step.label}</h2>
          <span className="ml-auto text-[11.5px] text-ink-4 tnum">
            {doneCount}/{steps.length} settled
          </span>
        </div>
        <p className="mt-1 text-[12.5px] leading-relaxed text-ink-3">{step.hint}</p>

        <Progress value={clamped + 1} max={steps.length} height={3} className="mt-3" />

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {steps.map((s, i) => (
            <button
              key={s.id}
              onClick={() => onIndex(i)}
              aria-current={i === clamped ? "step" : undefined}
              aria-label={`Step ${i + 1}: ${s.label}${s.done ? " — done" : ""}`}
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-medium cursor-pointer",
                "transition-[background-color,color] duration-150 ease-[var(--ease-out-apple)]",
                i === clamped
                  ? "bg-accent-soft text-accent"
                  : "text-ink-3 hover:bg-hover hover:text-ink",
              )}
            >
              {s.done ? (
                <Check className="size-3 text-success" strokeWidth={3} />
              ) : (
                <span className="size-1.5 rounded-full bg-line-strong" />
              )}
              <span className="hidden sm:inline">{s.label}</span>
              <span className="sm:hidden tnum">{i + 1}</span>
            </button>
          ))}
        </div>
      </div>

      <div key={step.id} className="anim-fade mt-6">
        {step.content}
      </div>

      <div className="mt-8 flex items-center gap-2 hairline-t pt-4">
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
