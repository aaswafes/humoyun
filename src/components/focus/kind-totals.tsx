"use client";

import * as React from "react";
import { Hourglass } from "lucide-react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { formatDuration } from "@/lib/date";
import { UMR_META, buildUmrIndex, parseUmrPrefs, sessionCategory } from "@/lib/umr";
import { Button } from "@/components/ui/primitives";
import { MiniEmpty } from "@/components/ui/form";
import { kindTotals, type DayGroup } from "./focus-data";

/**
 * The five-way split of focus time.
 *
 * This is the payoff of the dial asking for a kind before it starts: unlike
 * tags, which have to be inherited from a task and are often simply absent,
 * almost every sitting answers this itself.
 */
export const KindTotals = React.memo(function KindTotals({
  groups, onFixLast,
}: {
  groups: DayGroup[];
  /** Opens the editor on the most recent session, so the list is never a dead end. */
  onFixLast: (() => void) | null;
}) {
  const tasks = useStore((s) => s.tasks);
  const books = useStore((s) => s.books);
  const media = useStore((s) => s.media);
  const habits = useStore((s) => s.habits);
  const rawPrefs = useStore((s) => s.profile?.prefs);

  // The same resolver every other surface uses, so a sitting cannot be one
  // kind here and another on the Umr page.
  const index = React.useMemo(
    () => buildUmrIndex(parseUmrPrefs(rawPrefs), books, media, habits, tasks),
    [rawPrefs, books, media, habits, tasks],
  );

  const breakdown = React.useMemo(
    () => kindTotals(groups, (s) => sessionCategory(s, index)),
    [groups, index],
  );

  const peak = Math.max(1, ...breakdown.totals.map((t) => t.minutes));

  return (
    <section>
      {breakdown.unsetMinutes > 0 && (
        <p className="mb-3 text-[11.5px] text-ink-4 tnum">
          {formatDuration(breakdown.unsetMinutes)} with no kind set
        </p>
      )}

      {!breakdown.totals.length ? (
        <MiniEmpty
          action={
            onFixLast && (
              <Button variant="secondary" size="sm" onClick={onFixLast}>
                <Hourglass className="size-3.5" />
                Set the kind on the last session
              </Button>
            )
          }
        >
          Choose a kind of living on the dial before you start and every sitting lands here.
        </MiniEmpty>
      ) : (
        <>
          <ul className="space-y-2">
            {breakdown.totals.map((row) => {
              const meta = UMR_META[row.category];
              const share = breakdown.setMinutes > 0 ? row.minutes / breakdown.setMinutes : 0;
              return (
                <li key={row.category} className={`tint-${meta.tint}`}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate text-[12.5px] text-ink-2">
                      {meta.label}
                      <span className="ml-1.5 text-[11px] text-ink-4">{meta.gloss}</span>
                    </span>
                    <span className="shrink-0 text-[11.5px] text-ink-3 tnum">
                      {formatDuration(row.minutes)}
                      <span className="text-ink-4"> · {Math.round(share * 100)}%</span>
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-hover">
                    <div
                      className="h-full rounded-full transition-[width] duration-500 ease-[var(--ease-out-apple)]"
                      style={{
                        width: `${Math.max(3, (row.minutes / peak) * 100)}%`,
                        background: "var(--tint)",
                      }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>

          <p className="mt-4 text-[11.5px] leading-relaxed text-ink-4">
            This is focus time only. Prayers, habits and the hours you log by hand are counted too —{" "}
            <Link href="/umr/stats" className="text-accent hover:underline">
              Umr stats
            </Link>{" "}
            has the whole ledger.
          </p>
        </>
      )}
    </section>
  );
});
