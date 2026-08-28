"use client";

import { useRouter } from "next/navigation";
import { ArrowRight, CalendarPlus, Sun } from "lucide-react";
import { useStore, overdueTasks, tasksOn } from "@/lib/store";
import { addDays, formatDate, toISO } from "@/lib/date";
import { useNow } from "@/hooks/use-hotkeys";
import { PageBody, PageHeader } from "@/components/shell/page-header";
import { openQuickAdd } from "@/components/shell/quick-add";
import { TaskList, TaskSection } from "@/components/tasks/task-list";
import { Button, EmptyState } from "@/components/ui/primitives";
import { Masthead } from "@/components/today/masthead";
import { NowStrip } from "@/components/today/now-strip";
import { SalahCard } from "@/components/today/salah-card";
import { HabitsCard } from "@/components/today/habits-card";
import { ReadingCard } from "@/components/today/reading-card";
import { FocusCard } from "@/components/today/focus-card";

export default function TodayPage() {
  const router = useRouter();
  const now = useNow(30000);

  const tasks = useStore((s) => s.tasks);
  const moveTask = useStore((s) => s.moveTask);
  const toast = useStore((s) => s.toast);
  const setSelectedDate = useStore((s) => s.setSelectedDate);
  const setCalendarView = useStore((s) => s.setCalendarView);

  // Derived from the ticking clock so the page rolls over at midnight on its own.
  const clock = new Date(now);
  const today = toISO(clock);
  const minutesNow = clock.getHours() * 60 + clock.getMinutes();
  const tomorrow = addDays(today, 1);

  const overdue = overdueTasks(tasks, today);
  const list = tasksOn(tasks, today);
  const timed = list.filter((t) => t.start_min != null);
  const anytime = list.filter((t) => t.start_min == null);
  const open = list.filter((t) => t.status !== "done" && t.status !== "dropped").length;

  function rescheduleOverdue() {
    const snapshot = overdue.map((t) => ({ id: t.id, date: t.date }));
    snapshot.forEach((s) => moveTask(s.id, today));
    toast({
      title: `Moved ${snapshot.length} task${snapshot.length === 1 ? "" : "s"} to today`,
      tone: "success",
      action: { label: "Undo", run: () => snapshot.forEach((s) => moveTask(s.id, s.date)) },
    });
  }

  function planTomorrow() {
    setSelectedDate(tomorrow);
    setCalendarView("day");
    router.push("/calendar");
  }

  return (
    <>
      <PageHeader
        title="Today"
        subtitle={
          overdue.length
            ? `${open} open · ${overdue.length} overdue`
            : open
              ? `${open} open`
              : "All clear"
        }
      />

      <PageBody wide>
        <Masthead date={today} now={now} />

        <div className="mt-6">
          <NowStrip date={today} now={now} />
        </div>

        <div className="mt-8 grid grid-cols-1 gap-x-8 gap-y-8 min-[1100px]:grid-cols-[minmax(0,1fr)_312px]">
          {/* ---- the day itself ---- */}
          <div className="min-w-0">
            {overdue.length > 0 && (
              <TaskSection
                title="Overdue"
                count={overdue.length}
                tone="danger"
                accessory={
                  <button
                    type="button"
                    onClick={rescheduleOverdue}
                    className="rounded-md px-1.5 py-0.5 text-[11.5px] font-medium text-danger cursor-pointer transition-[background-color,transform] duration-150 ease-[var(--ease-out-apple)] hover:bg-danger-soft active:scale-[0.97]"
                  >
                    Reschedule all to today
                  </button>
                }
              >
                <TaskList tasks={overdue} showDate sortable={false} />
              </TaskSection>
            )}

            {list.length === 0 ? (
              <EmptyState
                icon={Sun}
                title="Nothing planned for today"
                description="Write down the one thing that would make today count, then build the rest around it."
                action={
                  <Button variant="primary" size="sm" onClick={openQuickAdd}>
                    Add a task
                  </Button>
                }
                className="rounded-lg border border-line py-12"
              />
            ) : (
              <>
                {timed.length > 0 && (
                  <TaskSection title="Timed" count={timed.length}>
                    <TaskList tasks={timed} sortable={false} />
                  </TaskSection>
                )}

                <TaskSection title={timed.length ? "Anytime" : "Tasks"} count={anytime.length}>
                  <TaskList
                    tasks={anytime}
                    composer
                    composerDate={today}
                    emptyDescription="Everything today has a time on it."
                  />
                </TaskSection>
              </>
            )}

            <button
              type="button"
              onClick={planTomorrow}
              className="mt-1 flex w-full items-center gap-2.5 rounded-lg border border-line bg-raised px-3.5 py-3 text-left cursor-pointer transition-[background-color,transform] duration-200 ease-[var(--ease-out-apple)] hover:bg-hover active:scale-[0.99]"
            >
              <CalendarPlus className="size-4 shrink-0 text-ink-3" />
              <span className="text-[13.5px] font-medium text-ink">Plan tomorrow</span>
              <span className="ml-auto flex items-center gap-1.5 text-[12.5px] text-ink-3 tnum">
                {formatDate(tomorrow)}
                <ArrowRight className="size-3.5" />
              </span>
            </button>
          </div>

          {/* ---- rail ---- */}
          <aside className="flex min-w-0 flex-col gap-3">
            <SalahCard date={today} minutesNow={minutesNow} />
            <HabitsCard date={today} />
            <ReadingCard date={today} />
            <FocusCard date={today} />
          </aside>
        </div>
      </PageBody>
    </>
  );
}
