"use client";

import * as React from "react";
import { BookOpen, CalendarPlus, Check, Minus } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import { addDays, formatDate } from "@/lib/date";
import { Button, IconButton, Progress } from "@/components/ui/primitives";
import { ConfirmDialog } from "@/components/ui/overlays";
import type { Task } from "@/lib/types";
import {
  KHATM_PAGES, buildPlan, isQuranReading, juzOfPage, pagesOf, quranCatchUp,
} from "./quran";
import { JuzGrid } from "./juz-grid";
import { KhatmPlanner } from "./khatm-planner";
import { useQuranPlan } from "./plan-actions";

const WINDOW_DAYS = 30;

export function QuranTracker({
  today, planning, onPlanning,
}: {
  today: string;
  /** The planner is controlled from the page so the rail can open it too. */
  planning: boolean;
  onPlanning: (open: boolean) => void;
}) {
  const dayLogs = useStore((s) => s.dayLogs);
  const tasks = useStore((s) => s.tasks);
  const setDayLog = useStore((s) => s.setDayLog);
  const toggleTask = useStore((s) => s.toggleTask);
  const toast = useStore((s) => s.toast);
  const { clearFrom, schedule } = useQuranPlan();

  const [confirming, setConfirming] = React.useState(false);

  const todayPages = dayLogs.find((d) => d.date === today)?.quran_pages ?? 0;
  const total = dayLogs.reduce((sum, d) => sum + (d.quran_pages || 0), 0);
  const khatms = Math.floor(total / KHATM_PAGES);
  const intoKhatm = total % KHATM_PAGES;
  const juz = intoKhatm > 0 ? juzOfPage(intoKhatm) : 0;

  const since = addDays(today, -(WINDOW_DAYS - 1));
  const pace =
    dayLogs
      .filter((d) => d.date >= since && d.date <= today)
      .reduce((sum, d) => sum + (d.quran_pages || 0), 0) / WINDOW_DAYS;

  const plannedToday = tasks.find((t) => t.date === today && isQuranReading(t));
  const upcoming = tasks.filter((t) => isQuranReading(t) && t.status !== "done" && !!t.date && t.date >= today).length;
  const catchUp = React.useMemo(() => quranCatchUp(tasks, today), [tasks, today]);

  function step(delta: number) {
    setDayLog(today, { quran_pages: Math.max(0, todayPages + delta) });
  }

  /** One tap closes the loop: the planned range is logged and the task ticked. */
  function logPlanned(task: Task) {
    setDayLog(today, { quran_pages: todayPages + pagesOf(task) });
    if (task.status !== "done") toggleTask(task.id);
  }

  /** Same finish date, redrawn from today at whatever rate that now needs. */
  function rescheduleRemaining() {
    if (!catchUp) return;
    clearFrom(null);
    const entries = buildPlan({
      mode: "pages",
      days: catchUp.daysLeft,
      juzPerDay: 1,
      pagesPerDay: catchUp.neededPerDay,
      startDate: today,
      startPage: catchUp.nextPage,
      endPage: catchUp.lastPage,
      skipWeekdays: [],
    });
    schedule(entries);
    toast({
      title: "Plan redrawn",
      description: `${entries.length} readings from today at ${catchUp.neededPerDay} pages a day.`,
      tone: "success",
    });
  }

  const note =
    total === 0
      ? `A khatm is ${KHATM_PAGES} pages. Log what you read today and the bar fills; plan one and every day lands on your calendar.`
      : pace >= 0.5
        ? `Averaging ${pace.toFixed(1)} pages a day over the last ${WINDOW_DAYS} days — a khatm every ${Math.round(KHATM_PAGES / pace)} days at this pace.`
        : `Fewer than half a page a day over the last ${WINDOW_DAYS} days. The plan below can carry it for you.`;

  return (
    <section className="surface p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">Quran</h2>
          <p className="mt-1.5 flex items-baseline gap-2">
            <span className="display-serif tnum text-[32px] leading-none text-ink">{todayPages}</span>
            <span className="text-[12.5px] text-ink-3">{todayPages === 1 ? "page today" : "pages today"}</span>
          </p>
        </div>

        <div className="flex items-center gap-1">
          <IconButton label="Remove a page" onClick={() => step(-1)} disabled={todayPages === 0}>
            <Minus />
          </IconButton>
          <Button size="sm" className="tnum w-10" onClick={() => step(1)}>+1</Button>
          <Button size="sm" className="tnum w-10" onClick={() => step(5)}>+5</Button>
        </div>
      </div>

      <div className="mt-5">
        <div className="flex items-baseline justify-between gap-3 text-[11.5px]">
          <span className="text-ink-2">
            Khatm progress
            {juz > 0 && <span className="text-ink-3"> · juz <span className="tnum">{juz}</span></span>}
          </span>
          <span className="tnum text-ink-3">
            p.{intoKhatm} of {KHATM_PAGES}
          </span>
        </div>
        <Progress value={intoKhatm} max={KHATM_PAGES} tint="emerald" height={6} className="mt-2" />
        <p className="mt-2 text-[11.5px] text-ink-3">
          <span className="tnum">{KHATM_PAGES - intoKhatm}</span> pages to go
          {khatms > 0 && (
            <> · <span className="tnum">{khatms}</span> khatm{khatms > 1 ? "s" : ""} completed</>
          )}
        </p>
      </div>

      <JuzGrid className="hairline-t mt-4 pt-4" pagesRead={intoKhatm} onLog={(pages) => step(pages)} />

      <p className="mt-4 text-[12px] leading-relaxed text-ink-3">{note}</p>

      {plannedToday && (
        <div className="mt-4 flex items-center gap-2.5 rounded-lg bg-hover px-2.5 py-2">
          <BookOpen className="size-3.5 shrink-0 text-ink-3" aria-hidden />
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-[12.5px]",
              plannedToday.status === "done" ? "text-ink-3 line-through decoration-ink-4" : "text-ink-2",
            )}
          >
            {plannedToday.title}
          </span>
          {plannedToday.status === "done" ? (
            <span className="inline-flex shrink-0 items-center gap-1 text-[11.5px] text-success">
              <Check className="size-3.5" aria-hidden />
              Logged
            </span>
          ) : (
            <Button size="sm" onClick={() => logPlanned(plannedToday)}>
              Log {pagesOf(plannedToday)} pages
            </Button>
          )}
        </div>
      )}

      {catchUp && (
        <div className="mt-4 rounded-lg border border-line p-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <p className="text-[12.5px] font-medium text-ink">
              {catchUp.behindDays > 0 ? "Behind the plan" : "On the plan"}
            </p>
            <p className="text-[11.5px] text-ink-3">
              finishes {formatDate(catchUp.endDate, { year: true })}
            </p>
          </div>

          <p className="mt-1.5 text-[12px] leading-relaxed text-ink-2">
            {catchUp.behindDays > 0 ? (
              <>
                <span className="tnum">{catchUp.behindDays}</span> reading{catchUp.behindDays > 1 ? "s" : ""} from
                past days {catchUp.behindDays > 1 ? "are" : "is"} still open —{" "}
                <span className="tnum">{catchUp.behindPages}</span> pages.{" "}
                {catchUp.daysLeft > 1 ? (
                  <>
                    Read <span className="tnum font-medium text-ink">{catchUp.neededPerDay}</span> a day from today
                    and it still lands on the same date
                    {catchUp.plannedPerDay > 0 && (
                      <> — the plan was drawn at <span className="tnum">{catchUp.plannedPerDay}</span>.</>
                    )}
                  </>
                ) : (
                  <>
                    The plan has run out of days, so catching up puts all{" "}
                    <span className="tnum font-medium text-ink">{catchUp.remainingPages}</span> pages on today.
                    Moving the finish date is the kinder option.
                  </>
                )}
              </>
            ) : (
              <>
                <span className="tnum">{catchUp.remainingPages}</span> pages left over{" "}
                <span className="tnum">{catchUp.daysLeft}</span> days, about{" "}
                <span className="tnum font-medium text-ink">{catchUp.neededPerDay}</span> a day.
              </>
            )}
          </p>

          {catchUp.behindDays > 0 && (
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <Button size="sm" variant="primary" onClick={() => setConfirming(true)}>
                Catch up at {catchUp.neededPerDay} a day
              </Button>
              <Button size="sm" variant="ghost" onClick={() => onPlanning(true)}>
                Move the finish date instead
              </Button>
            </div>
          )}
        </div>
      )}

      <div className="hairline-t mt-4 flex flex-wrap items-center justify-between gap-3 pt-3">
        <p className="text-[11.5px] text-ink-3">
          {upcoming > 0 ? (
            <><span className="tnum">{upcoming}</span> reading days scheduled ahead</>
          ) : (
            "No khatm planned yet"
          )}
        </p>
        <Button size="sm" onClick={() => onPlanning(true)}>
          <CalendarPlus className="size-3.5" />
          {upcoming > 0 ? "Re-plan" : "Plan a khatm"}
        </Button>
      </div>

      {planning && (
        <KhatmPlanner
          today={today}
          currentPage={intoKhatm}
          onClose={() => onPlanning(false)}
        />
      )}

      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={rescheduleRemaining}
        tone="primary"
        confirmLabel="Redraw the plan"
        title="Reschedule the remaining readings?"
        description={
          catchUp
            ? `The unfinished Quran readings are removed and rebuilt from today at ${catchUp.neededPerDay} pages a day, still finishing ${formatDate(catchUp.endDate)}. Readings you have already ticked are left alone.`
            : undefined
        }
      />
    </section>
  );
}
