"use client";

import * as React from "react";
import { Archive, Minus, Plus } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import { dayNameOf } from "@/lib/date";
import type { Habit, Tint } from "@/lib/types";
import { Button, Input, Segmented } from "@/components/ui/primitives";
import { Modal, TintPicker } from "@/components/ui/overlays";
import { Field, Select } from "@/components/ui/form";
import { HABIT_ICONS, HabitIcon } from "./habit-icons";
import {
  normaliseOrder, SLOT_HINT, SLOT_ICON, SLOT_LABEL, SLOTS, useHabitMeta, type Slot,
} from "./habit-meta";
import { cadenceLabel, orderedWeekdays, weeklyTarget } from "./habit-utils";

type CadenceChoice = "daily" | "weekly" | "custom";

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const NO_LINK = "";

/**
 * Create / edit. Mount with a `key` per habit so the fields seed themselves
 * from whichever habit is being edited.
 */
export function HabitModal({
  habit, weekStart, onClose, onArchive,
}: {
  habit: Habit | null;
  weekStart: number;
  onClose: () => void;
  onArchive: (habit: Habit) => void;
}) {
  const habits = useStore((s) => s.habits);
  const insert = useStore((s) => s.insert);
  const patch = useStore((s) => s.patch);
  const toast = useStore((s) => s.toast);
  const { metaOf, setMeta } = useHabitMeta();
  const existing = habit ? metaOf(habit.id) : null;

  const [name, setName] = React.useState(habit?.name ?? "");
  const [icon, setIcon] = React.useState(habit?.icon ?? "check");
  const [color, setColor] = React.useState<Tint>(habit?.color ?? "emerald");
  const [cadence, setCadence] = React.useState<CadenceChoice>(habit?.cadence ?? "daily");
  const [days, setDays] = React.useState<number[]>(
    habit?.cadence === "weekly" && habit.weekdays.length ? habit.weekdays : [1, 2, 3, 4, 5],
  );
  const [perWeek, setPerWeek] = React.useState(habit?.cadence === "custom" ? weeklyTarget(habit) : 3);
  const [target, setTarget] = React.useState(habit?.target_count ?? 1);
  const [unit, setUnit] = React.useState(habit?.unit ?? "");
  const [slot, setSlot] = React.useState<Slot>(existing?.slot ?? "anytime");
  const [after, setAfter] = React.useState<string>(existing?.after ?? NO_LINK);
  const [submitted, setSubmitted] = React.useState(false);

  const nameError = !name.trim() ? "Give the habit a name." : null;
  const daysError = cadence === "weekly" && !days.length ? "Pick at least one day." : null;
  const blocker = nameError ?? daysError;
  const problemId = React.useId();
  const daysGroupId = React.useId();

  const stackOptions = React.useMemo(
    () => [
      { value: NO_LINK, label: "Nothing — it stands alone" },
      ...habits
        .filter((h) => !h.archived && h.id !== habit?.id)
        .sort((a, b) => a.order_index - b.order_index)
        .map((h) => ({ value: h.id, label: h.name, description: cadenceLabel(h, weekStart) })),
    ],
    [habits, habit?.id, weekStart],
  );

  function save() {
    if (blocker) { setSubmitted(true); return; }

    const fields = {
      name: name.trim(),
      icon,
      color,
      cadence,
      // `weekdays` always means weekday indices; only the weekly cadence narrows it.
      weekdays: cadence === "weekly" ? [...days].sort((a, b) => a - b) : ALL_DAYS,
      times_per_week: Math.min(7, Math.max(1, perWeek)),
      target_count: Math.max(1, target),
      unit: unit.trim() || null,
    };

    let id: string;
    if (habit) {
      patch("habits", habit.id, fields);
      id = habit.id;
    } else {
      id = insert("habits", { ...fields, order_index: habits.length }).id;
    }

    setMeta(id, { slot, after: after || null });
    normaliseOrder();

    if (!habit) {
      toast({ title: `${fields.name} added`, description: "Tap its pill to log today.", tone: "success" });
    }
    onClose();
  }

  return (
    <Modal open onClose={onClose} title={habit ? "Edit habit" : "New habit"} width={480}>
      <div className="max-h-[62vh] overflow-y-auto px-4 py-4">
        <Field label="Name" required error={submitted ? nameError : null}>
          {(props) => (
            <div className={cn(`tint-${color}`, "flex items-center gap-3")}>
              <span
                className="grid size-8 shrink-0 place-items-center rounded-md"
                style={{ background: "var(--tint-soft)" }}
                aria-hidden
              >
                <HabitIcon name={icon} className="size-4 text-[var(--tint)]" />
              </span>
              <Input
                {...props}
                value={name}
                autoFocus
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") save(); }}
                placeholder="Read 10 pages"
              />
            </div>
          )}
        </Field>

        {/* Swatch and icon pickers are button groups, not inputs — they get a
            labelled group rather than a <label for>, which would have no target. */}
        <Group label="Colour">
          <TintPicker value={color} onChange={(t) => t && setColor(t)} />
        </Group>

        <Group label="Icon">
          <div className="grid grid-cols-8 gap-1">
            {HABIT_ICONS.map(({ key, label, Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => setIcon(key)}
                aria-label={label}
                aria-pressed={icon === key}
                title={label}
                className={cn(
                  "grid size-8 place-items-center rounded-md cursor-pointer transition-colors duration-150",
                  icon === key ? "bg-accent-soft text-accent" : "text-ink-3 hover:bg-hover hover:text-ink",
                )}
              >
                <Icon className="size-4" />
              </button>
            ))}
          </div>
        </Group>

        <Group label="Cadence">
          <Segmented<CadenceChoice>
            value={cadence}
            onChange={setCadence}
            options={[
              { value: "daily", label: "Every day" },
              { value: "weekly", label: "Set days" },
              { value: "custom", label: "Times a week" },
            ]}
          />

          {cadence === "weekly" && (
            <>
              <div
                id={daysGroupId}
                role="group"
                aria-label="Days of the week"
                aria-describedby={submitted && daysError ? problemId : undefined}
                className="mt-2.5 flex gap-1"
              >
                {orderedWeekdays(weekStart).map((day) => {
                  const on = days.includes(day);
                  return (
                    <button
                      key={day}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setDays((prev) => (on ? prev.filter((d) => d !== day) : [...prev, day]))}
                      className={cn(
                        "h-8 flex-1 rounded-md text-[12px] font-medium cursor-pointer transition-colors duration-150",
                        on ? "bg-accent text-accent-ink" : "bg-hover text-ink-2 hover:bg-active",
                        submitted && daysError && "ring-1 ring-danger",
                      )}
                    >
                      {dayNameOf(day, "short")}
                    </button>
                  );
                })}
              </div>
              {submitted && daysError && (
                <p className="mt-1 text-[11.5px] text-danger">{daysError}</p>
              )}
            </>
          )}

          {cadence === "custom" && (
            <div className="mt-2.5 flex items-center gap-2.5">
              <Stepper value={perWeek} min={1} max={7} onChange={setPerWeek} label="Times a week" />
              <span className="text-[13px] text-ink-2">times a week, any day you like</span>
            </div>
          )}
        </Group>

        <Group label="Daily target" hint="How many before the day counts as done">
          <div className="flex items-end gap-2.5">
            <Stepper value={target} min={1} max={50} onChange={setTarget} label="Daily target" />
            <Field label="Unit" className="flex-1">
              {(props) => (
                <Input
                  {...props}
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  placeholder="pages, glasses, minutes…"
                />
              )}
            </Field>
          </div>
        </Group>

        <Group label="Stacking" hint="Where it lands in the day">
          <div className="grid grid-cols-4 gap-1">
            {SLOTS.map((choice) => {
              const Icon = SLOT_ICON[choice];
              const on = slot === choice;
              return (
                <button
                  key={choice}
                  type="button"
                  aria-pressed={on}
                  title={SLOT_HINT[choice]}
                  onClick={() => setSlot(choice)}
                  className={cn(
                    "flex h-8 items-center justify-center gap-1.5 rounded-md text-[12px] font-medium",
                    "cursor-pointer transition-colors duration-150",
                    on ? "bg-accent text-accent-ink" : "bg-hover text-ink-2 hover:bg-active",
                  )}
                >
                  <Icon className="size-3.5" />
                  {SLOT_LABEL[choice]}
                </button>
              );
            })}
          </div>

          <Field
            label="Straight after"
            className="mt-2.5"
            description="Chain it onto another habit and both appear together on Today."
          >
            {(props) => (
              <Select
                {...props}
                label="Straight after"
                value={after}
                options={stackOptions}
                onChange={(id) => {
                  setAfter(id);
                  // Chaining moves it into the anchor's part of the day.
                  if (id) setSlot(metaOf(id).slot);
                }}
              />
            )}
          </Field>
        </Group>
      </div>

      <div className="flex items-center gap-2 border-t border-line px-4 py-3">
        {habit && (
          <Button variant="ghost" size="sm" onClick={() => { onArchive(habit); onClose(); }}>
            <Archive className="size-3.5" />
            Archive
          </Button>
        )}
        <div className="flex-1" />
        {submitted && blocker && (
          <p id={problemId} role="alert" className="text-[11.5px] text-danger">{blocker}</p>
        )}
        <Button size="sm" onClick={onClose}>Cancel</Button>
        <Button
          variant="primary"
          size="sm"
          onClick={save}
          aria-describedby={submitted && blocker ? problemId : undefined}
        >
          {habit ? "Save changes" : "Create habit"}
        </Button>
      </div>
    </Modal>
  );
}

