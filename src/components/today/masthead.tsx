"use client";

import { useStore, completionOn, overdueTasks, tasksOn } from "@/lib/store";
import { dayName, dayNumber, formatDuration, monthName, weekday, yearOf } from "@/lib/date";
import { Ring } from "@/components/ui/primitives";
import { CloseDay } from "./close-day";
import { budgetFor } from "./day-math";

function greetingFor(hour: number): string {
  if (hour < 5) return "Late night";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  if (hour < 21) return "Good evening";
  return "Good night";
}

/**
 * One sentence that knows what kind of day this is. Ranked by what would bother
 * you most if nobody said it: slipped work first, then an empty calendar, then
 * the shape of what is left.
 */
function contextFor({
  overdue, total, left, timed, weekend, hour, planned,
}: {
  overdue: number;
  total: number;
  left: number;
  timed: number;
  weekend: boolean;
  hour: number;
  planned: number;
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
  if (weekend) {
    return `Weekend pace — ${left} left, ${timed} on the clock.`;
  }
  if (planned > 0) {
    return `${left} to go, about ${formatDuration(planned)} of it estimated.`;
  }
  return `${left} to go, ${timed ? `${timed} of them timed` : "none of them timed yet"}.`;
}

export function Masthead({ date, now }: { date: string; now: number }) {
  const tasks = useStore((s) => s.tasks);
  const displayName = useStore((s) => s.profile?.display_name);

  const clock = new Date(now);
  const minutesNow = clock.getHours() * 60 + clock.getMinutes();

  const { done, total } = completionOn(tasks, date);
  const pct = total ? Math.round((done / total) * 100) : 0;
  const left = total - done;
  const day = tasksOn(tasks, date);
  const budget = budgetFor(day, minutesNow);
  const timed = day.filter((t) => t.start_min != null && t.status !== "done").length;

  const firstName = (displayName ?? "").trim().split(/\s+/)[0];
  const greeting = greetingFor(clock.getHours());
  const context = contextFor({
    overdue: overdueTasks(tasks, date).length,
    total,
    left,
    timed,
    weekend: weekday(date) === 0 || weekday(date) === 6,
    hour: clock.getHours(),
    planned: budget.planned,
  });

  return (
    <header>
      <p className="text-[13px] text-ink-2">
        {greeting}
        {firstName ? `, ${firstName}` : ""}
      </p>
      <p className="mt-0.5 text-[12.5px] leading-snug text-ink-3">{context}</p>

      <div className="mt-2.5 flex flex-wrap items-end justify-between gap-x-10 gap-y-5">
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

        <div className="flex flex-wrap items-center gap-x-4 gap-y-3 pb-1">
          <div className="flex items-center gap-3">
            <Ring value={done} max={total || 1} size={46} stroke={3.5}>
              {total ? (
                <span className="text-[11.5px] font-semibold text-ink tnum">{pct}</span>
              ) : (
                <span className="text-[13px] leading-none text-ink-4">—</span>
              )}
            </Ring>
            <div>
              <p className="text-[13.5px] font-medium text-ink tnum">
                {total ? `${done} of ${total} done` : "Nothing scheduled"}
              </p>
              <p className="text-[12px] text-ink-3 tnum">
                {!total
                  ? "The day is yours to shape"
                  : left === 0
                    ? "Everything is closed out"
                    : `${left} still open`}
              </p>
            </div>
          </div>

          <CloseDay date={date} now={now} />
        </div>
      </div>
    </header>
  );
}
