"use client";

import * as React from "react";
import {
  Archive, ArrowDown, ArrowUp, ChevronDown, CornerDownRight, Flame, Link2Off,
  MessageSquarePlus, Moon, MoreHorizontal, Pencil, PanelRight, Trash2,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import { addDays, dayNameOf, formatDate } from "@/lib/date";
import type { Habit, HabitLog } from "@/lib/types";
import { AutoTextarea, Button, IconButton, Tooltip } from "@/components/ui/primitives";
import { Popover, MenuItem, MenuLabel, MenuSeparator } from "@/components/ui/overlays";
import { HabitIcon } from "./habit-icons";
import { Heatmap } from "./heatmap";
import { DayControl, WeekDots } from "./day-control";
import { useHabitLogging } from "./habit-logging";
import { SLOT_ICON, SLOT_LABEL, type HabitMeta } from "./habit-meta";
import {
  bestStreak, cadenceLabel, completionRate, currentStreak, DAY_STATE_LABEL,
  targetLabel, weekDays, weekQuota, weekWindow, type Counts, type Skips,
} from "./habit-utils";

const ROW_WEEKS = 20;

export function HabitCard({
  habit, counts, logs, skips, meta, stackedAfter, weekStart, today,
  expanded, onExpand, onEdit, onOpenDetail, onArchive, onDelete,
  onSkip, onUnstack, onMove, canMoveUp, canMoveDown, dragHandle,
}: {
  habit: Habit;
  counts: Counts;
  /** This habit's logs only, newest first. */
  logs: HabitLog[];
  skips: Skips;
  meta: HabitMeta;
  stackedAfter: Habit | null;
  weekStart: number;
  today: string;
  expanded: boolean;
  onExpand: (id: string | null) => void;
  onEdit: (habit: Habit) => void;
  onOpenDetail: (id: string) => void;
  onArchive: (habit: Habit) => void;
  onDelete: (habit: Habit) => void;
  onSkip: (date: string, reason: string | null) => void;
  onUnstack: (habit: Habit) => void;
  onMove: (habit: Habit, direction: -1 | 1) => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  dragHandle?: React.ReactNode;
}) {
  const toggleHabit = useStore((s) => s.toggleHabit);
  const { setCount } = useHabitLogging();
  const panelId = React.useId();

  const count = counts.get(today) ?? 0;
  const skippedToday = skips.has(today);
  const streak = currentStreak(habit, counts, skips, today, weekStart);
  const best = Math.max(streak, bestStreak(habit, counts, skips, today, weekStart));
  const rate = completionRate(habit, counts, today, 30, skips);
  const lit = streak > 3;

  const days = React.useMemo(
    () => weekDays(habit, counts, skips, today, today, weekStart),
    [habit, counts, skips, today, weekStart],
  );
  const quota = habit.cadence === "custom" ? weekQuota(habit, counts, today, weekStart) : null;
  const SlotIcon = SLOT_ICON[meta.slot];

  return (
    <div className={cn(`tint-${habit.color}`, "group/habit rounded-lg px-2 py-3 transition-colors duration-150 hover:bg-hover")}>
      <div className="flex items-center gap-3">
        {/* Hover-revealed on a pointer, always there on touch, where there is
            no hover to reveal them with. */}
        <div className="flex w-7 shrink-0 justify-center transition-opacity duration-150 md:opacity-0 md:focus-within:opacity-100 md:group-hover/habit:opacity-100">
          {dragHandle}
        </div>

        <div className="flex min-w-[180px] flex-1 items-center gap-2.5">
          {stackedAfter && (
            <Tooltip content={`Right after ${stackedAfter.name}`}>
              <CornerDownRight className="size-3.5 shrink-0 text-ink-4" aria-hidden />
            </Tooltip>
          )}
          <span
            className="grid size-8 shrink-0 place-items-center rounded-md"
            style={{ background: "var(--tint-soft)" }}
            aria-hidden
          >
            <HabitIcon name={habit.icon} className="size-4 text-[var(--tint)]" />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => onOpenDetail(habit.id)}
                className="max-w-full truncate text-left text-[13.5px] font-medium text-ink hover:text-accent cursor-pointer transition-colors"
              >
                {habit.name}
              </button>
              {/* A stacked habit already says where it sits, by naming what it follows. */}
              {!stackedAfter && meta.slot !== "anytime" && (
                <Tooltip content={SLOT_LABEL[meta.slot]}>
                  <SlotIcon className="size-3 shrink-0 text-ink-4" />
                </Tooltip>
              )}
            </div>
            <p className="mt-0.5 truncate text-[11.5px] text-ink-3">
              {cadenceLabel(habit, weekStart)}
              {targetLabel(habit) && ` · ${targetLabel(habit)}`}
              {quota && ` · ${quota.done} of ${quota.target} this week`}
              {stackedAfter && ` · after ${stackedAfter.name}`}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {quota && (
            <WeekDots habit={habit} days={days} weekStart={weekStart} className="hidden sm:inline-flex" />
          )}
          <DayControl
            habit={habit}
            date={today}
            count={count}
            skipped={skippedToday}
            onCount={(next) => setCount(habit.id, today, next)}
            onUnskip={() => onSkip(today, null)}
            size="sm"
            className="w-[92px] justify-center"
          />
        </div>

        <div className="hidden shrink-0 items-center gap-5 lg:flex">
          <Metric label="Streak" hint={`${streak} scheduled days in a row`}>
            <Flame
              className={cn("size-3.5 shrink-0", lit ? "text-[var(--tint)]" : "text-ink-4")}
              fill={lit ? "currentColor" : "none"}
              aria-hidden
            />
            {streak}
          </Metric>
          <Metric label="Best" hint="Longest run so far">{best}</Metric>
          <Metric label="30 days" hint={`${rate.done} of ${rate.expected} expected`}>{rate.pct}%</Metric>
        </div>

        <div className="hidden shrink-0 xl:block">
          <Heatmap
            habit={habit}
            counts={counts}
            skips={skips}
            startWeek={weekWindow(today, ROW_WEEKS, weekStart)}
            weeks={ROW_WEEKS}
            weekStart={weekStart}
            onToggle={(date) => toggleHabit(habit.id, date)}
          />
        </div>

        <div className="flex shrink-0 items-center gap-0.5 transition-opacity duration-150 md:opacity-0 md:focus-within:opacity-100 md:group-hover/habit:opacity-100">
          <IconButton
            label={expanded ? "Hide this week" : "Show this week"}
            aria-expanded={expanded}
            aria-controls={panelId}
            active={expanded}
            onClick={() => onExpand(expanded ? null : habit.id)}
          >
            <ChevronDown className={cn("transition-transform duration-200", expanded && "rotate-180")} />
          </IconButton>
          <IconButton label={`Open ${habit.name}`} onClick={() => onOpenDetail(habit.id)}>
            <PanelRight />
          </IconButton>
          <Popover
            align="end"
            className="w-[214px]"
            trigger={<IconButton label={`${habit.name} options`}><MoreHorizontal /></IconButton>}
          >
            {(close) => (
              <>
                <MenuItem icon={PanelRight} onClick={() => { onOpenDetail(habit.id); close(); }}>
                  Open details
                </MenuItem>
                <MenuItem icon={Pencil} onClick={() => { onEdit(habit); close(); }}>Edit habit</MenuItem>
                <MenuItem
                  icon={Moon}
                  checked={skippedToday}
                  onClick={() => { onSkip(today, skippedToday ? null : ""); close(); }}
                >
                  {skippedToday ? "Undo rest day" : "Skip today"}
                </MenuItem>

                <MenuSeparator />
                <MenuLabel>Order</MenuLabel>
                <MenuItem icon={ArrowUp} disabled={!canMoveUp} onClick={() => { onMove(habit, -1); close(); }}>
                  Move up
                </MenuItem>
                <MenuItem icon={ArrowDown} disabled={!canMoveDown} onClick={() => { onMove(habit, 1); close(); }}>
                  Move down
                </MenuItem>
                {stackedAfter && (
                  <MenuItem icon={Link2Off} onClick={() => { onUnstack(habit); close(); }}>
                    Unstack from {stackedAfter.name}
                  </MenuItem>
                )}

                <MenuSeparator />
                <MenuItem icon={Archive} onClick={() => { onArchive(habit); close(); }}>Archive…</MenuItem>
                <MenuItem icon={Trash2} danger onClick={() => { onDelete(habit); close(); }}>
                  Delete forever
                </MenuItem>
              </>
            )}
          </Popover>
        </div>
      </div>

      <div id={panelId} hidden={!expanded}>
        {expanded && (
          <WeekPanel
            habit={habit}
            counts={counts}
            logs={logs}
            skips={skips}
            weekStart={weekStart}
            today={today}
            onSkip={onSkip}
            onOpenDetail={onOpenDetail}
          />
        )}
      </div>
    </div>
  );
}

