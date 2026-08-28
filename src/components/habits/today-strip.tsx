"use client";

import { Check, CornerDownRight, Minus, Moon, MoreHorizontal, PanelRight, Plus } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/date";
import type { Habit } from "@/lib/types";
import { SectionLabel } from "@/components/ui/primitives";
import { MenuItem, Popover } from "@/components/ui/overlays";
import { HabitIcon } from "./habit-icons";
import { useHabitLogging } from "./habit-logging";
import {
  metaFor, slotOf, SLOT_ICON, SLOT_LABEL, SLOTS, type HabitMetaMap, type Slot,
} from "./habit-meta";
import { isComplete, scheduledOn, type Counts, type Skips, NO_COUNTS } from "./habit-utils";

/**
 * Everything due today, in the order the day actually happens: morning first,
 * and a stacked habit directly under the one it follows.
 *
 * Each row is a pill split in two — the body logs, the trailing button opens
 * the rest of the actions — because an interactive row may not swallow buttons.
 */
export function TodayStrip({
  habits, index, meta, skipsOf, date, weekStart, onCreate, onOpenDetail, onSkip,
}: {
  /** Already in stack order. */
  habits: Habit[];
  index: Map<string, Counts>;
  meta: HabitMetaMap;
  skipsOf: (habitId: string) => Skips;
  date: string;
  weekStart: number;
  onCreate: () => void;
  onOpenDetail: (id: string) => void;
  onSkip: (habitId: string, date: string, reason: string | null) => void;
}) {
  const scheduled = scheduledOn(habits, index, date, weekStart);
  // A rested habit is not a miss waiting to happen, so it leaves the queue.
  const rested = scheduled.filter((h) => skipsOf(h.id).has(date));
  const due = scheduled.filter((h) => !skipsOf(h.id).has(date));
  const done = due.filter((h) => isComplete(h, (index.get(h.id) ?? NO_COUNTS).get(date))).length;

  // Only worth splitting into slots once the day genuinely has more than one.
  const present = new Set(habits.map((h) => h.id));
  const slotFor = (habit: Habit) => slotOf(habit.id, meta, present);
  const seen = new Set<Slot>();
  for (const habit of due) seen.add(slotFor(habit));
  const usedSlots = SLOTS.filter((s) => seen.has(s));
  const grouped = usedSlots.length > 1;

  return (
    <section className="mb-8">
      <div className="mb-2.5 flex items-baseline gap-2">
        <SectionLabel>Due today</SectionLabel>
        <span className="text-[11.5px] text-ink-4">{formatDate(date)}</span>
        <div className="flex-1" />
        {due.length > 0 && (
          <span className="text-[12px] text-ink-3 tnum">
            {done}<span className="text-ink-4"> / {due.length}</span>
          </span>
        )}
      </div>

      {due.length === 0 ? (
        <button
          onClick={onCreate}
          className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] text-ink-3 hover:bg-hover hover:text-ink-2 cursor-pointer transition-colors"
        >
          <Plus className="size-4" />
          {habits.length
            ? "Nothing is scheduled today — add a habit that runs daily."
            : "Add your first habit."}
        </button>
      ) : grouped ? (
        <div className="space-y-3">
          {usedSlots.map((slot) => {
            const SlotIcon = SLOT_ICON[slot];
            const inSlot = due.filter((h) => slotFor(h) === slot);
            return (
              <div key={slot}>
                <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-ink-4">
                  <SlotIcon className="size-3" aria-hidden />
                  {SLOT_LABEL[slot]}
                </p>
                <PillRow
                  habits={inSlot}
                  index={index}
                  meta={meta}
                  skipsOf={skipsOf}
                  date={date}
                  onOpenDetail={onOpenDetail}
                  onSkip={onSkip}
                />
              </div>
            );
          })}
        </div>
      ) : (
        <PillRow
          habits={due}
          index={index}
          meta={meta}
          skipsOf={skipsOf}
          date={date}
          onOpenDetail={onOpenDetail}
          onSkip={onSkip}
        />
      )}

      {rested.length > 0 && (
        <p className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[11.5px] text-ink-4">
          <Moon className="size-3" aria-hidden />
          Resting today:
          {rested.map((habit) => (
            <button
              key={habit.id}
              onClick={() => onSkip(habit.id, date, null)}
              className="rounded-full border border-dashed border-line px-2 py-0.5 text-ink-3 hover:border-line-strong hover:text-ink-2 cursor-pointer transition-colors"
            >
              {habit.name} · undo
            </button>
          ))}
        </p>
      )}
    </section>
  );
}

