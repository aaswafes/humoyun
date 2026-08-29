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
import { VisuallyHidden } from "@/components/ui/form";
import { Popover, MenuItem, MenuLabel, MenuSeparator } from "@/components/ui/overlays";
import { HabitIcon } from "./habit-icons";
import { Heatmap } from "./heatmap";
import { DayControl } from "./day-control";
import { useHabitLogging } from "./habit-logging";
import { SLOT_ICON, SLOT_LABEL, type HabitMeta } from "./habit-meta";
import {
  cadenceLabel, currentStreak, DAY_STATE_LABEL, targetLabel, weekDays,
  weekQuota, weekWindow, type Counts, type Skips,
} from "./habit-utils";

const ROW_WEEKS = 20;

/**
 * One habit, one line: its name, what it asks of you, today's control and the
 * run you are on. Best streak, the 30-day rate and the full year live in the
 * detail sheet — they are worth reading one habit at a time, not six.
 */
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
  const lit = streak > 3;

  // A weekly quota already says "3× a week", so it is stated as progress
  // instead of twice — once as the rule and once as the count.
  const quota = habit.cadence === "custom" ? weekQuota(habit, counts, today, weekStart) : null;
  const summary = [
    quota ? `${quota.done} of ${quota.target} this week` : cadenceLabel(habit, weekStart),
    targetLabel(habit),
  ].filter(Boolean).join(" · ");

  const SlotIcon = SLOT_ICON[meta.slot];

  return (
    <div className={cn(`tint-${habit.color}`, "group/habit rounded-lg px-2 py-2.5 transition-colors duration-150 hover:bg-hover")}>
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
            className="grid size-7 shrink-0 place-items-center rounded-md"
            style={{ background: "var(--tint-soft)" }}
            aria-hidden
          >
            <HabitIcon name={habit.icon} className="size-[15px] text-[var(--tint)]" />
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
            <p className="mt-0.5 truncate text-[11.5px] text-ink-4">{summary}</p>
          </div>
        </div>

        {/* The last twenty weeks sit behind the row rather than beside it:
            texture at rest, a full-contrast grid the moment you reach for it. */}
        <div className="hidden shrink-0 opacity-50 transition-opacity duration-200 ease-[var(--ease-out-apple)] focus-within:opacity-100 group-hover/habit:opacity-100 xl:block">
          <Heatmap
            habit={habit}
            counts={counts}
            skips={skips}
            startWeek={weekWindow(today, ROW_WEEKS, weekStart)}
            weeks={ROW_WEEKS}
            weekStart={weekStart}
            cellSize={9}
            gap={2}
            onToggle={(date) => toggleHabit(habit.id, date)}
          />
        </div>

        <Tooltip content={streak === 1 ? "1 scheduled day in a row" : `${streak} scheduled days in a row`}>
          <span className="flex w-[40px] items-center justify-end gap-1 text-[12.5px] tnum">
            <Flame
              className={cn("size-3.5 shrink-0", lit ? "text-[var(--tint)]" : "text-ink-4")}
              fill={lit ? "currentColor" : "none"}
              aria-hidden
            />
            <span className={lit ? "text-ink-2" : "text-ink-3"}>{streak}</span>
            <VisuallyHidden>{" scheduled days in a row"}</VisuallyHidden>
          </span>
        </Tooltip>

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

/**
 * The in-place panel: this week day by day, today's note, and the rest-day
 * switch. It sits on spacing rather than inside a second card — the row is
 * already a surface. Everything that needs a year of context is in the sheet.
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
    <div
      className="mb-1 ml-10 mr-2 mt-3"
      style={{ animation: "hm-slide-up 200ms var(--ease-out-apple) both" }}
    >
      <div className="flex flex-wrap items-start gap-x-8 gap-y-5">
        <div>
          <div className="mb-2 flex items-baseline gap-2">
            <p className="text-[11.5px] font-medium text-ink-3">This week</p>
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
                  <span className={cn("text-[10.5px] font-medium", day.date === today ? "text-ink-3" : "text-ink-4")}>
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
            <p className="text-[11.5px] font-medium text-ink-3">
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

          <div className="rounded-md bg-sunken px-2.5 py-2">
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
