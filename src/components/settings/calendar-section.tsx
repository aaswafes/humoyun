"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { useStore, type CalendarView } from "@/lib/store";
import {
  dayNameOf, formatDuration, formatTime, todayISO, weekDates, weekday, weekdayHeaders,
} from "@/lib/date";
import { Button, Segmented } from "@/components/ui/primitives";
import { VisuallyHidden } from "@/components/ui/form";
import { FoldGroup, Group, Pane, Row, TimeField } from "./ui";

const DEFAULT_WORK_START = 9 * 60;
const DEFAULT_WORK_END = 18 * 60;
const DEFAULT_WORK_DAYS = [1, 2, 3, 4, 5];

const PRESETS: { label: string; start: number; end: number; days: number[] }[] = [
  { label: "Early bird", start: 6 * 60, end: 14 * 60, days: [1, 2, 3, 4, 5] },
  { label: "Nine to five", start: 9 * 60, end: 17 * 60, days: [1, 2, 3, 4, 5] },
  { label: "Long day", start: 8 * 60, end: 19 * 60, days: [1, 2, 3, 4, 5] },
  { label: "Six-day week", start: 9 * 60, end: 16 * 60, days: [0, 1, 2, 3, 4, 6] },
];

const VIEW_HINT: Record<CalendarView, string> = {
  day: "One day, hour by hour, with the day log beside it.",
  week: "Seven columns and a time axis — the view that catches collisions.",
  month: "The whole month at a glance. Best for moving things around.",
  agenda: "A flat list of what is coming, ignoring empty days.",
};

/** Reads a minute count out of the loosely-typed prefs bag. */
function minutePref(prefs: Record<string, unknown> | undefined, key: string, fallback: number) {
  const raw = prefs?.[key];
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) && n >= 0 && n <= 1440 ? n : fallback;
}

function dayListPref(prefs: Record<string, unknown> | undefined, key: string, fallback: number[]) {
  const raw = prefs?.[key];
  if (!Array.isArray(raw)) return fallback;
  const days = raw.filter((d): d is number => typeof d === "number" && d >= 0 && d <= 6);
  return days.length ? [...new Set(days)].sort((a, b) => a - b) : fallback;
}

function DayBar({ start, end, hour12 }: { start: number; end: number; hour12: boolean }) {
  const ticks = [0, 6, 12, 18, 24];
  return (
    <div className="w-[300px]">
      <div className="relative h-7 w-full overflow-hidden rounded-md bg-hover">
        {[3, 6, 9, 12, 15, 18, 21].map((h) => (
          <div key={h} className="absolute inset-y-0 w-px bg-line" style={{ left: `${(h / 24) * 100}%` }} />
        ))}
        <div
          className="absolute inset-y-0 rounded-md border border-accent-line bg-accent-soft transition-[left,width] duration-200 ease-[var(--ease-out-apple)]"
          style={{ left: `${(start / 1440) * 100}%`, width: `${((end - start) / 1440) * 100}%` }}
        />
      </div>
      <div className="mt-1.5 flex justify-between text-[10.5px] text-ink-4 tnum">
        {ticks.map((h) => (
          <span key={h}>{formatTime((h % 24) * 60, hour12)}</span>
        ))}
      </div>
    </div>
  );
}

interface DayLoad {
  date: string;
  dow: number;
  working: boolean;
  blocks: { start: number; end: number; title: string; color: string | null }[];
  outside: number;
}

/**
 * The current week drawn against the working window, from the real calendar.
 * The point is not decoration: it shows how much of the week is actually
 * landing outside the hours you just claimed as yours.
 */
