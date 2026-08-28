"use client";

import * as React from "react";
import { AlertTriangle, CalendarPlus, CornerDownRight, Filter } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import { formatDate, friendlyDate, startOfWeek, weekday } from "@/lib/date";
import type { Task, Template } from "@/lib/types";
import { Badge, Button, Checkbox, Input } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/overlays";
import { Field, Toggle } from "@/components/ui/form";
import { LayeredSelect } from "./layered";
import { MiniCalendar } from "@/components/ui/mini-calendar";
import { TemplateIcon } from "./icons";
import { TimelinePreview } from "./timeline-preview";
import {
  DEFAULT_REPEAT, MAX_ANCHORS, REPEAT_LABELS, REPEAT_UNITS, anchorDates, buildPlan,
  busyIndex, clashesOn, collectVars, expandItems, repeatLabel, spreadDays,
  type PlannedDay, type RepeatMode, type RepeatSpec, type RichItem,
} from "./model";
import { SCOPE_LABELS, itemLead, offsetLabel, plural } from "./util";

/** One apply never touches more than this many days, however wild the repeat. */
const MAX_DAYS = 60;

const REPEAT_MODES: RepeatMode[] = ["once", "daily", "weekly", "days"];

/** Existing tasks, shaped so the timeline can draw them next to the new ones. */
function asPreviewItems(tasks: Task[]): RichItem[] {
  return tasks.map((t) => ({
    title: t.title,
    kind: t.kind,
    day_offset: 0,
    start_min: t.start_min,
    end_min: t.end_min,
    duration_min: t.duration_min,
    priority: t.priority,
    color: t.color,
    tags: t.tags,
    notes: t.notes,
  }));
}

/** A sensible first answer for {{book}}, {{goal}}, {{habit}} … */
function suggestionsFor(
  name: string,
  source: { books: string[]; goals: string[]; habits: string[]; tags: string[] },
): string[] {
  const key = name.toLowerCase();
  if (key.includes("book")) return source.books;
  if (key.includes("goal")) return source.goals;
  if (key.includes("habit")) return source.habits;
  if (key.includes("tag")) return source.tags;
  return [];
}

function DayRow({
  day, included, selected, clashes, onToggle, onPreview,
}: {
  day: PlannedDay;
  included: boolean;
  selected: boolean;
  clashes: number;
  onToggle: (next: boolean) => void;
  onPreview: () => void;
}) {
  const skipped = day.items.length - day.create.length;

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-md px-1.5 py-1 transition-colors duration-120",
        selected ? "bg-selected" : "hover:bg-hover",
      )}
    >
      <Checkbox
        checked={included}
        onChange={onToggle}
        size="sm"
        label={`Include ${formatDate(day.date, { year: true })}`}
      />
      <button
        type="button"
        onClick={onPreview}
        aria-pressed={selected}
        className="flex min-w-0 flex-1 cursor-pointer items-baseline gap-2 rounded-sm py-0.5 text-left"
      >
        <span className={cn("w-[86px] shrink-0 text-[12.5px]", included ? "text-ink" : "text-ink-4")}>
          {formatDate(day.date)}
        </span>
        <span className="text-[11.5px] text-ink-3 tnum">
          {day.create.length} new
        </span>
        {skipped > 0 && (
          <span className="inline-flex items-center gap-0.5 text-[11.5px] text-ink-4 tnum">
            <Filter className="size-3" aria-hidden />
            {skipped} skipped
          </span>
        )}
        {day.existing > 0 && (
          <span className="text-[11.5px] text-ink-4 tnum">{day.existing} already there</span>
        )}
        <span className="flex-1" />
        {clashes > 0 && (
          <span className="inline-flex shrink-0 items-center gap-1 text-[11.5px] text-warn">
            <AlertTriangle className="size-3" aria-hidden />
            {clashes} clash{clashes === 1 ? "" : "es"}
          </span>
        )}
      </button>
    </div>
  );
}

