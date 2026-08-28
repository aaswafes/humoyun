"use client";

import { ArchiveRestore, Flame, PanelRight, Trash2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import { formatDate, todayISO } from "@/lib/date";
import type { Habit } from "@/lib/types";
import { Button, IconButton } from "@/components/ui/primitives";
import { HabitIcon } from "./habit-icons";
import { normaliseOrder, useHabitMeta } from "./habit-meta";
import { bestStreak, cadenceLabel, type Counts, type Skips, NO_COUNTS } from "./habit-utils";

/**
 * The archive is a record, not a bin: it keeps the reason, the last day it was
 * done and the best run it ever had, because those are what decide whether a
 * habit comes back.
 */
export function ArchivedList({
  habits, index, skipsOf, weekStart, onOpenDetail, onDelete,
}: {
  habits: Habit[];
  index: Map<string, Counts>;
  skipsOf: (habitId: string) => Skips;
  weekStart: number;
  onOpenDetail: (id: string) => void;
  onDelete: (habit: Habit) => void;
}) {
  const patch = useStore((s) => s.patch);
  const toast = useStore((s) => s.toast);
  const { metaOf, setMeta } = useHabitMeta();
  const today = todayISO();

  function restore(habit: Habit) {
    patch("habits", habit.id, { archived: false });
    setMeta(habit.id, { archivedReason: null, archivedAt: null });
    normaliseOrder();
    toast({
      title: `${habit.name} restored`,
      description: "Every log came back with it.",
      tone: "success",
      action: { label: "Undo", run: () => patch("habits", habit.id, { archived: true }) },
    });
  }

  return (
    <div>
      {habits.map((habit, i) => {
        const counts = index.get(habit.id) ?? NO_COUNTS;
        const meta = metaOf(habit.id);
        const last = lastLogged(counts);
        const best = bestStreak(habit, counts, skipsOf(habit.id), today, weekStart);

        return (
          <div
            key={habit.id}
            className={cn(
              `tint-${habit.color}`,
              "group/arch flex items-center gap-3 rounded-lg px-2 py-3 transition-colors duration-150 hover:bg-hover",
              i > 0 && "border-t border-line",
            )}
          >
            <span
              className="grid size-8 shrink-0 place-items-center rounded-md opacity-60"
              style={{ background: "var(--tint-soft)" }}
              aria-hidden
            >
              <HabitIcon name={habit.icon} className="size-4 text-[var(--tint)]" />
            </span>

            <div className="min-w-0 flex-1">
              <button
                onClick={() => onOpenDetail(habit.id)}
                className="block max-w-full truncate text-left text-[13.5px] font-medium text-ink-2 hover:text-accent cursor-pointer transition-colors"
              >
                {habit.name}
              </button>
              <p className="mt-0.5 truncate text-[11.5px] text-ink-4 tnum">
                {cadenceLabel(habit, weekStart)} · {counts.size} days logged
                {best > 1 && <> · best run {best}</>}
                {last && <> · last on {formatDate(last, { weekday: false, year: true })}</>}
              </p>
              {meta.archivedReason && (
                <p className="mt-1 max-w-[52ch] truncate text-[12px] italic text-ink-3">
                  “{meta.archivedReason}”
                  {meta.archivedAt && (
                    <span className="not-italic text-ink-4"> — {formatDate(meta.archivedAt, { weekday: false, year: true })}</span>
                  )}
                </p>
              )}
            </div>

            {best > 2 && (
              <span className="hidden shrink-0 items-center gap-1 text-[11.5px] text-ink-4 tnum sm:flex">
                <Flame className="size-3" aria-hidden />
                {best}
              </span>
            )}

            <IconButton label={`Open ${habit.name}`} onClick={() => onOpenDetail(habit.id)}>
              <PanelRight />
            </IconButton>
            <Button size="sm" onClick={() => restore(habit)}>
              <ArchiveRestore className="size-3.5" />
              Restore
            </Button>
            <IconButton
              label={`Delete ${habit.name} forever`}
              tone="danger"
              className="transition-opacity md:opacity-0 md:focus-visible:opacity-100 md:group-hover/arch:opacity-100"
              onClick={() => onDelete(habit)}
            >
              <Trash2 />
            </IconButton>
          </div>
        );
      })}
    </div>
  );
}

function lastLogged(counts: Counts): string | null {
  let last: string | null = null;
  for (const day of counts.keys()) if (!last || day > last) last = day;
  return last;
}
