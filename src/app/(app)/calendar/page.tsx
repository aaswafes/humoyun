"use client";

import * as React from "react";
import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor, pointerWithin,
  closestCenter, rectIntersection, type CollisionDetection,
  useSensor, useSensors,
  type DragEndEvent, type DragOverEvent, type DragStartEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { ChevronLeft, ChevronRight, PanelRight, Plus } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  addDays, addMonths, endOfMonth, endOfWeek, formatDate, friendlyDate,
  monthName, startOfMonth, startOfWeek, todayISO, yearOf,
} from "@/lib/date";
import { useStore } from "@/lib/store";
import { useHotkeys } from "@/hooks/use-hotkeys";
import type { CalendarView } from "@/lib/store";
import { Button, IconButton, Segmented } from "@/components/ui/primitives";
import { PageBody, PageHeader } from "@/components/shell/page-header";
import { DndBoundary } from "@/components/tasks/task-list";
import { openQuickAdd } from "@/components/shell/quick-add";
import { MonthView } from "@/components/calendar/month-view";
import { WeekView } from "@/components/calendar/week-view";
import { DayView } from "@/components/calendar/day-view";
import { AgendaView } from "@/components/calendar/agenda-view";
import { YearView } from "@/components/calendar/year-view";
import { DayPeek } from "@/components/calendar/day-peek";
import { RightRail } from "@/components/calendar/right-rail";
import { ChipBody } from "@/components/calendar/task-chip";
import {
  applyTemplateOnDay, bookPreview, readDropDate, readPayload, scheduleBookOnDay,
  templatePreview, type DragPayload, type DropPreview,
} from "@/components/calendar/calendar-utils";

/**
 * Year is a calendar-page concept, not a store one: `store.calendarView` is
 * persisted and typed without it, so it lives in local state and any write to
 * the store view (command palette, day peek, another surface) drops us out of
 * it cleanly instead of leaving an invalid value behind.
 */
type PageView = CalendarView | "year";

const VIEW_OPTIONS: { value: PageView; label: string; title: string }[] = [
  { value: "day", label: "Day", title: "Day view — 1" },
  { value: "week", label: "Week", title: "Week view — 2" },
  { value: "month", label: "Month", title: "Month view — 3" },
  { value: "agenda", label: "Agenda", title: "Agenda — 4" },
  { value: "year", label: "Year", title: "Year view — 5" },
];

const STEP_UNIT: Record<PageView, string> = {
  day: "day", week: "week", month: "month", agenda: "week", year: "year",
};

/**
 * pointerWithin alone returns nothing during a keyboard drag — it needs pointer
 * coordinates that a keyboard sensor never produces — so every keyboard drop
 * silently failed. Fall back to geometry when there is no pointer.
 */
const calendarCollision: CollisionDetection = (args) => {
  const byPointer = pointerWithin(args);
  if (byPointer.length) return byPointer;
  const byRect = rectIntersection(args);
  return byRect.length ? byRect : closestCenter(args);
};

