"use client";

import * as React from "react";
import { Flag, Layers, ListChecks, Scale, Target } from "lucide-react";
import { cn } from "@/lib/cn";
import type { Goal } from "@/lib/types";
import { Progress } from "@/components/ui/primitives";
import { SubLabel } from "./goal-fold";
import { explainProgress, pct, type GoalStats, type SignalKey } from "./goal-model";
import type { ProgressMode } from "./goal-meta";

const SIGNAL_ICON: Record<SignalKey, React.ComponentType<{ className?: string }>> = {
  target: Target,
  children: Layers,
  tasks: ListChecks,
  milestones: Flag,
};

/**
 * Where the goal stands, said once: a bar and the number it is showing. Pace
 * and time left ride alongside because they are what turns the number into a
 * judgement — but only while the goal is still running.
 */
export function GoalProgressReadout({
  goal, stats, className,
}: {
  goal: Goal;
  stats: GoalStats;
  className?: string;
}) {
  const progress = goal.status === "done" ? 1 : stats.overall;
  const running = goal.status === "active";

  return (
    <div className={className}>
      <div className="flex items-baseline gap-2.5">
        <span className="display-serif text-[22px] leading-none text-ink tnum">{pct(progress)}</span>
        {running && stats.pace && (
          <span
            className={cn(
              // Behind pace is a fact to read, not an alarm to sound — only the
              // good news is worth a colour here.
              "text-[12.5px]",
              stats.pace === "ahead" ? "text-success" : "text-ink-2",
            )}
          >
            {stats.pace}
          </span>
        )}
        {running && stats.daysLeft != null && (
          <span className="text-[12px] text-ink-4 tnum">
            {stats.daysLeft >= 0 ? `${stats.daysLeft} days left` : `${-stats.daysLeft} days over`}
          </span>
        )}
      </div>
      <Progress value={progress * 100} tint={goal.color} height={4} className="mt-2" />
    </div>
  );
}

/**
 * The working behind the number. A single percentage is a claim; this lists
 * every signal that exists, what each one says, and which of them is in charge.
 * It sits on spacing rather than inside a panel — the sheet is already the box.
 */
export function GoalProgress({
  goal, stats, onModeChange,
}: {
  goal: Goal;
  stats: GoalStats;
  onModeChange: (mode: ProgressMode) => void;
}) {
  const present = stats.signals.filter((s) => s.pct != null).length;

  return (
    <section>
      <SubLabel>What drives this bar</SubLabel>
      <p className="mt-1 text-[12px] leading-snug text-ink-3">{explainProgress(stats)}</p>

      <div className="mt-2">
        <DriverRow
          active={stats.mode === "auto"}
          icon={Scale}
          label="Blend"
          detail={
            present === 0
              ? "Nothing to average yet"
              : `Average of ${present} ${present === 1 ? "signal" : "signals"}`
          }
          value={stats.auto}
          onSelect={() => onModeChange("auto")}
        />
        {stats.signals.map((signal) => (
          <DriverRow
            key={signal.key}
            active={stats.mode === signal.key}
            icon={SIGNAL_ICON[signal.key]}
            label={signal.label}
            detail={signal.detail}
            value={signal.pct}
            onSelect={() => onModeChange(signal.key)}
          />
        ))}
      </div>
    </section>
  );
}

/**
 * One candidate driver. The bar that used to sit here said the same thing as
 * the number beside it, so the number kept the job.
 */
function DriverRow({
  active, icon: Icon, label, detail, value, onSelect,
}: {
  active: boolean;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  detail: string;
  value: number | null;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onSelect}
      className={cn(
        "flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-[7px] text-left",
        "transition-colors duration-150",
        active ? "bg-selected" : "hover:bg-hover",
      )}
    >
      <Icon className={cn("size-3.5 shrink-0", active ? "text-accent" : "text-ink-4")} />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-1.5">
          <span className={cn("truncate text-[12.5px]", active ? "font-medium text-ink" : "text-ink-2")}>
            {label}
          </span>
          {/* The chosen driver says so in words — never in colour alone. */}
          {active && <span className="shrink-0 text-[11px] text-ink-3">driving</span>}
        </span>
        <span className="block truncate text-[11px] text-ink-4 tnum">{detail}</span>
      </span>
      <span className={cn("w-9 shrink-0 text-right text-[11.5px] tnum", value == null ? "text-ink-4" : "text-ink-2")}>
        {value == null ? "—" : pct(value)}
      </span>
    </button>
  );
}
