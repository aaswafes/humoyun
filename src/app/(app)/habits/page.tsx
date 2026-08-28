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
import { Flame, GripVertical, Plus } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import { todayISO } from "@/lib/date";
import type { Habit, HabitLog } from "@/lib/types";
import { PageBody, PageHeader } from "@/components/shell/page-header";
import { Button, EmptyState, SectionLabel, Segmented, Skeleton } from "@/components/ui/primitives";
import { ConfirmDialog } from "@/components/ui/overlays";
import {
  buildLogIndex, isComplete, NO_COUNTS, scheduledOn,
} from "@/components/habits/habit-utils";
import {
  normaliseOrder, slotOf, SLOT_HINT, SLOT_ICON, SLOT_LABEL, stackOrder,
  useHabitMeta, type HabitMeta, type Slot,
} from "@/components/habits/habit-meta";
import { HabitsSummary } from "@/components/habits/habits-summary";
import { TodayStrip } from "@/components/habits/today-strip";
import { HabitCard } from "@/components/habits/habit-card";
import { HabitModal } from "@/components/habits/habit-modal";
import { HabitSheet } from "@/components/habits/habit-sheet";
import { ArchivedList } from "@/components/habits/archived-list";
import { ArchiveDialog } from "@/components/habits/archive-dialog";

