"use client";

import * as React from "react";
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor,
  useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, arrayMove, sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  Braces, CalendarPlus, Copy, Download, MoreHorizontal, Plus, Trash2, X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore, uid } from "@/lib/store";
import { parseTask } from "@/lib/parse";
import { friendlyDate } from "@/lib/date";
import type { Template, Tint } from "@/lib/types";
import {
  AutoTextarea, Badge, Button, IconButton, InlineInput, Segmented, Tooltip,
} from "@/components/ui/primitives";
import { ConfirmDialog, MenuItem, MenuSeparator, Sheet, TintPicker } from "@/components/ui/overlays";
import { LayeredPopover } from "./layered";
import { Fold, useFold } from "./fold";
import { MiniEmpty } from "@/components/ui/form";
import { IconPicker, TemplateIcon } from "./icons";
import { TimelinePreview } from "./timeline-preview";
import { WeekBoard } from "./week-board";
import { ColourTrigger, ItemRow, emptyItem, reconcile, type Row } from "./item-row";
import { buildInsights, percent, verdict, type Insight } from "./insights";
import {
  BUILT_IN_VARS, collectVars, expandItems, itemsOf, referenceable, type RichItem,
} from "./model";
import { downloadJson, fileNameFor, serialize } from "./transfer";
import {
  SCOPES, SCOPE_HINTS, SCOPE_LABELS, offsetLabel, plural, totalMinutes,
} from "./util";
import { formatDuration } from "@/lib/date";

type EditorView = "list" | "board";

// Namespaced per surface so the editor's three panels remember themselves.
const DETAILS_FOLD = "humoyun.templates.detailsOpen";
const ITEMS_FOLD = "humoyun.templates.itemsOpen";
const PREVIEW_FOLD = "humoyun.templates.previewOpen";

/** Move a row onto another day, landing it just before `overKey` when there is one. */
function relocate(rows: Row[], key: string, offset: number, overKey: string | null): Row[] {
  const from = rows.findIndex((r) => r.key === key);
  if (from < 0) return rows;
  const moved: Row = { ...rows[from], item: { ...rows[from].item, day_offset: offset } };
  const rest = rows.filter((r) => r.key !== key);

  if (overKey) {
    const at = rest.findIndex((r) => r.key === overKey);
    if (at >= 0) return [...rest.slice(0, at), moved, ...rest.slice(at)];
  }
  // No target row: sit at the end of that day's run so the column order stays stable.
  let insert = rest.length;
  for (let i = rest.length - 1; i >= 0; i--) {
    if ((rest[i].item.day_offset ?? 0) === offset) { insert = i + 1; break; }
  }
  return [...rest.slice(0, insert), moved, ...rest.slice(insert)];
}

// ---------------------------------------------------------
// Panels
// ---------------------------------------------------------
function VariablesPanel({ vars }: { vars: { builtin: string[]; user: string[] } }) {
  const { builtin, user } = vars;
  const total = builtin.length + user.length;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Braces className="size-3.5 text-ink-4" aria-hidden />
        <span className="text-[12px] font-medium text-ink-2">Variables</span>
        <div className="flex-1" />
        <LayeredPopover
          align="end"
          className="w-[300px] p-2.5"
          trigger={
            <Button size="xs" variant="ghost">How they work</Button>
          }
        >
          <p className="text-[12.5px] leading-relaxed text-ink-2">
            Write <span className="rounded-[4px] bg-hover px-1 text-ink tnum">{"{{book}}"}</span> anywhere
            in an item title, its notes or a tag. When you apply the template you are asked for the value
            once and it is filled in everywhere.
          </p>
          <p className="mt-2 text-[12px] font-medium text-ink-2">Filled in for you</p>
          <ul className="mt-1 space-y-1">
            {Object.entries(BUILT_IN_VARS).map(([name, description]) => (
              <li key={name} className="flex gap-2 text-[12px] leading-snug">
                <span className="shrink-0 rounded-[4px] bg-hover px-1 text-ink">{`{{${name}}}`}</span>
                <span className="text-ink-3">{description}</span>
              </li>
            ))}
          </ul>
        </LayeredPopover>
      </div>

      {total === 0 ? (
        <p className="mt-1 text-[12px] leading-relaxed text-ink-4">
          None yet. Type {"{{book}}"} into an item and the apply dialog will ask for it.
        </p>
      ) : (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {user.map((name) => (
            <Tooltip key={name} content="You are asked for this when you apply">
              <Badge tint="blue">{`{{${name}}}`}</Badge>
            </Tooltip>
          ))}
          {builtin.map((name) => (
            <Tooltip key={name} content={BUILT_IN_VARS[name]}>
              <Badge tint="slate">{`{{${name}}}`}</Badge>
            </Tooltip>
          ))}
        </div>
      )}
    </div>
  );
}

