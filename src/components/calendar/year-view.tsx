"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { CalendarOff, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  addDays, addMonths, dayName, dayNumber, formatDuration, formatTime, isSameMonth,
  monthGrid, monthName, monthNameOf, todayISO, toISO, weekday, weekdayHeaders, yearOf,
} from "@/lib/date";
import { buildLogIndex, habitScheduledOn, isHabitComplete, NO_COUNTS } from "@/lib/habits";
import { useStore } from "@/lib/store";
import type { Task, Tint } from "@/lib/types";
import { Button, EmptyState, IconButton, Kbd, SectionLabel } from "@/components/ui/primitives";
import { VisuallyHidden } from "@/components/ui/form";
import { useMounted } from "@/components/ui/overlays";
import { openQuickAdd } from "@/components/shell/quick-add";

// =========================================================
// Year view — twelve mini-months as one contribution graph.
//
// Every square blends the four things this app actually tracks: tasks closed,
// habits hit, salah logged and focus time. One number per day, five steps of
// accent, so a year reads as a texture before it reads as data.
// =========================================================

/** Same ramp the stats heatmap uses, so the two surfaces agree on "a good day". */
const LEVEL_OPACITY = [0.14, 0.32, 0.5, 0.72, 1];

/** Only these count as prayed — mirrors the stats page. */
const PRAYED: ReadonlySet<string> = new Set(["prayed", "jamaah", "late"]);

/** An hour of deep work is a full day's worth of the focus component. */
const FOCUS_FULL_MIN = 60;

const TITLE_CAP = 4;

const pad2 = (n: number) => String(n).padStart(2, "0");

/** Thousands separator without Intl — the server and the browser must agree. */
const grouped = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

interface DayTitle {
  id: string;
  title: string;
  done: boolean;
  color: Tint | null;
  startMin: number | null;
}

interface YearDay {
  date: string;
  taskDone: number;
  taskTotal: number;
  habitDone: number;
  habitTotal: number;
  prayerDone: number;
  /** 0 when salah isn't tracked on this day, otherwise 5. */
  prayerTotal: number;
  focusMin: number;
  titles: DayTitle[];
  extraTitles: number;
  /** null = nothing was expected or recorded; 0..1 otherwise. */
  score: number | null;
  /** Something was expected here and none of it closed. */
  planned: boolean;
}

interface MonthStat {
  index: number;
  iso: string;
  taskDone: number;
  taskTotal: number;
  /** Mean day score across tracked days, or null when the month is untracked. */
  rate: number | null;
  trackedDays: number;
}

interface YearModel {
  byDate: Map<string, YearDay>;
  months: MonthStat[];
  taskDone: number;
  taskTotal: number;
  focusMin: number;
  focusSessions: number;
  perfectDays: number;
  trackedDays: number;
  activeDays: number;
  longestStreak: number;
  streakEnd: string | null;
  booksFinished: number;
  booksReading: number;
  pagesRead: number;
  readingBlocks: number;
  meanScore: number;
  hasData: boolean;
}

/** 0 is reserved for "nothing"; 1-5 map onto LEVEL_OPACITY. */
function levelOf(score: number | null): number {
  if (score == null || score <= 0) return 0;
  if (score <= 0.25) return 1;
  if (score <= 0.5) return 2;
  if (score <= 0.75) return 3;
  if (score < 0.999) return 4;
  return 5;
}

/** Timed first, then the manual order — the ordering used everywhere else. */
function sortDayTasks(a: Task, b: Task): number {
  const at = !a.all_day && a.start_min != null;
  const bt = !b.all_day && b.start_min != null;
  if (at !== bt) return at ? -1 : 1;
  if (at && bt) return (a.start_min ?? 0) - (b.start_min ?? 0);
  return a.order_index - b.order_index;
}

