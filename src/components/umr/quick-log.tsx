"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import { nowMinutes } from "@/lib/date";
import { UMR_META, damBalance, type UmrCategory, type UmrPrefs, type UmrTotals } from "@/lib/umr";
import { Button, Input } from "@/components/ui/primitives";
import { ConfirmDialog } from "@/components/ui/overlays";
import { CategoryPicker } from "./category-picker";
import { fmtMin } from "./derive";

// =========================================================
// The minutes nothing else records: sleep, a meal, a commute, an hour on the
// phone. One row, four fields, no modal — this is meant to be used several
// times a day or it will not be used at all.
//
// The one place the cap is enforced: logging Dam past the budget asks first.
// It still goes through if you say yes. Lying to the ledger to stay under a
// self-imposed cap would make every other number on the page worthless.
// =========================================================

const PRESETS = [15, 30, 60, 90];

export function QuickLog({
  date, totals, prefs, className,
}: {
  date: string;
  /** today's totals, so the Dam warning knows what is already spent */
  totals: UmrTotals;
  prefs: UmrPrefs;
  className?: string;
}) {
  const logUmr = useStore((s) => s.logUmr);
  const toast = useStore((s) => s.toast);

  const [category, setCategory] = React.useState<UmrCategory>("xordiq");
  const [minutes, setMinutes] = React.useState("");
  const [label, setLabel] = React.useState("");
  const [pending, setPending] = React.useState<number | null>(null);

  const parsed = Math.round(Number(minutes));
  const valid = Number.isFinite(parsed) && parsed > 0 && parsed <= 1440;

  const balance = damBalance(totals.talim, totals.dam, prefs);

  function write(mins: number) {
    logUmr({
      date,
      category,
      minutes: mins,
      label: label.trim() || null,
      // The clock matters for the hour profile, and "now" is the honest guess
      // for something being logged as it happens.
      startMin: nowMinutes(),
    });
    setMinutes("");
    setLabel("");
    toast({
      title: `${fmtMin(mins)} of ${UMR_META[category].label}`,
      description: label.trim() || undefined,
      tone: "success",
    });
  }

  function submit(mins: number) {
    if (!(mins > 0)) return;
    // Only Dam is policed, and only when this entry is what breaks the budget.
    if (category === "dam" && balance.spent + mins > balance.budget) {
      setPending(mins);
      return;
    }
    write(mins);
  }

  return (
    <div className={cn("surface p-3.5", className)}>
      <div className="flex items-baseline gap-2">
        <h2 className="text-[12.5px] font-medium text-ink">Log time</h2>
        <p className="min-w-0 flex-1 truncate text-[11.5px] text-ink-4">
          for what the app cannot see — sleep, meals, a walk, an hour on the phone
        </p>
      </div>

      <CategoryPicker value={category} onChange={(c) => c && setCategory(c)} className="mt-2.5" size="sm" />

      <form
        className="mt-2.5 flex flex-wrap items-center gap-1.5"
        onSubmit={(e) => { e.preventDefault(); submit(parsed); }}
      >
        <Input
          aria-label="Minutes"
          inputMode="numeric"
          placeholder="min"
          value={minutes}
          onChange={(e) => setMinutes(e.target.value.replace(/[^\d]/g, ""))}
          className="h-7 w-[68px] text-[12.5px] tnum"
        />
        <Input
          aria-label="What it was"
          placeholder="What was it?"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="h-7 min-w-[140px] flex-1 text-[12.5px]"
        />
        <Button type="submit" size="sm" variant="primary" disabled={!valid}>
          <Plus className="size-3.5" />
          Log
        </Button>
      </form>

      <div className="mt-2 flex flex-wrap gap-1">
        {PRESETS.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => submit(n)}
            className={cn(
              "h-6 rounded-md px-2 text-[11.5px] text-ink-3 cursor-pointer tnum",
              "transition-colors hover:bg-hover hover:text-ink",
            )}
          >
            +{fmtMin(n)}
          </button>
        ))}
      </div>

      <ConfirmDialog
        open={pending != null}
        onClose={() => setPending(null)}
        onConfirm={() => { if (pending != null) write(pending); setPending(null); }}
        title="That puts Dam over budget"
        confirmLabel="Log it anyway"
        description={
          balance.budget > 0
            ? `Taʼlim has earned ${fmtMin(balance.budget)} of Dam and ${fmtMin(balance.spent)} is already spent. This adds ${fmtMin(pending ?? 0)}, putting you ${fmtMin(balance.spent + (pending ?? 0) - balance.budget)} over. Logging it is still the right thing to do — the ledger should say what happened.`
            : `No Taʼlim has been recorded ${prefs.damWindow === "day" ? "today" : "this week"}, so the Dam budget is zero. Logging it is still the right thing to do — the ledger should say what happened.`
        }
      />
    </div>
  );
}
