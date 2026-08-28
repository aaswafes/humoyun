"use client";

import { ArchiveRestore, Trash2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import type { Habit } from "@/lib/types";
import { Button, IconButton } from "@/components/ui/primitives";
import { HabitIcon } from "./habit-icons";
import { cadenceLabel, type Counts } from "./habit-utils";

export function ArchivedList({
  habits, index, weekStart, onDelete,
}: {
  habits: Habit[];
  index: Map<string, Counts>;
  weekStart: number;
  onDelete: (habit: Habit) => void;
}) {
  const patch = useStore((s) => s.patch);
  const toast = useStore((s) => s.toast);

  function restore(habit: Habit) {
    patch("habits", habit.id, { archived: false });
    toast({ title: `${habit.name} restored`, tone: "success" });
  }

  return (
    <div>
      {habits.map((habit, i) => (
        <div
          key={habit.id}
          className={cn(
            `tint-${habit.color}`,
            "group/arch flex items-center gap-3 rounded-lg px-2 py-3 transition-colors duration-150 hover:bg-hover",
            i > 0 && "border-t border-line",
          )}
        >
          <span
            className="grid size-8 shrink-0 place-items-center rounded-[9px] opacity-60"
            style={{ background: "var(--tint-soft)" }}
            aria-hidden
          >
            <HabitIcon name={habit.icon} className="size-4 text-[var(--tint)]" />
          </span>

          <div className="min-w-0 flex-1">
            <p className="truncate text-[13.5px] font-medium text-ink-2">{habit.name}</p>
            <p className="mt-0.5 truncate text-[11.5px] text-ink-4">
              {cadenceLabel(habit, weekStart)} · {index.get(habit.id)?.size ?? 0} days logged
            </p>
          </div>

          <Button size="sm" onClick={() => restore(habit)}>
            <ArchiveRestore className="size-3.5" />
            Restore
          </Button>
          <IconButton
            label={`Delete ${habit.name} forever`}
            tone="danger"
            className="opacity-0 transition-opacity focus-visible:opacity-100 group-hover/arch:opacity-100"
            onClick={() => onDelete(habit)}
          >
            <Trash2 />
          </IconButton>
        </div>
      ))}
    </div>
  );
}