function TruthPanel({ insight }: { insight: Insight }) {
  const read = verdict(insight);

  if (insight.applied === 0 && insight.created === 0) {
    return (
      <MiniEmpty className="text-left">
        Apply it once and this starts telling you how much of it you actually do.
      </MiniEmpty>
    );
  }

  const worst = insight.items.filter((s) => s.created >= 2).slice(0, 3);

  return (
    <div>
      <div className="flex items-baseline gap-2">
        <span className="display-serif text-[22px] leading-none text-ink tnum">{percent(insight.rate)}</span>
        <span className="text-[12px] text-ink-3">of its tasks get finished</span>
        <div className="flex-1" />
        {/* A plan you only half do is information, not an emergency — it stays grey. */}
        <span className="text-[11.5px] text-ink-3">{read.text}</span>
      </div>
      <p className="mt-1.5 text-[11.5px] text-ink-4 tnum">
        Applied {insight.applied}× · {insight.done} done · {insight.open} still open
        {insight.lastApplied && ` · last ${friendlyDate(insight.lastApplied).toLowerCase()}`}
      </p>

      {worst.length > 0 && (
        <div className="mt-3">
          <p className="text-[12px] font-medium text-ink-2">Weakest items</p>
          <ul className="mt-1 space-y-1">
            {worst.map((stat) => (
              <li key={stat.title} className="flex items-baseline gap-2">
                <span className="w-[34px] shrink-0 text-[11.5px] text-ink-3 tnum">
                  {Math.round(stat.rate * 100)}%
                </span>
                <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-3">{stat.title}</span>
                <span className="shrink-0 text-[11px] text-ink-4 tnum">{stat.done}/{stat.created}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------
// Editor
// ---------------------------------------------------------
export function TemplateEditor({
  template, open, onClose, onApply, onOpenTemplate, onDuplicate,
}: {
  template: Template;
  open: boolean;
  onClose: () => void;
  onApply: (t: Template) => void;
  onOpenTemplate: (id: string) => void;
  onDuplicate: (t: Template) => void;
}) {
  const hour12 = useStore((s) => s.hour12);
  const weekStart = useStore((s) => s.profile?.week_start ?? 1);
  const templates = useStore((s) => s.templates);
  const tasks = useStore((s) => s.tasks);
  const patch = useStore((s) => s.patch);
  const remove = useStore((s) => s.remove);
  const toast = useStore((s) => s.toast);

  const [name, setName] = React.useState(template.name);
  const [description, setDescription] = React.useState(template.description ?? "");
  const [icon, setIcon] = React.useState(template.icon);
  const [color, setColor] = React.useState<Tint>(template.color);
  const [scope, setScope] = React.useState<Template["scope"]>(template.scope);
  const [rows, setRows] = React.useState<Row[]>(() =>
    itemsOf(template).map((item) => ({ key: uid(), item })),
  );
  const [openKey, setOpenKey] = React.useState<string | null>(null);
  const [previewDay, setPreviewDay] = React.useState(0);
  const [view, setView] = React.useState<EditorView>("list");
  const [confirming, setConfirming] = React.useState(false);
  const [composer, setComposer] = React.useState("");
  // Items is the panel the sheet opens on; the other two rest folded. Anything
  // that jumps to a row has to be able to unfold it first.
  const [, setItemsOpen] = useFold(ITEMS_FOLD, true);

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

  // A route change unmounts the sheet without going through close(), so the
  // last few hundred milliseconds of typing would otherwise be dropped.
  // `save` is stable, so this cleanup only ever runs on unmount.
  React.useEffect(() => () => save(), [save]);

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
    if (next !== "week") {
      setView("list");
      if (rows.some((r) => (r.item.day_offset ?? 0) !== 0)) {
        setRows(rows.map((r) => ({ ...r, item: { ...r.item, day_offset: 0 } })));
      }
    }
  }

  function updateItem(key: string, change: Partial<RichItem>) {
    mutate(rows.map((r) => (r.key === key ? { ...r, item: reconcile(r.item, change) } : r)));
  }

  function addItem(text: string, dayOffset?: number) {
    const title = text.trim();
    if (!title) return;
    const parsed = parseTask(title, weekStart);
    const last = rows[rows.length - 1]?.item;
    const item: RichItem = {
      ...emptyItem(),
      title: parsed.title || title,
      start_min: parsed.start_min,
      end_min: parsed.end_min,
      duration_min: parsed.duration_min,
      priority: parsed.priority,
      tags: parsed.tags,
      color: parsed.color,
      // a new item inherits the day it is being added to, which is what you almost always want
      day_offset: scope === "week" ? (dayOffset ?? last?.day_offset ?? previewDay) : 0,
    };
    mutate([...rows, { key: uid(), item }]);
    setComposer("");
  }

  /** Unfold the items, switch to the list, open that row, put it in front of the reader. */
  function revealItem(key: string) {
    setItemsOpen(true);
    setView("list");
    setOpenKey(key);
    // The scroll has to wait for the list to exist; the click has already committed by then.
    setTimeout(() => {
      document.getElementById(`tpl-item-${key}`)?.scrollIntoView({ block: "center" });
    }, 0);
  }

  function addOnDay(offset: number) {
    const key = uid();
    mutate([...rows, { key, item: { ...emptyItem(), day_offset: offset } }]);
    revealItem(key);
    setPreviewDay(offset);
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = rows.findIndex((r) => r.key === active.id);
    const to = rows.findIndex((r) => r.key === over.id);
    if (from < 0 || to < 0) return;
    mutate(arrayMove(rows, from, to));
  }

  // ---- derived ----
  const draft: Template = React.useMemo(() => ({ ...template, ...payload }), [template, payload]);

  const refOptions = React.useMemo(
    () => referenceable(draft, templates),
    [draft, templates],
  );
  const nameOfTemplate = React.useCallback(
    (id: string) => templates.find((t) => t.id === id)?.name ?? null,
    [templates],
  );

  const expanded = React.useMemo(() => expandItems(draft, templates), [draft, templates]);

  const previewItems = React.useMemo(() => {
    const items = expanded.map((e) => e.item);
    if (scope !== "week") return items;
    return items.filter((i) => (i.day_offset ?? 0) === previewDay);
  }, [expanded, scope, previewDay]);

  const perDay = React.useMemo(() => {
    const counts = Array.from({ length: 7 }, () => 0);
    expanded.forEach((e) => { counts[Math.min(6, Math.max(0, e.item.day_offset ?? 0))] += 1; });
    return counts;
  }, [expanded]);

  const insight = React.useMemo(
    () => buildInsights(tasks, [template]).get(template.id),
    [tasks, template],
  );
  const statFor = React.useCallback(
    (title: string) => {
      if (!insight) return null;
      const key = title.trim().toLowerCase();
      return insight.items.find((s) => s.title.trim().toLowerCase() === key) ?? null;
    },
    [insight],
  );

  const minutes = totalMinutes(expanded.map((e) => e.item));
  const nested = expanded.filter((e) => e.source).length;
  const vars = React.useMemo(() => collectVars(expanded.map((e) => e.item)), [expanded]);
  const timed = expanded.filter((e) => e.item.start_min != null).length;

  // Each folded panel says what is inside it, so nothing is a dead end.
  const detailsSummary = [
    SCOPE_LABELS[scope],
    color,
    vars.user.length > 0 ? plural(vars.user.length, "variable") : null,
    insight && insight.created > 0
      ? `${percent(insight.rate)} finished`
      : insight && insight.applied > 0 ? `applied ${insight.applied}×` : null,
  ].filter(Boolean).join(" · ");

  const itemsSummary = [
    plural(rows.length, "item"),
    nested > 0 ? `+${nested} from linked templates` : null,
  ].filter(Boolean).join(" · ");

  const previewSummary = expanded.length === 0
    ? "Nothing to draw yet"
    : [
        minutes > 0 ? `${formatDuration(minutes)} planned` : null,
        timed > 0 ? `${timed} on the clock` : "nothing on the clock",
        scope === "week" ? `across ${plural(perDay.filter((c) => c > 0).length, "day")}` : null,
      ].filter(Boolean).join(" · ");

  function exportOne() {
    const text = serialize([draft], templates);
    downloadJson(fileNameFor([draft]), text);
    toast({ title: "Template exported", description: fileNameFor([draft]) });
  }

  // The seven-column board needs room; everything else reads better narrow.
  const boardMode = scope === "week" && view === "board";

  return (
    <Sheet open={open} onClose={close} width={boardMode ? 1040 : 600}>
      <header className="flex h-[var(--topbar-h)] shrink-0 items-center gap-2 px-3 hairline-b">
        <LayeredPopover
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
        </LayeredPopover>

        <InlineInput
          value={name}
          onChange={(e) => { touch(); setName(e.target.value); }}
          placeholder="Template name"
          aria-label="Template name"
          className="min-w-0 flex-1 py-1 text-[15px] font-semibold tracking-[-0.01em] text-ink placeholder:text-ink-4"
        />

        <LayeredPopover
          align="end"
          className="w-[220px]"
          trigger={<IconButton label="Template actions"><MoreHorizontal /></IconButton>}
        >
          {(closeMenu) => (
            <>
              <MenuItem icon={Copy} onClick={() => { save(); onDuplicate(draft); closeMenu(); }}>
                Duplicate template
              </MenuItem>
              <MenuItem icon={Download} onClick={() => { exportOne(); closeMenu(); }}>
                Export as JSON
              </MenuItem>
              <MenuSeparator />
              <MenuItem icon={Trash2} danger onClick={() => { setConfirming(true); closeMenu(); }}>
                Delete template
              </MenuItem>
            </>
          )}
        </LayeredPopover>

        <IconButton label="Close editor" onClick={close}>
          <X />
        </IconButton>
      </header>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
        <AutoTextarea
          value={description}
          onChange={(v) => { touch(); setDescription(v); }}
          minRows={1}
          placeholder="What is this plan for? One line is plenty."
          aria-label="Template description"
          className="rounded-md px-1 py-1 text-[13px] text-ink-3 placeholder:text-ink-4 hover:bg-hover focus:bg-hover"
        />

        {/* ---- what it is ---- */}
        <Fold label="Details" summary={detailsSummary} storageKey={DETAILS_FOLD}>
          <div className="space-y-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Segmented
                  size="sm"
                  value={scope}
                  onChange={changeScope}
                  options={SCOPES.map((s) => ({ value: s, label: SCOPE_LABELS[s] }))}
                />
                <LayeredPopover
                  align="start"
                  className="w-[188px]"
                  trigger={
                    <ColourTrigger
                      tint={color}
                      label="Template colour"
                      name={color}
                      className="w-[124px]"
                    />
                  }
                >
                  <TintPicker value={color} onChange={(t) => { if (t) { touch(); setColor(t); } }} />
                </LayeredPopover>
              </div>
              <p className="mt-1.5 px-0.5 text-[12px] text-ink-3">{SCOPE_HINTS[scope]}</p>
            </div>

            <VariablesPanel vars={vars} />
            {insight && <TruthPanel insight={insight} />}
          </div>
        </Fold>

        {/* ---- items: the one panel that opens with the sheet ---- */}
        <Fold label="Items" summary={itemsSummary} storageKey={ITEMS_FOLD} defaultOpen>
          <div>
            {scope === "week" && (
              <div className="mb-1.5 flex justify-end">
                <Segmented
                  size="sm"
                  value={view}
                  onChange={setView}
                  options={[
                    { value: "list" as EditorView, label: "List" },
                    { value: "board" as EditorView, label: "Board" },
                  ]}
                />
              </div>
            )}

            {view === "board" && scope === "week" ? (
              <WeekBoard
                rows={rows}
                weekStart={weekStart}
                hour12={hour12}
                fallbackTint={color}
                refNameOf={(row) => (row.item.ref_template_id ? nameOfTemplate(row.item.ref_template_id) : null)}
                onRelocate={(key, offset, overKey) => mutate(relocate(rows, key, offset, overKey))}
                onEdit={revealItem}
                onAdd={addOnDay}
              />
            ) : (
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
                      refOptions={refOptions}
                      refName={row.item.ref_template_id ? nameOfTemplate(row.item.ref_template_id) : null}
                      stat={statFor(row.item.title)}
                      onOpenRef={(id) => { save(); onOpenTemplate(id); }}
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
            )}

            {view === "list" && (
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
            )}

            {rows.length === 0 && (
              <p className="mt-2 px-1.5 text-[12.5px] leading-relaxed text-ink-3">
                An empty template has nothing to apply. Add the first thing you do, then build outwards —
                times, durations, conditions and variables are all optional.
              </p>
            )}
          </div>
        </Fold>

        {/* ---- shape of the day ---- */}
        <Fold label="Preview" summary={previewSummary} storageKey={PREVIEW_FOLD}>
          <div>
            {scope === "week" && (
              <div className="mb-2 flex flex-wrap justify-end gap-0.5">
                {Array.from({ length: 7 }, (_, offset) => {
                  const count = perDay[offset];
                  const selected = previewDay === offset;
                  return (
                    <button
                      key={offset}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setPreviewDay(offset)}
                      title={
                        count > 0
                          ? `${offsetLabel(offset, weekStart, "long")} — ${plural(count, "item")}`
                          : `${offsetLabel(offset, weekStart, "long")} — no items`
                      }
                      className={cn(
                        "h-7 min-w-[36px] cursor-pointer rounded-md px-1.5 text-[11.5px] font-medium",
                        "transition-[background-color,color] duration-150",
                        selected
                          ? "bg-accent-soft text-accent"
                          : count > 0
                            ? "text-ink-3 hover:bg-hover"
                            : "text-ink-4 hover:bg-hover",
                      )}
                    >
                      {offsetLabel(offset, weekStart)}
                      <span className="ml-1 tnum">{count > 0 ? count : "·"}</span>
                    </button>
                  );
                })}
              </div>
            )}
            <TimelinePreview
              items={previewItems}
              color={color}
              hour12={hour12}
              emptyHint={
                scope === "week"
                  ? `Nothing on ${offsetLabel(previewDay, weekStart, "long")} yet.`
                  : "Add an item and the shape of the day appears here."
              }
            />
          </div>
        </Fold>
      </div>

      <footer className="flex shrink-0 items-center gap-2 px-3 py-2.5 hairline-t">
        <span className="text-[11.5px] text-ink-4">Changes save as you type</span>
        <div className="flex-1" />
        <Button
          size="sm"
          // Hand off to the apply dialog rather than stacking it over the sheet.
          onClick={() => { save(); onClose(); onApply(draft); }}
          disabled={rows.length === 0}
        >
          <CalendarPlus className="size-3.5" />
          Apply…
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
