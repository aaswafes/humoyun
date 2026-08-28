"use client";

import * as React from "react";
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor,
  useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, arrayMove, sortableKeyboardCoordinates,
  useSortable, verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { CSS } from "@dnd-kit/utilities";
import {
  CalendarPlus, ChevronDown, ChevronRight, Copy, Flag, GripVertical,
  Plus, Trash2, X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore, uid } from "@/lib/store";
import { parseTask } from "@/lib/parse";
import { formatDuration, formatRange, formatTime, parseTime } from "@/lib/date";
import { PRIORITY_LABELS, type TaskKind, type Template, type TemplateItem, type Tint } from "@/lib/types";
import {
  AutoTextarea, Badge, Button, IconButton, InlineInput, Input, Segmented,
} from "@/components/ui/primitives";
import { ConfirmDialog, Popover, Sheet, TintPicker } from "@/components/ui/overlays";
import { Field, Select } from "@/components/ui/form";
import { IconPicker, TemplateIcon } from "./icons";
import { TimelinePreview } from "./timeline-preview";
import { KINDS, KIND_LABELS, SCOPES, SCOPE_HINTS, SCOPE_LABELS, offsetLabel, plural } from "./util";

const PRIORITY_CLASS = ["text-ink-4", "text-ink-3", "text-warn", "text-danger"];

/** Rows carry a client-side key so drag reordering survives duplicate titles. */
interface Row { key: string; item: TemplateItem }

const emptyItem = (): TemplateItem => ({
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
});

