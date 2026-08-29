"use client";

import { useStore, completionOn, overdueTasks, tasksOn } from "@/lib/store";
import { dayName, dayNumber, monthName, weekday, yearOf } from "@/lib/date";
import { CloseDay } from "./close-day";

function greetingFor(hour: number): string {
  if (hour < 5) return "Late night";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  if (hour < 21) return "Good evening";
  return "Good night";
}

/**
 * The masthead's one progress expression. Ranked by what would bother you most
 * if nobody said it: slipped work first, then an empty calendar, then the shape
 * of what is left. The hours-planned figure is deliberately absent — it belongs
 * to Plan the day, and saying it twice is what made this page loud.
 */
function contextFor({
  overdue, total, left, timed, weekend, hour,
}: {
  overdue: number;
  total: number;
  left: number;
  timed: number;
  weekend: boolean;
  hour: number;
}): string {
  if (overdue > 0) {
    const tail = total === 0 ? " and nothing new is planned yet." : ".";
    return `${overdue} task${overdue === 1 ? "" : "s"} slipped from earlier days${tail}`;
  }
  if (total === 0) {
    return weekend
      ? "A weekend with nothing on it. Keep it clear, or plant one thing."
      : "Nothing on the calendar yet. Name the one thing that would make today count.";
  }
  if (left === 0) {
    return hour < 18
      ? "Everything is closed out, and the day is still going."
      : "Everything is closed out. Call it a day.";
  }
  if (weekend) return `Weekend pace. ${left} left, ${timed} on the clock.`;
  return `${left} to go, ${timed ? `${timed} of them timed` : "none of them timed yet"}.`;
}

/**
 * Date is the hero and the only 64px thing on the page. Everything the ring,
 * the greeting and the "still open" line used to say lives in one quiet
 * sentence beside it; closing the day is an action, not a competing button.
 */
export function Masthead({ date, now }: { date: string; now: number }) {
  const tasks = useStore((s) => s.tasks);
  const displayName = useStore((s) => s.profile?.display_name);

  const clock = new Date(now);
  const { done, total } = completionOn(tasks, date);
  const left = total - done;
  const day = tasksOn(tasks, date);
  const timed = day.filter((t) => t.start_min != null && t.status !== "done").length;

  const firstName = (displayName ?? "").trim().split(/\s+/)[0];
  const sentence =
    `${greetingFor(clock.getHours())}${firstName ? `, ${firstName}` : ""}. ` +
    contextFor({
      overdue: overdueTasks(tasks, date).length,
      total,
      left,
      timed,
      weekend: weekday(date) === 0 || weekday(date) === 6,
      hour: clock.getHours(),
    });

  return (
    <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
      <div className="flex items-end gap-4">
        <span className="display-serif tnum select-none text-[64px] leading-[0.76] text-ink">
          {dayNumber(date)}
        </span>
        <div className="pb-1">
          <h2 className="text-[19px] font-semibold leading-tight tracking-[-0.015em] text-ink">
            {dayName(date)}
          </h2>
          <p className="mt-0.5 text-[13px] text-ink-3 tnum">
            {monthName(date)} {yearOf(date)}
          </p>
        </div>
      </div>

      <div className="flex min-w-0 flex-1 items-end justify-between gap-4 pb-1">
        <p className="min-w-0 max-w-[46ch] text-[12.5px] leading-snug text-ink-3">{sentence}</p>
        <CloseDay date={date} now={now} />
      </div>
    </header>
  );
}