export default function CalendarPage() {
  const storeView = useStore((s) => s.calendarView);
  const setCalendarView = useStore((s) => s.setCalendarView);
  const anchor = useStore((s) => s.selectedDate);
  const setSelectedDate = useStore((s) => s.setSelectedDate);
  const weekStart = useStore((s) => s.profile?.week_start ?? 1);
  const hour12 = useStore((s) => s.hour12);
  const tasks = useStore((s) => s.tasks);
  const books = useStore((s) => s.books);
  const templates = useStore((s) => s.templates);
  const moveTask = useStore((s) => s.moveTask);
  const inspectorOpen = useStore((s) => s.inspectorTaskId !== null);

  const [railOpen, setRailOpen] = React.useState(true);
  const [peekDate, setPeekDate] = React.useState<string | null>(null);
  const [active, setActive] = React.useState<DragPayload | null>(null);
  const [overDate, setOverDate] = React.useState<string | null>(null);

  // Remembers which store view Year was entered from. The moment anything else
  // changes the store view, this no longer matches and Year steps aside — so
  // the fallback is derived, never chased by an effect.
  const [yearFrom, setYearFrom] = React.useState<CalendarView | null>(null);
  const view: PageView = yearFrom !== null && yearFrom === storeView ? "year" : storeView;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    // Without this, every drag on this surface — task chips, books and templates
    // from the rail — is mouse-only, and the drag handles still take a tab stop.
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // ---- navigation ----
  const step = React.useCallback((dir: 1 | -1) => {
    setPeekDate(null);
    setSelectedDate(
      view === "year" ? addMonths(anchor, dir * 12)
        : view === "month" ? addMonths(anchor, dir)
          : view === "day" ? addDays(anchor, dir)
            : addDays(anchor, dir * 7),
    );
  }, [view, anchor, setSelectedDate]);

  const nudge = React.useCallback((delta: number) => {
    setPeekDate(null);
    setSelectedDate(addDays(anchor, delta));
  }, [anchor, setSelectedDate]);

  const goToday = React.useCallback(() => {
    setPeekDate(null);
    setSelectedDate(todayISO());
  }, [setSelectedDate]);

  // Every view change closes the peek at the source, so no effect has to chase it.
  const changeView = React.useCallback((next: PageView) => {
    setPeekDate(null);
    if (next === "year") {
      // Remember the view underneath so leaving Year lands back on something real.
      setYearFrom(useStore.getState().calendarView);
      return;
    }
    setYearFrom(null);
    setCalendarView(next);
  }, [setCalendarView]);

  const openDay = React.useCallback((date: string) => {
    setSelectedDate(date);
    changeView("day");
  }, [setSelectedDate, changeView]);

  const openMonth = React.useCallback((date: string) => {
    setSelectedDate(date);
    changeView("month");
  }, [setSelectedDate, changeView]);

  useHotkeys(
    {
      arrowleft: () => nudge(-1),
      arrowright: () => nudge(1),
      arrowup: () => nudge(view === "month" || view === "week" || view === "year" ? -7 : -1),
      arrowdown: () => nudge(view === "month" || view === "week" || view === "year" ? 7 : 1),
      t: goToday,
      "1": () => changeView("day"),
      "2": () => changeView("week"),
      "3": () => changeView("month"),
      "4": () => changeView("agenda"),
      "5": () => changeView("year"),
    },
    { enabled: !inspectorOpen },
  );

  // ---- header copy ----
  const range = React.useMemo(() => {
    if (view === "year") return { from: `${yearOf(anchor)}-01-01`, to: `${yearOf(anchor)}-12-31` };
    if (view === "month") return { from: startOfMonth(anchor), to: endOfMonth(anchor) };
    if (view === "week") return { from: startOfWeek(anchor, weekStart), to: endOfWeek(anchor, weekStart) };
    if (view === "day") return { from: anchor, to: anchor };
    return { from: anchor, to: addDays(anchor, 30) };
  }, [view, anchor, weekStart]);

  const stats = React.useMemo(() => {
    let total = 0;
    let done = 0;
    for (const t of tasks) {
      if (!t.date || t.parent_id || t.status === "dropped") continue;
      if (t.date < range.from || t.date > range.to) continue;
      total++;
      if (t.status === "done") done++;
    }
    return { total, done };
  }, [tasks, range]);

  const title = React.useMemo(() => {
    if (view === "year") return String(yearOf(anchor));
    if (view === "month") return `${monthName(anchor)} ${yearOf(anchor)}`;
    if (view === "day") return friendlyDate(anchor);
    if (view === "agenda") return "Agenda";
    const from = startOfWeek(anchor, weekStart);
    const to = endOfWeek(anchor, weekStart);
    return `${formatDate(from, { weekday: false })} – ${formatDate(to, { weekday: false })}`;
  }, [view, anchor, weekStart]);

  const subtitle = React.useMemo(() => {
    const scope = view === "agenda" ? "in the next 30 days" : view === "year" ? "this year" : "scheduled";
    if (!stats.total) {
      if (view === "day") return formatDate(anchor, { year: true });
      return view === "year" ? "Nothing scheduled this year" : `Nothing ${scope}`;
    }
    return (
      <span className="tnum">
        {view === "day" && `${formatDate(anchor, { year: true })} · `}
        {stats.done}/{stats.total} done
      </span>
    );
  }, [stats, view, anchor]);

  // ---- drag & drop ----
  const preview: DropPreview | null = React.useMemo(() => {
    if (!active || !overDate) return null;
    if (active.type === "book") {
      const book = books.find((b) => b.id === active.id);
      return book ? bookPreview(book, overDate) : null;
    }
    if (active.type === "template") {
      const template = templates.find((t) => t.id === active.id);
      return template ? templatePreview(template, overDate) : null;
    }
    return null;
  }, [active, overDate, books, templates]);

  const activeTask = active?.type === "task"
    ? tasks.find((t) => t.id === active.taskId) ?? null
    : null;
  const activeBook = active?.type === "book" ? books.find((b) => b.id === active.id) ?? null : null;
  const activeTemplate = active?.type === "template"
    ? templates.find((t) => t.id === active.id) ?? null
    : null;

  function onDragStart(event: DragStartEvent) {
    setActive(readPayload(event.active.data.current));
    setPeekDate(null);
  }

  function onDragOver(event: DragOverEvent) {
    setOverDate(readDropDate(event.over?.data.current));
  }

  function onDragEnd(event: DragEndEvent) {
    const payload = readPayload(event.active.data.current);
    const date = readDropDate(event.over?.data.current);
    setActive(null);
    setOverDate(null);
    if (!payload || !date) return;

    if (payload.type === "book") { scheduleBookOnDay(payload.id, date); return; }
    if (payload.type === "template") { applyTemplateOnDay(payload.id, date); return; }

    const task = tasks.find((t) => t.id === payload.taskId);
    if (task && task.date !== date) moveTask(payload.taskId, date);
  }

  function onDragCancel() {
    setActive(null);
    setOverDate(null);
  }

  return (
    <>
      <PageHeader
        title={title}
        subtitle={subtitle}
        actions={
          <div className="flex items-center gap-1.5">
            {/* Year has no drop targets, so the rail's only job there would be
                to offer a drag that cannot land. */}
            {view !== "year" && (
              <IconButton
                label={railOpen ? "Hide books and templates" : "Show books and templates"}
                active={railOpen}
                onClick={() => setRailOpen((v) => !v)}
              >
                <PanelRight />
              </IconButton>
            )}
            <Button variant="primary" size="sm" onClick={openQuickAdd}>
              <Plus className="size-3.5" />
              New
            </Button>
          </div>
        }
      >
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            onClick={goToday}
            className={cn(anchor === todayISO() && "text-ink-3")}
          >
            Today
          </Button>
          <div className="flex items-center">
            <IconButton label={`Previous ${STEP_UNIT[view]}`} onClick={() => step(-1)}>
              <ChevronLeft />
            </IconButton>
            <IconButton label={`Next ${STEP_UNIT[view]}`} onClick={() => step(1)}>
              <ChevronRight />
            </IconButton>
          </div>
          <Segmented
            value={view}
            options={VIEW_OPTIONS}
            onChange={changeView}
            className="ml-1"
          />
        </div>
      </PageHeader>

      <PageBody wide className={view === "year" ? undefined : "flex h-full min-h-[540px] gap-4"}>
        {view === "year" ? (
          <YearView
            anchor={anchor}
            weekStart={weekStart}
            hour12={hour12}
            onStepYear={step}
            onToday={goToday}
            onSelectDay={setSelectedDate}
            onOpenDay={openDay}
            onOpenMonth={openMonth}
          />
        ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={calendarCollision}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDragEnd={onDragEnd}
          onDragCancel={onDragCancel}
        >
          <DndBoundary>
          <div className="flex min-w-0 flex-1 flex-col">
            {view === "month" && (
              <MonthView
                anchor={anchor}
                weekStart={weekStart}
                hour12={hour12}
                preview={preview}
                onPeek={setPeekDate}
                onOpenDay={openDay}
              />
            )}
            {view === "week" && (
              <WeekView anchor={anchor} weekStart={weekStart} hour12={hour12} preview={preview} />
            )}
            {view === "day" && <DayView date={anchor} hour12={hour12} preview={preview} />}
            {view === "agenda" && <AgendaView anchor={anchor} preview={preview} />}
          </div>

          {railOpen && <RightRail date={anchor} onClose={() => setRailOpen(false)} />}

          <DragOverlay dropAnimation={null}>
            {activeTask && (
              <div className="w-[190px] cursor-grabbing">
                <ChipBody task={activeTask} hour12={hour12} floating />
              </div>
            )}
            {(activeBook || activeTemplate) && (
              <div className="w-[248px] cursor-grabbing rounded-lg border border-line bg-raised p-2.5 shadow-lg">
                <p className="truncate text-[12.5px] font-medium text-ink">
                  {activeBook?.title ?? activeTemplate?.name}
                </p>
                {preview ? (
                  <>
                    <p className="mt-1 text-[11.5px] font-medium text-accent tnum">{preview.headline}</p>
                    <p className="text-[11px] text-ink-3 tnum">{preview.detail}</p>
                  </>
                ) : (
                  <p className="mt-1 text-[11.5px] text-ink-3">Drop on a day to schedule it</p>
                )}
              </div>
            )}
          </DragOverlay>
          </DndBoundary>
        </DndContext>
        )}
      </PageBody>

      {view === "month" && peekDate && (
        <DayPeek date={peekDate} onClose={() => setPeekDate(null)} />
      )}
    </>
  );
}
