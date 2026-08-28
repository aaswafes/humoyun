"use client";

import { useStore, completionOn } from "@/lib/store";
import { dayName, dayNumber, monthName, yearOf } from "@/lib/date";
import { Ring } from "@/components/ui/primitives";

function greetingFor(hour: number): string {
  if (hour < 5) return "Late night";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  if (hour < 21) return "Good evening";
  return "Good night";
}

export function Masthead({ date, now }: { date: string; now: number }) {
  const tasks = useStore((s) => s.tasks);
  const displayName = useStore((s) => s.profile?.display_name);

  const { done, total } = completionOn(tasks, date);
  const pct = total ? Math.round((done / total) * 100) : 0;
  const left = total - done;

  const firstName = (displayName ?? "").trim().split(/\s+/)[0];
  const greeting = greetingFor(new Date(now).getHours());

  return (
    <header>
      <p className="text-[13px] text-ink-2">
        {greeting}
        {firstName ? `, ${firstName}` : ""}
      </p>

      <div className="mt-2.5 flex flex-wrap items-end justify-between gap-x-10 gap-y-5">
        <div className="flex items-end gap-4">
          <span className="display-serif tnum select-none text-[64px] leading-[0.76] text-ink">
            {dayNumber(date)}
          </span>
          <div className="pb-1">
            <h2 className="text-[20px] font-semibold leading-tight tracking-[-0.015em] text-ink">
              {dayName(date)}
            </h2>
            <p className="mt-0.5 text-[13px] text-ink-3 tnum">
              {monthName(date)} {yearOf(date)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 pb-1">
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
      </div>
    </header>
  );
}
