"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import {
  ArrowUpRight, BookOpen, Check, ChevronsRight, Clock, LayoutTemplate, X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import {
  addDays, dayName, dayNumber, formatDuration, formatRange, formatTime,
  monthName, nowMinutes, todayISO, yearOf,
} from "@/lib/date";
import { completionOn, tasksOn, useStore } from "@/lib/store";
import { buildLogIndex, habitScheduledOn, habitStreakOn, isHabitComplete } from "@/lib/habits";
import { prayerTimesFor } from "@/lib/prayer";
import { PRAYER_LABELS, PRAYER_NAMES, type Task } from "@/lib/types";
import { IconButton, Progress, SectionLabel } from "@/components/ui/primitives";
import { MenuItem, Popover, useMounted } from "@/components/ui/overlays";
import { MiniEmpty } from "@/components/ui/form";
import { TaskList } from "@/components/tasks/task-list";
import { PRAYER_STATE, StateMark } from "@/components/salah/prayer-state";
import { Fold, useStickyFlag } from "./view-prefs";
import { applyTemplateOnDay, isTimed, spanOf } from "./calendar-utils";

const WIDTH = 344;

const FOCUSABLE = [
  "a[href]", "button:not([disabled])", "input:not([disabled])",
  "textarea:not([disabled])", "select:not([disabled])", '[tabindex]:not([tabindex="-1"])',
].join(",");

