"use client";

import * as React from "react";
import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor, closestCorners,
  useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronLeft, ChevronRight, Filter, Layers, Plus, Pencil } from "lucide-react";
import { cn } from "@/lib/cn";
import type { Tint } from "@/lib/types";
import { IconButton } from "@/components/ui/primitives";
import { MiniEmpty } from "@/components/ui/form";
import type { Row } from "./item-row";
import { hasRule, ruleLabel } from "./model";
import { dayColumns, itemLead, plural, totalMinutes } from "./util";
import { formatDuration } from "@/lib/date";

const COLUMN_PREFIX = "col:";

function CardBody({
  row, hour12, fallbackTint, refName,
}: {
  row: Row;
  hour12: boolean;
  fallbackTint: Tint;
  refName: string | null;
}) {
  const item = row.item;
  const isRef = !!item.ref_template_id;

  return (
    <>
      <div className="flex items-start gap-1.5">
        {isRef ? (
          <Layers className="mt-[3px] size-3 shrink-0 text-ink-3" aria-hidden />
        ) : (
          <span
            className={cn(`tint-${item.color ?? fallbackTint}`, "mt-[5px] size-2 shrink-0 rounded-full")}
            style={{ background: "var(--tint)" }}
            aria-hidden
          />
        )}
        <span className="min-w-0 flex-1 text-[12.5px] leading-snug text-ink">
          {item.title || refName || "Untitled item"}
        </span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-1.5 pl-[14px]">
        <span className="text-[11px] text-ink-4 tnum">{itemLead(item, hour12)}</span>
        {hasRule(item.rule) && (
          <span className="inline-flex items-center gap-0.5 text-[11px] text-ink-3" title={ruleLabel(item.rule)}>
            <Filter className="size-3" aria-hidden />
          </span>
        )}
        {isRef && refName && (
          <span className="truncate text-[11px] text-ink-3">{refName}</span>
        )}
      </div>
    </>
  );
}

function BoardCard({
  row, offset, hour12, fallbackTint, refName, onMove, onEdit, columns,
}: {
  row: Row;
  offset: number;
  hour12: boolean;
  fallbackTint: Tint;
  refName: string | null;
  onMove: (key: string, offset: number) => void;
  onEdit: (key: string) => void;
  columns: { offset: number; label: string; long: string }[];
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: row.key });

  const title = row.item.title || refName || "Untitled item";
  const prev = columns[(offset + 6) % 7];
  const next = columns[(offset + 1) % 7];

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        "group/card rounded-md border border-line bg-raised px-2 py-1.5",
        "transition-[box-shadow,opacity] duration-150",
        isDragging && "opacity-40",
      )}
    >
      <button
        {...attributes}
        {...listeners}
        aria-label={`Drag ${title}`}
        className="w-full cursor-grab text-left active:cursor-grabbing"
      >
        <CardBody
          row={row}
          hour12={hour12}
          fallbackTint={fallbackTint}
          refName={refName}
        />
      </button>

      <div className="mt-1 flex items-center gap-0.5 opacity-0 transition-opacity duration-150 focus-within:opacity-100 group-hover/card:opacity-100">
        <IconButton
          label={`Move ${title} to ${prev.long}`}
          onClick={() => onMove(row.key, prev.offset)}
        >
          <ChevronLeft />
        </IconButton>
        <IconButton
          label={`Move ${title} to ${next.long}`}
          onClick={() => onMove(row.key, next.offset)}
        >
          <ChevronRight />
        </IconButton>
        <div className="flex-1" />
        <IconButton label={`Edit ${title}`} onClick={() => onEdit(row.key)}>
          <Pencil />
        </IconButton>
      </div>
    </div>
  );
}

