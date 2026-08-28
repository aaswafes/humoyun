"use client";

import * as React from "react";
import { Flag, Layers, ListChecks, Scale, Target } from "lucide-react";
import { cn } from "@/lib/cn";
import type { Goal } from "@/lib/types";
import { Progress } from "@/components/ui/primitives";
import { explainProgress, pct, type GoalStats, type SignalKey } from "./goal-model";
import type { ProgressMode } from "./goal-meta";

const SIGNAL_ICON: Record<SignalKey, React.ComponentType<{ className?: string }>> = {
  target: Target,
  children: Layers,
  tasks: ListChecks,
  milestones: Flag,
};

/**
 * The progress panel. A single number is a claim; this shows the working —
 * every signal that exists, what each one says, and which one is in charge.
 */
export function GoalProgress({
  goal, stats, onModeChange,
}: {
  goal: Goal;
  stats: GoalStats;
  onModeChange: (mode: ProgressMode) => void;
}) {
  const progress = goal.status === "done" ? 1 : stats.overall;
  const present = stats.signals.filter((s) => s.pct != null).length;

  return (
    <div className="surface p-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="display-serif text-[32px] leading-none text-ink tnum">{pct(progress)}</div>
          <div className="mt-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">
            Overall progress
          </div>
        </div>
        {stats.pace && goal.status === "active" && (
          <div className="text-right">
            <div
              className={cn(
                "text-[13px] font-medium",
                stats.pace === "behind" ? "text-warn" : stats.pace === "ahead" ? "text-success" : "text-ink-2",
              )}
            >
              {stats.pace}
            </div>
            {stats.daysLeft != null && (
              <div className="text-[11.5px] text-ink-3 tnum">
                {stats.daysLeft >= 0 ? `${stats.daysLeft} days left` : `${-stats.daysLeft} days over`}
              </div>
            )}
          </div>
        )}
      </div>

      <Progress value={progress * 100} tint={goal.color} height={6} className="mt-3" />

      <div className="mt-3.5 pt-3.5 hairline-t">
        <div className="flex items-baseline gap-2">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">
            What drives this bar
          </h3>
        </div>
        <p className="mt-1 text-[12px] leading-snug text-ink-3">{explainProgress(stats)}</p>

        <div className="mt-2 space-y-1">
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
            tint={goal.color}
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
              tint={goal.color}
              onSelect={() => onModeChange(signal.key)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function DriverRow({
  active, icon: Icon, label, detail, value, tint, onSelect,
}: {
  active: boolean;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  detail: string;
  value: number | null;
  tint: Goal["color"];
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onSelect}
      className={cn(
        "flex w-full cursor-pointer items-center gap-2 rounded-md border px-2 py-[7px] text-left",
        "transition-[background-color,border-color] duration-150",
        active ? "border-accent-line bg-accent-soft" : "border-transparent hover:bg-hover",
      )}
    >
      <Icon className={cn("size-3.5 shrink-0", active ? "text-accent" : "text-ink-4")} />
      <span className="min-w-0 flex-1">
        <span className={cn("block truncate text-[12.5px] font-medium", active ? "text-ink" : "text-ink-2")}>
          {label}
        </span>
        <span className="block truncate text-[11px] text-ink-3 tnum">{detail}</span>
      </span>
      <span className="w-12 shrink-0">
        <Progress value={(value ?? 0) * 100} tint={value == null ? null : tint} height={3} />
      </span>
      <span className={cn("w-9 shrink-0 text-right text-[11.5px] tnum", value == null ? "text-ink-4" : "text-ink-2")}>
        {value == null ? "—" : pct(value)}
      </span>
    </button>
  );
}
