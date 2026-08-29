"use client";

import * as React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Braces, ChevronDown, ChevronRight, Copy, CornerDownRight, Flag, Filter,
  GripVertical, Layers, Trash2,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { formatDuration, formatRange, formatTime, parseTime } from "@/lib/date";
import {
  PRIORITY_LABELS, type TaskKind, type Template, type Tint,
} from "@/lib/types";
import {
  AutoTextarea, Badge, Button, IconButton, InlineInput, Input, Segmented,
} from "@/components/ui/primitives";
import { TintPicker } from "@/components/ui/overlays";
import { Field, Toggle } from "@/components/ui/form";
import { LayeredPopover, LayeredSelect } from "./layered";
import type { ItemStat } from "./insights";
import {
  hasRule, ruleCount, ruleLabel, weekdaysLabel, WEEKDAY_PRESETS,
  type ItemRule, type RichItem,
} from "./model";
import { KINDS, KIND_LABELS, PRIORITY_CLASS, dayColumns, offsetLabel } from "./util";

/** Rows carry a client-side key so drag reordering survives duplicate titles. */
export interface Row { key: string; item: RichItem }

export const emptyItem = (): RichItem => ({
  title: "",
  kind: "task",
  day_offset: 0,
  start_min: null,
  end_min: null,
  duration_min: null,
  priority: 0,
  color: null,
  icon: null,
  tags: [],
  notes: null,
  checklist: [],
  rule: null,
  ref_template_id: null,
});

/** Times and duration stay consistent: change one, the dependent one follows. */
export function reconcile(item: RichItem, change: Partial<RichItem>): RichItem {
  const next = { ...item, ...change };
  if ("start_min" in change) {
    if (next.start_min == null) next.end_min = null;
    else if (next.duration_min) next.end_min = Math.min(1439, next.start_min + next.duration_min);
    else if (next.end_min != null && next.end_min > next.start_min) next.duration_min = next.end_min - next.start_min;
  }
  if ("end_min" in change && next.start_min != null && next.end_min != null && next.end_min > next.start_min) {
    next.duration_min = next.end_min - next.start_min;
  }
  if ("duration_min" in change && next.start_min != null && next.duration_min) {
    next.end_min = Math.min(1439, next.start_min + next.duration_min);
  }
  return next;
}

// ---------------------------------------------------------
// Small field chrome
// ---------------------------------------------------------
/**
 * `Field` from the kit needs one labelable control to point `htmlFor` at. A
 * Segmented control and a row of day buttons are groups, not controls, so they
 * get a group label instead — same chrome, correct semantics.
 */
export function GroupField({
  label, children, className, hint,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
  hint?: React.ReactNode;
}) {
  const id = React.useId();
  return (
    <div className={cn("min-w-0", className)}>
      <div className="mb-1 flex items-baseline gap-1.5">
        <span id={id} className="text-[12px] font-medium text-ink-2">{label}</span>
        {hint && <span className="ml-auto text-[11px] text-ink-4">{hint}</span>}
      </div>
      <div role="group" aria-labelledby={id}>{children}</div>
    </div>
  );
}

/** Accepts "9", "9:30", "930", "9pm", "21:15"; a value it cannot read is left alone. */
export function TimeField({
  value, onChange, hour12, className, ...props
}: {
  value: number | null | undefined;
  onChange: (v: number | null) => void;
  hour12: boolean;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  const [draft, setDraft] = React.useState<string | null>(null);
  const shown = draft ?? (value != null ? formatTime(value, hour12) : "");

  function commit() {
    if (draft == null) return;
    const text = draft.trim();
    if (!text) onChange(null);
    else {
      const parsed = parseTime(text);
      if (parsed != null) onChange(parsed);
    }
    setDraft(null);
  }

  return (
    <Input
      value={shown}
      placeholder="—"
      className={cn("h-7 px-2 text-[13px] tnum", className)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); }
        if (e.key === "Escape") { setDraft(null); e.currentTarget.blur(); }
      }}
      {...props}
    />
  );
}

/**
 * The one dropdown trigger shape used for colour across this surface.
 * Forwards click and ref so `Popover` can drive it like any other trigger.
 */