function WeekLoad({
  days, workStart, workEnd, hour12, describedBy,
}: {
  days: DayLoad[];
  workStart: number;
  workEnd: number;
  hour12: boolean;
  describedBy: string;
}) {
  return (
    <div aria-describedby={describedBy} className="w-full max-w-[440px] space-y-1">
      {days.map((d) => (
        <div key={d.date} className="flex items-center gap-2.5">
          <span className={cn("w-8 shrink-0 text-[11px] font-medium", d.working ? "text-ink-2" : "text-ink-4")}>
            {dayNameOf(d.dow, "short")}
          </span>
          <div className="relative h-5 flex-1 overflow-hidden rounded-[5px] bg-hover">
            {d.working && (
              <div
                className="absolute inset-y-0 bg-accent-soft"
                style={{ left: `${(workStart / 1440) * 100}%`, width: `${((workEnd - workStart) / 1440) * 100}%` }}
              />
            )}
            {d.blocks.map((b, i) => (
              <div
                key={`${b.start}-${i}`}
                title={`${b.title} · ${formatTime(b.start, hour12)}`}
                className={cn(
                  "absolute inset-y-[3px] rounded-[3px]",
                  b.color ? `tint-${b.color}` : "",
                )}
                style={{
                  left: `${(b.start / 1440) * 100}%`,
                  width: `${Math.max(1.2, ((b.end - b.start) / 1440) * 100)}%`,
                  background: b.color ? "var(--tint)" : "var(--ink-3)",
                }}
              />
            ))}
          </div>
          <span className="w-[52px] shrink-0 text-right text-[11px] text-ink-4 tnum">
            {d.outside ? `${d.outside} out` : d.blocks.length ? `${d.blocks.length}` : "—"}
          </span>
        </div>
      ))}
    </div>
  );
}