// ---------------------------------------------------------
// The whole year, derived in one pass over the store arrays.
// ---------------------------------------------------------
function useYearModel(year: number, weekStart: number): YearModel {
  const tasks = useStore((s) => s.tasks);
  const habits = useStore((s) => s.habits);
  const habitLogs = useStore((s) => s.habitLogs);
  const prayers = useStore((s) => s.prayers);
  const focusSessions = useStore((s) => s.focusSessions);
  const books = useStore((s) => s.books);

  return React.useMemo<YearModel>(() => {
    const yearStr = String(year);
    const yearStart = `${yearStr}-01-01`;
    const yearEnd = `${yearStr}-12-31`;
    const today = todayISO();
    const inYear = (iso: string) => iso.slice(0, 4) === yearStr;

    // The earliest day this person has any record of. Before it, habits and
    // salah were never "expected", so those days stay blank instead of
    // painting a wall of missed-ring squares back to 1 January. The sentinel
    // sorts after every real date, so "no data at all" tracks nothing.
    let earliest = "9999-12-31";

    // ---- tasks ----
    const buckets = new Map<string, Task[]>();
    let taskDoneTotal = 0;
    let taskTotalAll = 0;
    let pagesRead = 0;
    let readingBlocks = 0;
    for (const t of tasks) {
      if (!t.date || t.parent_id || t.status === "dropped") continue;
      if (t.date < earliest) earliest = t.date;
      if (!inYear(t.date)) continue;
      const list = buckets.get(t.date);
      if (list) list.push(t);
      else buckets.set(t.date, [t]);
      taskTotalAll++;
      if (t.status === "done") {
        taskDoneTotal++;
        if (t.page_from != null && t.page_to != null && t.page_to >= t.page_from) {
          pagesRead += t.page_to - t.page_from + 1;
          readingBlocks++;
        }
      }
    }

    // ---- focus ----
    const focusByDate = new Map<string, number>();
    let focusMinutes = 0;
    let focusCount = 0;
    for (const s of focusSessions) {
      if (s.mode === "break") continue;
      const date = toISO(new Date(s.started_at));
      if (date < earliest) earliest = date;
      if (!inYear(date)) continue;
      focusByDate.set(date, (focusByDate.get(date) ?? 0) + s.seconds / 60);
      focusMinutes += s.seconds / 60;
      focusCount++;
    }

    // ---- salah ----
    const prayedByDate = new Map<string, number>();
    let tracksPrayer = false;
    for (const p of prayers) {
      if (p.date < earliest) earliest = p.date;
      if (!inYear(p.date)) continue;
      tracksPrayer = true;
      if (!PRAYED.has(p.status)) continue;
      prayedByDate.set(p.date, (prayedByDate.get(p.date) ?? 0) + 1);
    }

    // ---- habits ----
    for (const l of habitLogs) if (l.date < earliest) earliest = l.date;
    const logIndex = buildLogIndex(habitLogs);
    const liveHabits = habits.filter((h) => !h.archived);

    const trackingStart = earliest > yearStart ? earliest : yearStart;

    const byDate = new Map<string, YearDay>();
    const months: MonthStat[] = Array.from({ length: 12 }, (_, i) => ({
      index: i,
      iso: `${yearStr}-${pad2(i + 1)}-01`,
      taskDone: 0,
      taskTotal: 0,
      rate: null,
      trackedDays: 0,
    }));
    const monthScore = new Array<number>(12).fill(0);

    let perfect = 0;
    let tracked = 0;
    let active = 0;
    let scoreSum = 0;
    let longest = 0;
    let running = 0;
    let streakEnd: string | null = null;

    for (let date = yearStart; date <= yearEnd; date = addDays(date, 1)) {
      const list = buckets.get(date);
      if (list) list.sort(sortDayTasks);
      const taskTotal = list?.length ?? 0;
      const taskDone = list ? list.filter((t) => t.status === "done").length : 0;

      // Habits and salah can only be "expected" on days already lived through,
      // and only once there was any data at all.
      const expectable = date <= today && date >= trackingStart;

      let habitTotal = 0;
      let habitDone = 0;
      if (expectable) {
        for (const h of liveHabits) {
          const counts = logIndex.get(h.id) ?? NO_COUNTS;
          if (!habitScheduledOn(h, date, counts, weekStart)) continue;
          habitTotal++;
          if (isHabitComplete(h, counts.get(date))) habitDone++;
        }
      }

      const prayerTotal = expectable && tracksPrayer ? 5 : 0;
      const prayerDone = Math.min(5, prayedByDate.get(date) ?? 0);
      const focusMin = Math.round(focusByDate.get(date) ?? 0);

      const parts: number[] = [];
      if (taskTotal > 0) parts.push(taskDone / taskTotal);
      if (habitTotal > 0) parts.push(habitDone / habitTotal);
      if (prayerTotal > 0) parts.push(prayerDone / prayerTotal);
      // Focus only joins the average on days it actually happened — a day
      // without a timer running was never asked for one.
      if (focusMin > 0) parts.push(Math.min(1, focusMin / FOCUS_FULL_MIN));

      const score = parts.length ? parts.reduce((sum, v) => sum + v, 0) / parts.length : null;
      const anyDone = taskDone > 0 || habitDone > 0 || prayerDone > 0 || focusMin > 0;

      const titles: DayTitle[] = (list ?? []).slice(0, TITLE_CAP).map((t) => ({
        id: t.id,
        title: t.title || "Untitled",
        done: t.status === "done",
        color: t.color,
        startMin: t.all_day ? null : t.start_min,
      }));

      const day: YearDay = {
        date,
        taskDone,
        taskTotal,
        habitDone,
        habitTotal,
        prayerDone,
        prayerTotal,
        focusMin,
        titles,
        extraTitles: Math.max(0, taskTotal - titles.length),
        score,
        planned: score !== null && score <= 0,
      };
      byDate.set(date, day);

      const mi = Number(date.slice(5, 7)) - 1;
      months[mi].taskDone += taskDone;
      months[mi].taskTotal += taskTotal;

      if (score !== null) {
        tracked++;
        scoreSum += score;
        monthScore[mi] += score;
        months[mi].trackedDays++;
        if (score > 0.9999) perfect++;
      }

      // Streaks only run over days that have happened.
      if (date <= today) {
        if (anyDone) {
          active++;
          running++;
          if (running >= longest) { longest = running; streakEnd = date; }
        } else {
          running = 0;
        }
      }
    }

    for (let i = 0; i < 12; i++) {
      months[i].rate = months[i].trackedDays ? monthScore[i] / months[i].trackedDays : null;
    }

    let booksFinished = 0;
    let booksReading = 0;
    for (const b of books) {
      if (b.status === "reading") booksReading++;
      if (b.status !== "finished") continue;
      // Books carry no "finished on" column — the plan's end date is the best
      // signal, and the row's last write is the fallback.
      const when = b.end_date ?? toISO(new Date(b.updated_at));
      if (inYear(when)) booksFinished++;
    }

    return {
      byDate,
      months,
      taskDone: taskDoneTotal,
      taskTotal: taskTotalAll,
      focusMin: Math.round(focusMinutes),
      focusSessions: focusCount,
      perfectDays: perfect,
      trackedDays: tracked,
      activeDays: active,
      longestStreak: longest,
      streakEnd,
      booksFinished,
      booksReading,
      pagesRead,
      readingBlocks,
      meanScore: tracked ? scoreSum / tracked : 0,
      hasData: tracked > 0 || taskTotalAll > 0 || focusMinutes > 0 || booksFinished > 0,
    };
  }, [tasks, habits, habitLogs, prayers, focusSessions, books, year, weekStart]);
}

