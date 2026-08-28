"use client";

import * as React from "react";
import {
  DndContext, closestCenter, PointerSensor, KeyboardSensor,
  useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, sortableKeyboardCoordinates, useSortable,
  verticalListSortingStrategy, arrayMove,
} from "@dnd-kit/sortable";
import { restrictToVerticalAxis, restrictToParentElement } from "@dnd-kit/modifiers";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Plus } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore, orderBetween } from "@/lib/store";
import { parseTask } from "@/lib/parse";
import type { Task } from "@/lib/types";
import { TaskRow } from "./task-row";
import { EmptyState } from "@/components/ui/primitives";

// ---------------------------------------------------------
// Sortable wrapper — the row itself stays presentational
// ---------------------------------------------------------
function SortableTaskRow({ task, showDate }: { task: Task; showDate?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(isDragging && "relative z-10 opacity-90")}
    >
      <TaskRow
        task={task}
        showDate={showDate}
        dragHandle={
          <button
            {...attributes}
            {...listeners}
            aria-label="Reorder task"
            className="grid size-4 cursor-grab place-items-center rounded text-ink-4 hover:text-ink-2 active:cursor-grabbing"
          >
            <GripVertical className="size-3.5" />
          </button>
        }
      />
    </div>
  );
}

// ---------------------------------------------------------
// Inline composer — the Notion "click here and type" row
// ---------------------------------------------------------
export function InlineComposer({
  date, parentId, placeholder = "Add a task", defaults, className, autoFocus,
}: {
  date?: string | null;
  parentId?: string;
  placeholder?: string;
  defaults?: Partial<Task>;
  className?: string;
  autoFocus?: boolean;
}) {
  const addTask = useStore((s) => s.addTask);
  const weekStart = useStore((s) => s.profile?.week_start ?? 1);
  const [active, setActive] = React.useState(!!autoFocus);
  const [value, setValue] = React.useState("");
  const ref = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => { if (active) ref.current?.focus(); }, [active]);

  function submit() {
    const text = value.trim();
    if (!text) { setActive(false); return; }
    const parsed = parseTask(text, weekStart);
    addTask({
      title: parsed.title,
      date: parsed.date ?? date ?? null,
      start_min: parsed.start_min,
      end_min: parsed.end_min,
      all_day: parsed.start_min == null,
      duration_min: parsed.duration_min,
      priority: parsed.priority,
      tags: parsed.tags,
      parent_id: parentId ?? null,
      ...defaults,
    });
    setValue("");
  }

  if (!active) {
    return (
      <button
        onClick={() => setActive(true)}
        className={cn(
          "flex w-full items-center gap-2 rounded-md px-1.5 py-[6px] text-left text-[13.5px] text-ink-4",
          "hover:bg-hover hover:text-ink-3 cursor-pointer transition-colors",
          className,
        )}
      >
        <Plus className="size-4" />
        {placeholder}
      </button>
    );
  }

  return (
    <div className={cn("flex items-center gap-2 rounded-md bg-hover px-1.5 py-[5px]", className)}>
      <Plus className="size-4 shrink-0 text-ink-4" />
      <input
        ref={ref}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => { submit(); setActive(false); }}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); submit(); }
          if (e.key === "Escape") { setValue(""); setActive(false); }
        }}
        placeholder="Task name — try “friday 9am #deep !high”"
        className="min-w-0 flex-1 bg-transparent text-[13.5px] text-ink outline-none placeholder:text-ink-4"
      />
    </div>
  );
}

// ---------------------------------------------------------
// TaskList
// ---------------------------------------------------------
export function TaskList({
  tasks, showDate, sortable = true, composer, composerDate, composerDefaults,
  emptyTitle = "Nothing here yet", emptyDescription, className,
}: {
  tasks: Task[];
  showDate?: boolean;
  sortable?: boolean;
  composer?: boolean;
  composerDate?: string | null;
  composerDefaults?: Partial<Task>;
  emptyTitle?: string;
  emptyDescription?: string;
  className?: string;
}) {
  const patch = useStore((s) => s.patch);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = tasks.findIndex((t) => t.id === active.id);
    const newIndex = tasks.findIndex((t) => t.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const reordered = arrayMove(tasks, oldIndex, newIndex);
    const before = reordered[newIndex - 1]?.order_index;
    const after = reordered[newIndex + 1]?.order_index;
    patch("tasks", String(active.id), { order_index: orderBetween(before, after) });
  }

  if (!tasks.length && !composer) {
    return <EmptyState title={emptyTitle} description={emptyDescription} className={className} />;
  }

  const rows = sortable ? (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis, restrictToParentElement]}
      onDragEnd={onDragEnd}
    >
      <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        {tasks.map((task) => (
          <SortableTaskRow key={task.id} task={task} showDate={showDate} />
        ))}
      </SortableContext>
    </DndContext>
  ) : (
    tasks.map((task) => <TaskRow key={task.id} task={task} showDate={showDate} />)
  );

  return (
    <div className={cn("relative", className)}>
      {rows}
      {!tasks.length && (
        <p className="px-1.5 py-2 text-[13px] text-ink-4">{emptyDescription ?? emptyTitle}</p>
      )}
      {composer && (
        <InlineComposer date={composerDate} defaults={composerDefaults} className="mt-0.5" />
      )}
    </div>
  );
}

/** Collapsible section wrapper used by Today, Inbox and Upcoming. */
export function TaskSection({
  title, count, children, defaultOpen = true, accessory, tone,
}: {
  title: string;
  count?: number;
  children: React.ReactNode;
  defaultOpen?: boolean;
  accessory?: React.ReactNode;
  tone?: "danger" | "default";
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <section className="mb-5">
      <div className="mb-1 flex items-center gap-2">
        <button
          onClick={() => setOpen((v) => !v)}
          className="group flex items-center gap-1.5 cursor-pointer"
        >
          <h2 className={cn(
            "text-[11px] font-semibold uppercase tracking-[0.06em]",
            tone === "danger" ? "text-danger" : "text-ink-3",
          )}>
            {title}
          </h2>
          {count !== undefined && (
            <span className="text-[11px] text-ink-4 tnum">{count}</span>
          )}
        </button>
        <div className="ml-auto">{accessory}</div>
      </div>
      {open && children}
    </section>
  );
}