/** Times and duration stay consistent: change one, the dependent one follows. */
function reconcile(item: TemplateItem, change: Partial<TemplateItem>): TemplateItem {
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
function GroupField({
  label, children, className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  const id = React.useId();
  return (
    <div className={cn("min-w-0", className)}>
      <div id={id} className="mb-1 text-[12px] font-medium text-ink-2">{label}</div>
      <div role="group" aria-labelledby={id}>{children}</div>
    </div>
  );
}

/** Accepts "9", "9:30", "930", "9pm", "21:15"; a value it cannot read is left alone. */
function TimeField({
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

// ---------------------------------------------------------
// One item
// ---------------------------------------------------------
function ItemRow({
  row, scope, weekStart, hour12, fallbackTint, open, onToggle, onChange, onDuplicate, onDelete,
}: {
  row: Row;
  scope: Template["scope"];
  weekStart: number;
  hour12: boolean;
  fallbackTint: Tint;
  open: boolean;
  onToggle: () => void;
  onChange: (change: Partial<TemplateItem>) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: row.key });
  const item = row.item;
  const [tagDraft, setTagDraft] = React.useState<string | null>(null);

  const timeLabel = item.start_min != null
    ? formatRange(item.start_min, item.end_min ?? null, hour12)
    : item.duration_min
      ? formatDuration(item.duration_min)
      : null;

  return (
    <div
      ref={setNodeRef}
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
          className="grid h-7 w-5 shrink-0 cursor-grab place-items-center rounded text-ink-4 opacity-0 transition-opacity hover:text-ink-2 focus-visible:opacity-100 group-hover/item:opacity-100 active:cursor-grabbing"
        >
          <GripVertical className="size-3.5" />
        </button>

        <span
          className={cn(`tint-${item.color ?? fallbackTint}`, "size-2 shrink-0 rounded-full")}
          style={{ background: "var(--tint)" }}
          aria-hidden
        />

        <input
          value={item.title}
          onChange={(e) => onChange({ title: e.target.value })}
          placeholder="Untitled item"
          aria-label="Item title"
          className="min-w-0 flex-1 rounded-sm bg-transparent px-1 py-0.5 text-[13.5px] text-ink outline-none placeholder:text-ink-4 hover:bg-active focus:bg-active"
        />

        {scope === "week" && (
          <span className="shrink-0 rounded-[5px] bg-active px-1.5 py-0.5 text-[11px] font-medium text-ink-2">
            {offsetLabel(item.day_offset ?? 0, weekStart)}
          </span>
        )}
        {timeLabel && (
          <span className="hidden shrink-0 text-[11.5px] text-ink-3 tnum sm:inline">{timeLabel}</span>
        )}
        {(item.priority ?? 0) > 0 && (
          <Flag className={cn("size-3 shrink-0", PRIORITY_CLASS[item.priority ?? 0])} fill="currentColor" />
        )}
        {item.tags && item.tags.length > 0 && (
          <span className="hidden shrink-0 text-[11px] text-ink-4 sm:inline">#{item.tags.length}</span>
        )}

        <IconButton label={open ? "Collapse item" : "Edit item details"} size="sm" onClick={onToggle}>
          <ChevronRight className={cn("transition-transform duration-200", open && "rotate-90")} />
        </IconButton>
      </div>

      {open && (
        <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 px-2 pb-2.5 pt-1">
          <Field label="Kind">
            <Select<TaskKind>
              size="sm"
              value={item.kind ?? "task"}
              onChange={(k) => onChange({ kind: k })}
              options={KINDS.map((k: TaskKind) => ({ value: k, label: KIND_LABELS[k] }))}
            />
          </Field>

          <Field label="Priority">
            <Segmented
              size="sm"
              value={String(item.priority ?? 0)}
              onChange={(v) => onChange({ priority: Number(v) })}
              options={PRIORITY_LABELS.map((label, i) => ({ value: String(i), label }))}
              className="w-fit"
            />
          </Field>

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

          <Field label="Colour">
            <Popover
              align="start"
              className="w-[188px]"
              trigger={
                <button
                  aria-label="Item colour"
                  className="flex h-7 cursor-pointer items-center gap-2 rounded-md border border-line px-2 text-[13px] text-ink transition-colors hover:border-line-strong"
                >
                  <span
                    className={cn(`tint-${item.color ?? fallbackTint}`, "size-3 rounded-full")}
                    style={{ background: "var(--tint)" }}
                  />
                  <span className="capitalize">{item.color ?? "Template"}</span>
                </button>
              }
            >
              <TintPicker value={item.color ?? null} allowNone onChange={(t) => onChange({ color: t })} />
            </Popover>
          </Field>

          {scope === "week" && (
            <Field label="Day" className="col-span-2">
              <div className="flex flex-wrap gap-1">
                {Array.from({ length: 7 }, (_, offset) => {
                  const active = (item.day_offset ?? 0) === offset;
                  return (
                    <button
                      key={offset}
                      onClick={() => onChange({ day_offset: offset })}
                      title={`Day ${offset + 1} of the week`}
                      className={cn(
                        "h-7 min-w-[38px] cursor-pointer rounded-md px-2 text-[12px] font-medium",
                        "transition-[background-color,color] duration-150",
                        active ? "bg-accent text-accent-ink" : "bg-hover text-ink-2 hover:bg-active hover:text-ink",
                      )}
                    >
                      {offsetLabel(offset, weekStart)}
                    </button>
                  );
                })}
              </div>
            </Field>
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

// ---------------------------------------------------------
// Editor
// ---------------------------------------------------------
export function TemplateEditor({
  template, open, onClose, onApply,
}: {
  template: Template;
  open: boolean;
  onClose: () => void;
  onApply: (t: Template) => void;
}) {
  const hour12 = useStore((s) => s.hour12);
  const weekStart = useStore((s) => s.profile?.week_start ?? 1);
  const patch = useStore((s) => s.patch);
  const remove = useStore((s) => s.remove);
  const toast = useStore((s) => s.toast);

  const [name, setName] = React.useState(template.name);
  const [description, setDescription] = React.useState(template.description ?? "");
  const [icon, setIcon] = React.useState(template.icon);
  const [color, setColor] = React.useState<Tint>(template.color);
  const [scope, setScope] = React.useState<Template["scope"]>(template.scope);
  const [rows, setRows] = React.useState<Row[]>(() =>
    template.items.map((item) => ({ key: uid(), item })),
  );
  const [openKey, setOpenKey] = React.useState<string | null>(null);
  const [previewDay, setPreviewDay] = React.useState(0);
  const [confirming, setConfirming] = React.useState(false);
  const [composer, setComposer] = React.useState("");

  const dirty = React.useRef(false);
  const touch = () => { dirty.current = true; };

  const payload = React.useMemo(
    () => ({
      name: name.trim() || "Untitled template",
      description: description.trim() || null,
      icon,
      color,
      scope,
      items: rows.map((r) => r.item),
    }),
    [name, description, icon, color, scope, rows],
  );

  const pending = React.useRef(payload);
  const save = React.useCallback(() => {
    if (!dirty.current) return;
    dirty.current = false;
    patch("templates", template.id, pending.current);
  }, [patch, template.id]);

  // Edits land instantly in local state; Supabase catches up a beat later.
  React.useEffect(() => {
    pending.current = payload;
    if (!dirty.current) return;
    const id = setTimeout(save, 400);
    return () => clearTimeout(id);
  }, [payload, save]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function close() {
    save();
    onClose();
  }

  function mutate(next: Row[]) {
    touch();
    setRows(next);
  }

  /** Leaving week scope collapses the spread — otherwise stale offsets keep scattering tasks. */
  function changeScope(next: Template["scope"]) {
    touch();
    setScope(next);
    if (next !== "week" && rows.some((r) => (r.item.day_offset ?? 0) !== 0)) {
      setRows(rows.map((r) => ({ ...r, item: { ...r.item, day_offset: 0 } })));
    }
  }

  function updateItem(key: string, change: Partial<TemplateItem>) {
    mutate(rows.map((r) => (r.key === key ? { ...r, item: reconcile(r.item, change) } : r)));
  }

  function addItem(text: string) {
    const title = text.trim();
    if (!title) return;
    const parsed = parseTask(title, weekStart);
    const last = rows[rows.length - 1]?.item;
    const item: TemplateItem = {
      ...emptyItem(),
      title: parsed.title || title,
      start_min: parsed.start_min,
      end_min: parsed.end_min,
      duration_min: parsed.duration_min,
      priority: parsed.priority,
      tags: parsed.tags,
      color: parsed.color,
      // a new item inherits the day it is being added to, which is what you almost always want
      day_offset: scope === "week" ? (last?.day_offset ?? previewDay) : 0,
    };
    mutate([...rows, { key: uid(), item }]);
    setComposer("");
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = rows.findIndex((r) => r.key === active.id);
    const to = rows.findIndex((r) => r.key === over.id);
    if (from < 0 || to < 0) return;
    mutate(arrayMove(rows, from, to));
  }

  const previewItems = React.useMemo(() => {
    const items = rows.map((r) => r.item);
    if (scope !== "week") return items;
    return items.filter((i) => (i.day_offset ?? 0) === previewDay);
  }, [rows, scope, previewDay]);

  const perDay = React.useMemo(() => {
    const counts = Array.from({ length: 7 }, () => 0);
    rows.forEach((r) => { counts[Math.min(6, Math.max(0, r.item.day_offset ?? 0))] += 1; });
    return counts;
  }, [rows]);

  return (
    <Sheet open={open} onClose={close} width={580}>
      <header className="flex h-[var(--topbar-h)] shrink-0 items-center gap-2 px-3 hairline-b">
        <Popover
          align="start"
          className="w-[268px]"
          trigger={
            <button
              aria-label="Choose an icon"
              className={cn(
                `tint-${color}`,
                "grid size-8 cursor-pointer place-items-center rounded-[9px] bg-[var(--tint-soft)] text-[var(--tint-ink)]",
                "transition-transform duration-150 ease-[var(--ease-out-apple)] active:scale-[0.94]",
              )}
            >
              <TemplateIcon name={icon} className="size-[18px]" />
            </button>
          }
        >
          {(closePop) => (
            <IconPicker value={icon} onChange={(n) => { touch(); setIcon(n); closePop(); }} />
          )}
        </Popover>

        <input
          value={name}
          onChange={(e) => { touch(); setName(e.target.value); }}
          placeholder="Template name"
          aria-label="Template name"
          className="min-w-0 flex-1 rounded-sm bg-transparent px-1 py-1 text-[15px] font-semibold tracking-[-0.01em] text-ink outline-none placeholder:text-ink-4 hover:bg-hover focus:bg-hover"
        />

        <IconButton label="Close editor" onClick={close}>
          <X />
        </IconButton>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <textarea
          value={description}
          onChange={(e) => { touch(); setDescription(e.target.value); }}
          rows={2}
          placeholder="What is this plan for? One line is plenty."
          aria-label="Template description"
          className="w-full resize-none rounded-md bg-transparent px-1 py-1 text-[13px] leading-relaxed text-ink-2 outline-none placeholder:text-ink-4 hover:bg-hover focus:bg-hover"
        />

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Segmented
            size="sm"
            value={scope}
            onChange={changeScope}
            options={SCOPES.map((s) => ({ value: s, label: SCOPE_LABELS[s] }))}
          />
          <Popover
            align="start"
            className="w-[188px]"
            trigger={
              <button
                aria-label="Template colour"
                className={cn(
                  `tint-${color}`,
                  "flex h-7 cursor-pointer items-center gap-1.5 rounded-md border border-line px-2 text-[12.5px] text-ink-2 transition-colors hover:border-line-strong",
                )}
              >
                <span className="size-3 rounded-full" style={{ background: "var(--tint)" }} />
                <span className="capitalize">{color}</span>
              </button>
            }
          >
            <TintPicker value={color} onChange={(t) => { if (t) { touch(); setColor(t); } }} />
          </Popover>
        </div>
        <p className="mt-1.5 px-0.5 text-[12px] text-ink-3">{SCOPE_HINTS[scope]}</p>

        {/* ---- shape of the day ---- */}
        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">Preview</span>
            {scope === "week" && (
              <div className="flex gap-0.5">
                {Array.from({ length: 7 }, (_, offset) => (
                  <button
                    key={offset}
                    onClick={() => setPreviewDay(offset)}
                    className={cn(
                      "h-7 min-w-[36px] cursor-pointer rounded-md px-1.5 text-[11.5px] font-medium",
                      "transition-[background-color,color] duration-150",
                      previewDay === offset
                        ? "bg-accent-soft text-accent"
                        : perDay[offset] > 0
                          ? "text-ink-2 hover:bg-hover"
                          : "text-ink-4 hover:bg-hover",
                    )}
                  >
                    {offsetLabel(offset, weekStart)}
                    {perDay[offset] > 0 && <span className="ml-1 tnum">{perDay[offset]}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
          <TimelinePreview items={previewItems} color={color} hour12={hour12} />
        </div>

        {/* ---- items ---- */}
        <div className="mt-6">
          <div className="mb-1.5 flex items-baseline gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">Items</span>
            <span className="text-[11px] text-ink-4 tnum">{rows.length}</span>
          </div>

          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            modifiers={[restrictToVerticalAxis]}
            onDragEnd={onDragEnd}
          >
            <SortableContext items={rows.map((r) => r.key)} strategy={verticalListSortingStrategy}>
              {rows.map((row) => (
                <ItemRow
                  key={row.key}
                  row={row}
                  scope={scope}
                  weekStart={weekStart}
                  hour12={hour12}
                  fallbackTint={color}
                  open={openKey === row.key}
                  onToggle={() => setOpenKey(openKey === row.key ? null : row.key)}
                  onChange={(change) => updateItem(row.key, change)}
                  onDuplicate={() => {
                    const at = rows.findIndex((r) => r.key === row.key);
                    const copy = { key: uid(), item: { ...row.item } };
                    mutate([...rows.slice(0, at + 1), copy, ...rows.slice(at + 1)]);
                  }}
                  onDelete={() => {
                    if (openKey === row.key) setOpenKey(null);
                    mutate(rows.filter((r) => r.key !== row.key));
                  }}
                />
              ))}
            </SortableContext>
          </DndContext>

          <div className="mt-1 flex items-center gap-2 rounded-md px-1.5 py-1 focus-within:bg-hover">
            <Plus className="size-4 shrink-0 text-ink-4" />
            <input
              value={composer}
              onChange={(e) => setComposer(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); addItem(composer); }
                if (e.key === "Escape") setComposer("");
              }}
              onBlur={() => addItem(composer)}
              placeholder="Add an item — try “Deep work 9am for 90m !high #deep”"
              aria-label="Add a template item"
              className="min-w-0 flex-1 bg-transparent py-0.5 text-[13.5px] text-ink outline-none placeholder:text-ink-4"
            />
          </div>

          {rows.length === 0 && (
            <p className="mt-2 px-1.5 text-[12.5px] leading-relaxed text-ink-3">
              An empty template has nothing to apply. Add the first thing you do, then build outwards —
              times and durations are optional.
            </p>
          )}
        </div>

        <div className="mt-6 flex items-center gap-2 border-t border-line pt-4">
          <Badge tint={color}>{SCOPE_LABELS[scope]}</Badge>
          <span className="text-[12px] text-ink-3 tnum">{plural(rows.length, "item")}</span>
          <div className="flex-1" />
          <Button
            size="sm"
            variant="ghost"
            className="hover:text-danger hover:bg-danger-soft"
            onClick={() => setConfirming(true)}
          >
            <Trash2 className="size-3.5" />
            Delete template
          </Button>
        </div>
      </div>

      <footer className="flex shrink-0 items-center gap-2 px-3 py-2.5 hairline-t">
        <span className="text-[11.5px] text-ink-4">Changes save as you type</span>
        <div className="flex-1" />
        <Button
          size="sm"
          // Hand off to the apply dialog rather than stacking it over the sheet.
          onClick={() => { save(); const snapshot = { ...template, ...payload }; onClose(); onApply(snapshot); }}
          disabled={rows.length === 0}
        >
          <CalendarPlus className="size-3.5" />
          Apply to a date…
        </Button>
        <Button size="sm" variant="primary" onClick={close}>Done</Button>
      </footer>

      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={() => {
          dirty.current = false;
          remove("templates", template.id);
          toast({ title: "Template deleted", description: `“${payload.name}” is gone.` });
          onClose();
        }}
        title={`Delete “${payload.name}”?`}
        description="Tasks you already created from it are not touched."
      />
    </Sheet>
  );
}
