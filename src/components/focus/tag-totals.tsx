"use client";

import * as React from "react";
import { Tags } from "lucide-react";
import { useStore } from "@/lib/store";
import { formatDuration } from "@/lib/date";
import type { Tint } from "@/lib/types";
import { Button, SectionLabel } from "@/components/ui/primitives";
import { MiniEmpty } from "@/components/ui/form";
import { tagTotals, type DayGroup } from "./focus-data";

const TOP = 7;

/**
 * Where the hours went by subject rather than by clock. A session inherits its
 * task's tags, so this fills itself in as long as the tasks are tagged.
 */
export const TagTotals = React.memo(function TagTotals({
  groups, onTagLast,
}: {
  groups: DayGroup[];
  /** Opens the editor on the most recent session so the list is never a dead end. */
  onTagLast: (() => void) | null;
}) {
  const tasks = useStore((s) => s.tasks);
  const tagRows = useStore((s) => s.tags);

  const breakdown = React.useMemo(() => tagTotals(groups, tasks), [groups, tasks]);
  const tintOf = React.useMemo(() => {
    const map = new Map<string, Tint>();
    tagRows.forEach((t) => map.set(t.name.toLowerCase(), t.color));
    return map;
  }, [tagRows]);

  const shown = breakdown.totals.slice(0, TOP);
  const rest = breakdown.totals.slice(TOP);
  const peak = Math.max(1, ...shown.map((t) => t.minutes));

  return (
    <section>
      <div className="mb-2.5 flex items-baseline justify-between gap-3">
        <SectionLabel>By tag</SectionLabel>
        {breakdown.untaggedMinutes > 0 && (
          <p className="text-[11.5px] text-ink-4 tnum">
            {formatDuration(breakdown.untaggedMinutes)} untagged
          </p>
        )}
      </div>

      {!shown.length ? (
        <MiniEmpty
          action={
            onTagLast && (
              <Button variant="secondary" size="sm" onClick={onTagLast}>
                <Tags className="size-3.5" />
                Tag the last session
              </Button>
            )
          }
        >
          Tags come from the task you focused on, or straight from the stop dialog.
        </MiniEmpty>
      ) : (
        <ul className="space-y-2">
          {shown.map((row) => {
            const tint = tintOf.get(row.tag) ?? null;
            return (
              <li key={row.tag} className={tint ? `tint-${tint}` : undefined}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate text-[12.5px] text-ink-2">{row.tag}</span>
                  <span className="shrink-0 text-[11.5px] text-ink-3 tnum">
                    {formatDuration(row.minutes)}
                    <span className="text-ink-4"> · {row.sessions}</span>
                  </span>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-hover">
                  <div
                    className="h-full rounded-full transition-[width] duration-500 ease-[var(--ease-out-apple)]"
                    style={{
                      width: `${Math.max(3, (row.minutes / peak) * 100)}%`,
                      background: tint ? "var(--tint)" : "var(--accent)",
                    }}
                  />
                </div>
              </li>
            );
          })}

          {rest.length > 0 && (
            <li className="pt-0.5 text-[11.5px] text-ink-4 tnum">
              + {rest.length} more {rest.length === 1 ? "tag" : "tags"} ·{" "}
              {formatDuration(rest.reduce((sum, t) => sum + t.minutes, 0))}
            </li>
          )}
        </ul>
      )}
    </section>
  );
});
