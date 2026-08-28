"use client";

import * as React from "react";
import { Flame, Plus } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import { todayISO } from "@/lib/date";
import type { Habit } from "@/lib/types";
import { PageBody, PageHeader } from "@/components/shell/page-header";
import { Button, EmptyState, SectionLabel, Segmented, Skeleton } from "@/components/ui/primitives";
import { ConfirmDialog } from "@/components/ui/overlays";
import {
  buildLogIndex, isComplete, NO_COUNTS, scheduledOn,
} from "@/components/habits/habit-utils";
import { HabitsSummary } from "@/components/habits/habits-summary";
import { TodayStrip } from "@/components/habits/today-strip";
import { HabitCard } from "@/components/habits/habit-card";
import { HabitModal } from "@/components/habits/habit-modal";
import { ArchivedList } from "@/components/habits/archived-list";

const byOrder = (a: Habit, b: Habit) => a.order_index - b.order_index;

export default function HabitsPage() {
  const ready = useStore((s) => s.ready);
  const habits = useStore((s) => s.habits);
  const habitLogs = useStore((s) => s.habitLogs);
  const weekStart = useStore((s) => s.profile?.week_start ?? 1);
  const remove = useStore((s) => s.remove);
  const removeWhere = useStore((s) => s.removeWhere);
  const toast = useStore((s) => s.toast);

  const [view, setView] = React.useState<"active" | "archived">("active");
  const [editor, setEditor] = React.useState<{ habit: Habit | null } | null>(null);
  const [expandedId, setExpandedId] = React.useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = React.useState<Habit | null>(null);

  const today = todayISO();
  const index = React.useMemo(() => buildLogIndex(habitLogs), [habitLogs]);

  const active = React.useMemo(() => habits.filter((h) => !h.archived).sort(byOrder), [habits]);
  const archived = React.useMemo(() => habits.filter((h) => h.archived).sort(byOrder), [habits]);

  const due = scheduledOn(active, index, today, weekStart);
  const doneToday = due.filter((h) => isComplete(h, (index.get(h.id) ?? NO_COUNTS).get(today))).length;

  // Archived tab has nothing to show once the last archived habit is restored.
  const tab = view === "archived" && !archived.length ? "active" : view;

  function confirmDelete() {
    const habit = pendingDelete;
    if (!habit) return;
    removeWhere("habitLogs", (log) => log.habit_id === habit.id);
    remove("habits", habit.id);
    if (expandedId === habit.id) setExpandedId(null);
    toast({ title: `${habit.name} deleted`, description: "Its history went with it.", tone: "danger" });
  }

  const subtitle = !ready
    ? undefined
    : due.length
      ? `${doneToday} of ${due.length} done today`
      : active.length
        ? "Nothing scheduled today"
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
            <Skeleton className="h-[104px] rounded-lg" />
            <Skeleton className="h-9 w-64 rounded-full" />
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
          </div>
        ) : tab === "archived" ? (
          <>
            <SectionLabel className="mb-2">Archived</SectionLabel>
            <p className="mb-4 max-w-[52ch] text-[13px] leading-relaxed text-ink-3">
              Archived habits stop appearing on your day but keep every log. Restore one and the
              streak picks up exactly where it left off.
            </p>
            <ArchivedList
              habits={archived}
              index={index}
              weekStart={weekStart}
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
              logs={habitLogs}
              index={index}
              weekStart={weekStart}
              className="mb-8"
            />

            <TodayStrip
              habits={active}
              index={index}
              date={today}
              weekStart={weekStart}
              onCreate={() => setEditor({ habit: null })}
            />

            <section>
              <div className="mb-1.5 flex items-baseline gap-2">
                <SectionLabel>All habits</SectionLabel>
                <span className="text-[11px] text-ink-4 tnum">{active.length}</span>
                <div className="flex-1" />
                <span className="hidden text-[11.5px] text-ink-4 lg:block">
                  Last 20 weeks — click any square to log that day
                </span>
              </div>

              <div className="-mx-2">
                {active.map((habit, i) => (
                  <div key={habit.id} className={cn(i > 0 && "border-t border-line")}>
                    <HabitCard
                      habit={habit}
                      counts={index.get(habit.id) ?? NO_COUNTS}
                      logs={habitLogs}
                      weekStart={weekStart}
                      expanded={expandedId === habit.id}
                      onExpand={setExpandedId}
                      onEdit={(h) => setEditor({ habit: h })}
                      onDelete={setPendingDelete}
                    />
                  </div>
                ))}
              </div>
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
        />
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
        title={`Delete ${pendingDelete?.name ?? "habit"}?`}
        description="Every log for this habit goes too, and the streak can't be recovered. Archiving keeps the history instead."
        confirmLabel="Delete forever"
      />
    </>
  );
}