function PillRow({
  habits, index, meta, skipsOf, date, onOpenDetail, onSkip,
}: {
  habits: Habit[];
  index: Map<string, Counts>;
  meta: HabitMetaMap;
  skipsOf: (habitId: string) => Skips;
  date: string;
  onOpenDetail: (id: string) => void;
  onSkip: (habitId: string, date: string, reason: string | null) => void;
}) {
  const ids = new Set(habits.map((h) => h.id));
  return (
    <div className="flex flex-wrap gap-2">
      {habits.map((habit) => {
        const after = metaFor(meta, habit.id).after;
        return (
        <HabitPill
          key={habit.id}
          habit={habit}
          count={(index.get(habit.id) ?? NO_COUNTS).get(date) ?? 0}
          date={date}
          stacked={!!after && ids.has(after)}
          skipped={skipsOf(habit.id).has(date)}
          onOpenDetail={() => onOpenDetail(habit.id)}
          onSkip={(reason) => onSkip(habit.id, date, reason)}
        />
        );
      })}
    </div>
  );
}

function HabitPill({
  habit, count, date, stacked, skipped, onOpenDetail, onSkip,
}: {
  habit: Habit;
  count: number;
  date: string;
  stacked: boolean;
  skipped: boolean;
  onOpenDetail: () => void;
  onSkip: (reason: string | null) => void;
}) {
  const { setCount } = useHabitLogging();
  const target = Math.max(1, habit.target_count);
  const complete = count >= target;
  const pct = Math.min(100, (count / target) * 100);

  return (
    <div
      className={cn(
        `tint-${habit.color}`,
        "group relative flex h-9 items-stretch overflow-hidden rounded-full border transition-colors duration-200",
        complete ? "border-[var(--tint)]" : "border-line hover:border-[var(--tint)]",
      )}
    >
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 transition-[width] duration-[260ms] ease-[var(--ease-out-apple)]"
        style={{ width: `${pct}%`, background: "var(--tint-soft)" }}
      />

      {/* Body: one press logs the next unit, and the last press clears the day. */}
      <button
        onClick={() => setCount(habit.id, date, complete ? 0 : count + 1)}
        aria-label={
          complete
            ? `${habit.name}, done. Clear today.`
            : `${habit.name}, ${count} of ${target} today. Log one.`
        }
        className={cn(
          "relative flex items-center gap-1.5 pl-2.5 pr-2 cursor-pointer",
          "transition-transform duration-200 ease-[var(--ease-out-apple)] active:scale-[0.97]",
        )}
      >
        {stacked && <CornerDownRight className="size-3 shrink-0 text-ink-4" aria-hidden />}
        <HabitIcon
          name={habit.icon}
          className={cn("size-4 shrink-0 transition-colors duration-150", count > 0 ? "text-[var(--tint)]" : "text-ink-3")}
        />
        <span className={cn("text-[13px] font-medium", complete ? "text-[var(--tint-ink)]" : "text-ink")}>
          {habit.name}
        </span>
        {target > 1 && <span className="text-[11.5px] text-ink-3 tnum">{count}/{target}</span>}
        {complete && <Check className="size-3.5 shrink-0 stroke-[2.5] text-[var(--tint)] anim-pop" />}
      </button>

      <Popover
        align="end"
        className="w-[186px]"
        trigger={
          <button
            aria-label={`${habit.name} options`}
            title={`${habit.name} options`}
            className="relative grid w-7 shrink-0 place-items-center border-l border-line text-ink-4 hover:bg-hover hover:text-ink-2 cursor-pointer transition-colors"
          >
            <MoreHorizontal className="size-3.5" />
          </button>
        }
      >
        {(close) => (
          <>
            <MenuItem icon={PanelRight} onClick={() => { onOpenDetail(); close(); }}>Open details</MenuItem>
            {target > 1 && (
              <MenuItem icon={Minus} disabled={count <= 0} onClick={() => { setCount(habit.id, date, count - 1); close(); }}>
                Take one off
              </MenuItem>
            )}
            <MenuItem
              icon={Moon}
              checked={skipped}
              onClick={() => { onSkip(skipped ? null : ""); close(); }}
            >
              {skipped ? "Undo rest day" : "Skip today"}
            </MenuItem>
          </>
        )}
      </Popover>
    </div>
  );
}