/**
 * A labelled group for the button pickers. Real inputs use `Field` from the kit
 * so they get a `<label for>`; a grid of toggle buttons has nothing to point a
 * label at, so it gets `role="group"` and a heading instead.
 */
function Group({
  label, hint, children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  const id = React.useId();
  return (
    <div className="mt-5" role="group" aria-labelledby={id}>
      <div className="mb-2 flex items-baseline gap-2">
        <span id={id} className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">
          {label}
        </span>
        {hint && <span className="text-[11.5px] text-ink-4">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function Stepper({
  value, min, max, onChange, label,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  label: string;
}) {
  const step = (delta: number) => onChange(Math.max(min, Math.min(max, value + delta)));
  return (
    <div className="inline-flex h-8 shrink-0 items-center rounded-md border border-line">
      <button
        type="button"
        aria-label={`Decrease ${label.toLowerCase()}`}
        disabled={value <= min}
        onClick={() => step(-1)}
        className="grid h-full w-8 place-items-center rounded-l-md text-ink-3 hover:bg-hover hover:text-ink cursor-pointer transition-colors disabled:pointer-events-none disabled:opacity-40"
      >
        <Minus className="size-3.5" />
      </button>
      <span aria-live="polite" className="w-8 text-center text-[13.5px] font-medium text-ink tnum">{value}</span>
      <button
        type="button"
        aria-label={`Increase ${label.toLowerCase()}`}
        disabled={value >= max}
        onClick={() => step(1)}
        className="grid h-full w-8 place-items-center rounded-r-md text-ink-3 hover:bg-hover hover:text-ink cursor-pointer transition-colors disabled:pointer-events-none disabled:opacity-40"
      >
        <Plus className="size-3.5" />
      </button>
    </div>
  );
}
