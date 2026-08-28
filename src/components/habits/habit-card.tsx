"use client";

import * as React from "react";
import {
  Archive, CalendarDays, ChevronLeft, ChevronRight, Flame, MoreHorizontal,
  Pencil, Trash2,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore, habitStreak } from "@/lib/store";
import { diffDays, startOfWeek, todayISO, yearOf } from "@/lib/date";
import type { Habit, HabitLog } from "@/lib/types";
import { IconButton } from "@/components/ui/primitives";
import { Popover, MenuItem, MenuSeparator } from "@/components/ui/overlays";
import { HabitIcon } from "./habit-icons";
import { Heatmap, HeatmapLegend } from "./heatmap";
import {
  bestStreak, cadenceLabel, completionRate, daysLoggedIn, habitStart,
  loggedThisWeek, targetLabel, weeklyTarget, weekWindow, type Counts,
} from "./habit-utils";

const ROW_WEEKS = 20;

export function HabitCard({
  habit, counts, logs, weekStart, expanded, onExpand, onEdit, onDelete,
}: {
  habit: Habit;
  counts: Counts;
  logs: HabitLog[];
  weekStart: number;
  expanded: boolean;
  onExpand: (id: string | null) => void;
  onEdit: (habit: Habit) => void;
  onDelete: (habit: Habit) => void;
}) {
  const toggleHabit = useStore((s) => s.toggleHabit);
  const patch = useStore((s) => s.patch);
  const toast = useStore((s) => s.toast);

  const today = todayISO();
  const streak = habitStreak(logs, habit.id, today);
  const best = Math.max(streak, bestStreak(counts));
  const rate = completionRate(habit, counts, today, 30);
  const lit = streak > 3;

  function archive() {
    patch("habits", habit.id, { archived: true });
    onExpand(null);
    toast({
      title: `${habit.name} archived`,
      description: "Its history is kept — restore it any time.",
      action: { label: "Undo", run: () => patch("habits", habit.id, { archived: false }) },
    });
  }

  return (
    <div className={cn(`tint-${habit.color}`, "group/habit rounded-lg px-2 py-3.5 transition-colors duration-150 hover:bg-hover")}>
      <div className="flex items-center gap-4">
        <div className="flex min-w-[180px] flex-1 items-center gap-3">
          <span
            className="grid size-9 shrink-0 place-items-center rounded-[10px]"
            style={{ background: "var(--tint-soft)" }}
            aria-hidden
          >
            <HabitIcon name={habit.icon} className="size-[18px] text-[var(--tint)]" />
          </span>
          <div className="min-w-0">
            <button
              onClick={() => onEdit(habit)}
              className="block max-w-full truncate text-left text-[13.5px] font-medium text-ink hover:text-accent cursor-pointer transition-colors"
            >
              {habit.name}
            </button>
            <p className="mt-0.5 truncate text-[11.5px] text-ink-3">
              {cadenceLabel(habit, weekStart)}
              {targetLabel(habit) && ` · ${targetLabel(habit)}`}
              {habit.cadence === "custom" &&
                ` · ${loggedThisWeek(counts, today, weekStart)} of ${weeklyTarget(habit)} this week`}
            </p>
          </div>
        </div>

        <div className="hidden shrink-0 items-center gap-5 sm:flex">
          <Metric label="Streak">
            <Flame
              className={cn("size-3.5 shrink-0", lit ? "text-[var(--tint)]" : "text-ink-4")}
              fill={lit ? "currentColor" : "none"}
            />
            {streak}
          </Metric>
          <Metric label="Best">{best}</Metric>
          <Metric label="30 days">{rate.pct}%</Metric>
        </div>

        <div className="hidden shrink-0 lg:block">
          <Heatmap
            habit={habit}
            counts={counts}
            startWeek={weekWindow(today, ROW_WEEKS, weekStart)}
            weeks={ROW_WEEKS}
            weekStart={weekStart}
            onToggle={(date) => toggleHabit(habit.id, date)}
          />
        </div>

        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity duration-150 focus-within:opacity-100 group-hover/habit:opacity-100">
          <IconButton
            label={expanded ? "Hide full year" : "Show full year"}
            active={expanded}
            onClick={() => onExpand(expanded ? null : habit.id)}
          >
            <CalendarDays />
          </IconButton>
          <Popover
            align="end"
            className="w-[190px]"
            trigger={<IconButton label={`${habit.name} options`}><MoreHorizontal /></IconButton>}
          >
            {(close) => (
              <>
                <MenuItem icon={Pencil} onClick={() => { onEdit(habit); close(); }}>Edit habit</MenuItem>
                <MenuItem icon={Archive} onClick={() => { archive(); close(); }}>Archive</MenuItem>
                <MenuSeparator />
                <MenuItem icon={Trash2} danger onClick={() => { onDelete(habit); close(); }}>
                  Delete forever
                </MenuItem>
              </>
            )}
          </Popover>
        </div>
      </div>

      {expanded && (
        <YearPanel
          habit={habit}
          counts={counts}
          weekStart={weekStart}
          onToggle={(date) => toggleHabit(habit.id, date)}
        />
      )}
    </div>
  );
}

