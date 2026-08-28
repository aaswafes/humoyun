"use client";

import * as React from "react";
import { Archive, Minus, Plus } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import { dayNameOf } from "@/lib/date";
import type { Habit, Tint } from "@/lib/types";
import { Button, Input, SectionLabel, Segmented } from "@/components/ui/primitives";
import { Modal, TintPicker } from "@/components/ui/overlays";
import { HABIT_ICONS, HabitIcon } from "./habit-icons";
import { orderedWeekdays, weeklyTarget } from "./habit-utils";

type CadenceChoice = "daily" | "weekly" | "custom";

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

/**
 * Create / edit. Mount with a `key` per habit so the fields seed themselves
 * from whichever habit is being edited.
 */
export function HabitModal({
  habit, weekStart, onClose,
}: {
  habit: Habit | null;
  weekStart: number;
  onClose: () => void;
}) {
  const habits = useStore((s) => s.habits);
  const insert = useStore((s) => s.insert);
  const patch = useStore((s) => s.patch);
  const toast = useStore((s) => s.toast);

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

  const valid = name.trim().length > 0 && (cadence !== "weekly" || days.length > 0);

  function save() {
    if (!valid) return;
    const weekdays =
      cadence === "weekly" ? [...days].sort((a, b) => a - b) : ALL_DAYS;

    const fields = {
      name: name.trim(),
      icon,
      color,
      cadence,
      weekdays,
      times_per_week: Math.min(7, Math.max(1, perWeek)),
      target_count: Math.max(1, target),
      unit: unit.trim() || null,
    };

    if (habit) {
      patch("habits", habit.id, fields);
    } else {
      const order = habits.length ? Math.max(...habits.map((h) => h.order_index)) + 1 : 0;
      insert("habits", { ...fields, order_index: order });
      toast({ title: `${fields.name} added`, description: "Tap its pill to log today.", tone: "success" });
    }
    onClose();
  }

  function archive() {
    if (!habit) return;
    patch("habits", habit.id, { archived: true });
    toast({
      title: `${habit.name} archived`,
      description: "Its history is kept — restore it any time.",
      action: { label: "Undo", run: () => patch("habits", habit.id, { archived: false }) },
    });
    onClose();
  }

  return (
    <Modal open onClose={onClose} title={habit ? "Edit habit" : "New habit"} width={480}>
      <div className="max-h-[62vh] overflow-y-auto px-4 py-4">
        <div className={cn(`tint-${color}`, "flex items-center gap-3")}>
          <span className="grid size-10 shrink-0 place-items-center rounded-xl" style={{ background: "var(--tint-soft)" }}>
            <HabitIcon name={icon} className="size-5 text-[var(--tint)]" />
          </span>
          <Input
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") save(); }}
            placeholder="Read 10 pages"
            aria-label="Habit name"
            className="h-9 text-[14px]"
          />
        </div>

        <Field label="Colour">
          <TintPicker value={color} onChange={(t) => t && setColor(t)} />
        </Field>

        <Field label="Icon">
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
        </Field>

        <Field label="Cadence">
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
            <div className="mt-2.5 flex gap-1">
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
                    )}
                  >
                    {dayNameOf(day, "short")}
                  </button>
                );
              })}
            </div>
          )}

          {cadence === "custom" && (
            <div className="mt-2.5 flex items-center gap-2.5">
              <Stepper value={perWeek} min={1} max={7} onChange={setPerWeek} label="Times a week" />
              <span className="text-[13px] text-ink-2">times a week, any day</span>
            </div>
          )}
        </Field>

        <Field label="Daily target" hint="How many before the day counts as done">
          <div className="flex items-center gap-2.5">
            <Stepper value={target} min={1} max={50} onChange={setTarget} label="Daily target" />
            <Input
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="pages, glasses, minutes…"
              aria-label="Unit"
              className="h-8 flex-1"
            />
          </div>
        </Field>
      </div>

      <div className="flex items-center gap-2 border-t border-line px-4 py-3">
        {habit && (
          <Button variant="ghost" size="sm" onClick={archive}>
            <Archive className="size-3.5" />
            Archive
          </Button>
        )}
        <div className="flex-1" />
        <Button size="sm" onClick={onClose}>Cancel</Button>
        <Button variant="primary" size="sm" disabled={!valid} onClick={save}>
          {habit ? "Save changes" : "Create habit"}
        </Button>
      </div>
    </Modal>
  );
}

function Field({
  label, hint, children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-5">
      <div className="mb-2 flex items-baseline gap-2">
        <SectionLabel>{label}</SectionLabel>
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
