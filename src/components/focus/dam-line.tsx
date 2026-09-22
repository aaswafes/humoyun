"use client";

import * as React from "react";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/cn";
import { useDamBalance } from "@/components/umr/use-umr";
import { fmtMin } from "@/components/umr/derive";

// =========================================================
// The cap, said out loud on the dial.
//
// It appears only when Dam is the chosen kind, and it never blocks the start
// button — the contract is that the cap warns and keeps counting. But it says
// the number while the choice can still change, which is the only moment it
// can do any good.
// =========================================================

export function DamLine({ className }: { className?: string }) {
  const { balance, prefs } = useDamBalance();
  const windowWord = prefs.damWindow === "day" ? "today" : "this week";

  if (balance.budget <= 0) {
    return (
      <p className={cn("flex items-center gap-1.5 text-[11.5px] text-warn", className)}>
        <AlertTriangle className="size-3 shrink-0" aria-hidden />
        <span>
          No Taʼlim recorded {windowWord}, so Dam has earned nothing yet.
        </span>
      </p>
    );
  }

  return (
    <p
      className={cn(
        "flex items-center gap-1.5 text-[11.5px] tnum",
        balance.over ? "text-danger" : "text-ink-4",
        className,
      )}
    >
      {balance.over && <AlertTriangle className="size-3 shrink-0" aria-hidden />}
      <span>
        {balance.over
          ? `Dam is ${fmtMin(-balance.left)} past its budget ${windowWord}.`
          : `${fmtMin(balance.left)} of Dam left ${windowWord}, of ${fmtMin(balance.budget)} earned.`}
      </span>
    </p>
  );
}
