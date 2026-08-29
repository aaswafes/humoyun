"use client";

import * as React from "react";
import { Pencil, TrendingDown, TrendingUp, Target } from "lucide-react";
import { cn } from "@/lib/cn";
import { yearOf, todayISO } from "@/lib/date";
import { Button, IconButton, Progress } from "@/components/ui/primitives";
import { Popover } from "@/components/ui/overlays";
import { VisuallyHidden } from "@/components/ui/form";
import { NumberField } from "./fields";
import { goalPace, daysPhrase } from "./pace";
import { setYearGoal } from "./library-prefs";

/** Above this a cell per book stops reading as a row of books. */
const MAX_CELLS = 24;

export function ReadingGoal({
  goal, finished, className,
}: {
  goal: number;
  finished: number;
  className?: string;
}) {
  const [draft, setDraft] = React.useState(goal || 12);
  const [seen, setSeen] = React.useState(goal);
  const year = yearOf(todayISO());

  if (seen !== goal) { setSeen(goal); setDraft(goal || 12); }

  const pace = goalPace(goal, finished);
  const summaryId = React.useId();

  const editor = (
    <Popover
      align="end"
      className="w-[196px] p-2"
      trigger={
        <IconButton label="Change the yearly reading goal" size="sm">
          <Pencil />
        </IconButton>
      }
    >
      {(close) => (
        <div className="space-y-2">
          <p className="px-0.5 text-[11.5px] text-ink-3">Books to finish in {year}</p>
          <NumberField
            label="Yearly book goal"
            value={draft}
            min={0}
            max={365}
            step={1}
            onChange={setDraft}
          />
          <div className="flex gap-1.5">
            <Button size="sm" variant="primary" className="flex-1" onClick={() => { setYearGoal(draft); close(); }}>
              Save goal
            </Button>
            {goal > 0 && (
              <Button size="sm" variant="ghost" onClick={() => { setYearGoal(0); close(); }}>
                Off
              </Button>
            )}
          </div>
        </div>
      )}
    </Popover>
  );

  if (goal <= 0) {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <Target className="size-3.5 text-ink-4" aria-hidden />
        <p className="text-[12px] text-ink-3">
          No reading goal for {year}. {finished > 0 && `You have finished ${finished} so far.`}
        </p>
        {editor}
      </div>
    );
  }

  const cells = goal <= MAX_CELLS;
  const verdict = pace.daysAhead === 0
    ? "Exactly on pace."
    : pace.daysAhead > 0
      ? `${daysPhrase(pace.daysAhead)} ahead of pace.`
      : `${daysPhrase(pace.daysAhead)} behind pace.`;

  return (
    <div className={cn("min-w-0", className)} aria-describedby={summaryId}>
      <VisuallyHidden id={summaryId}>
        {`${finished} of ${goal} books finished in ${year}, ${pace.pct}%. ${verdict}`}
      </VisuallyHidden>

      <div className="flex items-baseline gap-2">
        <h3 className="shrink-0 text-[11.5px] text-ink-3">{year} goal</h3>
        <span className="text-[12px] text-ink-3 tnum">
          <span className="font-medium text-ink">{finished}</span> / {goal} books
        </span>
        <span className="ml-auto flex items-center gap-1">
          {/* Off the pace of a yearly goal is information, not an alarm. */}
          <span className="inline-flex items-center gap-1 text-[11.5px] text-ink-3 tnum">
            {pace.daysAhead >= 0
              ? <TrendingUp className="size-3 text-ink-4" aria-hidden />
              : <TrendingDown className="size-3 text-ink-4" aria-hidden />}
            {verdict}
          </span>
          {editor}
        </span>
      </div>

      {cells ? (
        <div className="mt-2 flex flex-wrap gap-1" aria-hidden>
          {Array.from({ length: goal }, (_, i) => (
            <span
              key={i}
              className={cn(
                "h-4 w-2.5 rounded-[3px] transition-colors duration-300",
                i < finished ? "bg-accent" : "bg-hover",
              )}
            />
          ))}
          {finished > goal && (
            <span className="ml-1 self-center text-[11px] font-medium text-ink-2 tnum">
              +{finished - goal}
            </span>
          )}
        </div>
      ) : (
        <Progress value={finished} max={goal} height={5} className="mt-2.5" />
      )}

      <p className="mt-1.5 text-[11px] text-ink-4 tnum">
        {pace.remaining > 0
          ? `${pace.remaining} to go · ${pace.daysLeftInYear} days left in the year`
          : `Goal met with ${pace.daysLeftInYear} days to spare.`}
      </p>
    </div>
  );
}