export const ColourTrigger = React.forwardRef<
  HTMLButtonElement,
  { tint: Tint; label: string; name: string } & React.ButtonHTMLAttributes<HTMLButtonElement>
>(function ColourTrigger({ tint, label, name, className, ...props }, ref) {
  return (
    <Button
      ref={ref}
      variant="secondary"
      size="sm"
      aria-label={label}
      className={cn("w-full justify-between font-normal", className)}
      {...props}
    >
      <span className={cn(`tint-${tint}`, "flex min-w-0 items-center gap-2")}>
        <span className="size-3 shrink-0 rounded-full" style={{ background: "var(--tint)" }} />
        <span className="truncate capitalize text-ink">{name}</span>
      </span>
      <ChevronDown className="size-3.5 shrink-0 text-ink-3" />
    </Button>
  );
});

// ---------------------------------------------------------
// Conditions
// ---------------------------------------------------------
type WeekdayPreset = "any" | "weekdays" | "weekends" | "pick";

function presetOf(days: number[] | null | undefined): WeekdayPreset {
  if (!days || !days.length || days.length === 7) return "any";
  const key = [...new Set(days)].sort((a, b) => a - b).join(",");
  if (key === "1,2,3,4,5") return "weekdays";
  if (key === "0,6") return "weekends";
  return "pick";
}