function Metric({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <Tooltip content={hint}>
      <span className="block w-[58px] text-right">
        <span className="flex items-center justify-end gap-1 text-[13.5px] font-medium leading-none text-ink tnum">
          {children}
        </span>
        <span className="mt-1 block text-[10.5px] font-semibold uppercase tracking-[0.06em] text-ink-4">{label}</span>
      </span>
    </Tooltip>
  );
}

/**
 * The in-place panel: this week day by day, today's note, and the rest-day
 * switch. Everything that needs a year of context lives in the detail sheet.
 */
function WeekPanel({
  habit, counts, logs, skips, weekStart, today, onSkip, onOpenDetail,
}: {
  habit: Habit;
  counts: Counts;
  logs: HabitLog[];
  skips: Skips;
  weekStart: number;
  today: string;
  onSkip: (date: string, reason: string | null) => void;
  onOpenDetail: (id: string) => void;
}) {
  const { setCount, setNote } = useHabitLogging();
  const days = weekDays(habit, counts, skips, today, today, weekStart);
  const todayLog = logs.find((l) => l.date === today);
  const [note, setNoteDraft] = React.useState(todayLog?.note ?? "");

  const recentNotes = React.useMemo(() => {
    const from = addDays(today, -27);
    return logs.filter((l) => l.note && l.date >= from).slice(0, 4);
  }, [logs, today]);

  const quota = habit.cadence === "custom" ? weekQuota(habit, counts, today, weekStart) : null;

  return (
    <div className="mt-3 rounded-lg bg-sunken px-3.5 py-3 anim-slide">
      <div className="flex flex-wrap items-start gap-x-6 gap-y-4">
        <div>
          <div className="mb-2 flex items-baseline gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">This week</p>
            {quota && (
              <p className="text-[11.5px] text-ink-4 tnum">
                <span className="text-ink-2">{quota.done}</span> of {quota.target}
              </p>
            )}
          </div>
          <div className="flex gap-1">
            {days.map((day, i) => {
              const state = day.state;
              const label = dayNameOf((weekStart + i) % 7, "min");
              const locked = day.date > today;
              return (
                <div key={day.date} className="flex w-9 flex-col items-center gap-1">
                  <span className={cn("text-[10.5px] font-medium", day.date === today ? "text-ink-2" : "text-ink-4")}>
                    {label}
                  </span>
                  <button
                    type="button"
                    disabled={locked}
                    onClick={() => setCount(habit.id, day.date, state === "done" ? 0 : Math.max(1, habit.target_count))}
                    aria-label={`${formatDate(day.date)} · ${DAY_STATE_LABEL[state]}. ${state === "done" ? "Clear" : "Mark done"}.`}
                    className={cn(
                      "grid h-8 w-full place-items-center rounded-md text-[11.5px] font-medium tnum",
                      "transition-[background-color,box-shadow,transform] duration-150 ease-[var(--ease-out-apple)]",
                      locked
                        ? "cursor-default text-ink-4"
                        : "cursor-pointer hover:brightness-95 active:scale-95 dark:hover:brightness-110",
                      state === "done" || state === "partial" ? "text-[var(--tint-ink)]" : "text-ink-3",
                    )}
                    style={{
                      background:
                        state === "done" ? "var(--tint-soft)"
                          : state === "partial" ? "var(--tint-soft)"
                            : state === "rest" || state === "future" ? "transparent"
                              : "var(--hover)",
                      boxShadow:
                        state === "skipped" ? "inset 0 0 0 1px var(--line-strong)"
                          : state === "due" ? "inset 0 0 0 1px var(--accent-line)"
                            : state === "done" ? "inset 0 0 0 1px var(--tint)"
                              : undefined,
                    }}
                  >
                    {day.count > 0 ? day.count : state === "skipped" ? "·" : ""}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <div className="min-w-[220px] flex-1">
          <div className="mb-2 flex items-center gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">
              Note for {formatDate(today, { weekday: false })}
            </p>
            <div className="flex-1" />
            <Button
              size="xs"
              variant={skips.has(today) ? "subtle" : "ghost"}
              onClick={() => onSkip(today, skips.has(today) ? null : "")}
            >
              <Moon className="size-3" />
              {skips.has(today) ? "Rested" : "Rest day"}
            </Button>
          </div>

          <div className="rounded-md border border-line bg-raised px-2.5 py-2">
            <AutoTextarea
              value={note}
              onChange={setNoteDraft}
              onBlur={() => {
                const next = note.trim();
                if (next !== (todayLog?.note ?? "")) setNote(habit.id, today, next || null);
              }}
              placeholder="What made it easy or hard today?"
              className="text-[12.5px] text-ink placeholder:text-ink-4"
            />
          </div>

          {recentNotes.length > 0 && (
            <ul className="mt-2 space-y-1">
              {recentNotes.map((log) => (
                <li key={log.id} className="flex gap-2 text-[11.5px] leading-snug">
                  <span className="shrink-0 text-ink-4 tnum">{formatDate(log.date, { weekday: false })}</span>
                  <span className="min-w-0 flex-1 truncate text-ink-3">{log.note}</span>
                </li>
              ))}
              <li>
                <button
                  onClick={() => onOpenDetail(habit.id)}
                  className="inline-flex items-center gap-1 text-[11.5px] text-ink-4 hover:text-accent cursor-pointer transition-colors"
                >
                  <MessageSquarePlus className="size-3" />
                  All notes and history
                </button>
              </li>
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
