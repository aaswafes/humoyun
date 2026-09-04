"use client";

import * as React from "react";
import { BookOpen, Plus, Repeat2, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import { dayNameOf, todayISO } from "@/lib/date";
import { buildLogIndex, cadenceLabel, habitStreakOn, NO_COUNTS } from "@/lib/habits";
import type { Goal } from "@/lib/types";
import { Button, IconButton, Progress } from "@/components/ui/primitives";
import { MenuItem, MenuLabel, Popover } from "@/components/ui/overlays";
import { MiniEmpty } from "@/components/ui/form";
import { SubLabel } from "./goal-fold";
import type { GoalStats } from "./goal-model";
import { useGoalMeta } from "./use-goal-actions";

/**
 * A goal is not only its tasks. A reading plan or a habit can be the thing
 * that actually moves it — and once they are linked, their activity is what
 * keeps the goal off the stalled list.
 */
export function GoalLinks({ goal, stats }: { goal: Goal; stats: GoalStats }) {
  const books = useStore((s) => s.books);
  const habits = useStore((s) => s.habits);
  const habitLogs = useStore((s) => s.habitLogs);
  const weekStart = useStore((s) => s.profile?.week_start ?? 1);
  const { toggleLink } = useGoalMeta();

  const meta = stats.meta;
  const today = todayISO();

  const linkedBooks = React.useMemo(
    () => meta.book_ids.map((id) => books.find((b) => b.id === id)).filter((b): b is NonNullable<typeof b> => !!b),
    [meta.book_ids, books],
  );
  const linkedHabits = React.useMemo(
    () => meta.habit_ids.map((id) => habits.find((h) => h.id === id)).filter((h): h is NonNullable<typeof h> => !!h),
    [meta.habit_ids, habits],
  );
  const logIndex = React.useMemo(() => buildLogIndex(habitLogs), [habitLogs]);

  const empty = !linkedBooks.length && !linkedHabits.length;

  return (
    <section>
      <div className="flex items-center gap-2">
        <SubLabel>Also connected</SubLabel>
        <span className="text-[11px] text-ink-4 tnum">
          {linkedBooks.length + linkedHabits.length}
        </span>
        <div className="flex-1" />

        <Popover
          align="end"
          className="max-h-[320px] w-[268px] overflow-y-auto"
          trigger={
            <Button size="xs" variant="ghost">
              <Plus className="size-3.5" />
              Link
            </Button>
          }
        >
          {(close) => (
            <>
              <MenuLabel>Books</MenuLabel>
              {books.length === 0 && (
                <p className="px-2 pb-1.5 text-[12px] text-ink-4">No books on the shelf yet.</p>
              )}
              {books.map((book) => (
                <MenuItem
                  key={book.id}
                  icon={BookOpen}
                  checked={meta.book_ids.includes(book.id)}
                  onClick={() => toggleLink(goal, "book_ids", book.id)}
                >
                  <span className="block truncate">{book.title}</span>
                </MenuItem>
              ))}

              <MenuLabel>Habits</MenuLabel>
              {habits.filter((h) => !h.archived).length === 0 && (
                <p className="px-2 pb-1.5 text-[12px] text-ink-4">No habits running yet.</p>
              )}
              {habits.filter((h) => !h.archived).map((habit) => (
                <MenuItem
                  key={habit.id}
                  icon={Repeat2}
                  checked={meta.habit_ids.includes(habit.id)}
                  onClick={() => toggleLink(goal, "habit_ids", habit.id)}
                >
                  <span className="block truncate">{habit.name}</span>
                </MenuItem>
              ))}

            </>
          )}
        </Popover>
      </div>

      {empty ? (
        <MiniEmpty className="mt-1">
          Nothing else points here yet. A book or a habit keeps this goal alive
          between tasks.
        </MiniEmpty>
      ) : (
        <div className="mt-1.5 space-y-0.5">
          {linkedBooks.map((book) => {
            const done = book.total_pages > 0 ? book.current_page / book.total_pages : 0;
            return (
              <LinkRow
                key={book.id}
                icon={BookOpen}
                title={book.title}
                detail={`${book.current_page}/${book.total_pages} pages`}
                tint={book.color}
                value={done}
                onUnlink={() => toggleLink(goal, "book_ids", book.id)}
                unlinkLabel={`Unlink ${book.title}`}
              />
            );
          })}

          {linkedHabits.map((habit) => {
            const counts = logIndex.get(habit.id) ?? NO_COUNTS;
            const streak = habitStreakOn(habit, counts, today, weekStart);
            return (
              <LinkRow
                key={habit.id}
                icon={Repeat2}
                title={habit.name}
                detail={`${cadenceLabel(habit, (i) => dayNameOf(i, "min"))} · ${streak} day streak`}
                tint={habit.color}
                onUnlink={() => toggleLink(goal, "habit_ids", habit.id)}
                unlinkLabel={`Unlink ${habit.name}`}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}

function LinkRow({
  icon: Icon, title, detail, tint, value, onUnlink, unlinkLabel,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  detail: string;
  tint: Goal["color"];
  value?: number;
  onUnlink: () => void;
  unlinkLabel: string;
}) {
  return (
    <div className="group/link flex items-center gap-2 rounded-md px-1.5 py-[6px] transition-colors duration-150 hover:bg-hover">
      <span className={cn(`tint-${tint}`, "grid size-5 shrink-0 place-items-center rounded-[5px]")}
        style={{ background: "var(--tint-soft)" }}
      >
        <Icon className="size-3 text-[var(--tint-ink)]" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] text-ink">{title}</span>
        <span className="block truncate text-[11px] text-ink-3 tnum">{detail}</span>
      </span>
      {value != null && (
        <span className="w-12 shrink-0">
          <Progress value={value * 100} tint={tint} height={3} />
        </span>
      )}
      <IconButton
        label={unlinkLabel}
        size="sm"
        className="shrink-0 opacity-0 transition-opacity focus-visible:opacity-100 group-hover/link:opacity-100"
        onClick={onUnlink}
      >
        <X />
      </IconButton>
    </div>
  );
}
