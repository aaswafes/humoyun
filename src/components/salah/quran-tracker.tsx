"use client";

import * as React from "react";
import { BookOpen, CalendarPlus, Check, Minus } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import { addDays } from "@/lib/date";
import { Button, IconButton, Progress } from "@/components/ui/primitives";
import type { Task } from "@/lib/types";
import { KHATM_PAGES, isQuranReading, pagesOf } from "./quran";
import { KhatmPlanner } from "./khatm-planner";

const WINDOW_DAYS = 30;

export function QuranTracker({ today }: { today: string }) {
  const dayLogs = useStore((s) => s.dayLogs);
  const tasks = useStore((s) => s.tasks);
  const setDayLog = useStore((s) => s.setDayLog);
  const toggleTask = useStore((s) => s.toggleTask);
  const [planning, setPlanning] = React.useState(false);

  const todayPages = dayLogs.find((d) => d.date === today)?.quran_pages ?? 0;
  const total = dayLogs.reduce((sum, d) => sum + (d.quran_pages || 0), 0);
  const khatms = Math.floor(total / KHATM_PAGES);
  const intoKhatm = total % KHATM_PAGES;

  const since = addDays(today, -(WINDOW_DAYS - 1));
  const pace =
    dayLogs
      .filter((d) => d.date >= since && d.date <= today)
      .reduce((sum, d) => sum + (d.quran_pages || 0), 0) / WINDOW_DAYS;

  const plannedToday = tasks.find((t) => t.date === today && isQuranReading(t));
  const upcoming = tasks.filter((t) => isQuranReading(t) && t.status !== "done" && !!t.date && t.date >= today).length;

  function step(delta: number) {
    setDayLog(today, { quran_pages: Math.max(0, todayPages + delta) });
  }

  /** One tap closes the loop: the planned range is logged and the task ticked. */
  function logPlanned(task: Task) {
    setDayLog(today, { quran_pages: todayPages + pagesOf(task) });
    if (task.status !== "done") toggleTask(task.id);
  }

  const note =
    total === 0
      ? `A khatm is ${KHATM_PAGES} pages. Log what you read today and the bar fills; plan one and every day lands on your calendar.`
      : pace >= 0.5
        ? `Averaging ${pace.toFixed(1)} pages a day over the last ${WINDOW_DAYS} days — a khatm every ${Math.round(KHATM_PAGES / pace)} days at this pace.`
        : `Fewer than half a page a day over the last ${WINDOW_DAYS} days.`;

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
          <span className="text-ink-2">Khatm progress</span>
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

      <p className="mt-3 text-[12px] leading-relaxed text-ink-3">{note}</p>

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
            <Button size="xs" onClick={() => logPlanned(plannedToday)}>
              Log {pagesOf(plannedToday)} pages
            </Button>
          )}
        </div>
      )}

      <div className="hairline-t mt-4 flex items-center justify-between gap-3 pt-3">
        <p className="text-[11.5px] text-ink-3">
          {upcoming > 0 ? (
            <><span className="tnum">{upcoming}</span> reading days scheduled ahead</>
          ) : (
            "No khatm planned yet"
          )}
        </p>
        <Button size="sm" onClick={() => setPlanning(true)}>
          <CalendarPlus className="size-3.5" />
          Plan a khatm
        </Button>
      </div>

      {planning && <KhatmPlanner today={today} onClose={() => setPlanning(false)} />}
    </section>
  );
}
