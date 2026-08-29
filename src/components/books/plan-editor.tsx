"use client";

import * as React from "react";
import { CalendarRange, Gauge } from "lucide-react";
import { cn } from "@/lib/cn";
import { Segmented } from "@/components/ui/primitives";
import { DateField, Field, NumberField, Toggle } from "./fields";
import { computePlan, planSentence, type PlanDraft, type PlanMode } from "./plan";

export function PlanEditor({
  draft, onChange, totalPages, currentPage, weekStart, className, showStart = true,
}: {
  draft: PlanDraft;
  onChange: (next: PlanDraft) => void;
  totalPages: number;
  currentPage: number;
  weekStart: number;
  className?: string;
  showStart?: boolean;
}) {
  const plan = computePlan(draft, totalPages, currentPage);
  const set = (patch: Partial<PlanDraft>) => onChange({ ...draft, ...patch });

  return (
    <div className={cn("space-y-3", className)}>
      <Segmented<PlanMode>
        value={draft.mode}
        onChange={(mode) => set({ mode })}
        options={[
          { value: "rate", label: <span className="inline-flex items-center gap-1.5"><Gauge className="size-3.5" />Pages per day</span> },
          { value: "date", label: <span className="inline-flex items-center gap-1.5"><CalendarRange className="size-3.5" />Finish by</span> },
        ]}
        className="w-full [&>button]:flex-1"
      />

      <div className={cn("grid gap-3", showStart ? "grid-cols-2" : "grid-cols-1")}>
        {showStart && (
          <Field label="Start">
            <DateField
              label="Start date"
              value={draft.startDate}
              weekStart={weekStart}
              onChange={(startDate) => set({ startDate })}
            />
          </Field>
        )}

        {draft.mode === "rate" ? (
          <Field label="Pace">
            <NumberField
              label="Pages per day"
              value={draft.pagesPerDay}
              min={1}
              max={2000}
              step={5}
              suffix="pp"
              onChange={(pagesPerDay) => set({ pagesPerDay })}
            />
          </Field>
        ) : (
          <Field label="Finish by">
            <DateField
              label="Finish date"
              value={draft.endDate}
              weekStart={weekStart}
              onChange={(endDate) => set({ endDate })}
            />
          </Field>
        )}
      </div>

      <Toggle
        label="Skip weekends"
        description="Reading blocks land Monday to Friday only."
        checked={draft.skipWeekends}
        onChange={(skipWeekends) => set({ skipWeekends })}
      />

      {/* A working plan is information, not an announcement — only a plan that
          cannot be scheduled earns a colour. */}
      <p
        className={cn(
          "rounded-md bg-hover px-2.5 py-2 text-[12.5px] leading-relaxed tnum",
          plan.valid ? "text-ink-2" : "text-warn",
        )}
        aria-live="polite"
      >
        {planSentence(draft, plan)}
      </p>
    </div>
  );
}
