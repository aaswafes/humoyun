"use client";

import * as React from "react";
import { BookOpen, Clock, Flame, Hand, Moon, Timer, Trash2, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import { formatTime } from "@/lib/date";
import { UMR_META, type UmrEntry, type UmrSource } from "@/lib/umr";
import { IconButton } from "@/components/ui/primitives";
import { MiniEmpty } from "@/components/ui/form";
import { fmtMin } from "./derive";

// =========================================================
// Everything that made up a day, in order, with where each minute came from.
//
// The icon is not decoration: it says whether a figure was measured by a timer
// or declared by hand, which is the difference between a fact and a claim.
// =========================================================

const SOURCE_ICON: Record<UmrSource, LucideIcon> = {
  session: Timer,
  task: Clock,
  prayer: BookOpen,
  habit: Flame,
  sleep: Moon,
  manual: Hand,
};

const SOURCE_WORD: Record<UmrSource, string> = {
  session: "timed",
  task: "recorded on a task",
  prayer: "declared for a prayer",
  habit: "from a habit",
  sleep: "from the day log",
  manual: "logged by hand",
};

export function UmrEntryList({
  entries, hour12, className, emptyLabel = "Nothing recorded yet.",
}: {
  entries: UmrEntry[];
  hour12: boolean;
  className?: string;
  emptyLabel?: string;
}) {
  const remove = useStore((s) => s.remove);

  const sorted = React.useMemo(
    () => [...entries].sort((a, b) => {
      // Entries with a clock time lead, in order; the rest follow by size.
      if (a.startMin != null && b.startMin != null) return a.startMin - b.startMin;
      if (a.startMin != null) return -1;
      if (b.startMin != null) return 1;
      return b.minutes - a.minutes;
    }),
    [entries],
  );

  if (!sorted.length) return <MiniEmpty className={className}>{emptyLabel}</MiniEmpty>;

  return (
    <ul className={cn("divide-y divide-line", className)}>
      {sorted.map((e) => {
        const Icon = SOURCE_ICON[e.source];
        const meta = e.category ? UMR_META[e.category] : null;
        return (
          <li key={e.id} className="group/entry flex items-center gap-2.5 py-1.5">
            <span
              className={cn(meta && `tint-${meta.tint}`, "grid size-5 shrink-0 place-items-center")}
              title={SOURCE_WORD[e.source]}
            >
              <Icon
                className="size-3.5"
                style={{ color: meta ? "var(--tint)" : "var(--ink-4)" }}
                aria-hidden
              />
            </span>

            <span className="w-[52px] shrink-0 text-[11.5px] text-ink-4 tnum">
              {e.startMin != null ? formatTime(e.startMin, hour12) : "—"}
            </span>

            <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{e.label}</span>

            <span className={cn("shrink-0 text-[11px]", meta ? "text-ink-3" : "text-ink-4")}>
              {meta ? meta.label : "unset"}
            </span>

            <span className="w-[56px] shrink-0 text-right text-[12.5px] text-ink-2 tnum">
              {fmtMin(e.minutes)}
            </span>

            {/* Only a hand-logged row can be deleted here. Everything else is a
                view of a row that lives somewhere else, and deleting it from
                this list would be deleting a session or a prayer by surprise. */}
            <span className="w-6 shrink-0">
              {e.source === "manual" && e.sourceId && (
                <IconButton
                  size="sm"
                  label={`Delete ${e.label}`}
                  onClick={() => remove("umrLogs", e.sourceId as string)}
                  className="opacity-0 transition-opacity focus-visible:opacity-100 group-hover/entry:opacity-100"
                >
                  <Trash2 />
                </IconButton>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