export function ApplyDialog({
  template, open, onClose,
}: {
  template: Template;
  open: boolean;
  onClose: () => void;
}) {
  const tasks = useStore((s) => s.tasks);
  const templates = useStore((s) => s.templates);
  const books = useStore((s) => s.books);
  const goals = useStore((s) => s.goals);
  const habits = useStore((s) => s.habits);
  const tagRows = useStore((s) => s.tags);
  const hour12 = useStore((s) => s.hour12);
  const weekStart = useStore((s) => s.profile?.week_start ?? 1);
  const selectedDate = useStore((s) => s.selectedDate);
  const addTask = useStore((s) => s.addTask);
  const patch = useStore((s) => s.patch);
  const removeWhere = useStore((s) => s.removeWhere);
  const toast = useStore((s) => s.toast);

  const expanded = React.useMemo(() => expandItems(template, templates), [template, templates]);
  const vars = React.useMemo(() => collectVars(expanded.map((e) => e.item)), [expanded]);

  const suggestionSource = React.useMemo(
    () => ({
      books: books.map((b) => b.title).filter(Boolean),
      goals: goals.map((g) => g.title).filter(Boolean),
      habits: habits.map((h) => h.name).filter(Boolean),
      tags: tagRows.map((t) => t.name).filter(Boolean),
    }),
    [books, goals, habits, tagRows],
  );

  const [date, setDate] = React.useState(selectedDate);
  const [snap, setSnap] = React.useState(true);
  const [repeat, setRepeat] = React.useState<RepeatSpec>(DEFAULT_REPEAT);
  const [excluded, setExcluded] = React.useState<Set<string>>(() => new Set());
  const [previewDate, setPreviewDate] = React.useState<string | null>(null);
  const [values, setValues] = React.useState<Record<string, string>>(() => {
    const source = {
      books: books.map((b) => b.title).filter(Boolean),
      goals: goals.map((g) => g.title).filter(Boolean),
      habits: habits.map((h) => h.name).filter(Boolean),
      tags: tagRows.map((t) => t.name).filter(Boolean),
    };
    const initial: Record<string, string> = {};
    for (const name of collectVars(expandItems(template, templates).map((e) => e.item)).user) {
      initial[name] = suggestionsFor(name, source)[0] ?? "";
    }
    return initial;
  });

  const start = template.scope === "week" && snap ? startOfWeek(date, weekStart) : date;
  const spread = React.useMemo(() => spreadDays(template, templates), [template, templates]);
  const maxRepeats = Math.max(1, Math.min(MAX_ANCHORS, Math.floor(MAX_DAYS / spread)));

  const allAnchors = React.useMemo(
    () => anchorDates(start, repeat, weekStart),
    [start, repeat, weekStart],
  );
  const anchors = React.useMemo(() => allAnchors.slice(0, maxRepeats), [allAnchors, maxRepeats]);
  const trimmed = allAnchors.length - anchors.length;

  const plan = React.useMemo(
    () => buildPlan({ template, templates, anchors, values, tasks }),
    [template, templates, anchors, values, tasks],
  );

  const included = React.useMemo(
    () => plan.filter((d) => !excluded.has(d.date)),
    [plan, excluded],
  );

  const totalNew = included.reduce((sum, d) => sum + d.create.length, 0);
  const totalSkipped = included.reduce((sum, d) => sum + (d.items.length - d.create.length), 0);
  const usedAnchors = new Set(included.flatMap((d) => d.create.map((p) => p.anchor))).size;

  const busy = React.useMemo(() => busyIndex(tasks), [tasks]);
  const clashBy = React.useMemo(() => {
    const map = new Map<string, number>();
    for (const day of plan) map.set(day.date, clashesOn(day, busy));
    return map;
  }, [plan, busy]);
  const totalClashes = included.reduce((sum, d) => sum + (clashBy.get(d.date) ?? 0), 0);

  const missingVars = vars.user.filter((name) => !(values[name] ?? "").trim());

  // The preview always points at a day that is actually in the plan.
  const focus = React.useMemo(() => {
    if (previewDate) {
      const found = plan.find((d) => d.date === previewDate);
      if (found) return found;
    }
    return included[0] ?? plan[0] ?? null;
  }, [previewDate, plan, included]);

  const markers = React.useMemo(() => {
    const map = new Map<string, number>();
    tasks.forEach((t) => {
      if (!t.date || t.parent_id || t.status === "done") return;
      map.set(t.date, (map.get(t.date) ?? 0) + 1);
    });
    return map;
  }, [tasks]);

  const existingOnFocus = React.useMemo(
    () => (focus ? tasks.filter((t) => t.date === focus.date && !t.parent_id) : []),
    [focus, tasks],
  );

  function toggleDay(iso: string, next: boolean) {
    setExcluded((prev) => {
      const set = new Set(prev);
      if (next) set.delete(iso); else set.add(iso);
      return set;
    });
  }

  function setRepeatMode(mode: RepeatMode) {
    setExcluded(new Set());
    setRepeat((prev) => ({
      ...prev,
      mode,
      weekdays: mode === "days" && !prev.weekdays.length ? [weekday(start)] : prev.weekdays,
    }));
  }

  function toggleWeekday(index: number) {
    setExcluded(new Set());
    setRepeat((prev) => {
      const set = new Set(prev.weekdays);
      // Never leave the set empty — the repeat would silently fall back to one day.
      if (set.has(index)) { if (set.size === 1) return prev; set.delete(index); }
      else set.add(index);
      return { ...prev, weekdays: [...set].sort((a, b) => a - b) };
    });
  }

  function apply() {
    const createdIds: string[] = [];
    for (const day of included) {
      // Land after whatever is already on the day rather than on top of it.
      const siblings = useStore.getState().tasks.filter((t) => t.date === day.date && !t.parent_id);
      const base = siblings.length ? Math.max(...siblings.map((t) => t.order_index)) + 1 : 0;

      day.create.forEach((planned, i) => {
        const item = planned.item;
        const task = addTask({
          title: item.title,
          kind: item.kind ?? "task",
          date: day.date,
          start_min: item.start_min ?? null,
          end_min: item.end_min ?? null,
          all_day: item.start_min == null,
          duration_min: item.duration_min ?? null,
          priority: item.priority ?? 0,
          color: item.color ?? template.color,
          icon: item.icon ?? null,
          tags: item.tags ?? [],
          notes: item.notes ?? null,
          checklist: item.checklist ?? [],
          template_id: template.id,
          order_index: base + i,
        });
        createdIds.push(task.id);
      });
    }

    const ids = new Set(createdIds);
    const bump = Math.max(1, usedAnchors);
    // Read the live row rather than the snapshot the editor may have handed over.
    const before = useStore.getState().templates.find((t) => t.id === template.id);
    patch("templates", template.id, { use_count: (before?.use_count ?? template.use_count) + bump });

    const first = included[0]?.date;
    const last = included[included.length - 1]?.date;
    toast({
      title: `Applied ${template.name}`,
      description:
        included.length > 1 && first && last
          ? `${plural(createdIds.length, "task")} across ${formatDate(first)} – ${formatDate(last)}.`
          : `${plural(createdIds.length, "task")} on ${friendlyDate(first ?? start)}.`,
      tone: "success",
      action: {
        label: "Undo",
        run: () => {
          // Guarded twice over: only rows this apply created, and only ones still tagged to it.
          removeWhere("tasks", (t) => ids.has(t.id) && t.template_id === template.id);
          const current = useStore.getState().templates.find((t) => t.id === template.id);
          if (current) patch("templates", template.id, { use_count: Math.max(0, current.use_count - bump) });
          toast({ title: "Undone", description: `${plural(ids.size, "task")} removed.` });
        },
      },
    });
    onClose();
  }

  const headline =
    included.length > 1
      ? `${plural(totalNew, "task")} across ${plural(included.length, "day")}`
      : `${plural(totalNew, "task")} on ${friendlyDate(included[0]?.date ?? start)}`;

  return (
    <Modal open={open} onClose={onClose} width={880} title={`Apply “${template.name}”`}>
      <div className="grid max-h-[74vh] grid-cols-1 sm:grid-cols-[268px_1fr]">
        {/* ---------------- when ---------------- */}
        <div className="overflow-y-auto border-line p-3.5 sm:border-r">
          <MiniCalendar value={date} onChange={setDate} weekStart={weekStart} markers={markers} />

          {template.scope === "week" && (
            <div className="mt-3 border-t border-line pt-3">
              <Toggle
                checked={snap}
                onChange={setSnap}
                label="Start on the first day of the week"
                description={
                  snap
                    ? `Day one lands on ${formatDate(start)}.`
                    : `Day one lands on ${formatDate(date)} instead.`
                }
              />
            </div>
          )}

          <div className="mt-3 space-y-2.5 border-t border-line pt-3">
            <Field label="Repeat">
              <LayeredSelect<RepeatMode>
                size="sm"
                value={repeat.mode}
                onChange={setRepeatMode}
                options={REPEAT_MODES.map((mode) => ({ value: mode, label: REPEAT_LABELS[mode] }))}
              />
            </Field>

            {repeat.mode === "days" && (
              <div>
                <span className="mb-1 block text-[12px] font-medium text-ink-2" id="apply-weekdays">
                  On these days
                </span>
                <div className="flex flex-wrap gap-1" role="group" aria-labelledby="apply-weekdays">
                  {Array.from({ length: 7 }, (_, i) => (weekStart + i) % 7).map((index) => {
                    const active = repeat.weekdays.includes(index);
                    return (
                      <button
                        key={index}
                        type="button"
                        aria-pressed={active}
                        onClick={() => toggleWeekday(index)}
                        className={cn(
                          "h-7 min-w-[34px] cursor-pointer rounded-md px-1.5 text-[12px] font-medium",
                          "transition-[background-color,color,transform] duration-150 ease-[var(--ease-out-apple)] active:scale-[0.97]",
                          active ? "bg-accent text-accent-ink" : "bg-hover text-ink-2 hover:bg-active hover:text-ink",
                        )}
                      >
                        {offsetLabel((index - weekStart + 7) % 7, weekStart)}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {repeat.mode !== "once" && (
              <Field label={`How many ${REPEAT_UNITS[repeat.mode]}`}>
                <Input
                  type="number"
                  min={1}
                  max={maxRepeats}
                  step={1}
                  value={repeat.count}
                  onChange={(e) => {
                    setExcluded(new Set());
                    setRepeat((prev) => ({ ...prev, count: Math.max(1, Number(e.target.value) || 1) }));
                  }}
                  className="h-8 tnum"
                />
              </Field>
            )}

            <p className="text-[11.5px] leading-snug text-ink-3">
              {repeatLabel(repeat)}
              {trimmed > 0 && (
                <span className="mt-1 block text-warn">
                  Trimmed to {plural(anchors.length, "repeat")} — one apply touches at most {MAX_DAYS} days.
                </span>
              )}
            </p>
          </div>
        </div>

        {/* ---------------- what ---------------- */}
        <div className="flex min-h-0 flex-col">
          <div className="flex items-start gap-2.5 border-b border-line px-4 py-3">
            <span
              className={cn(
                `tint-${template.color}`,
                "grid size-8 shrink-0 place-items-center rounded-[9px] bg-[var(--tint-soft)] text-[var(--tint-ink)]",
              )}
            >
              <TemplateIcon name={template.icon} className="size-[18px]" />
            </span>
            <div className="min-w-0">
              <p className="text-[13.5px] font-semibold text-ink">{headline}</p>
              <p className="mt-0.5 text-[12px] text-ink-3">
                {SCOPE_LABELS[template.scope]} template · {plural(usedAnchors, "repeat")}
                {totalSkipped > 0 && ` · ${totalSkipped} skipped by conditions`}
                {totalClashes > 0 && ` · ${totalClashes} clash with existing tasks`}
              </p>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
            {vars.user.length > 0 && (
              <section className="mb-4">
                <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">
                  Fill in
                </h3>
                <div className="grid gap-2.5 sm:grid-cols-2">
                  {vars.user.map((name) => {
                    const options = suggestionsFor(name, suggestionSource);
                    const listId = `apply-var-${name.replace(/\W/g, "-")}`;
                    return (
                      <Field
                        key={name}
                        label={`{{${name}}}`}
                        description={
                          (values[name] ?? "").trim() ? undefined : "Needed before this can be applied"
                        }
                      >
                        <Input
                          value={values[name] ?? ""}
                          list={options.length ? listId : undefined}
                          placeholder={options[0] ?? `What is “${name}”?`}
                          onChange={(e) => setValues((prev) => ({ ...prev, [name]: e.target.value }))}
                        />
                      </Field>
                    );
                  })}
                </div>
                {vars.user.map((name) => {
                  const options = suggestionsFor(name, suggestionSource);
                  if (!options.length) return null;
                  return (
                    <datalist key={name} id={`apply-var-${name.replace(/\W/g, "-")}`}>
                      {options.slice(0, 30).map((option) => <option key={option} value={option} />)}
                    </datalist>
                  );
                })}
              </section>
            )}

            <section className="mb-4">
              <div className="mb-1 flex items-center gap-2">
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">
                  Dates receiving items
                </h3>
                <span className="text-[11px] text-ink-4 tnum">{included.length}/{plan.length}</span>
                <div className="flex-1" />
                <Button size="xs" variant="ghost" onClick={() => setExcluded(new Set())}>
                  Select all
                </Button>
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => setExcluded(new Set(plan.map((d) => d.date)))}
                >
                  Clear
                </Button>
              </div>
              <div className="max-h-[240px] overflow-y-auto">
                {plan.map((day) => (
                  <DayRow
                    key={day.date}
                    day={day}
                    included={!excluded.has(day.date)}
                    selected={focus?.date === day.date}
                    clashes={clashBy.get(day.date) ?? 0}
                    onToggle={(next) => toggleDay(day.date, next)}
                    onPreview={() => setPreviewDate(day.date)}
                  />
                ))}
                {plan.length === 0 && (
                  <p className="px-1.5 py-2 text-[12.5px] text-ink-3">
                    This template has no items yet, so there is nothing to place.
                  </p>
                )}
              </div>
            </section>

            {focus && (
              <section>
                <div className="mb-1.5 flex items-baseline gap-2">
                  <h3 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">
                    {friendlyDate(focus.date)} after applying
                  </h3>
                  <span className="text-[11px] text-ink-4 tnum">{formatDate(focus.date, { year: true })}</span>
                </div>

                <TimelinePreview
                  items={focus.create.map((p) => p.item)}
                  existing={asPreviewItems(existingOnFocus)}
                  color={template.color}
                  hour12={hour12}
                  emptyHint="Nothing lands on this day."
                />

                <div className="mt-2 space-y-[3px]">
                  {focus.items.map((planned) => (
                    <div key={planned.key} className="flex items-baseline gap-2">
                      <span
                        className={cn(
                          `tint-${planned.item.color ?? template.color}`,
                          "size-1.5 shrink-0 translate-y-[-1px] rounded-full",
                        )}
                        style={{ background: planned.skip ? "var(--line-strong)" : "var(--tint)" }}
                        aria-hidden
                      />
                      <span className="w-[62px] shrink-0 text-[11.5px] text-ink-4 tnum">
                        {itemLead(planned.item, hour12)}
                      </span>
                      <span
                        className={cn(
                          "min-w-0 flex-1 truncate text-[13px]",
                          planned.skip ? "text-ink-4 line-through" : "text-ink-2",
                        )}
                      >
                        {planned.item.title || "Untitled item"}
                      </span>
                      {planned.source && (
                        <span className="hidden shrink-0 items-center gap-0.5 text-[11px] text-ink-4 sm:inline-flex">
                          <CornerDownRight className="size-3" aria-hidden />
                          {planned.source}
                        </span>
                      )}
                      {planned.skip && (
                        <span className="shrink-0 text-[11px] text-ink-4">{planned.skip}</span>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3">
        <Badge tint={template.color}>{SCOPE_LABELS[template.scope]}</Badge>
        <p className="text-[12px] text-ink-3 tnum">
          {plural(totalNew, "task")} · {plural(included.length, "day")}
        </p>
        {missingVars.length > 0 && (
          <p className="text-[12px] text-warn">
            Fill in {missingVars.map((v) => `{{${v}}}`).join(", ")} first
          </p>
        )}
        <div className="flex-1" />
        <Button size="sm" onClick={onClose}>Cancel</Button>
        <Button
          size="sm"
          variant="primary"
          onClick={apply}
          disabled={totalNew === 0 || missingVars.length > 0}
        >
          <CalendarPlus className="size-3.5" />
          Apply {plural(totalNew, "task")}
        </Button>
      </div>
    </Modal>
  );
}