function Metric({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="w-[58px] text-right">
      <div className="flex items-center justify-end gap-1 text-[14px] font-medium leading-none text-ink tnum">
        {children}
      </div>
      <div className="mt-1 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-ink-4">{label}</div>
    </div>
  );
}

/** GitHub-style full year for one habit, with its own year navigation. */
function YearPanel({
  habit, counts, weekStart, onToggle,
}: {
  habit: Habit;
  counts: Counts;
  weekStart: number;
  onToggle: (date: string) => void;
}) {
  const today = todayISO();
  const thisYear = yearOf(today);
  const firstYear = yearOf(habitStart(habit));
  const [year, setYear] = React.useState(thisYear);

  const jan1 = `${year}-01-01`;
  const dec31 = `${year}-12-31`;
  const startWeek = startOfWeek(jan1, weekStart);
  const weeks = Math.round(diffDays(startOfWeek(dec31, weekStart), startWeek) / 7) + 1;

  const end = dec31 < today ? dec31 : today;
  const logged = daysLoggedIn(counts, year);
  const rate = completionRate(habit, counts, end, Math.max(1, diffDays(end, jan1) + 1));

  const inYear = React.useMemo(() => {
    const map: Counts = new Map();
    for (const [date, count] of counts) if (date.startsWith(`${year}-`)) map.set(date, count);
    return map;
  }, [counts, year]);

  return (
    <div className="mt-3 rounded-lg bg-sunken px-4 py-3.5 anim-slide">
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-0.5">
          <IconButton
            label="Previous year"
            size="sm"
            disabled={year <= firstYear}
            onClick={() => setYear((y) => y - 1)}
          >
            <ChevronLeft />
          </IconButton>
          <span className="min-w-[46px] text-center text-[13px] font-semibold text-ink tnum">{year}</span>
          <IconButton
            label="Next year"
            size="sm"
            disabled={year >= thisYear}
            onClick={() => setYear((y) => y + 1)}
          >
            <ChevronRight />
          </IconButton>
        </div>

        <p className="text-[12px] text-ink-3">
          <span className="text-ink tnum">{logged}</span> days logged ·{" "}
          <span className="text-ink tnum">{bestStreak(inYear)}</span> day best run ·{" "}
          <span className="text-ink tnum">{rate.pct}%</span> of target
        </p>

        <HeatmapLegend habit={habit} className="ml-auto" />
      </div>

      <div className="overflow-x-auto pb-1">
        <Heatmap
          habit={habit}
          counts={counts}
          startWeek={startWeek}
          weeks={weeks}
          weekStart={weekStart}
          cellSize={12}
          showMonths
          showWeekdays
          onToggle={onToggle}
        />
      </div>
    </div>
  );
}
