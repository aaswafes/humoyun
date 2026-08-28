"use client";

import * as React from "react";
import { CalendarPlus, Check } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import { friendlyDate } from "@/lib/date";
import type { Task } from "@/lib/types";
import { Button } from "@/components/ui/primitives";
import { MiniEmpty } from "@/components/ui/form";
import { isQuranReading, juzOfPage, pagesOf } from "./quran";

const SHOWN = 8;

/**
 * The plan as a short queue rather than a calendar. Ticking here logs the
 * pages against today, which is the only place they can honestly go.
 */
export function UpcomingReadings({ today, onPlan }: { today: string; onPlan: () => void }) {
  const tasks = useStore((s) => s.tasks);
  const dayLogs = useStore((s) => s.dayLogs);
  const setDayLog = useStore((s) => s.setDayLog);
  const toggleTask = useStore((s) => s.toggleTask);

  const pending = React.useMemo(
    () =>
      tasks
        .filter((t) => isQuranReading(t) && t.status !== "done" && !!t.date)
        .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? "")),
    [tasks],
  );

  const overdue = pending.filter((t) => (t.date as string) < today);
  const ahead = pending.filter((t) => (t.date as string) >= today);
  const shown = [...overdue, ...ahead].slice(0, SHOWN);

  function log(task: Task) {
    const pages = dayLogs.find((d) => d.date === today)?.quran_pages ?? 0;
    setDayLog(today, { quran_pages: pages + pagesOf(task) });
    toggleTask(task.id);
  }

  return (
    <section className="surface p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[13px] font-semibold text-ink">Reading queue</h2>
        {pending.length > 0 && (
          <p className="tnum text-[11.5px] text-ink-3">{pending.length} left</p>
        )}
      </div>

      {pending.length === 0 ? (
        <MiniEmpty
          className="py-6"
          action={
            <Button size="sm" onClick={onPlan}>
              <CalendarPlus className="size-3.5" />
              Plan a khatm
            </Button>
          }
        >
          Nothing scheduled. A plan puts one reading a day on the calendar.
        </MiniEmpty>
      ) : (
        <>
          {overdue.length > 0 && (
            <p className="mt-2 rounded-md bg-warn-soft px-2 py-1.5 text-[11.5px] leading-snug text-warn">
              <span className="tnum">{overdue.length}</span> reading
              {overdue.length > 1 ? "s" : ""} from earlier days still open. They are held here, not lost.
            </p>
          )}

          <ul className="-mx-2 mt-1.5">
            {shown.map((task) => {
              const late = (task.date as string) < today;
              const pages = pagesOf(task);
              return (
                <li key={task.id}>
                  <button
                    type="button"
                    onClick={() => log(task)}
                    aria-label={`Log ${pages} pages for ${task.title} and tick it off`}
                    className={cn(
                      "group flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-left",
                      "transition-[background-color,transform] duration-150 ease-[var(--ease-out-apple)]",
                      "hover:bg-hover active:scale-[0.99]",
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "grid size-[17px] shrink-0 place-items-center rounded-[5px] border",
                        "transition-colors duration-150",
                        "border-line-strong text-transparent group-hover:border-accent group-hover:text-accent",
                      )}
                    >
                      <Check className="size-3 stroke-[3.5]" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] text-ink-2">
                        p.<span className="tnum">{task.page_from}</span>–
                        <span className="tnum">{task.page_to}</span>
                        <span className="text-ink-4">
                          {" · juz "}
                          <span className="tnum">{juzOfPage(task.page_from ?? 1)}</span>
                        </span>
                      </span>
                      <span className={cn("block text-[11px]", late ? "text-warn" : "text-ink-4")}>
                        {friendlyDate(task.date as string)} · <span className="tnum">{pages}</span> pages
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          {pending.length > shown.length && (
            <p className="mt-1.5 px-2 text-[11px] text-ink-4">
              <span className="tnum">{pending.length - shown.length}</span> more further out.
            </p>
          )}

          <p className="hairline-t mt-2.5 pt-2.5 text-[11px] leading-relaxed text-ink-4">
            Ticking one logs its pages against today, wherever it was scheduled.
          </p>
        </>
      )}
    </section>
  );
}
