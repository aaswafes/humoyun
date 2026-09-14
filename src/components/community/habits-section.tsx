"use client";

import * as React from "react";
import { Check, Ellipsis, Flame, PencilLine, Plus, Repeat, Trash2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import { addDays, dayNameOf, dayNumber, startOfWeek, todayISO, weekday } from "@/lib/date";
import {
  cadenceLabel, habitScheduledOn, habitStreakOn, isHabitComplete,
  loggedThisWeek, weeklyTarget, type HabitCounts,
} from "@/lib/habits";
import { TINTS, type Habit, type Tint } from "@/lib/types";
import { Button, EmptyState, Input, Skeleton, Tooltip } from "@/components/ui/primitives";
import { Field, Select } from "@/components/ui/form";
import { ConfirmDialog, MenuItem, MenuSeparator, Modal, Popover, TintPicker } from "@/components/ui/overlays";
import type { CommunityHabit, CommunityHabitLog, FeedMember } from "./community-types";
import { addHabit, deleteHabit, setHabitLog, updateHabit, useUserId } from "./community-data";

/**
 * `@/lib/habits` is the one implementation of "is this due today?", and the
 * contract says every surface imports it rather than reading `weekdays` for
 * itself. Its functions take a `Habit`; a joint habit carries every field they
 * actually touch, so this fills in the rest of the shape instead of growing a
 * second copy of the scheduling rules.
 */
function asHabit(h: CommunityHabit): Habit {
  return {
    id: h.id, user_id: h.created_by, name: h.name, icon: h.icon, color: h.color,
    cadence: h.cadence, weekdays: h.weekdays, times_per_week: h.times_per_week,
    target_count: h.target_count, unit: h.unit, archived: h.archived,
    order_index: 0, deleted_at: null, created_at: h.created_at, updated_at: h.updated_at,
  };
}

/** habit -> (user -> (date -> count)). Built once, read by every row. */
function buildIndex(logs: CommunityHabitLog[]) {
  const byHabit = new Map<string, Map<string, HabitCounts>>();
  for (const log of logs) {
    let byUser = byHabit.get(log.habit_id);
    if (!byUser) { byUser = new Map(); byHabit.set(log.habit_id, byUser); }
    let counts = byUser.get(log.user_id);
    if (!counts) { counts = new Map(); byUser.set(log.user_id, counts); }
    counts.set(log.date, log.count);
  }
  return byHabit;
}

const EMPTY: HabitCounts = new Map();

export function HabitsSection({
  communityId, habits, logs, members, loading, onChanged,
}: {
  communityId: string;
  habits: CommunityHabit[];
  logs: CommunityHabitLog[];
  members: FeedMember[];
  loading: boolean;
  onChanged: () => void;
}) {
  const userId = useUserId();
  const toast = useStore((s) => s.toast);
  const weekStart = useStore((s) => s.profile?.week_start ?? 1);
  const [adding, setAdding] = React.useState(false);
  const [editing, setEditing] = React.useState<CommunityHabit | null>(null);
  const [removing, setRemoving] = React.useState<CommunityHabit | null>(null);
  // Ticks have to feel instant, so the new value is held locally until the
  // reload lands. The row it writes is the only row this member may write.
  const [pending, setPending] = React.useState<Map<string, number>>(new Map());

  const today = todayISO();
  const index = React.useMemo(() => buildIndex(logs), [logs]);
  const active = React.useMemo(() => habits.filter((h) => !h.archived), [habits]);

  const week = React.useMemo(() => {
    const start = startOfWeek(today, weekStart);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [today, weekStart]);

  const key = (habitId: string, date: string) => `${habitId}|${date}`;

  async function tick(habit: CommunityHabit, date: string, next: number) {
    if (!userId) return;
    setPending((p) => new Map(p).set(key(habit.id, date), next));
    try {
      await setHabitLog(habit.id, userId, date, next);
      onChanged();
    } catch (e) {
      setPending((p) => { const c = new Map(p); c.delete(key(habit.id, date)); return c; });
      toast({ title: e instanceof Error ? e.message : "Could not save that", tone: "danger" });
    }
  }

  if (loading) {
    return <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <p className="flex-1 text-[12.5px] text-ink-3">
          One habit, everyone keeping each other to it.
        </p>
        <Button size="sm" variant="primary" onClick={() => setAdding(true)}>
          <Plus className="size-3.5" />
          New habit
        </Button>
      </div>

      {active.length === 0 ? (
        <EmptyState
          icon={Repeat}
          title="No joint habits yet"
          description="Pick something the whole community does daily — Fajr in jamaah, twenty pages, an hour of revision. Everyone ticks their own, and everyone can see it."
          action={<Button variant="primary" onClick={() => setAdding(true)}><Plus className="size-3.5" />New habit</Button>}
        />
      ) : (
        <ul className="divide-y divide-line">
          {active.map((habit) => (
            <HabitRow
              key={habit.id}
              habit={habit}
              byUser={index.get(habit.id) ?? new Map()}
              members={members}
              week={week}
              today={today}
              weekStart={weekStart}
              pending={pending}
              onTick={tick}
              onEdit={setEditing}
              onDelete={setRemoving}
            />
          ))}
        </ul>
      )}

      {adding && (
        <HabitDialog communityId={communityId} onClose={() => setAdding(false)} onDone={onChanged} />
      )}

      {editing && (
        <HabitDialog
          communityId={communityId}
          habit={editing}
          onClose={() => setEditing(null)}
          onDone={onChanged}
        />
      )}

      <ConfirmDialog
        open={removing !== null}
        title="Delete this habit?"
        description="Everyone's ticks on it go too. This cannot be undone."
        confirmLabel="Delete"
        tone="danger"
        onClose={() => setRemoving(null)}
        onConfirm={async () => {
          const habit = removing;
          if (!habit) return;
          try { await deleteHabit(habit.id); onChanged(); }
          catch (e) { toast({ title: e instanceof Error ? e.message : "Could not delete", tone: "danger" }); }
        }}
      />
    </div>
  );
}

function HabitRow({
  habit, byUser, members, week, today, weekStart, pending, onTick, onEdit, onDelete,
}: {
  habit: CommunityHabit;
  byUser: Map<string, HabitCounts>;
  members: FeedMember[];
  week: string[];
  today: string;
  weekStart: number;
  pending: Map<string, number>;
  onTick: (h: CommunityHabit, date: string, next: number) => void;
  onEdit: (h: CommunityHabit) => void;
  onDelete: (h: CommunityHabit) => void;
}) {
  const userId = useUserId();
  const shaped = React.useMemo(() => asHabit(habit), [habit]);

  // Your own counts, with any un-landed tick applied on top.
  const mine = React.useMemo(() => {
    const base = new Map(byUser.get(userId ?? "") ?? EMPTY);
    for (const [k, v] of pending) {
      const [hid, date] = k.split("|");
      if (hid !== habit.id) continue;
      if (v <= 0) base.delete(date); else base.set(date, v);
    }
    return base;
  }, [byUser, userId, pending, habit.id]);

  const streak = habitStreakOn(shaped, mine, today, weekStart);
  const target = Math.max(1, habit.target_count);

  const doneToday = members.filter((m) => {
    const counts = m.user_id === userId ? mine : byUser.get(m.user_id) ?? EMPTY;
    return isHabitComplete(shaped, counts.get(today));
  });

  const summary = habit.cadence === "custom"
    ? `${loggedThisWeek(mine, today, weekStart)} of ${weeklyTarget(shaped)} this week`
    : cadenceLabel(shaped, (i) => dayNameOf(i, "short"));

  const myCount = mine.get(today) ?? 0;
  const myDone = isHabitComplete(shaped, myCount);
  const dueToday = habitScheduledOn(shaped, today, mine, weekStart);

  return (
    <li className={cn(`tint-${habit.color}`, "group/habit py-3.5")}>
      <div className="flex items-start gap-3">
        <span
          className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-md"
          style={{ background: "var(--tint-soft)" }}
          aria-hidden
        >
          <Check className="size-[15px] text-[var(--tint)]" />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="text-[13.5px] font-medium leading-tight text-ink">{habit.name}</p>
            <p className="text-[11.5px] text-ink-4">{summary}</p>
            {streak > 0 && (
              <Tooltip content={streak === 1 ? "1 scheduled day in a row" : `${streak} scheduled days in a row`}>
                <span className="inline-flex items-center gap-0.5 text-[11.5px] text-ink-3 tnum">
                  <Flame className="size-3" aria-hidden />
                  {streak}
                </span>
              </Tooltip>
            )}

            <div className="flex-1" />

            {/* Who has it today — the whole reason it is a joint habit. */}
            <div className="flex items-center gap-1">
              {members.map((m) => {
                const counts = m.user_id === userId ? mine : byUser.get(m.user_id) ?? EMPTY;
                const done = isHabitComplete(shaped, counts.get(today));
                return (
                  <Tooltip
                    key={m.user_id}
                    content={`${m.is_self ? "You" : m.display_name} — ${done ? "done today" : "not yet"}`}
                  >
                    <span
                      className={cn(
                        "grid size-[19px] place-items-center rounded-full text-[10.5px] font-semibold leading-none",
                        done
                          ? "bg-[var(--success-soft)] text-success"
                          : "bg-hover text-ink-4",
                      )}
                    >
                      {(m.avatar?.trim() || m.display_name.charAt(0).toUpperCase())}
                    </span>
                  </Tooltip>
                );
              })}
              <span className="ml-0.5 text-[11.5px] text-ink-3 tnum">
                {doneToday.length}/{members.length}
              </span>
            </div>

            <Popover
              align="end"
              className="w-[196px]"
              trigger={
                <button
                  type="button"
                  aria-label={`Actions for ${habit.name || "habit"}`}
                  className={cn(
                    "-m-1 grid size-6 shrink-0 place-items-center rounded-md p-1 text-ink-3 cursor-pointer",
                    "opacity-0 transition-opacity duration-150 hover:bg-hover hover:text-ink",
                    "focus-visible:opacity-100 group-hover/habit:opacity-100",
                  )}
                >
                  <Ellipsis className="size-3.5" />
                </button>
              }
            >
              {(close) => (
                <>
                  <MenuItem icon={PencilLine} onClick={() => { close(); onEdit(habit); }}>
                    Edit habit
                  </MenuItem>
                  {habit.created_by === userId && (
                    <>
                      <MenuSeparator />
                      <MenuItem icon={Trash2} danger onClick={() => { close(); onDelete(habit); }}>
                        Delete
                      </MenuItem>
                    </>
                  )}
                </>
              )}
            </Popover>
          </div>

          {/* Your week. Only your own row is clickable — nobody ticks for
              anyone else, which is the difference between a shared habit and
              a shared to-do list. */}
          <div className="mt-2 flex items-center gap-1.5">
            {week.map((date) => {
              const count = mine.get(date) ?? 0;
              const done = isHabitComplete(shaped, count);
              const scheduled = habitScheduledOn(shaped, date, mine, weekStart);
              const future = date > today;
              const label = `${dayNameOf(weekday(date), "short")} ${dayNumber(date)}`;
              return (
                <button
                  key={date}
                  type="button"
                  disabled={future}
                  aria-pressed={done}
                  aria-label={`${label} — ${done ? "done" : "not done"}`}
                  title={`${label}${scheduled ? "" : " · not scheduled"}`}
                  onClick={() => onTick(habit, date, done ? 0 : target)}
                  className={cn(
                    "grid h-[26px] w-[30px] place-items-center rounded-md text-[11px] font-medium leading-none",
                    "transition-[background-color,transform] duration-150 ease-[var(--ease-out-apple)]",
                    future
                      ? "cursor-default bg-transparent text-ink-4/50"
                      : "cursor-pointer active:scale-[0.94]",
                    // Soft fill + tint-ink, never white-on-tint: --tint is
                    // mid-dark in the light theme and light in the dark one, so
                    // a white glyph is legible in exactly one of them.
                    done && "bg-[var(--tint-soft)] font-semibold text-[var(--tint-ink)] ring-1 ring-[var(--tint)]",
                    !done && !future && scheduled && "bg-hover text-ink-3 hover:bg-active",
                    !done && !future && !scheduled && "text-ink-4 hover:bg-hover",
                    date === today && !done && "ring-1 ring-accent-line",
                  )}
                >
                  {dayNameOf(weekday(date), "min")}
                </button>
              );
            })}

            <div className="flex-1" />

            <Button
              size="sm"
              variant={myDone ? "secondary" : "primary"}
              onClick={() => onTick(habit, today, myDone ? 0 : target)}
            >
              {myDone ? <><Check className="size-3.5 text-success" />Done today</> : dueToday ? "Tick today" : "Tick anyway"}
            </Button>
          </div>
        </div>
      </div>
    </li>
  );
}

const CADENCE_OPTIONS = [
  { value: "daily" as const, label: "Every day" },
  { value: "weekly" as const, label: "Certain weekdays" },
  { value: "custom" as const, label: "N times a week" },
];

/** Mounted only while open, so its fields start from the row it was handed. */
function HabitDialog({
  communityId, habit, onClose, onDone,
}: {
  communityId: string;
  habit?: CommunityHabit;
  onClose: () => void;
  onDone: () => void;
}) {
  const userId = useUserId();
  const toast = useStore((s) => s.toast);
  const weekStart = useStore((s) => s.profile?.week_start ?? 1);
  const [name, setName] = React.useState(habit?.name ?? "");
  const [cadence, setCadence] = React.useState<"daily" | "weekly" | "custom">(habit?.cadence ?? "daily");
  const [weekdays, setWeekdays] = React.useState<number[]>(habit?.weekdays ?? []);
  const [perWeek, setPerWeek] = React.useState(String(habit?.times_per_week ?? 3));
  const [targetCount, setTargetCount] = React.useState(String(habit?.target_count ?? 1));
  const [unit, setUnit] = React.useState(habit?.unit ?? "");
  const [color, setColor] = React.useState<Tint>(
    () => habit?.color ?? TINTS[Math.floor(Math.random() * TINTS.length)],
  );
  const [busy, setBusy] = React.useState(false);

  const days = React.useMemo(
    () => Array.from({ length: 7 }, (_, i) => (weekStart + i) % 7),
    [weekStart],
  );

  const perWeekNum = Number(perWeek);
  const targetNum = Number(targetCount);
  const valid =
    name.trim().length > 0
    && Number.isFinite(targetNum) && targetNum > 0
    && (cadence !== "custom" || (Number.isFinite(perWeekNum) && perWeekNum >= 1 && perWeekNum <= 7))
    && (cadence !== "weekly" || weekdays.length > 0);

  async function submit() {
    if (!valid || !userId || busy) return;
    setBusy(true);
    try {
      const fields = {
        name: name.trim(),
        icon: habit?.icon ?? "check",
        color,
        cadence,
        weekdays: cadence === "weekly" ? [...weekdays].sort() : [],
        times_per_week: cadence === "custom" ? perWeekNum : 3,
        target_count: targetNum,
        unit: unit.trim() || null,
      };
      if (habit) await updateHabit(habit.id, fields as Partial<CommunityHabit>);
      else await addHabit(communityId, userId, fields);
      onDone();
      onClose();
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Could not save the habit", tone: "danger" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={habit ? "Edit joint habit" : "New joint habit"} width={440}>
      <div className="space-y-4 p-4">
        <Field label="Habit" required>
          {(props) => (
            <Input
              {...props}
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && valid) submit(); }}
              placeholder="Fajr in jamaah"
            />
          )}
        </Field>

        <Field label="How often">
          {(props) => (
            <Select {...props} value={cadence} onChange={setCadence} options={CADENCE_OPTIONS} />
          )}
        </Field>

        {cadence === "weekly" && (
          <Field label="Which days" error={weekdays.length === 0 ? "Pick at least one" : null}>
            {() => (
              <div className="flex gap-1">
                {days.map((d) => {
                  const on = weekdays.includes(d);
                  return (
                    <button
                      key={d}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setWeekdays((w) => (on ? w.filter((x) => x !== d) : [...w, d]))}
                      className={cn(
                        "h-8 flex-1 rounded-md text-[12px] font-medium cursor-pointer transition-colors",
                        on ? "bg-accent text-accent-ink" : "bg-hover text-ink-3 hover:bg-active hover:text-ink",
                      )}
                    >
                      {dayNameOf(d, "min")}
                    </button>
                  );
                })}
              </div>
            )}
          </Field>
        )}

        {cadence === "custom" && (
          <Field label="Days per week" description="Between 1 and 7" required>
            {(props) => (
              <Input {...props} inputMode="numeric" value={perWeek} onChange={(e) => setPerWeek(e.target.value)} />
            )}
          </Field>
        )}

        <div className="flex gap-3">
          <Field label="Times per day" className="flex-1" required>
            {(props) => (
              <Input {...props} inputMode="numeric" value={targetCount} onChange={(e) => setTargetCount(e.target.value)} />
            )}
          </Field>
          <Field label="Unit" description="Optional" className="flex-1">
            {(props) => (
              <Input {...props} value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="pages" />
            )}
          </Field>
        </div>

        <Field label="Colour">
          {() => <TintPicker value={color} onChange={(t) => t && setColor(t)} />}
        </Field>

        <div className="flex justify-end gap-2 pt-1">
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!valid || busy} onClick={submit}>
            {busy ? "Saving…" : habit ? "Save" : "Add habit"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