export function CalendarSection() {
  const profile = useStore((s) => s.profile);
  const hour12 = useStore((s) => s.hour12);
  const tasks = useStore((s) => s.tasks);
  const calendarView = useStore((s) => s.calendarView);
  const setCalendarView = useStore((s) => s.setCalendarView);
  const updateProfile = useStore((s) => s.updateProfile);

  const summaryId = React.useId();

  const weekStart = profile?.week_start ?? 1;
  const prefs = profile?.prefs as Record<string, unknown> | undefined;
  const workStart = minutePref(prefs, "work_start", DEFAULT_WORK_START);
  const workEnd = minutePref(prefs, "work_end", DEFAULT_WORK_END);
  const workDays = dayListPref(prefs, "work_days", DEFAULT_WORK_DAYS);

  function writePref(changes: Record<string, unknown>) {
    updateProfile({ prefs: { ...(prefs ?? {}), ...changes } });
  }

  function setStart(next: number) {
    // A window has to have a shape: keep at least an hour of daylight in it.
    const end = next >= workEnd ? Math.min(1440, next + 60) : workEnd;
    writePref({ work_start: next, work_end: end });
  }

  function setEnd(next: number) {
    const start = next <= workStart ? Math.max(0, next - 60) : workStart;
    writePref({ work_start: start, work_end: next });
  }

  function toggleWorkDay(dow: number) {
    const next = workDays.includes(dow)
      ? workDays.filter((d) => d !== dow)
      : [...workDays, dow].sort((a, b) => a - b);
    // An empty working week would make the whole panel meaningless.
    if (!next.length) return;
    writePref({ work_days: next });
  }

  // Left unmemoised on purpose: seven filters over the task list is cheap, and
  // the compiler memoises it more accurately than a hand-written dependency array.
  const today = todayISO();
  const load: DayLoad[] = weekDates(today, weekStart).map((date) => {
    const dow = weekday(date);
    const blocks = tasks
      .filter((t) => t.date === date && t.start_min != null && t.status !== "dropped" && !t.parent_id)
      .map((t) => ({
        start: t.start_min as number,
        end: Math.max((t.start_min as number) + 15, t.end_min ?? (t.start_min as number) + (t.duration_min ?? 30)),
        title: t.title,
        color: t.color,
      }))
      .sort((a, b) => a.start - b.start);

    const working = workDays.includes(dow);
    const outside = working
      ? blocks.filter((b) => b.start < workStart || b.end > workEnd).length
      : blocks.length;
    return { date, dow, working, blocks, outside };
  });

  const totalBlocks = load.reduce((a, d) => a + d.blocks.length, 0);
  const totalOutside = load.reduce((a, d) => a + d.outside, 0);
  const weeklyHours = (workEnd - workStart) * workDays.length;

  return (
    <Pane
      title="Calendar"
      description="Where the week begins, what the calendar opens to, and the hours you actually intend to work."
    >
      <Group title="The week">
        <Row
          label="Week starts on"
          hint="Every week grid, mini calendar and weekly review follows this."
          stacked
        >
          <div className="flex flex-wrap items-center gap-4">
            <Segmented
              value={String(weekStart)}
              onChange={(v) => updateProfile({ week_start: Number(v) })}
              options={[
                { value: "0", label: "Sunday" },
                { value: "1", label: "Monday" },
              ]}
            />
            <div className="flex items-center gap-1">
              {weekdayHeaders(weekStart, "short").map((d, i) => (
                <span
                  key={`${d}-${i}`}
                  className={cn(
                    "grid h-6 w-8 place-items-center rounded-md text-[11px] font-medium",
                    i === 0 ? "bg-accent-soft text-accent" : "text-ink-3",
                  )}
                >
                  {d}
                </span>
              ))}
            </div>
          </div>
        </Row>

        <Row label="Default view" hint={VIEW_HINT[calendarView]}>
          <Segmented
            value={calendarView}
            onChange={(v) => {
              setCalendarView(v as CalendarView);
              writePref({ default_view: v });
            }}
            options={[
              { value: "day", label: "Day" },
              { value: "week", label: "Week" },
              { value: "month", label: "Month" },
              { value: "agenda", label: "Agenda" },
            ]}
          />
        </Row>
      </Group>

      <Group
        title="Working hours"
        description="The stretch of the day the calendar treats as yours to spend. The week grid shades it in."
      >
        <Row
          label="Start and end"
          hint={`${formatDuration(workEnd - workStart)} a day. Arrow keys nudge by fifteen minutes, Shift by an hour.`}
          stacked
        >
          <div className="flex flex-wrap items-end gap-6">
            <div className="flex items-center gap-2">
              {/* Keyed so each field re-seeds when the other one nudges it. */}
              <TimeField
                key={`start-${workStart}-${hour12}`}
                value={workStart} onChange={setStart} hour12={hour12} label="Working hours start"
              />
              <span className="text-[13px] text-ink-4">to</span>
              <TimeField
                key={`end-${workEnd}-${hour12}`}
                value={workEnd} onChange={setEnd} hour12={hour12} label="Working hours end"
              />
            </div>
            <DayBar start={workStart} end={workEnd} hour12={hour12} />
          </div>
        </Row>

        <Row label="Presets" hint="A starting point. Nudge it afterwards." stacked>
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((p) => {
              const active = p.start === workStart && p.end === workEnd;
              return (
                <Button
                  key={p.label}
                  size="sm"
                  variant={active ? "subtle" : "secondary"}
                  onClick={() => writePref({ work_start: p.start, work_end: p.end, work_days: p.days })}
                >
                  {p.label}
                  <span className="text-ink-3 tnum">
                    {formatTime(p.start, hour12)}–{formatTime(p.end, hour12)}
                  </span>
                </Button>
              );
            })}
          </div>
        </Row>

        <Row
          label="Working days"
          hint={`${workDays.length} days a week, ${formatDuration(weeklyHours)} in total.`}
          stacked
        >
          <div className="flex flex-wrap gap-1.5">
            {Array.from({ length: 7 }, (_, i) => (i + weekStart) % 7).map((dow) => {
              const on = workDays.includes(dow);
              return (
                <button
                  key={dow}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleWorkDay(dow)}
                  className={cn(
                    "h-7 min-w-[46px] cursor-pointer rounded-md px-2 text-[12px] font-medium",
                    "transition-[background-color,color] duration-150",
                    on
                      ? "bg-accent-soft text-accent ring-1 ring-accent-line"
                      : "bg-hover text-ink-3 hover:text-ink-2",
                  )}
                >
                  {dayNameOf(dow, "short")}
                </button>
              );
            })}
          </div>
        </Row>

      </Group>

      <FoldGroup
        title="This week against those hours"
        storageKey="humoyun.settings.weekLoadOpen"
        summary={
          totalBlocks === 0
            ? "Nothing with a time on it this week"
            : totalOutside === 0
              ? "Everything timed lands inside the window"
              : `${totalOutside} of ${totalBlocks} timed items fall outside it`
        }
      >
        <div className="pt-1">
          <>
            <WeekLoad
              days={load}
              workStart={workStart}
              workEnd={workEnd}
              hour12={hour12}
              describedBy={summaryId}
            />
            <VisuallyHidden id={summaryId}>
              {`This week has ${totalBlocks} items with a start time. ${totalOutside} of them fall outside your working window of ${formatTime(workStart, hour12)} to ${formatTime(workEnd, hour12)}. ` +
                load
                  .map((d) => `${dayNameOf(d.dow, "long")}: ${d.blocks.length} timed, ${d.outside} outside.`)
                  .join(" ")}
            </VisuallyHidden>
          </>
        </div>
      </FoldGroup>
    </Pane>
  );
}
