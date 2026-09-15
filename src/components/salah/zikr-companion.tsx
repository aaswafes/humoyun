"use client";

import * as React from "react";
import { Check, Flame, Plus } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/date";
import { IconButton, Progress } from "@/components/ui/primitives";
import { MiniEmpty } from "@/components/ui/form";
import { groupNumber, shortNumber, type ZikrCounts, type ZikrDef } from "./zikr-data";
import type { Moment } from "./zikr-moment";
import { daysToReach, MILESTONES, nextMilestone, type ZikrStats } from "./zikr-stats";

/**
 * The companion.
 *
 * It answers one question — what is being said right now — and it answers it
 * from the clock, not from a list the user has to search. Each row counts in
 * place; tapping the name moves the big ring onto it.
 */
export function ZikrCompanion({
  moment, defs, counts, targets, activeId, onPick, onAdd,
}: {
  moment: Moment;
  /** The moment's zikr, already resolved against the catalog. */
  defs: ZikrDef[];
  counts: ZikrCounts;
  targets: Record<string, number>;
  activeId: string;
  onPick: (id: string) => void;
  onAdd: (id: string, by: number) => void;
}) {
  const done = defs.filter((d) => (counts[d.id] ?? 0) >= (targets[d.id] ?? d.target)).length;

  return (
    <section className="surface p-4">
      <header>
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-[13px] font-medium text-ink">{moment.title}</h2>
          <span className="tnum text-[11.5px] text-ink-4">
            {done}/{defs.length}
          </span>
        </div>
        <p className="mt-1 text-[11.5px] leading-relaxed text-ink-4">{moment.note}</p>
      </header>

      {defs.length === 0 ? (
        <MiniEmpty className="py-6">Nothing is attached to this hour.</MiniEmpty>
      ) : (
        <ul className="mt-3">
          {defs.map((def) => {
            const target = targets[def.id] ?? def.target;
            const count = counts[def.id] ?? 0;
            const complete = count >= target;
            return (
              // Not a clickable row: it holds two buttons, and a row that is
              // itself a button could not.
              <li key={def.id} className="hairline-t flex items-center gap-2 py-2">
                <button
                  type="button"
                  onClick={() => onPick(def.id)}
                  aria-pressed={def.id === activeId}
                  className={cn(
                    "-mx-1 min-w-0 flex-1 cursor-pointer rounded-md px-1 py-1 text-left",
                    "transition-colors duration-150 ease-[var(--ease-out-apple)] hover:bg-hover",
                  )}
                >
                  <span className="flex items-baseline gap-1.5">
                    <span
                      className={cn(
                        "min-w-0 flex-1 truncate text-[12.5px]",
                        def.id === activeId ? "font-medium text-ink" : "text-ink-2",
                      )}
                    >
                      {def.label}
                    </span>
                    <span className="tnum shrink-0 text-[11px] text-ink-4">
                      {count}/{target}
                    </span>
                    {complete && <Check aria-hidden className="size-3 shrink-0 text-success" />}
                  </span>
                  <Progress
                    className="mt-1.5"
                    value={Math.min(count, target)}
                    max={target}
                    tint={def.tint}
                    height={3}
                  />
                </button>
                <IconButton
                  label={`Count one ${def.label}`}
                  onClick={() => onAdd(def.id, 1)}
                  className="shrink-0"
                >
                  <Plus />
                </IconButton>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/**
 * The long view: what has been counted in all, how steady it has been, and
 * the next round number. One number per idea — the ring is the milestone,
 * the line under it is the pace.
 */
export function ZikrLifetime({ stats }: { stats: ZikrStats }) {
  const milestone = nextMilestone(stats.total);
  const perDay = stats.activeDays ? stats.total / stats.activeDays : 0;
  const eta = milestone ? daysToReach(milestone, stats.total, perDay) : null;
  const previous = milestone ? lastMilestoneBelow(milestone) : 0;
  const span = milestone ? milestone - previous : 0;
  const into = milestone ? Math.max(0, stats.total - previous) : 0;

  return (
    <section className="surface p-4">
      <h2 className="text-[13px] font-medium text-ink">A lifetime of it</h2>

      <p className="display-serif tnum mt-3 text-[32px] leading-none text-ink">
        {groupNumber(stats.total)}
      </p>
      <p className="mt-2 text-[11.5px] leading-relaxed text-ink-3">
        counted in all
        {stats.firstDate && <> since {formatDate(stats.firstDate, { year: true })}</>}
      </p>

      {milestone && (
        <div className="mt-4">
          <div className="flex items-baseline justify-between gap-2 text-[11.5px]">
            <span className="text-ink-3">Next: {groupNumber(milestone)}</span>
            <span className="tnum text-ink-4">{shortNumber(Math.max(0, milestone - stats.total))} to go</span>
          </div>
          <Progress className="mt-1.5" value={into} max={span || 1} height={4} />
          {eta !== null && (
            <p className="mt-1.5 text-[11px] text-ink-4">
              About <span className="tnum">{groupNumber(eta)}</span> more {eta === 1 ? "day" : "days"} at your
              usual pace.
            </p>
          )}
        </div>
      )}

      <dl className="hairline-t mt-4 grid grid-cols-2 gap-x-3 gap-y-3 pt-4">
        <Stat label="Streak" value={`${stats.streak}`} suffix={stats.streak === 1 ? "day" : "days"} icon={stats.streak > 0} />
        <Stat label="Longest" value={`${stats.longestStreak}`} suffix={stats.longestStreak === 1 ? "day" : "days"} />
        <Stat label="Days counted" value={groupNumber(stats.activeDays)} />
        <Stat label="Usual day" value={groupNumber(Math.round(perDay))} />
      </dl>
    </section>
  );
}

/** The rung below the one being climbed, so the bar measures this leg only. */
function lastMilestoneBelow(milestone: number): number {
  let best = 0;
  for (const m of MILESTONES) if (m < milestone) best = m;
  return best;
}

function Stat({
  label, value, suffix, icon,
}: {
  label: string;
  value: string;
  suffix?: string;
  icon?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-ink-4">{label}</dt>
      <dd className="mt-0.5 flex items-baseline gap-1">
        {icon && <Flame aria-hidden className="size-3 shrink-0 self-center text-ink-3" />}
        <span className="tnum text-[15px] font-medium text-ink">{value}</span>
        {suffix && <span className="text-[11px] text-ink-4">{suffix}</span>}
      </dd>
    </div>
  );
}