// ---------------------------------------------------------
// Copy
// ---------------------------------------------------------
function describeDay(day: YearDay): string {
  const bits: string[] = [];
  if (day.taskTotal) bits.push(`${day.taskDone} of ${day.taskTotal} tasks done`);
  if (day.habitTotal) bits.push(`${day.habitDone} of ${day.habitTotal} habits`);
  if (day.prayerTotal) bits.push(`${day.prayerDone} of 5 prayers`);
  if (day.focusMin) bits.push(`${formatDuration(day.focusMin)} focus`);
  if (!bits.length) return "nothing tracked";
  if (day.planned) return `${bits.join(", ")} — nothing closed out yet`;
  return bits.join(", ");
}

// ---------------------------------------------------------
// Hover / focus card
// ---------------------------------------------------------
interface TipAnchor { x: number; y: number; w: number; h: number }

const TIP_W = 252;

function DayTip({ day, anchor, hour12 }: { day: YearDay; anchor: TipAnchor; hour12: boolean }) {
  const mounted = useMounted();
  const ref = React.useRef<HTMLDivElement>(null);
  const [pos, setPos] = React.useState<{ top: number; left: number } | null>(null);

  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    let top = anchor.y + anchor.h + 8;
    if (top + r.height > window.innerHeight - 10) top = anchor.y - r.height - 8;
    top = Math.max(10, Math.min(top, window.innerHeight - r.height - 10));
    let left = anchor.x + anchor.w / 2 - r.width / 2;
    left = Math.max(10, Math.min(left, window.innerWidth - r.width - 10));
    setPos({ top, left });
  }, [anchor, day.date]);

  if (!mounted) return null;

  const rows: { label: string; value: string }[] = [];
  if (day.taskTotal) rows.push({ label: "Tasks", value: `${day.taskDone}/${day.taskTotal}` });
  if (day.habitTotal) rows.push({ label: "Habits", value: `${day.habitDone}/${day.habitTotal}` });
  if (day.prayerTotal) rows.push({ label: "Salah", value: `${day.prayerDone}/5` });
  if (day.focusMin) rows.push({ label: "Focus", value: formatDuration(day.focusMin) });

  return createPortal(
    <div
      ref={ref}
      // The square's own aria-label already carries every number in here.
      aria-hidden
      style={{
        width: TIP_W,
        top: pos?.top ?? -9999,
        left: pos?.left ?? -9999,
        visibility: pos ? "visible" : "hidden",
      }}
      className="pointer-events-none fixed z-[75] rounded-xl border border-line bg-raised p-2.5 shadow-lg anim-fade"
    >
      <div className="flex items-baseline gap-1.5">
        <span className="display-serif text-[22px] leading-none text-ink tnum">
          {dayNumber(day.date)}
        </span>
        <span className="truncate text-[12.5px] text-ink-2">
          {monthName(day.date)} <span className="text-ink-3 tnum">{yearOf(day.date)}</span>
        </span>
        <span className="ml-auto text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">
          {dayName(day.date, "short")}
        </span>
      </div>

      {rows.length > 0 ? (
        <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
          {rows.map((r) => (
            <div key={r.label} className="flex items-baseline justify-between gap-2">
              <span className="text-[11.5px] text-ink-3">{r.label}</span>
              <span className="text-[12px] font-medium text-ink tnum">{r.value}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-[12px] leading-snug text-ink-4">
          Nothing tracked on this day yet.
        </p>
      )}

      {day.score !== null && (
        <div className="mt-2 flex items-center gap-2">
          <span className="h-[3px] flex-1 overflow-hidden rounded-full bg-hover">
            <span
              className="block h-full rounded-full"
              style={{ width: `${Math.round(day.score * 100)}%`, background: "var(--accent)" }}
            />
          </span>
          <span className="text-[11px] text-ink-3 tnum">{Math.round(day.score * 100)}%</span>
        </div>
      )}

      {day.titles.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1 border-t border-line pt-2">
          {day.titles.map((t) => (
            <li key={t.id} className={cn(`tint-${t.color ?? "slate"}`, "flex items-center gap-1.5")}>
              <span
                className="size-[5px] shrink-0 rounded-full"
                style={{ background: t.done ? "var(--ink-4)" : "var(--tint)" }}
              />
              {t.startMin != null && (
                <span className="shrink-0 text-[11px] text-ink-4 tnum">
                  {formatTime(t.startMin, hour12)}
                </span>
              )}
              <span
                className={cn(
                  "truncate text-[12px]",
                  t.done ? "text-ink-4 line-through" : "text-ink-2",
                )}
              >
                {t.title}
              </span>
            </li>
          ))}
          {day.extraTitles > 0 && (
            <li className="text-[11.5px] text-ink-4 tnum">+{day.extraTitles} more</li>
          )}
        </ul>
      )}

      <p className="mt-2 flex items-center gap-1 border-t border-line pt-2 text-[11px] text-ink-4">
        <Kbd>↵</Kbd> open day
        <span className="mx-0.5 text-ink-4">·</span>
        <Kbd>Space</Kbd> select
      </p>
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------
// One mini-month
// ---------------------------------------------------------
interface MiniMonthProps {
  year: number;
  monthIndex: number;
  weekStart: number;
  byDate: Map<string, YearDay>;
  stat: MonthStat;
  cursor: string;
  selected: string;
  today: string;
  onOpenMonth: (iso: string) => void;
  onOpenDay: (iso: string) => void;
  onSelectDay: (iso: string) => void;
  onFocusDay: (iso: string) => void;
  onShowTip: (iso: string, el: HTMLElement) => void;
  onHideTip: (iso: string) => void;
}

const MiniMonth = React.memo(function MiniMonth({
  year, monthIndex, weekStart, byDate, stat, cursor, selected, today,
  onOpenMonth, onOpenDay, onSelectDay, onFocusDay, onShowTip, onHideTip,
}: MiniMonthProps) {
  const first = `${year}-${pad2(monthIndex + 1)}-01`;
  const grid = React.useMemo(() => monthGrid(first, weekStart), [first, weekStart]);
  const headers = React.useMemo(() => weekdayHeaders(weekStart, "min"), [weekStart]);
  const label = `${monthNameOf(monthIndex)} ${year}`;
  const isCurrentMonth = today.slice(0, 7) === first.slice(0, 7);

  return (
    <section className="mx-auto w-full max-w-[264px]" aria-label={label}>
      <div className="flex items-baseline gap-2 px-0.5">
        <button
          type="button"
          onClick={() => onOpenMonth(first)}
          aria-label={`Open ${label} in month view`}
          className={cn(
            "-mx-1 flex h-7 cursor-pointer items-center rounded-md px-1 text-[13px] font-semibold tracking-[-0.01em]",
            "transition-colors duration-150 hover:bg-hover active:scale-[0.975]",
            isCurrentMonth ? "text-accent" : "text-ink",
          )}
        >
          {monthNameOf(monthIndex)}
        </button>
        <span className="ml-auto text-[11px] text-ink-4 tnum">
          {stat.rate == null ? "—" : `${Math.round(stat.rate * 100)}%`}
        </span>
      </div>

      <div className="mt-0.5 grid grid-cols-7">
        {headers.map((h, i) => (
          <span
            key={`${h}-${i}`}
            aria-hidden
            className="pb-1 text-center text-[10.5px] font-medium text-ink-4"
          >
            {h}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {grid.map((date) => {
          if (!isSameMonth(date, first)) {
            return <span key={date} aria-hidden className="aspect-square" />;
          }
          const day = byDate.get(date);
          const level = levelOf(day?.score ?? null);
          const planned = day?.planned ?? false;
          const isToday = date === today;
          const isSelected = date === selected;
          const wd = weekday(date);
          const isWeekend = wd === 0 || wd === 6;

          const shadows: string[] = [];
          if (planned) shadows.push("inset 0 0 0 1.5px var(--accent-line)");
          if (isToday) shadows.push("0 0 0 1.5px var(--ink-2)");

          const detail = day ? describeDay(day) : "nothing tracked";
          const aria =
            `${dayName(date, "long")} ${dayNumber(date)} ${monthNameOf(monthIndex)} ${year}` +
            ` — ${detail}${isToday ? ". Today" : ""}${isSelected ? ". Selected" : ""}`;

          return (
            <button
              key={date}
              type="button"
              data-year-day={date}
              tabIndex={date === cursor ? 0 : -1}
              aria-label={aria}
              aria-current={isToday ? "date" : undefined}
              onClick={() => onOpenDay(date)}
              onKeyDown={(e) => {
                // Space picks the day without leaving the year; Enter opens it.
                if (e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  onSelectDay(date);
                }
              }}
              onFocus={(e) => { onFocusDay(date); onShowTip(date, e.currentTarget); }}
              onBlur={() => onHideTip(date)}
              onMouseEnter={(e) => onShowTip(date, e.currentTarget)}
              onMouseLeave={() => onHideTip(date)}
              className={cn(
                // The square stretches to fill the padded box, so the whole
                // grid pitch — not just the paint — is the hit target.
                "relative grid aspect-square cursor-pointer rounded-[7px] p-[3px]",
                "transition-colors duration-150 focus-visible:z-10",
                isSelected ? "bg-selected" : isWeekend ? "bg-sunken hover:bg-hover" : "hover:bg-hover",
              )}
            >
              <span
                className="relative block size-full overflow-hidden rounded-[5px]"
                style={{
                  background: "var(--hover)",
                  boxShadow: shadows.length ? shadows.join(", ") : undefined,
                }}
              >
                {level > 0 && (
                  <span
                    className="absolute inset-0"
                    style={{ background: "var(--accent)", opacity: LEVEL_OPACITY[level - 1] }}
                  />
                )}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
});

// ---------------------------------------------------------
// Stat tile
// ---------------------------------------------------------
function Stat({ value, label, detail }: { value: string; label: string; detail?: string }) {
  return (
    <div className="min-w-0">
      <p className="display-serif text-[32px] leading-none text-ink tnum">{value}</p>
      <SectionLabel className="mt-1.5">{label}</SectionLabel>
      {detail && <p className="mt-0.5 truncate text-[11.5px] text-ink-4 tnum">{detail}</p>}
    </div>
  );
}

// ---------------------------------------------------------
// Year
// ---------------------------------------------------------
export interface YearViewProps {
  /** The selected day. Picks the year on show, and is drawn filled inside it. */
  anchor: string;
  weekStart: number;
  hour12: boolean;
  onStepYear: (dir: 1 | -1) => void;
  onToday: () => void;
  onSelectDay: (iso: string) => void;
  onOpenDay: (iso: string) => void;
  onOpenMonth: (iso: string) => void;
}

export function YearView({
  anchor, weekStart, hour12,
  onStepYear, onToday, onSelectDay, onOpenDay, onOpenMonth,
}: YearViewProps) {
  const year = yearOf(anchor);
  const today = todayISO();
  const thisYear = yearOf(today);
  const model = useYearModel(year, weekStart);

  const gridId = React.useId();
  const stripId = React.useId();

  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;

  // The keyboard cursor. Kept as plain state and re-derived whenever the year
  // moves out from under it, so no effect has to chase the anchor.
  const [cursorState, setCursorState] = React.useState<string | null>(null);
  const cursor =
    cursorState && cursorState.slice(0, 4) === String(year) ? cursorState : anchor;

  const [tip, setTip] = React.useState<{ date: string; anchor: TipAnchor } | null>(null);
  const gridRef = React.useRef<HTMLDivElement>(null);
  // Set only by keyboard navigation, so focus follows the cursor without ever
  // being yanked away from wherever the user actually is.
  const chase = React.useRef(false);

  React.useEffect(() => {
    if (!chase.current) return;
    chase.current = false;
    gridRef.current
      ?.querySelector<HTMLElement>(`[data-year-day="${cursor}"]`)
      ?.focus();
  }, [cursor]);

  // A card pinned to a square that has moved is worse than no card. Arrowing
  // to an off-screen day scrolls it into view, though, and dropping the card
  // for the one navigation method that needs it most would be backwards — so a
  // scroll re-anchors the card while its square still holds focus.
  React.useEffect(() => {
    const onScroll = () => {
      setTip((t) => {
        if (!t) return t;
        const el = gridRef.current?.querySelector<HTMLElement>(`[data-year-day="${t.date}"]`);
        if (!el || document.activeElement !== el) return null;
        const r = el.getBoundingClientRect();
        return { date: t.date, anchor: { x: r.left, y: r.top, w: r.width, h: r.height } };
      });
    };
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  const showTip = React.useCallback((date: string, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    setTip({ date, anchor: { x: r.left, y: r.top, w: r.width, h: r.height } });
  }, []);

  const hideTip = React.useCallback((date: string) => {
    setTip((t) => (t && t.date === date ? null : t));
  }, []);

  const focusDay = React.useCallback((date: string) => setCursorState(date), []);

  function moveCursor(e: React.KeyboardEvent) {
    // Month-name buttons live in this grid too; arrows there belong to the page.
    if (!(e.target as HTMLElement).hasAttribute("data-year-day")) return;
    let next: string | null = null;
    switch (e.key) {
      case "ArrowLeft": next = addDays(cursor, -1); break;
      case "ArrowRight": next = addDays(cursor, 1); break;
      case "ArrowUp": next = addDays(cursor, -7); break;
      case "ArrowDown": next = addDays(cursor, 7); break;
      case "PageUp": next = addMonths(cursor, -1); break;
      case "PageDown": next = addMonths(cursor, 1); break;
      case "Home": next = yearStart; break;
      case "End": next = yearEnd; break;
      default: return;
    }
    e.preventDefault();
    // The page's own arrow shortcuts would otherwise move the anchor too.
    e.stopPropagation();
    if (next === cursor) return;
    chase.current = true;
    setCursorState(next);
    if (next < yearStart) onStepYear(-1);
    else if (next > yearEnd) onStepYear(1);
  }

  const tipDay = tip ? model.byDate.get(tip.date) : null;

  const focusHours = model.focusMin / 60;
  const focusLabel = focusHours >= 100 ? String(Math.round(focusHours)) : focusHours.toFixed(1);

  const summary = model.trackedDays
    ? `${model.trackedDays} tracked ${model.trackedDays === 1 ? "day" : "days"} · ` +
      `${model.activeDays} with something done · ${Math.round(model.meanScore * 100)}% average day`
    : "Nothing tracked in this year yet";

  const gridSummary =
    `Activity for ${year}, one square per day. ` +
    `${model.trackedDays} days tracked, ${model.activeDays} with something completed, ` +
    `${model.perfectDays} perfect. Each square blends that day's tasks, habits, salah and focus time. ` +
    `Use the arrow keys to move a day at a time, Page Up and Page Down for months, ` +
    `Home and End for 1 January and 31 December, Enter to open a day and Space to select it.`;

  const stripSummary = model.months
    .map((m) => `${monthNameOf(m.index)}: ${m.rate == null ? "no data" : `${Math.round(m.rate * 100)}%`}` +
      (m.taskTotal ? `, ${m.taskDone} of ${m.taskTotal} tasks done` : ""))
    .join(". ");

  return (
    <div className="pb-2">
      {/* ---- year bar ---- */}
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1">
          <IconButton label={`Go to ${year - 1}`} onClick={() => onStepYear(-1)}>
            <ChevronLeft />
          </IconButton>
          <span className="display-serif px-1 text-[44px] leading-none text-ink tnum">
            {year}
          </span>
          <IconButton label={`Go to ${year + 1}`} onClick={() => onStepYear(1)}>
            <ChevronRight />
          </IconButton>
          <Button
            size="sm"
            onClick={onToday}
            className={cn("ml-2", year === thisYear && "text-ink-3")}
            title={`Jump to ${thisYear} and select today`}
          >
            This year
          </Button>
        </div>
        <p className="mt-2 text-[12.5px] text-ink-3 tnum">{summary}</p>
      </div>

      {/* ---- headline stats ---- */}
      {model.hasData && (
        <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-5 min-[720px]:grid-cols-3 min-[1120px]:grid-cols-6">
          <Stat
            value={grouped(model.taskDone)}
            label="Tasks done"
            detail={model.taskTotal ? `of ${grouped(model.taskTotal)} planned` : "nothing planned"}
          />
          <Stat
            value={focusLabel}
            label="Focus hours"
            detail={`${model.focusSessions} ${model.focusSessions === 1 ? "session" : "sessions"}`}
          />
          <Stat
            value={String(model.perfectDays)}
            label="Perfect days"
            detail={`of ${model.trackedDays} tracked`}
          />
          <Stat
            value={String(model.longestStreak)}
            label="Longest streak"
            detail={
              model.streakEnd
                ? `days, ending ${dayNumber(model.streakEnd)} ${monthName(model.streakEnd, true)}`
                : "days in a row"
            }
          />
          <Stat
            value={String(model.booksFinished)}
            label="Books finished"
            detail={`${model.booksReading} still reading`}
          />
          <Stat
            value={grouped(model.pagesRead)}
            label="Pages read"
            detail={`across ${model.readingBlocks} ${model.readingBlocks === 1 ? "block" : "blocks"}`}
          />
        </div>
      )}

      {!model.hasData && (
        <EmptyState
          className="py-10"
          icon={CalendarOff}
          title={`Nothing recorded in ${year}`}
          description="No tasks, habits, salah or focus time landed anywhere in this year. Jump back to today, or start planning a day right here — every square below is still a live calendar."
          action={
            <div className="flex items-center gap-2">
              <Button variant="primary" size="sm" onClick={onToday}>
                Jump to today
              </Button>
              <Button size="sm" onClick={openQuickAdd}>
                Plan something
              </Button>
            </div>
          }
        />
      )}

      {/* ---- twelve months ---- */}
      <div className="mt-7 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <SectionLabel>Twelve months</SectionLabel>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-ink-4">
          <span className="flex items-center gap-1.5">
            Less
            <span className="size-2.5 rounded-[3px]" style={{ background: "var(--hover)" }} />
            {LEVEL_OPACITY.map((o) => (
              <span
                key={o}
                className="size-2.5 rounded-[3px]"
                style={{ background: "var(--accent)", opacity: o }}
              />
            ))}
            More
          </span>
          <span className="flex items-center gap-1.5">
            <span
              className="size-2.5 rounded-[3px]"
              style={{ background: "var(--hover)", boxShadow: "inset 0 0 0 1.5px var(--accent-line)" }}
            />
            Planned, nothing done
          </span>
          <span className="flex items-center gap-1.5">
            <span
              className="size-2.5 rounded-[3px]"
              style={{ background: "var(--hover)", boxShadow: "0 0 0 1.5px var(--ink-2)" }}
            />
            Today
          </span>
        </div>
      </div>

      <VisuallyHidden id={gridId}>{gridSummary}</VisuallyHidden>
      <div
        ref={gridRef}
        onKeyDown={moveCursor}
        role="group"
        aria-label={`${year} day activity`}
        aria-describedby={gridId}
        className={cn(
          "mt-3 grid grid-cols-1 gap-x-5 gap-y-6",
          "min-[600px]:grid-cols-2 min-[980px]:grid-cols-3 min-[1320px]:grid-cols-4",
        )}
      >
        {model.months.map((m) => (
          <MiniMonth
            key={m.index}
            year={year}
            monthIndex={m.index}
            weekStart={weekStart}
            byDate={model.byDate}
            stat={m}
            cursor={cursor}
            selected={anchor}
            today={today}
            onOpenMonth={onOpenMonth}
            onOpenDay={onOpenDay}
            onSelectDay={onSelectDay}
            onFocusDay={focusDay}
            onShowTip={showTip}
            onHideTip={hideTip}
          />
        ))}
      </div>

      <p className="mt-3 text-[11.5px] leading-relaxed text-ink-4">
        Arrows move a day · <Kbd>PgUp</Kbd>/<Kbd>PgDn</Kbd> a month ·{" "}
        <Kbd>Home</Kbd>/<Kbd>End</Kbd> jump to 1 Jan / 31 Dec · <Kbd>↵</Kbd> opens the day ·{" "}
        <Kbd>Space</Kbd> selects it
      </p>

      {/* ---- month strip ---- */}
      {model.hasData && (
      <section className="mt-8">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <SectionLabel>Completion by month</SectionLabel>
          <p className="text-[11.5px] text-ink-4">
            Average day score — tasks, habits, salah and focus combined
          </p>
        </div>

        <VisuallyHidden id={stripId}>{stripSummary}</VisuallyHidden>
        <div className="mt-3 overflow-x-auto pb-1">
          <div
            role="group"
            aria-label={`Completion by month in ${year}`}
            aria-describedby={stripId}
            className="grid min-w-[540px] grid-cols-12 gap-1"
          >
            {model.months.map((m) => {
              const pct = m.rate == null ? null : Math.round(m.rate * 100);
              const isCurrent = today.slice(0, 7) === m.iso.slice(0, 7);
              return (
                <button
                  key={m.index}
                  type="button"
                  onClick={() => onOpenMonth(m.iso)}
                  aria-label={
                    `${monthNameOf(m.index)} ${year} — ` +
                    `${pct == null ? "nothing tracked" : `${pct}% average day`}` +
                    `${m.taskTotal ? `, ${m.taskDone} of ${m.taskTotal} tasks done` : ""}. ` +
                    "Open in month view."
                  }
                  className={cn(
                    "group/bar flex cursor-pointer flex-col items-center gap-1.5 rounded-md px-0.5 py-1.5",
                    "transition-colors duration-150 hover:bg-hover active:scale-[0.975]",
                  )}
                >
                  <span
                    className={cn(
                      "text-[11px] tnum transition-colors duration-150",
                      pct == null ? "text-ink-4" : "text-ink-3 group-hover/bar:text-ink",
                    )}
                  >
                    {pct == null ? "—" : `${pct}%`}
                  </span>
                  <span className="flex h-[72px] w-full items-end">
                    <span
                      className="w-full rounded-[4px] transition-[height] duration-500 ease-[var(--ease-out-apple)]"
                      style={{
                        height: pct == null ? 2 : Math.max(3, (pct / 100) * 72),
                        background: pct == null ? "var(--line-strong)" : "var(--accent)",
                        opacity: pct == null ? 1 : 0.3 + 0.7 * (pct / 100),
                      }}
                    />
                  </span>
                  <span
                    className={cn(
                      "text-[10.5px]",
                      isCurrent ? "font-semibold text-accent" : "text-ink-3",
                    )}
                  >
                    {monthNameOf(m.index, true)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </section>
      )}

      {tip && tipDay && <DayTip day={tipDay} anchor={tip.anchor} hour12={hour12} />}
    </div>
  );
}
