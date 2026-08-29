"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore, tasksOn } from "@/lib/store";
import { addDays, dayName, dayNumber, formatTime, weekday } from "@/lib/date";
import { RailCard, RailMeta, RailRow } from "./rail-card";

const DAYS_AHEAD = 3;

/** The next three days, close enough to act on and far enough to still change. */
export function ComingUpCard({ date }: { date: string }) {
  const router = useRouter();
  const tasks = useStore((s) => s.tasks);
  const hour12 = useStore((s) => s.hour12);
  const setSelectedDate = useStore((s) => s.setSelectedDate);
  const setCalendarView = useStore((s) => s.setCalendarView);

  const days = React.useMemo(
    () => Array.from({ length: DAYS_AHEAD }, (_, i) => addDays(date, i + 1)).map((iso) => {
      const list = tasksOn(tasks, iso).filter((t) => t.status !== "dropped");
      const timed = list.filter((t) => t.start_min != null);
      return {
        iso,
        count: list.length,
        first: timed[0] ?? list[0] ?? null,
        firstTimed: timed[0] ?? null,
        weekend: weekday(iso) === 0 || weekday(iso) === 6,
      };
    }),
    [tasks, date],
  );

  const total = days.reduce((sum, d) => sum + d.count, 0);

  function open(iso: string) {
    setSelectedDate(iso);
    setCalendarView("day");
    router.push("/calendar");
  }

  const summary = total
    ? `${total} task${total === 1 ? "" : "s"} in the next three days`
    : "the next three days are empty";

  return (
    <RailCard
      icon={CalendarDays}
      title="Coming up"
      foldKey="rail.comingUp"
      summary={summary}
      href="/calendar"
      hrefLabel="Open Calendar"
      footer={
        <RailMeta value={String(total)}>
          {total === 0 ? "The next three days are empty" : "Tasks in the next three days"}
        </RailMeta>
      }
    >
      {days.map((day) => (
        <RailRow
          key={day.iso}
          onClick={() => open(day.iso)}
          ariaLabel={
            `Open ${dayName(day.iso)} ${dayNumber(day.iso)} — ` +
            (day.count ? `${day.count} task${day.count === 1 ? "" : "s"}` : "nothing planned")
          }
        >
          <span className="w-8 shrink-0">
            <span className={cn(
              "block text-[11px]",
              day.weekend ? "text-ink-4" : "text-ink-3",
            )}>
              {dayName(day.iso, "short")}
            </span>
            <span className="block text-[13px] leading-tight text-ink-2 tnum">{dayNumber(day.iso)}</span>
          </span>

          <span className="min-w-0 flex-1">
            <span className={cn("block truncate text-[13px]", day.count ? "text-ink" : "text-ink-4")}>
              {day.first?.title || (day.weekend ? "Clear weekend day" : "Nothing planned")}
            </span>
            <span className="block truncate text-[11.5px] text-ink-3 tnum">
              {day.count
                ? `${day.count} task${day.count === 1 ? "" : "s"}${
                    day.firstTimed ? ` · first at ${formatTime(day.firstTimed.start_min, hour12)}` : " · none timed"
                  }`
                : "Tap to plan it"}
            </span>
          </span>

          <ChevronRight aria-hidden className="size-3.5 shrink-0 text-ink-4" />
        </RailRow>
      ))}
    </RailCard>
  );
}
