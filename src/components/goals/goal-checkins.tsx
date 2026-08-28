"use client";

import * as React from "react";
import { BellDot, Check, Trash2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { diffDays, formatDate, todayISO } from "@/lib/date";
import type { Goal } from "@/lib/types";
import { Button, IconButton, Input, SectionLabel } from "@/components/ui/primitives";
import { MiniEmpty, Select } from "@/components/ui/form";
import { fmtNum, type GoalStats } from "./goal-model";
import {
  CADENCE_LABEL, effectiveCadence, lastCheckIn, type CheckIn, type CheckInCadence,
} from "./goal-meta";
import { useGoalMeta } from "./use-goal-actions";

const CADENCE_OPTIONS: { value: CheckInCadence; label: string }[] = [
  { value: "week", label: CADENCE_LABEL.week },
  { value: "fortnight", label: CADENCE_LABEL.fortnight },
  { value: "month", label: CADENCE_LABEL.month },
  { value: "off", label: CADENCE_LABEL.off },
];

const VISIBLE = 6;

/**
 * The periodic "where does this actually stand" prompt, its history, and a
 * sparkline of the number moving. Logging a check-in is what moves `current`,
 * so the target signal always has a dated receipt behind it.
 */
export function GoalCheckIns({ goal, stats }: { goal: Goal; stats: GoalStats }) {
  const { logCheckIn, removeCheckIn, setMeta } = useGoalMeta();
  const meta = stats.meta;
  const cadence = effectiveCadence(goal, meta);
  const last = lastCheckIn(meta);
  const today = todayISO();

  const [draft, setDraft] = React.useState<string | null>(null);
  const [note, setNote] = React.useState("");
  const [showAll, setShowAll] = React.useState(false);

  const value = draft ?? String(goal.current);
  const parsed = Number(value.trim().replace(",", "."));
  const valid = value.trim() !== "" && Number.isFinite(parsed);

  const history = React.useMemo(() => [...meta.checkins].reverse(), [meta.checkins]);
  const shown = showAll ? history : history.slice(0, VISIBLE);

  function submit() {
    if (!valid) return;
    logCheckIn(goal, Math.max(0, parsed), note);
    setDraft(null);
    setNote("");
  }

  const dueLine = (() => {
    if (cadence === "off") return "Never asks — this goal keeps its own counsel.";
    if (stats.needsCheckIn) {
      const late = stats.checkInDueOn ? diffDays(today, stats.checkInDueOn) : 0;
      return late <= 0 ? "Due today." : `Asked ${late} ${late === 1 ? "day" : "days"} ago.`;
    }
    if (stats.checkInDueOn) {
      return `Next on ${formatDate(stats.checkInDueOn, { weekday: false })}, ${diffDays(stats.checkInDueOn, today)} days away.`;
    }
    return "Set a target and this goal will start asking.";
  })();

  return (
    <section>
      <div className="flex items-center gap-2">
        <SectionLabel>Check-ins</SectionLabel>
        <span className="text-[11px] text-ink-4 tnum">{meta.checkins.length}</span>
        <div className="flex-1" />
        <Select
          label="Check-in rhythm"
          size="sm"
          value={cadence}
          options={CADENCE_OPTIONS}
          onChange={(next) => setMeta(goal, { cadence: next })}
          className="w-[152px]"
        />
      </div>

      <p
        className={cn(
          "mt-1.5 flex items-center gap-1.5 text-[12px]",
          stats.needsCheckIn ? "text-warn" : "text-ink-3",
        )}
      >
        {stats.needsCheckIn && <BellDot className="size-3.5 shrink-0" />}
        {dueLine}
      </p>

      {meta.checkins.length > 1 && (
        <Sparkline goal={goal} points={meta.checkins} className="mt-3" />
      )}

      <div className="mt-3 flex items-center gap-1.5">
        <Input
          value={value}
          inputMode="decimal"
          aria-label={`Where ${goal.title || "this goal"} stands today`}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
          className="w-[76px] text-center tnum"
        />
        {goal.target != null && (
          <span className="shrink-0 text-[12px] text-ink-3 tnum">
            of {fmtNum(goal.target)}{goal.unit ? ` ${goal.unit}` : ""}
          </span>
        )}
        <Input
          value={note}
          placeholder="What happened? (optional)"
          aria-label="Check-in note"
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
          className="min-w-0 flex-1"
        />
        <Button variant="primary" size="sm" disabled={!valid} onClick={submit} className="shrink-0">
          <Check className="size-3.5" />
          Log
        </Button>
      </div>

      {history.length === 0 ? (
        <MiniEmpty className="mt-1">
          No check-ins yet. The first one sets the baseline everything else is measured from.
        </MiniEmpty>
      ) : (
        <div className="mt-2">
          {shown.map((entry, i) => {
            const previous = history[i + 1];
            const delta = previous ? entry.value - previous.value : null;
            return (
              <div
                key={entry.id}
                className="group/ci flex items-baseline gap-2 rounded-md px-1.5 py-[6px] transition-colors duration-150 hover:bg-hover"
              >
                <span className="w-[62px] shrink-0 text-[11.5px] text-ink-3 tnum">
                  {entry.date === today ? "Today" : formatDate(entry.date, { weekday: false })}
                </span>
                <span className="shrink-0 text-[13px] font-medium text-ink tnum">{fmtNum(entry.value)}</span>
                {delta != null && delta !== 0 && (
                  <span
                    className={cn(
                      "shrink-0 text-[11.5px] font-medium tnum",
                      delta > 0 ? "text-success" : "text-warn",
                    )}
                  >
                    {delta > 0 ? "+" : ""}{fmtNum(delta)}
                  </span>
                )}
                <span className="min-w-0 flex-1 truncate text-[12px] text-ink-3">{entry.note}</span>
                <IconButton
                  label={`Delete the check-in from ${formatDate(entry.date, { weekday: false })}`}
                  size="sm"
                  tone="danger"
                  className="shrink-0 opacity-0 transition-opacity focus-visible:opacity-100 group-hover/ci:opacity-100"
                  onClick={() => removeCheckIn(goal, entry.id)}
                >
                  <Trash2 />
                </IconButton>
              </div>
            );
          })}

          {history.length > VISIBLE && (
            <Button size="xs" variant="ghost" className="mt-1" onClick={() => setShowAll((v) => !v)}>
              {showAll ? "Show fewer" : `Show ${history.length - VISIBLE} older`}
            </Button>
          )}
        </div>
      )}

      {last && stats.needsCheckIn && (
        <p className="mt-1.5 px-1.5 text-[11.5px] text-ink-4 tnum">
          Last logged {formatDate(last.date, { weekday: false })} · {diffDays(today, last.date)} days ago
        </p>
      )}
    </section>
  );
}

/**
 * The number over time. Drawn in a unit box and stretched, with a
 * non-scaling stroke so the line keeps its weight at any width.
 */
function Sparkline({
  goal, points, className,
}: {
  goal: Goal;
  points: CheckIn[];
  className?: string;
}) {
  const titleId = React.useId();
  const first = points[0];
  const last = points[points.length - 1];
  const spanDays = Math.max(1, diffDays(last.date, first.date));
  const values = points.map((p) => p.value);
  const ceiling = Math.max(goal.target ?? 0, ...values, 1);

  const xy = points.map((p) => ({
    x: (diffDays(p.date, first.date) / spanDays) * 100,
    y: 32 - (p.value / ceiling) * 32,
    point: p,
  }));

  const line = xy.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" ");
  const area = `${line} L 100 32 L 0 32 Z`;
  const targetY = goal.target ? 32 - (Math.min(goal.target, ceiling) / ceiling) * 32 : null;
  const tip = xy[xy.length - 1];

  return (
    <div className={cn(`tint-${goal.color}`, "relative", className)}>
      <svg
        viewBox="0 0 100 32"
        preserveAspectRatio="none"
        role="img"
        aria-labelledby={titleId}
        className="h-14 w-full"
      >
        <title id={titleId}>
          {`${points.length} check-ins between ${formatDate(first.date, { weekday: false })} and ${formatDate(last.date, { weekday: false })}: ${fmtNum(first.value)} to ${fmtNum(last.value)}${goal.unit ? ` ${goal.unit}` : ""}.`}
        </title>
        <path d={area} fill="var(--tint-soft)" opacity={0.7} />
        {targetY != null && (
          <path
            d={`M 0 ${targetY.toFixed(2)} L 100 ${targetY.toFixed(2)}`}
            stroke="var(--line-strong)"
            strokeWidth={1}
            strokeDasharray="3 3"
            vectorEffect="non-scaling-stroke"
            fill="none"
          />
        )}
        <path
          d={line}
          fill="none"
          stroke="var(--tint)"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <span
        aria-hidden
        className="pointer-events-none absolute size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          left: `${tip.x}%`,
          top: `${(tip.y / 32) * 100}%`,
          background: "var(--tint)",
        }}
      />
      <div className="mt-1 flex justify-between text-[10.5px] text-ink-4 tnum">
        <span>{formatDate(first.date, { weekday: false })}</span>
        {goal.target != null && <span>target {fmtNum(goal.target)}</span>}
        <span>{formatDate(last.date, { weekday: false })}</span>
      </div>
    </div>
  );
}
