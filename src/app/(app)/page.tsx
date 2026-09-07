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
import { PlanStrip } from "@/components/today/plan-strip";
import { DayLogPanel } from "@/components/today/day-log-panel";
import { SalahCard } from "@/components/today/salah-card";
import { HabitsCard } from "@/components/today/habits-card";
import { ReadingCard } from "@/components/today/reading-card";
import { FocusCard } from "@/components/today/focus-card";
import { ComingUpCard } from "@/components/today/coming-up-card";
import { Leftovers } from "@/components/today/leftovers";

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
      {/* One fact in the chrome — the hours and the overdue count have their own homes below. */}
      <PageHeader title="Today" subtitle={open ? `${open} open` : "All clear"} />

      <PageBody wide>
        <Masthead date={today} now={now} />

        <div className="mt-6">
          <NowStrip date={today} now={now} />
        </div>

        <div className="mt-8 grid grid-cols-1 gap-x-10 gap-y-10 min-[1100px]:grid-cols-[minmax(0,1fr)_300px]">
          {/* ---- the day itself: the tasks are the page ---- */}
          <div className="min-w-0">
            <Leftovers today={today} />

            {list.length > 0 && <PlanStrip date={today} minutesNow={minutesNow} />}

            <div className="mt-6">
              {overdue.length > 0 && (
                <TaskSection
                  title="Overdue"
                  count={overdue.length}
                  tone="danger"
                  accessory={
                    <Button size="xs" variant="ghost" onClick={rescheduleOverdue}>
                      Reschedule all to today
                    </Button>
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
            </div>

            <div className="mt-8">
              <DayLogPanel key={today} date={today} />

              <button
                type="button"
                onClick={planTomorrow}
                className="-mx-2 mt-1 flex w-[calc(100%+1rem)] items-center gap-1.5 rounded-md px-2 py-2 text-left cursor-pointer transition-colors duration-150 ease-[var(--ease-out-apple)] hover:bg-hover"
              >
                <CalendarPlus className="size-3.5 shrink-0 text-ink-4" />
                <span className="text-[12.5px] font-medium text-ink-2">Plan tomorrow</span>
                <span className="ml-auto flex items-center gap-1.5 text-[12px] text-ink-3 tnum">
                  {formatDate(tomorrow)}
                  <ArrowRight className="size-3" />
                </span>
              </button>
            </div>
          </div>

          {/* ---- rail: folded sections on hairlines, not a stack of cards ---- */}
          <aside className="flex min-w-0 flex-col divide-y divide-line min-[1100px]:hairline-l min-[1100px]:pl-8">
            <SalahCard date={today} minutesNow={minutesNow} />
            <HabitsCard date={today} />
            <ReadingCard date={today} />
            <FocusCard date={today} now={now} />
            <ComingUpCard date={today} />
          </aside>
        </div>
      </PageBody>
    </>
  );
}
