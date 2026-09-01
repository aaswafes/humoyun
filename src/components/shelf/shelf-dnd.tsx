"use client";

import * as React from "react";
import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor,
  closestCorners, pointerWithin, useDraggable, useDroppable, useSensor, useSensors,
  type CollisionDetection, type DragEndEvent, type DragStartEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { GripVertical } from "lucide-react";
import { cn } from "@/lib/cn";
import { useDragBody } from "@/components/ui/drag";

// =========================================================
// Dragging a card from one shelf to another.
//
// The three shelves — Books, Films & Anime, YouTube — are the same surface:
// cards in a grid, grouped by whatever the toolbar is grouping by. Dropping a
// card on another group heading files it there, which is the only thing a drop
// on a shelf can honestly mean.
//
// It is deliberately not a reorder. The shelves sort by title, pace, progress —
// never by hand — so a card dropped between two others would spring back, and a
// drag that looks like it did something and didn't is the bug this whole pass
// was about. Cross-group only, and the grip is hidden entirely when the current
// grouping is one a drop cannot change.
// =========================================================

const GROUP = "shelf:";

const ShelfContext = React.createContext<{ activeId: string | null; enabled: boolean }>({
  activeId: null,
  enabled: false,
});

/**
 * The pointer decides which shelf you are over; the corner test only steps in
 * when the cursor is in the gap between two of them.
 */
const collide: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  return hits.length ? hits : closestCorners(args);
};

export function ShelfDnd({
  enabled, onRefile, overlay, children,
}: {
  /** false when the current grouping is not something a drop could change */
  enabled: boolean;
  /** the card, and the group it was dropped on — never its own */
  onRefile: (itemId: string, groupKey: string) => void;
  /** what follows the cursor */
  overlay: (itemId: string) => React.ReactNode;
  /**
   * Rendered with whether a card is currently in the air. A shelf hides its
   * empty groups at rest — but an empty shelf you cannot see is an empty shelf
   * you cannot drop on, so they come back for the length of the drag.
   */
  children: (dragging: boolean) => React.ReactNode;
}) {
  const [activeId, setActiveId] = React.useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const ctx = React.useMemo(() => ({ activeId, enabled }), [activeId, enabled]);

  function onDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const overId = event.over ? String(event.over.id) : "";
    if (!overId.startsWith(GROUP)) return;

    const target = overId.slice(GROUP.length);
    const from = event.active.data.current?.groupKey as string | undefined;
    if (target === from) return;
    onRefile(String(event.active.id), target);
  }

  if (!enabled) {
    return <ShelfContext.Provider value={ctx}>{children(false)}</ShelfContext.Provider>;
  }

  return (
    <ShelfContext.Provider value={ctx}>
      <DndContext
        sensors={sensors}
        collisionDetection={collide}
        onDragStart={(e: DragStartEvent) => setActiveId(String(e.active.id))}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        {children(activeId !== null)}

        <DragOverlay dropAnimation={null}>
          {activeId && (
            <div className="max-w-[220px] rounded-lg border border-line bg-raised px-2.5 py-1.5 shadow-pop">
              {overlay(activeId)}
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </ShelfContext.Provider>
  );
}

/**
 * One shelf. The whole section is the target — heading included — so a card
 * dropped on an empty shelf still lands, and the ring says which one it will
 * land on.
 */
export function ShelfGroup({
  groupKey, empty, children, className,
}: {
  groupKey: string;
  /** a destination with nothing on it yet, only visible mid-drag */
  empty?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const { activeId, enabled } = React.useContext(ShelfContext);
  const { setNodeRef, isOver } = useDroppable({ id: `${GROUP}${groupKey}`, disabled: !enabled });
  const over = isOver && !!activeId;

  return (
    <section
      ref={setNodeRef}
      className={cn(
        "-mx-2 rounded-xl px-2 py-1 transition-colors duration-150",
        over && "bg-hover ring-1 ring-accent-line",
        empty && "opacity-70",
        className,
      )}
    >
      {children}
      {empty && (
        <div
          className={cn(
            "mt-1 rounded-lg border border-dashed py-6 text-center text-[12px] transition-colors duration-150",
            over ? "border-accent text-accent" : "border-line text-ink-4",
          )}
        >
          Drop here
        </div>
      )}
    </section>
  );
}

/**
 * One card. The cover is the grab surface — the card is a button, so it carries
 * `data-drag-ok` and opts back in — and the grip that appears on hover is the
 * affordance plus the keyboard path.
 */
export function ShelfItem({
  id, groupKey, label, children,
}: {
  id: string;
  groupKey: string;
  /** for the grip's accessible name */
  label: string;
  children: React.ReactNode;
}) {
  const { activeId, enabled } = React.useContext(ShelfContext);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id,
    data: { groupKey },
    disabled: !enabled,
  });
  const body = useDragBody(listeners, enabled);

  if (!enabled) return <>{children}</>;

  return (
    <div
      ref={setNodeRef}
      {...body}
      className={cn(
        "group/shelf relative cursor-grab active:cursor-grabbing",
        (isDragging || activeId === id) && "opacity-40",
      )}
    >
      <button
        {...attributes}
        {...listeners}
        data-no-drag
        aria-label={`Move ${label} to another shelf`}
        title="Drag to another shelf"
        className={cn(
          // above the full-bleed overlay button the YouTube card lays over itself
          "absolute left-1 top-1 z-20 grid size-6 place-items-center rounded-md",
          "border border-line bg-raised text-ink-4 shadow-sm cursor-grab active:cursor-grabbing",
          "opacity-0 transition-opacity duration-150",
          "hover:text-ink-2 focus-visible:opacity-100 group-hover/shelf:opacity-100",
        )}
      >
        <GripVertical className="size-3.5" />
      </button>

      {children}
    </div>
  );
}