export default function HabitsPage() {
  const ready = useStore((s) => s.ready);
  const habits = useStore((s) => s.habits);
  const habitLogs = useStore((s) => s.habitLogs);
  const weekStart = useStore((s) => s.profile?.week_start ?? 1);
  const patch = useStore((s) => s.patch);
  const remove = useStore((s) => s.remove);
  const removeWhere = useStore((s) => s.removeWhere);
  const toast = useStore((s) => s.toast);
  const { meta, metaOf, skipsOf, setMeta, setSkip, clearMeta } = useHabitMeta();

  const [view, setView] = React.useState<"active" | "archived">("active");
  const [editor, setEditor] = React.useState<{ habit: Habit | null } | null>(null);
  const [expandedId, setExpandedId] = React.useState<string | null>(null);
  const [detailId, setDetailId] = React.useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = React.useState<Habit | null>(null);
  const [pendingArchive, setPendingArchive] = React.useState<Habit | null>(null);

  const today = todayISO();
  const index = React.useMemo(() => buildLogIndex(habitLogs), [habitLogs]);

  const logsByHabit = React.useMemo(() => {
    const map = new Map<string, HabitLog[]>();
    for (const log of habitLogs) {
      const list = map.get(log.habit_id);
      if (list) list.push(log);
      else map.set(log.habit_id, [log]);
    }
    for (const list of map.values()) list.sort((a, b) => b.date.localeCompare(a.date));
    return map;
  }, [habitLogs]);

  // The displayed order is the stored order: slots, then chains.
  const active = React.useMemo(
    () => stackOrder(habits.filter((h) => !h.archived), meta),
    [habits, meta],
  );
  const archived = React.useMemo(
    () => habits.filter((h) => h.archived).sort((a, b) => a.order_index - b.order_index),
    [habits],
  );

  const scheduled = scheduledOn(active, index, today, weekStart);
  const resting = scheduled.filter((h) => skipsOf(h.id).has(today));
  const due = scheduled.filter((h) => !skipsOf(h.id).has(today));
  const doneToday = due.filter((h) => isComplete(h, (index.get(h.id) ?? NO_COUNTS).get(today))).length;

  // Slot headers only earn their space once the day has more than one part.
  // A stacked habit takes its heading from the chain it belongs to.
  const present = new Set(active.map((h) => h.id));
  const slotFor = (habit: Habit) => slotOf(habit.id, meta, present);
  const usedSlots = new Set<Slot>();
  for (const habit of active) usedSlots.add(slotFor(habit));
  const grouped = usedSlots.size > 1;

  // Archived tab has nothing to show once the last archived habit is restored.
  const tab = view === "archived" && !archived.length ? "active" : view;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  /**
   * One path for every reorder — drag, or the Move up / Move down items that
   * give the same result from the keyboard. Landing inside another part of the
   * day adopts that part; leaving a stack breaks the link, reversibly.
   */
  function moveTo(id: string, toIndex: number) {
    const from = active.findIndex((h) => h.id === id);
    const to = Math.max(0, Math.min(active.length - 1, toIndex));
    if (from < 0 || from === to) return;

    const habit = active[from];
    const before = metaOf(id);
    const next = arrayMove(active, from, to);
    const above = next[to - 1] ?? null;
    const neighbour = above ?? next[to + 1] ?? null;
    const landed = neighbour ? slotFor(neighbour) : before.slot;
    // Dropping it straight back under its own anchor is not leaving the stack.
    const detaches = !!before.after && above?.id !== before.after;

    const changes: Partial<HabitMeta> = {};
    if (landed !== before.slot) changes.slot = landed;
    if (detaches) changes.after = null;
    if (Object.keys(changes).length) setMeta(id, changes);

    next.forEach((h, i) => { if (h.order_index !== i) patch("habits", h.id, { order_index: i }); });
    normaliseOrder();

    if (detaches) {
      const anchor = habits.find((h) => h.id === before.after);
      toast({
        title: `${habit.name} moved out of the stack`,
        description: anchor ? `It no longer follows ${anchor.name}.` : undefined,
        action: {
          label: "Undo",
          run: () => { setMeta(id, { after: before.after, slot: before.slot }); normaliseOrder(); },
        },
      });
    }
  }

  function onDragEnd(event: DragEndEvent) {
    const { active: dragged, over } = event;
    if (!over || dragged.id === over.id) return;
    moveTo(String(dragged.id), active.findIndex((h) => h.id === over.id));
  }

  function unstack(habit: Habit) {
    const before = metaOf(habit.id).after;
    setMeta(habit.id, { after: null });
    normaliseOrder();
    toast({
      title: `${habit.name} stands alone`,
      action: { label: "Undo", run: () => { setMeta(habit.id, { after: before }); normaliseOrder(); } },
    });
  }

  function archiveHabit(habit: Habit, reason: string | null) {
    const orphans = habits.filter((h) => metaOf(h.id).after === habit.id);
    const anchored = metaOf(habit.id).after;
    patch("habits", habit.id, { archived: true });
    setMeta(habit.id, { archivedReason: reason, archivedAt: today, after: null });
    // Anything stacked onto it has lost its anchor.
    orphans.forEach((h) => setMeta(h.id, { after: null }));
    normaliseOrder();
    if (expandedId === habit.id) setExpandedId(null);
    if (detailId === habit.id) setDetailId(null);

    toast({
      title: `${habit.name} archived`,
      description: reason ?? "Its history is kept — restore it any time.",
      action: {
        label: "Undo",
        run: () => {
          patch("habits", habit.id, { archived: false });
          setMeta(habit.id, { archivedReason: null, archivedAt: null, after: anchored });
          orphans.forEach((h) => setMeta(h.id, { after: habit.id }));
          normaliseOrder();
        },
      },
    });
  }

  function confirmDelete() {
    const habit = pendingDelete;
    if (!habit) return;
    removeWhere("habitLogs", (log) => log.habit_id === habit.id);
    habits.filter((h) => metaOf(h.id).after === habit.id).forEach((h) => setMeta(h.id, { after: null }));
    remove("habits", habit.id);
    clearMeta(habit.id);
    normaliseOrder();
    if (expandedId === habit.id) setExpandedId(null);
    if (detailId === habit.id) setDetailId(null);
    toast({ title: `${habit.name} deleted`, description: "Its history went with it.", tone: "danger" });
  }

  const subtitle = !ready
    ? undefined
    : due.length
      ? `${doneToday} of ${due.length} done today${resting.length ? ` · ${resting.length} resting` : ""}`
      : active.length
        ? resting.length ? `${resting.length} resting today` : "Nothing scheduled today"
        : undefined;

  return (
    <>
      <PageHeader
        title="Habits"
        subtitle={subtitle}
        actions={
          <Button variant="primary" size="sm" onClick={() => setEditor({ habit: null })}>
            <Plus className="size-3.5" />
            New habit
          </Button>
        }
      >
        {archived.length > 0 && (
          <Segmented
            size="sm"
            value={tab}
            onChange={setView}
            className="mr-1"
            options={[
              { value: "active", label: "Active" },
              {
                value: "archived",
                label: <>Archived <span className="text-ink-4 tnum">{archived.length}</span></>,
              },
            ]}
          />
        )}
      </PageHeader>

      <PageBody wide>
        {!ready ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-[130px] rounded-lg" />
            <Skeleton className="h-9 w-64 rounded-full" />
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
          </div>
        ) : tab === "archived" ? (
          <>
            <SectionLabel className="mb-2">Archived</SectionLabel>
            <p className="mb-4 max-w-[56ch] text-[13px] leading-relaxed text-ink-3">
              Archived habits stop appearing on your day but keep every log, every note and the
              reason you put them down. Restore one and the streak picks up exactly where it left off.
            </p>
            <ArchivedList
              habits={archived}
              index={index}
              skipsOf={skipsOf}
              weekStart={weekStart}
              onOpenDetail={setDetailId}
              onDelete={setPendingDelete}
            />
          </>
        ) : !active.length ? (
          <EmptyState
            icon={Flame}
            title="No habits yet"
            description="Habits are the things you want to do on a rhythm — every day, on set weekdays, or a few times a week. Add one and the streak starts tonight."
            action={
              <Button variant="primary" onClick={() => setEditor({ habit: null })}>
                <Plus className="size-4" />
                New habit
              </Button>
            }
            className="py-20"
          />
        ) : (
          <>
            <HabitsSummary
              habits={active}
              archivedCount={archived.length}
              index={index}
              skipsOf={skipsOf}
              weekStart={weekStart}
              className="mb-8"
            />

            <TodayStrip
              habits={active}
              index={index}
              meta={meta}
              skipsOf={skipsOf}
              date={today}
              weekStart={weekStart}
              onCreate={() => setEditor({ habit: null })}
              onOpenDetail={setDetailId}
              onSkip={(habitId, date, reason) => setSkip(habitId, date, reason)}
            />

            <section>
              <div className="mb-1.5 flex flex-wrap items-baseline gap-2">
                <SectionLabel>All habits</SectionLabel>
                <span className="text-[11px] text-ink-4 tnum">{active.length}</span>
                <div className="flex-1" />
                <span className="hidden text-[11.5px] text-ink-4 xl:block">
                  Drag to reorder · click a square to log that day
                </span>
              </div>

              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                modifiers={[restrictToVerticalAxis, restrictToParentElement]}
                onDragEnd={onDragEnd}
              >
                <SortableContext items={active.map((h) => h.id)} strategy={verticalListSortingStrategy}>
                  <div className="-mx-2">
                    {active.map((habit, i) => {
                      const row = metaOf(habit.id);
                      const slot = slotFor(habit);
                      const prev = i > 0 ? slotFor(active[i - 1]) : null;
                      const header = grouped && slot !== prev;
                      const anchor = row.after ? active.find((h) => h.id === row.after) ?? null : null;

                      return (
                        <React.Fragment key={habit.id}>
                          {header && <SlotHeader slot={slot} first={i === 0} />}
                          <SortableHabit id={habit.id} divided={i > 0 && !header}>
                            {(handle) => (
                              <HabitCard
                                habit={habit}
                                counts={index.get(habit.id) ?? NO_COUNTS}
                                logs={logsByHabit.get(habit.id) ?? EMPTY_LOGS}
                                skips={skipsOf(habit.id)}
                                meta={row}
                                stackedAfter={anchor}
                                weekStart={weekStart}
                                today={today}
                                expanded={expandedId === habit.id}
                                onExpand={setExpandedId}
                                onEdit={(h) => setEditor({ habit: h })}
                                onOpenDetail={setDetailId}
                                onArchive={setPendingArchive}
                                onDelete={setPendingDelete}
                                onSkip={(date, reason) => setSkip(habit.id, date, reason)}
                                onUnstack={unstack}
                                onMove={(h, dir) => moveTo(h.id, i + dir)}
                                canMoveUp={i > 0}
                                canMoveDown={i < active.length - 1}
                                dragHandle={handle}
                              />
                            )}
                          </SortableHabit>
                        </React.Fragment>
                      );
                    })}
                  </div>
                </SortableContext>
              </DndContext>
            </section>
          </>
        )}
      </PageBody>

      {editor && (
        <HabitModal
          key={editor.habit?.id ?? "new"}
          habit={editor.habit}
          weekStart={weekStart}
          onClose={() => setEditor(null)}
          onArchive={setPendingArchive}
        />
      )}

      <HabitSheet
        habitId={detailId}
        onClose={() => setDetailId(null)}
        onEdit={(habit) => setEditor({ habit })}
        onArchive={setPendingArchive}
        onDelete={setPendingDelete}
      />

      <ArchiveDialog
        key={pendingArchive?.id ?? "none"}
        habit={pendingArchive}
        daysLogged={pendingArchive ? index.get(pendingArchive.id)?.size ?? 0 : 0}
        onClose={() => setPendingArchive(null)}
        onArchive={archiveHabit}
      />

      <ConfirmDialog
        open={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
        title={`Delete ${pendingDelete?.name ?? "habit"}?`}
        description="Every log and note for this habit goes too, and the streak can't be recovered. Archiving keeps the history instead."
        confirmLabel="Delete forever"
      />
    </>
  );
}

const EMPTY_LOGS: HabitLog[] = [];

function SlotHeader({ slot, first }: { slot: Slot; first: boolean }) {
  const Icon = SLOT_ICON[slot];
  return (
    <div className={cn("flex items-baseline gap-2 px-2", first ? "pb-1.5" : "pb-1.5 pt-5")}>
      <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">
        <Icon className="size-3" aria-hidden />
        {SLOT_LABEL[slot]}
      </span>
      <span className="text-[11.5px] text-ink-4">{SLOT_HINT[slot]}</span>
    </div>
  );
}

function SortableHabit({
  id, divided, children,
}: {
  id: string;
  divided: boolean;
  children: (handle: React.ReactNode) => React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(divided && "border-t border-line", isDragging && "relative z-10 opacity-90")}
    >
      {children(
        <button
          {...attributes}
          {...listeners}
          aria-label="Reorder habit — hold space, then use the arrow keys"
          title="Drag to reorder"
          className="grid size-7 cursor-grab place-items-center rounded-md text-ink-4 hover:bg-hover hover:text-ink-2 active:cursor-grabbing"
        >
          <GripVertical className="size-3.5" />
        </button>,
      )}
    </div>
  );
}
