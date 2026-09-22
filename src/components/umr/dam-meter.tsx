"use client";

import * as React from "react";
import { AlertTriangle, Gamepad2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { UMR_META, ratioPhrase, talimNeededFor, type DamBalance, type UmrPrefs } from "@/lib/umr";
import { fmtMin } from "./derive";

// =========================================================
// The cap, drawn.
//
// Ten minutes of Taʼlim buys one minute of Dam. The meter never blocks
// anything — an app cannot stop anyone picking up a phone — but it refuses to
// be vague: it says exactly how much is left, and when the budget is gone it
// says how much study would buy the next ten minutes.
// =========================================================

export function DamMeter({
  balance, prefs, className, compact,
}: {
  balance: DamBalance;
  prefs: UmrPrefs;
  className?: string;
  compact?: boolean;
}) {
  const { budget, spent, left, used, over } = balance;
  const windowWord = balance.window === "day" ? "today" : "this week";
  const meta = UMR_META.dam;

  const headline = over
    ? `${fmtMin(-left)} over`
    : budget > 0
      ? `${fmtMin(left)} left`
      : "nothing earned yet";

  return (
    <div className={cn("surface p-3.5", className)}>
      <div className="flex items-baseline gap-2">
        <span className={cn(`tint-${meta.tint}`, "flex items-center gap-1.5")}>
          <Gamepad2 className="size-3.5 shrink-0" style={{ color: "var(--tint)" }} aria-hidden />
          <span className="text-[12.5px] font-medium text-ink">{meta.label}</span>
        </span>
        <span className="text-[11.5px] text-ink-4">{windowWord}</span>
        <span className="flex-1" />
        {over && (
          <span className="flex items-center gap-1 text-[11.5px] font-medium text-danger">
            <AlertTriangle className="size-3" aria-hidden />
            over budget
          </span>
        )}
      </div>

      <p className="display-serif mt-2 text-[26px] leading-none text-ink tnum">
        {headline}
      </p>

      {/* The bar fills as Dam is spent, and turns when it passes the budget.
          Red is earned here — this is the one number the section polices. */}
      <div
        className="mt-3 h-2 w-full overflow-hidden rounded-full bg-hover"
        role="img"
        aria-label={`${fmtMin(spent)} of a ${fmtMin(budget)} budget used`}
      >
        <div
          className={cn(
            `tint-${meta.tint}`,
            "h-full rounded-full transition-[width] duration-300 ease-[var(--ease-out-apple)]",
          )}
          style={{
            width: `${Math.round(used * 100)}%`,
            background: over ? "var(--danger)" : "var(--tint)",
          }}
        />
      </div>

      <dl className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1 text-[11.5px]">
        <span className="flex gap-1.5">
          <dt className="text-ink-4">Earned</dt>
          <dd className="text-ink-2 tnum">{fmtMin(budget)}</dd>
        </span>
        <span className="flex gap-1.5">
          <dt className="text-ink-4">Spent</dt>
          <dd className="text-ink-2 tnum">{fmtMin(spent)}</dd>
        </span>
        <span className="flex gap-1.5">
          <dt className="text-ink-4">From</dt>
          <dd className="text-ink-2 tnum">{fmtMin(balance.earned)} of Taʼlim</dd>
        </span>
      </dl>

      {!compact && (
        <p className="mt-2.5 text-[11.5px] leading-relaxed text-ink-4">
          {ratioPhrase(prefs)}.{" "}
          {over
            ? `Another ${fmtMin(-left)} of Taʼlim at this rate would square it.`
            : left <= 0 && budget === 0
              ? `Ten more minutes of Dam would need ${fmtMin(talimNeededFor(10, prefs))} of Taʼlim first.`
              : "The budget resets when the window does — it does not roll over."}
        </p>
      )}
    </div>
  );
}

/** The one-line version, for a rail or a header. */
export function DamChip({ balance, className }: { balance: DamBalance; className?: string }) {
  const { left, over, budget } = balance;
  const words = over
    ? `Dam ${fmtMin(-left)} over budget`
    : budget > 0
      ? `Dam ${fmtMin(left)} left`
      : "Dam not earned yet";

  return (
    <span
      title={words}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11.5px] tnum",
        over ? "bg-danger-soft text-danger" : "bg-hover text-ink-2",
        className,
      )}
    >
      <Gamepad2 className="size-3 shrink-0" aria-hidden />
      {words}
    </span>
  );
}
