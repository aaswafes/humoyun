"use client";

import * as React from "react";
import { ArrowRight, Minus, Plus, Dot } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/date";
import { Button } from "@/components/ui/primitives";
import { VisuallyHidden } from "@/components/ui/form";
import type { DiffKind, PlanDiff, PlanDiffRow } from "./plan-diff";
import { diffSummary, rangeLabel } from "./plan-diff";

const PREVIEW_ROWS = 7;

const KIND_META: Record<DiffKind, {
  icon: React.ComponentType<{ className?: string }>;
  tone: string;
  verb: string;
}> = {
  added:   { icon: Plus,       tone: "text-success", verb: "New block" },
  removed: { icon: Minus,      tone: "text-danger",  verb: "Block removed" },
  changed: { icon: ArrowRight, tone: "text-warn",    verb: "Pages change" },
  same:    { icon: Dot,        tone: "text-ink-4",   verb: "Unchanged" },
};

function Chip({ n, mark, word, tone }: { n: number; mark: string; word: string; tone: string }) {
  if (!n) return null;
  return (
    <span
      className={cn("inline-flex items-center gap-1 text-[11.5px] font-medium tnum", tone)}
      title={`${n} ${word}`}
    >
      <span aria-hidden>{mark}</span>
      <span aria-hidden>{n}</span>
      <VisuallyHidden>{`${n} ${word}`}</VisuallyHidden>
    </span>
  );
}

function Row({ row, divided }: { row: PlanDiffRow; divided: boolean }) {
  const meta = KIND_META[row.kind];
  const Icon = meta.icon;
  return (
    <div className={cn("flex items-center gap-2 px-2 py-[5px]", divided && "hairline-t")}>
      <Icon className={cn("size-3 shrink-0", meta.tone)} aria-hidden />
      <VisuallyHidden>{meta.verb}. </VisuallyHidden>
      <span className={cn("w-[78px] shrink-0 text-[12px] tnum", row.kind === "same" ? "text-ink-4" : "text-ink-2")}>
        {formatDate(row.date)}
      </span>
      {row.kind === "changed" ? (
        <span className="flex min-w-0 flex-1 items-center gap-1.5 text-[12px] tnum">
          <span className="truncate text-ink-4 line-through">{rangeLabel(row.before)}</span>
          <ArrowRight className="size-3 shrink-0 text-ink-4" aria-hidden />
          <span className="truncate text-ink">{rangeLabel(row.after)}</span>
        </span>
      ) : (
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-[12px] tnum",
            row.kind === "removed" ? "text-ink-4 line-through" : row.kind === "added" ? "text-ink" : "text-ink-4",
          )}
        >
          {rangeLabel(row.after ?? row.before)}
        </span>
      )}
    </div>
  );
}

/**
 * The live before/after for a reschedule. Rendered under the plan controls so
 * the calendar damage is visible while the pace is still being dialled in.
 */
export function PlanDiffView({
  diff, className,
}: {
  diff: PlanDiff;
  className?: string;
}) {
  const [expanded, setExpanded] = React.useState(false);

  // Unchanged days are noise while scanning a diff — show them only on request.
  const interesting = diff.rows.filter((r) => r.kind !== "same");
  const source = interesting.length ? interesting : diff.rows;
  const visible = expanded ? source : source.slice(0, PREVIEW_ROWS);

  return (
    <div className={cn("rounded-md border border-line", className)}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-2 py-2">
        <p className="text-[12px] text-ink-2 tnum" aria-live="polite">{diffSummary(diff)}</p>
        <span className="flex items-center gap-2.5">
          <Chip n={diff.added} mark="+" word="days added" tone="text-success" />
          <Chip n={diff.changed} mark="~" word="days re-paged" tone="text-warn" />
          <Chip n={diff.removed} mark="−" word="days dropped" tone="text-danger" />
        </span>
      </div>

      {visible.length > 0 && (
        <div className="max-h-[232px] overflow-y-auto">
          {visible.map((row, i) => <Row key={row.date} row={row} divided={i > 0} />)}
        </div>
      )}

      {source.length > PREVIEW_ROWS && (
        <div className="hairline-t p-1">
          <Button
            size="sm"
            variant="ghost"
            className="w-full"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? "Show fewer days" : `Show all ${source.length} days`}
          </Button>
        </div>
      )}

      {diff.kept > 0 && (
        <p className="hairline-t px-2 py-1.5 text-[11.5px] text-ink-4 tnum">
          {diff.kept} finished {diff.kept === 1 ? "block stays" : "blocks stay"} where {diff.kept === 1 ? "it is" : "they are"}.
        </p>
      )}
    </div>
  );
}