function DayColumn({
  offset, label, long, rows, hour12, fallbackTint, refNameOf, onMove, onEdit, onAdd, columns,
}: {
  offset: number;
  label: string;
  long: string;
  rows: Row[];
  hour12: boolean;
  fallbackTint: Tint;
  refNameOf: (row: Row) => string | null;
  onMove: (key: string, offset: number) => void;
  onEdit: (key: string) => void;
  onAdd: (offset: number) => void;
  columns: { offset: number; label: string; long: string }[];
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `${COLUMN_PREFIX}${offset}` });
  const minutes = totalMinutes(rows.map((r) => r.item));

  return (
    <div className="flex min-w-[136px] flex-1 flex-col">
      <div className="mb-1.5 flex items-baseline gap-1.5 px-0.5">
        <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">{label}</span>
        <span className="text-[11px] text-ink-4 tnum">{rows.length || ""}</span>
        <div className="flex-1" />
        {minutes > 0 && <span className="text-[11px] text-ink-4 tnum">{formatDuration(minutes)}</span>}
        <IconButton label={`Add an item on ${long}`} onClick={() => onAdd(offset)}>
          <Plus />
        </IconButton>
      </div>

      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-[96px] flex-1 flex-col gap-1.5 rounded-lg border border-dashed p-1.5",
          "transition-colors duration-150",
          isOver ? "border-accent bg-accent-soft" : "border-line bg-sunken",
        )}
      >
        <SortableContext items={rows.map((r) => r.key)} strategy={verticalListSortingStrategy}>
          {rows.map((row) => (
            <BoardCard
              key={row.key}
              row={row}
              offset={offset}
              hour12={hour12}
              fallbackTint={fallbackTint}
              refName={refNameOf(row)}
              onMove={onMove}
              onEdit={onEdit}
              columns={columns}
            />
          ))}
        </SortableContext>
        {rows.length === 0 && (
          <MiniEmpty className="py-2">Nothing on {long}.</MiniEmpty>
        )}
      </div>
    </div>
  );
}

/**
 * Seven columns for a week template. Cards drag between days with a pointer,
 * and every card carries the same move as two labelled buttons for the keyboard.
 */
export function WeekBoard({
  rows, weekStart, hour12, fallbackTint, refNameOf, onRelocate, onEdit, onAdd,
}: {
  rows: Row[];
  weekStart: number;
  hour12: boolean;
  fallbackTint: Tint;
  refNameOf: (row: Row) => string | null;
  /** Move a row to a day, optionally landing it just before `overKey`. */
  onRelocate: (key: string, offset: number, overKey: string | null) => void;
  onEdit: (key: string) => void;
  onAdd: (offset: number) => void;
}) {
  const [dragging, setDragging] = React.useState<string | null>(null);
  const columns = React.useMemo(() => dayColumns(weekStart), [weekStart]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const byDay = React.useMemo(() => {
    const map = new Map<number, Row[]>();
    for (let i = 0; i < 7; i++) map.set(i, []);
    for (const row of rows) {
      const offset = Math.min(6, Math.max(0, row.item.day_offset ?? 0));
      map.get(offset)?.push(row);
    }
    return map;
  }, [rows]);

  const active = dragging ? rows.find((r) => r.key === dragging) ?? null : null;

  function onDragStart(event: DragStartEvent) {
    setDragging(String(event.active.id));
  }

  function onDragEnd(event: DragEndEvent) {
    setDragging(null);
    const { active: dragged, over } = event;
    if (!over) return;
    const key = String(dragged.id);
    const overId = String(over.id);
    if (overId === key) return;

    if (overId.startsWith(COLUMN_PREFIX)) {
      onRelocate(key, Number(overId.slice(COLUMN_PREFIX.length)), null);
      return;
    }
    const target = rows.find((r) => r.key === overId);
    if (!target) return;
    onRelocate(key, Math.min(6, Math.max(0, target.item.day_offset ?? 0)), overId);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setDragging(null)}
    >
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {columns.map(({ offset, label, long }) => (
          <DayColumn
            key={offset}
            offset={offset}
            label={label}
            long={long}
            rows={byDay.get(offset) ?? []}
            hour12={hour12}
            fallbackTint={fallbackTint}
            refNameOf={refNameOf}
            onMove={(key, next) => onRelocate(key, next, null)}
            onEdit={onEdit}
            onAdd={onAdd}
            columns={columns}
          />
        ))}
      </div>

      <p className="mt-1.5 px-0.5 text-[11.5px] text-ink-4">
        Drag a card to another day, or use the arrows on it — {plural(rows.length, "item")} across the week.
      </p>

      <DragOverlay dropAnimation={null}>
        {active && (
          <div className="w-[160px] rounded-md border border-line bg-raised px-2 py-1.5 shadow-lg">
            <CardBody
              row={active}
              hour12={hour12}
              fallbackTint={fallbackTint}
              refName={refNameOf(active)}
            />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