function RuleEditor({
  rule, onChange, weekStart,
}: {
  rule: ItemRule | null | undefined;
  onChange: (next: ItemRule | null) => void;
  weekStart: number;
}) {
  const days = rule?.weekdays ?? null;
  const preset = presetOf(days);
  const [picking, setPicking] = React.useState(preset === "pick");

  function patch(change: Partial<ItemRule>) {
    const next: ItemRule = { ...(rule ?? {}), ...change };
    // An empty rule object is stored as null so the item stays clean in the file.
    onChange(hasRule(next) ? next : null);
  }

  function setPreset(value: WeekdayPreset) {
    setPicking(value === "pick");
    if (value === "any") patch({ weekdays: null });
    else if (value === "weekdays") patch({ weekdays: [...WEEKDAY_PRESETS.weekdays] });
    else if (value === "weekends") patch({ weekdays: [...WEEKDAY_PRESETS.weekends] });
    else patch({ weekdays: days?.length ? days : [1, 3, 5] });
  }

  function toggleDay(index: number) {
    const set = new Set(days ?? []);
    if (set.has(index)) set.delete(index); else set.add(index);
    patch({ weekdays: set.size ? [...set].sort((a, b) => a - b) : null });
  }

  return (
    <div className="col-span-2 space-y-2.5 rounded-md bg-sunken p-2.5">
      <GroupField
        label="Only create it on"
        hint={days?.length ? weekdaysLabel(days) : "any day"}
      >
        <div className="flex flex-wrap items-center gap-1.5">
          <Segmented
            size="sm"
            value={picking ? "pick" : preset}
            onChange={setPreset}
            options={[
              { value: "any" as WeekdayPreset, label: "Any day" },
              { value: "weekdays" as WeekdayPreset, label: "Weekdays" },
              { value: "weekends" as WeekdayPreset, label: "Weekends" },
              { value: "pick" as WeekdayPreset, label: "Pick" },
            ]}
          />
        </div>
        {(picking || preset === "pick") && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {Array.from({ length: 7 }, (_, i) => (weekStart + i) % 7).map((index) => {
              const active = (days ?? []).includes(index);
              return (
                <button
                  key={index}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggleDay(index)}
                  className={cn(
                    "h-7 min-w-[38px] cursor-pointer rounded-md px-2 text-[12px] font-medium",
                    "transition-[background-color,color] duration-150 ease-[var(--ease-out-apple)] active:scale-[0.97]",
                    active ? "bg-accent text-accent-ink" : "bg-hover text-ink-2 hover:bg-active hover:text-ink",
                  )}
                >
                  {offsetLabel((index - weekStart + 7) % 7, weekStart)}
                </button>
              );
            })}
          </div>
        )}
      </GroupField>

      <Toggle
        checked={!!rule?.skip_if_duplicate}
        onChange={(v) => patch({ skip_if_duplicate: v })}
        label="Skip if it is already on that day"
        description="Matches on the title, after variables are filled in."
      />

      <Field
        label="Skip if the day already has this tag"
        description="Leave empty to always create it."
      >
        <Input
          value={rule?.skip_if_tag ?? ""}
          placeholder="gym"
          onChange={(e) => patch({ skip_if_tag: e.target.value.replace(/^#/, "") || null })}
          className="h-7 px-2 text-[13px]"
        />
      </Field>

      <Field
        label="Skip if the day already has this many tasks"
        description="A guard against piling a plan onto a day that is already full."
      >
        <Input
          type="number"
          min={0}
          step={1}
          value={rule?.skip_if_busier_than ?? ""}
          placeholder="—"
          onChange={(e) =>
            patch({ skip_if_busier_than: e.target.value === "" ? null : Math.max(0, Number(e.target.value)) })
          }
          className="h-7 px-2 text-[13px] tnum"
        />
      </Field>
    </div>
  );
}

// ---------------------------------------------------------
// One item
// ---------------------------------------------------------
export function ItemRow({
  row, scope, weekStart, hour12, fallbackTint, open, onToggle, onChange,
  onDuplicate, onDelete, refOptions, refName, stat, onOpenRef,
}: {
  row: Row;
  scope: Template["scope"];
  weekStart: number;
  hour12: boolean;
  fallbackTint: Tint;
  open: boolean;
  onToggle: () => void;
  onChange: (change: Partial<RichItem>) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  /** Templates this item may reference without making a loop. */
  refOptions: Template[];
  /** Name of the referenced template, or null when the link is broken. */
  refName: string | null;
  stat: ItemStat | null;
  onOpenRef: (templateId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: row.key });
  const item = row.item;
  const [tagDraft, setTagDraft] = React.useState<string | null>(null);
  const [showRules, setShowRules] = React.useState(false);

  const isRef = !!item.ref_template_id;
  const rules = ruleCount(item.rule);
  const usesVariable = item.title.includes("{{") || (item.notes ?? "").includes("{{");

  const timeLabel = item.start_min != null
    ? formatRange(item.start_min, item.end_min ?? null, hour12)
    : item.duration_min
      ? formatDuration(item.duration_min)
      : null;

  return (
    <div
      ref={setNodeRef}
      id={`tpl-item-${row.key}`}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        "group/item rounded-lg",
        isDragging && "relative z-10 bg-raised shadow-md",
        open && "bg-hover",
      )}
    >
      <div className="flex items-center gap-1.5 rounded-lg px-1.5 py-1.5 transition-colors duration-120 hover:bg-hover">
        <button
          {...attributes}
          {...listeners}
          aria-label={`Reorder ${item.title || "item"}`}
          className="grid size-7 shrink-0 cursor-grab place-items-center rounded text-ink-4 opacity-0 transition-opacity hover:text-ink-2 focus-visible:opacity-100 group-hover/item:opacity-100 active:cursor-grabbing"
        >
          <GripVertical className="size-3.5" />
        </button>

        {isRef ? (
          <Layers className="size-3.5 shrink-0 text-ink-3" aria-hidden />
        ) : (
          <span
            className={cn(`tint-${item.color ?? fallbackTint}`, "size-2 shrink-0 rounded-full")}
            style={{ background: "var(--tint)" }}
            aria-hidden
          />
        )}

        <InlineInput
          value={item.title}
          onChange={(e) => onChange({ title: e.target.value })}
          placeholder={isRef ? refName ?? "Missing template" : "Untitled item"}
          aria-label="Item title"
          className="min-w-0 flex-1 text-[13.5px] text-ink placeholder:text-ink-4"
        />

        {usesVariable && (
          <Braces className="size-3 shrink-0 text-ink-4" aria-label="Uses a variable" />
        )}
        {rules > 0 && (
          <span
            className="hidden shrink-0 items-center gap-0.5 text-[11px] text-ink-3 sm:inline-flex"
            title={ruleLabel(item.rule)}
          >
            <Filter className="size-3" aria-hidden />
            <span className="tnum">{rules}</span>
          </span>
        )}
        {scope === "week" && (
          <span className="shrink-0 rounded-[5px] bg-active px-1.5 py-0.5 text-[11px] font-medium text-ink-2">
            {offsetLabel(item.day_offset ?? 0, weekStart)}
          </span>
        )}
        {timeLabel && !isRef && (
          <span className="hidden shrink-0 text-[11.5px] text-ink-3 tnum sm:inline">{timeLabel}</span>
        )}
        {(item.priority ?? 0) > 0 && !isRef && (
          <Flag className={cn("size-3 shrink-0", PRIORITY_CLASS[item.priority ?? 0])} fill="currentColor" />
        )}
        {item.tags && item.tags.length > 0 && (
          <span className="hidden shrink-0 text-[11px] text-ink-4 sm:inline">#{item.tags.length}</span>
        )}
        {stat && stat.created >= 3 && (
          <span
            /* How often a row gets finished is information, not an alarm. */
            className="hidden shrink-0 text-[11px] text-ink-4 tnum sm:inline"
            title={`Done ${stat.done} of the ${stat.created} times it was created`}
          >
            {Math.round(stat.rate * 100)}%
          </span>
        )}

        <IconButton label={open ? "Collapse item" : "Edit item details"} onClick={onToggle}>
          <ChevronRight className={cn("transition-transform duration-200", open && "rotate-90")} />
        </IconButton>
      </div>

      {open && (
        <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 px-2 pb-2.5 pt-1">
          {(refOptions.length > 0 || isRef) && (
            <Field
              label="Runs another template"
              className="col-span-2"
              description={
                isRef
                  ? "This item applies that template at the same offset instead of creating one task."
                  : "Chain a block or a routine in rather than copying its items."
              }
            >
              <LayeredSelect<string>
                size="sm"
                value={item.ref_template_id ?? ""}
                onChange={(id) => onChange({ ref_template_id: id || null })}
                options={[
                  { value: "", label: "No — this is an ordinary item" },
                  ...refOptions.map((t) => ({
                    value: t.id,
                    label: t.name || "Untitled template",
                    description: `${t.items.length} items`,
                  })),
                ]}
              />
            </Field>
          )}

          {isRef && (
            <div className="col-span-2 -mt-1 flex items-center gap-2">
              {refName ? (
                <>
                  <Badge tint={fallbackTint}>
                    <CornerDownRight className="size-3" aria-hidden />
                    {refName}
                  </Badge>
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={() => onOpenRef(item.ref_template_id as string)}
                  >
                    Open it
                  </Button>
                </>
              ) : (
                <p className="text-[11.5px] text-danger">
                  That template no longer exists — this item will be skipped.
                </p>
              )}
            </div>
          )}

          {!isRef && (
            <>
              <Field label="Kind">
                <LayeredSelect<TaskKind>
                  size="sm"
                  value={item.kind ?? "task"}
                  onChange={(k) => onChange({ kind: k })}
                  options={KINDS.map((k: TaskKind) => ({ value: k, label: KIND_LABELS[k] }))}
                />
              </Field>

              <GroupField label="Priority">
                <Segmented
                  size="sm"
                  value={String(item.priority ?? 0)}
                  onChange={(v) => onChange({ priority: Number(v) })}
                  options={PRIORITY_LABELS.map((label, i) => ({ value: String(i), label }))}
                  className="w-fit"
                />
              </GroupField>

              <Field label="Starts">
                <TimeField
                  value={item.start_min}
                  hour12={hour12}
                  onChange={(v) => onChange({ start_min: v })}
                />
              </Field>

              <Field label="Ends">
                <TimeField
                  value={item.end_min}
                  hour12={hour12}
                  onChange={(v) => onChange({ end_min: v })}
                />
              </Field>

              <Field label="Duration">
                <div className="flex items-center gap-1.5">
                  <Input
                    type="number"
                    min={0}
                    step={5}
                    aria-label="Duration in minutes"
                    value={item.duration_min ?? ""}
                    placeholder="—"
                    onChange={(e) =>
                      onChange({ duration_min: e.target.value === "" ? null : Math.max(0, Number(e.target.value)) })
                    }
                    className="h-7 px-2 text-[13px] tnum"
                  />
                  <span className="shrink-0 text-[11.5px] text-ink-3">min</span>
                </div>
              </Field>

              <GroupField label="Colour">
                <LayeredPopover
                  align="start"
                  className="w-[188px]"
                  trigger={
                    <ColourTrigger
                      tint={item.color ?? fallbackTint}
                      label="Item colour"
                      name={item.color ?? "Template colour"}
                    />
                  }
                >
                  <TintPicker value={item.color ?? null} allowNone onChange={(t) => onChange({ color: t })} />
                </LayeredPopover>
              </GroupField>
            </>
          )}

          {scope === "week" && (
            <GroupField label="Day" className="col-span-2">
              <div className="flex flex-wrap gap-1">
                {dayColumns(weekStart).map(({ offset, label, long }) => {
                  const active = (item.day_offset ?? 0) === offset;
                  return (
                    <button
                      key={offset}
                      type="button"
                      aria-pressed={active}
                      onClick={() => onChange({ day_offset: offset })}
                      title={`${long} — day ${offset + 1} of the week`}
                      className={cn(
                        "h-7 min-w-[38px] cursor-pointer rounded-md px-2 text-[12px] font-medium",
                        "transition-[background-color,color,transform] duration-150 ease-[var(--ease-out-apple)] active:scale-[0.97]",
                        active ? "bg-accent text-accent-ink" : "bg-hover text-ink-2 hover:bg-active hover:text-ink",
                      )}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </GroupField>
          )}

          <Field label="Tags" className="col-span-2">
            <Input
              aria-label="Tags, comma separated"
              placeholder="deep, study"
              value={tagDraft ?? (item.tags ?? []).join(", ")}
              onChange={(e) => setTagDraft(e.target.value)}
              onBlur={() => {
                if (tagDraft == null) return;
                onChange({
                  tags: tagDraft.split(",").map((t) => t.trim().replace(/^#/, "")).filter(Boolean),
                });
                setTagDraft(null);
              }}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } }}
              className="h-7 px-2 text-[13px]"
            />
          </Field>

          {!isRef && (
            <Field
              label="Notes"
              className="col-span-2"
              description="Copied onto the task. Variables work here too."
            >
              <AutoTextarea
                value={item.notes ?? ""}
                onChange={(v) => onChange({ notes: v || null })}
                minRows={2}
                placeholder="What does “done” look like?"
                className="rounded-md border border-line px-2 py-1.5 text-[13px] text-ink-2 placeholder:text-ink-4 focus:border-accent"
              />
            </Field>
          )}

          <div className="col-span-2">
            <button
              type="button"
              onClick={() => setShowRules(!showRules)}
              aria-expanded={showRules}
              className={cn(
                "flex h-7 w-full cursor-pointer items-center gap-1.5 rounded-md px-1.5 text-[12px] font-medium",
                "transition-colors duration-150 hover:bg-hover",
                hasRule(item.rule) ? "text-ink" : "text-ink-3",
              )}
            >
              <Filter className="size-3.5" aria-hidden />
              <span>Conditions</span>
              <span className="text-ink-4">{ruleLabel(item.rule)}</span>
              <span className="flex-1" />
              <ChevronRight className={cn("size-3.5 transition-transform duration-200", showRules && "rotate-90")} />
            </button>
          </div>

          {showRules && (
            <RuleEditor
              rule={item.rule}
              onChange={(next) => onChange({ rule: next })}
              weekStart={weekStart}
            />
          )}

          {stat && stat.created > 0 && (
            <p className="col-span-2 text-[11.5px] text-ink-4">
              Created {stat.created}× from this template, finished {stat.done}×
              {stat.created >= 3 && stat.rate < 0.4 && " — this is the one you keep skipping."}
            </p>
          )}

          <div className="col-span-2 flex items-center gap-1 pt-0.5">
            <Button size="xs" variant="ghost" onClick={onDuplicate}>
              <Copy className="size-3" />
              Duplicate
            </Button>
            <Button size="xs" variant="ghost" onClick={onDelete} className="hover:text-danger hover:bg-danger-soft">
              <Trash2 className="size-3" />
              Remove
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