// ---------------------------------------------------------
// Mini timeline — where the day's timed work actually sits
// ---------------------------------------------------------
function MiniTimeline({
  date, tasks, hour12,
}: {
  date: string;
  tasks: Task[];
  hour12: boolean;
}) {
  const profile = useStore((s) => s.profile);
  const now = nowMinutes();
  const isToday = date === todayISO();

  const prayerTimes = React.useMemo(() => {
    if (!profile) return null;
    return prayerTimesFor(date, {
      latitude: profile.latitude,
      longitude: profile.longitude,
      method: profile.calc_method,
      madhab: profile.madhab,
    });
  }, [date, profile]);

  const spans = React.useMemo(
    () => tasks.map((task) => ({ task, ...spanOf(task) })).sort((a, b) => a.start - b.start),
    [tasks],
  );

  // The window always shows the working day, and stretches to hold anything
  // scheduled outside it rather than clipping the block off the edge.
  const earliest = spans.length ? Math.min(...spans.map((s) => s.start)) : 480;
  const latest = spans.length ? Math.max(...spans.map((s) => s.end)) : 1260;
  const from = Math.max(0, Math.min(360, Math.floor(earliest / 60) * 60));
  const to = Math.min(1440, Math.max(1320, Math.ceil(latest / 60) * 60));
  const width = Math.max(60, to - from);
  const pct = (min: number) => ((Math.max(from, Math.min(to, min)) - from) / width) * 100;

  const ticks = React.useMemo(() => {
    const out: number[] = [];
    for (let m = Math.ceil(from / 180) * 180; m < to; m += 180) out.push(m);
    return out;
  }, [from, to]);

  const summary = spans.length
    ? `Timeline from ${formatTime(from, hour12)} to ${formatTime(to, hour12)}. ${spans
      .map((s) => `${s.task.title || "Untitled"} ${formatRange(s.start, s.end, hour12)}`)
      .join(". ")}.`
    : `No timed work between ${formatTime(from, hour12)} and ${formatTime(to, hour12)}.`;

  return (
    <div className="mt-1.5">
      <div
        role="img"
        aria-label={summary}
        className="relative h-8 overflow-hidden rounded-md border border-line bg-sunken"
      >
        {ticks.map((m) => (
          <span
            key={m}
            aria-hidden
            className="absolute inset-y-0 w-px bg-line"
            style={{ left: `${pct(m)}%` }}
          />
        ))}

        {prayerTimes && PRAYER_NAMES.map((name) => (
          <span
            key={name}
            aria-hidden
            title={`${PRAYER_LABELS[name]} ${formatTime(prayerTimes[name], hour12)}`}
            className="tint-emerald absolute bottom-0 h-1.5 w-px"
            style={{ left: `${pct(prayerTimes[name])}%`, background: "var(--tint)" }}
          />
        ))}

        {spans.map(({ task, start, end }) => (
          <span
            key={task.id}
            aria-hidden
            title={`${task.title || "Untitled"} · ${formatRange(start, end, hour12)}`}
            className={cn(
              `tint-${task.color ?? "slate"}`,
              "absolute top-1.5 h-4 rounded-[3px]",
            )}
            style={{
              left: `${pct(start)}%`,
              width: `${Math.max(1.2, pct(end) - pct(start))}%`,
              background: "var(--tint)",
              opacity: task.status === "done" ? 0.35 : 0.85,
            }}
          />
        ))}

        {isToday && now >= from && now <= to && (
          <span
            aria-hidden
            className="absolute inset-y-0 w-[1.5px] bg-accent"
            style={{ left: `${pct(now)}%` }}
          />
        )}
      </div>

      <div className="mt-1 flex items-baseline justify-between text-[10.5px] text-ink-4 tnum">
        <span>{formatTime(from, hour12)}</span>
        <span>{formatTime(Math.round((from + to) / 2), hour12)}</span>
        <span>{formatTime(to === 1440 ? 1439 : to, hour12)}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------
// Salah row
// ---------------------------------------------------------
function SalahRow({ date, hour12 }: { date: string; hour12: boolean }) {
  const profile = useStore((s) => s.profile);
  const prayers = useStore((s) => s.prayers);
  const cyclePrayer = useStore((s) => s.cyclePrayer);

  const times = React.useMemo(() => {
    if (!profile) return null;
    return prayerTimesFor(date, {
      latitude: profile.latitude,
      longitude: profile.longitude,
      method: profile.calc_method,
      madhab: profile.madhab,
    });
  }, [date, profile]);

  if (!times) return null;

  return (
    <div className="mt-1.5 grid grid-cols-5 gap-1">
      {PRAYER_NAMES.map((name) => {
        const status = prayers.find((p) => p.date === date && p.name === name)?.status ?? "none";
        const state = PRAYER_STATE[status];
        return (
          <button
            key={name}
            type="button"
            onClick={() => cyclePrayer(date, name)}
            aria-label={`${PRAYER_LABELS[name]} at ${formatTime(times[name], hour12)} — ${state.label}. Activate to change.`}
            title={`${PRAYER_LABELS[name]} — ${state.meaning}`}
            className={cn(
              "flex cursor-pointer flex-col items-center gap-1 rounded-md py-1.5",
              "transition-colors duration-150 hover:bg-hover active:scale-[0.97]",
            )}
          >
            <StateMark status={status} />
            <span className="text-[10.5px] font-medium text-ink-2">{PRAYER_LABELS[name]}</span>
            <span className={cn("text-[10.5px] tnum", state.text)}>
              {formatTime(times[name], hour12)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------
// Habits due on this day
// ---------------------------------------------------------
/** The habits this day expects, and the log index they are counted against. */
function useHabitsDue(date: string) {
  const habits = useStore((s) => s.habits);
  const habitLogs = useStore((s) => s.habitLogs);
  const weekStart = useStore((s) => s.profile?.week_start ?? 1);

  const index = React.useMemo(() => buildLogIndex(habitLogs), [habitLogs]);
  const due = React.useMemo(
    () => habits
      .filter((h) => !h.archived && habitScheduledOn(h, date, index.get(h.id), weekStart))
      .sort((a, b) => a.order_index - b.order_index),
    [habits, date, index, weekStart],
  );

  return { due, index, weekStart };
}

function HabitsDue({
  date, due, index, weekStart,
}: {
  date: string;
  due: ReturnType<typeof useHabitsDue>["due"];
  index: ReturnType<typeof useHabitsDue>["index"];
  weekStart: number;
}) {
  const toggleHabit = useStore((s) => s.toggleHabit);

  if (!due.length) return null;

  return (
    <section className="mt-4">
      <div className="mb-1 flex items-baseline justify-between">
        <SectionLabel>Habits due</SectionLabel>
        <span className="text-[11px] text-ink-4 tnum">
          {due.filter((h) => isHabitComplete(h, index.get(h.id)?.get(date))).length}/{due.length}
        </span>
      </div>

      {due.map((habit) => {
        const counts = index.get(habit.id);
        const count = counts?.get(date) ?? 0;
        const complete = isHabitComplete(habit, count);
        const streak = counts ? habitStreakOn(habit, counts, date, weekStart) : 0;
        return (
          <button
            key={habit.id}
            type="button"
            onClick={() => toggleHabit(habit.id, date)}
            aria-label={
              `${habit.name} — ${complete ? "done" : `${count} of ${Math.max(1, habit.target_count)}`}` +
              `${streak ? `, ${streak} day streak` : ""}. Activate to log.`
            }
            className={cn(
              `tint-${habit.color}`,
              "flex h-7 w-full cursor-pointer items-center gap-2 rounded-md px-1 text-left",
              "transition-colors duration-150 hover:bg-hover",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "grid size-[17px] shrink-0 place-items-center rounded-[5px] border",
                complete ? "border-transparent text-white" : "border-line-strong",
              )}
              style={complete ? { background: "var(--tint)" } : undefined}
            >
              {complete && <Check className="size-3 stroke-[3.5]" />}
            </span>

            <span
              className={cn(
                "min-w-0 flex-1 truncate text-[13px]",
                complete ? "text-ink-3 line-through decoration-ink-4/60" : "text-ink",
              )}
            >
              {habit.name}
            </span>

            {habit.target_count > 1 && (
              <span className="shrink-0 text-[11px] text-ink-3 tnum">
                {count}/{habit.target_count}
              </span>
            )}
            {streak > 0 && (
              <span className="shrink-0 text-[11px] text-[var(--tint-ink)] tnum">{streak}d</span>
            )}
          </button>
        );
      })}
    </section>
  );
}

// ---------------------------------------------------------
// Reading blocks — the book behind the chip, not another copy of the task
// ---------------------------------------------------------
function ReadingBlocks({ tasks }: { tasks: Task[] }) {
  const books = useStore((s) => s.books);

  const blocks = React.useMemo(() => {
    const map = new Map<string, { from: number; to: number; done: boolean }>();
    for (const task of tasks) {
      if (!task.book_id) continue;
      const prev = map.get(task.book_id);
      const from = task.page_from ?? prev?.from ?? 0;
      const to = task.page_to ?? prev?.to ?? 0;
      map.set(task.book_id, {
        from: prev ? Math.min(prev.from, from) : from,
        to: prev ? Math.max(prev.to, to) : to,
        done: (prev?.done ?? true) && task.status === "done",
      });
    }
    return [...map.entries()].flatMap(([id, span]) => {
      const book = books.find((b) => b.id === id);
      return book ? [{ book, span }] : [];
    });
  }, [tasks, books]);

  if (!blocks.length) return null;

  return (
    <section className="mt-4">
      <SectionLabel className="mb-1">Reading</SectionLabel>
      {blocks.map(({ book, span }) => (
        <div key={book.id} className={`tint-${book.color} px-1 py-1`}>
          <div className="flex items-baseline gap-2">
            <BookOpen className="size-3 shrink-0 translate-y-[1px] text-[var(--tint-ink)]" aria-hidden />
            <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">{book.title}</span>
            <span className={cn("shrink-0 text-[11px] tnum", span.done ? "text-success" : "text-ink-3")}>
              p.{span.from}–{span.to}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-2">
            <Progress value={book.current_page} max={Math.max(1, book.total_pages)} tint={book.color} height={3} />
            <span className="shrink-0 text-[10.5px] text-ink-4 tnum">
              {Math.round((book.current_page / Math.max(1, book.total_pages)) * 100)}%
            </span>
          </div>
        </div>
      ))}
    </section>
  );
}

// =========================================================
// DayPeek
//
// A modal panel, not a floating div with a dialog role. It takes focus when it
// opens, keeps Tab inside itself, and hands focus back to the day cell it came
// from — the click-catcher behind it is what makes `aria-modal` true rather
// than a claim.
// =========================================================
export function DayPeek({ date, onClose }: { date: string; onClose: () => void }) {
  const tasks = useStore((s) => s.tasks);
  const templates = useStore((s) => s.templates);
  const hour12 = useStore((s) => s.hour12);
  const setCalendarView = useStore((s) => s.setCalendarView);
  const setSelectedDate = useStore((s) => s.setSelectedDate);
  const patch = useStore((s) => s.patch);
  const toast = useStore((s) => s.toast);

  const mounted = useMounted();
  const panelRef = React.useRef<HTMLDivElement>(null);
  const restoreRef = React.useRef<HTMLElement | null>(null);
  const [pos, setPos] = React.useState<{ top: number; left: number } | null>(null);

  const dayTasks = React.useMemo(() => tasksOn(tasks, date), [tasks, date]);
  const timed = React.useMemo(() => dayTasks.filter(isTimed), [dayTasks]);
  const { done, total } = React.useMemo(() => completionOn(tasks, date), [tasks, date]);
  const unfinished = React.useMemo(
    () => dayTasks.filter((t) => t.status !== "done" && t.status !== "dropped"),
    [dayTasks],
  );
  const planned = React.useMemo(
    () => timed.reduce((sum, t) => { const s = spanOf(t); return sum + (s.end - s.start); }, 0),
    [timed],
  );
  const isToday = date === todayISO();

  // The peek used to repeat most of the Day view. What is left open is the
  // day's list; the timeline, salah, habits and reading sit one line below it.
  const [moreOpen, setMoreOpen] = useStickyFlag("humoyun.calendar.peekMoreOpen", false);
  const { due: habitsDue, index: habitIndex, weekStart } = useHabitsDue(date);
  const prayers = useStore((s) => s.prayers);
  const prayedCount = React.useMemo(
    () => prayers.filter((p) => p.date === date && p.status !== "none").length,
    [prayers, date],
  );
  const readingCount = React.useMemo(
    () => new Set(dayTasks.filter((t) => t.book_id).map((t) => t.book_id)).size,
    [dayTasks],
  );
  const moreSummary = [
    "Timeline",
    `salah ${prayedCount}/5`,
    habitsDue.length ? `${habitsDue.length} ${habitsDue.length === 1 ? "habit" : "habits"}` : null,
    readingCount ? `${readingCount} reading` : null,
  ].filter(Boolean).join(" · ");

  // ---- placement ----
  const place = React.useCallback(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const p = panel.getBoundingClientRect();
    const anchor = document
      .querySelector<HTMLElement>(`[data-day-cell="${date}"]`)
      ?.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let left = anchor ? anchor.left + anchor.width / 2 - p.width / 2 : vw - p.width - 24;
    let top = anchor ? anchor.bottom + 8 : 96;
    if (anchor && top + p.height > vh - 12) top = anchor.top - p.height - 8;
    left = Math.max(12, Math.min(left, vw - p.width - 12));
    top = Math.max(12, Math.min(top, vh - p.height - 12));
    setPos({ top, left });
  }, [date]);

  React.useLayoutEffect(() => {
    place();
    const onScroll = () => place();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    // The panel grows and shrinks as tasks are added, checked or expanded.
    const panel = panelRef.current;
    const observer = panel ? new ResizeObserver(() => place()) : null;
    if (panel && observer) observer.observe(panel);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
      observer?.disconnect();
    };
  }, [place]);

  // ---- focus: take it on open, give it back on close ----
  React.useEffect(() => {
    restoreRef.current = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    return () => {
      const previous = restoreRef.current;
      const cell = document.querySelector<HTMLElement>(
        `[data-day-cell="${date}"] [data-day-cell-button]`,
      );
      const target = previous?.isConnected ? previous : cell;
      target?.focus();
    };
  }, [date]);

  function onPanelKeyDown(e: React.KeyboardEvent) {
    const panel = panelRef.current;
    // Menus opened from inside the panel portal out of it but still bubble
    // through this React tree — their keys are theirs, not ours.
    if (!panel || !panel.contains(e.target as Node)) return;

    if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
    if (e.key !== "Tab") return;

    const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE))
      .filter((el) => el.getClientRects().length > 0);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;

    if (e.shiftKey && (active === first || active === panel)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }

  // ---- actions ----
  function openDayView() {
    setSelectedDate(date);
    setCalendarView("day");
    onClose();
  }

  function pushUnfinished() {
    const moving = unfinished.map((t) => ({ id: t.id, date: t.date as string }));
    if (!moving.length) return;
    moving.forEach(({ id }) => patch("tasks", id, { date: addDays(date, 1) }));
    toast({
      title: `${moving.length} moved to tomorrow`,
      description: `From ${dayName(date)} ${dayNumber(date)}.`,
      tone: "success",
      action: {
        label: "Undo",
        run: () => {
          const store = useStore.getState();
          moving.forEach((m) => store.patch("tasks", m.id, { date: m.date }));
        },
      },
    });
  }

  if (!mounted) return null;

  return createPortal(
    <>
      {/* Light dismiss, and the thing that makes the panel genuinely modal. */}
      <div
        aria-hidden
        onPointerDown={onClose}
        className="fixed inset-0 z-[68]"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={`${dayName(date)} ${dayNumber(date)} ${monthName(date)} ${yearOf(date)} — day detail`}
        tabIndex={-1}
        onKeyDown={onPanelKeyDown}
        style={{
          width: WIDTH,
          top: pos?.top ?? -9999,
          left: pos?.left ?? -9999,
          visibility: pos ? "visible" : "hidden",
        }}
        className="fixed z-[70] flex max-h-[78vh] flex-col rounded-xl border border-line bg-raised shadow-lg anim-pop"
      >
        {/* ---- header ---- */}
        <header className="flex items-start gap-2 border-b border-line px-3 py-2.5">
          <div className="min-w-0 flex-1">
            <p
              className={cn(
                "text-[11.5px] font-medium",
                isToday ? "text-accent" : "text-ink-3",
              )}
            >
              {dayName(date)}{isToday && " · Today"}
            </p>
            <div className="flex items-baseline gap-1.5">
              <span className="display-serif text-[22px] leading-none text-ink tnum">
                {dayNumber(date)}
              </span>
              <span className="truncate text-[12.5px] text-ink-2">
                {monthName(date)} <span className="text-ink-3 tnum">{yearOf(date)}</span>
              </span>
            </div>
          </div>

          <IconButton label="Close day detail" onClick={onClose}>
            <X />
          </IconButton>
        </header>

        {/* ---- body ---- */}
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2.5">
          <div className="flex items-center gap-2">
            <Progress value={done} max={Math.max(1, total)} height={3} className="flex-1" />
            <span className="shrink-0 text-[11.5px] text-ink-3 tnum">
              {done}<span className="text-ink-4">/{total}</span>
            </span>
            {planned > 0 && (
              <span className="inline-flex shrink-0 items-center gap-1 text-[11.5px] text-ink-3 tnum">
                <Clock className="size-3" aria-hidden />
                {formatDuration(planned)}
              </span>
            )}
          </div>

          {/* Timed and untimed used to be two labelled lists; they are one
              list that already prints the times, so the labels went. */}
          <div className="mt-2.5">
            <TaskList
              tasks={dayTasks}
              sortable={false}
              composer
              composerDate={date}
              emptyDescription="Nothing on this day yet."
            />
          </div>

          {!dayTasks.length && (
            <MiniEmpty className="mt-1">
              Type above to add the first thing, or apply a template from the bar below.
            </MiniEmpty>
          )}

          <Fold
            className="mt-3 border-t border-line pt-1"
            dense
            label="More"
            summary={moreSummary}
            open={moreOpen}
            onOpenChange={setMoreOpen}
          >
            <MiniTimeline date={date} tasks={timed} hour12={hour12} />

            <section className="mt-4">
              <SectionLabel>Salah</SectionLabel>
              <SalahRow date={date} hour12={hour12} />
            </section>

            <HabitsDue date={date} due={habitsDue} index={habitIndex} weekStart={weekStart} />
            <ReadingBlocks tasks={dayTasks} />
          </Fold>
        </div>

        {/* ---- quick actions ---- */}
        <footer className="flex items-center gap-1 border-t border-line px-2 py-1.5">
          <Popover
            align="start"
            className="w-[236px]"
            trigger={
              <button
                type="button"
                className={cn(
                  "flex h-7 cursor-pointer items-center gap-1.5 rounded-md px-2 text-[12.5px] font-medium text-ink-2",
                  "transition-colors duration-150 hover:bg-hover hover:text-ink active:scale-[0.975]",
                )}
              >
                <LayoutTemplate className="size-3.5" aria-hidden />
                Template
              </button>
            }
          >
            {(close) => (
              templates.length ? (
                <>
                  {templates.map((template) => (
                    <MenuItem
                      key={template.id}
                      icon={LayoutTemplate}
                      onClick={() => { applyTemplateOnDay(template.id, date); close(); }}
                    >
                      {template.name}
                      <span className="ml-1 text-[11px] text-ink-4 tnum">
                        {template.items.length}
                      </span>
                    </MenuItem>
                  ))}
                </>
              ) : (
                <MiniEmpty>Build a template on the Templates page and it lands here.</MiniEmpty>
              )
            )}
          </Popover>

          {unfinished.length > 0 && (
            <button
              type="button"
              onClick={pushUnfinished}
              title={`Move every unfinished task to ${dayName(addDays(date, 1))}`}
              className={cn(
                "flex h-7 cursor-pointer items-center gap-1.5 rounded-md px-2 text-[12.5px] font-medium text-ink-2",
                "transition-colors duration-150 hover:bg-hover hover:text-ink active:scale-[0.975]",
              )}
            >
              <ChevronsRight className="size-3.5" aria-hidden />
              Push <span className="tnum">{unfinished.length}</span>
            </button>
          )}

          <button
            type="button"
            onClick={openDayView}
            className={cn(
              "ml-auto flex h-7 cursor-pointer items-center gap-1.5 rounded-md px-2 text-[12.5px] font-medium",
              "text-accent transition-colors duration-150 hover:bg-accent-soft active:scale-[0.975]",
            )}
          >
            Open full day
            <ArrowUpRight className="size-3.5" aria-hidden />
          </button>
        </footer>
      </div>
    </>,
    document.body,
  );
}
