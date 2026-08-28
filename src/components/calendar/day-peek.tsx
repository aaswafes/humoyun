"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { ArrowUpRight, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { dayName, dayNumber, monthName, todayISO, yearOf } from "@/lib/date";
import { completionOn, tasksOn, useStore } from "@/lib/store";
import { IconButton, Progress } from "@/components/ui/primitives";
import { useMounted } from "@/components/ui/overlays";
import { TaskList } from "@/components/tasks/task-list";

const WIDTH = 296;

/**
 * The month-view day peek. Anchors itself to the cell it was opened from by
 * data attribute, so arrow-key navigation can re-anchor it without the grid
 * having to hand positions back up.
 */
export function DayPeek({ date, onClose }: { date: string; onClose: () => void }) {
  const tasks = useStore((s) => s.tasks);
  const setCalendarView = useStore((s) => s.setCalendarView);
  const mounted = useMounted();
  const panelRef = React.useRef<HTMLDivElement>(null);
  const [pos, setPos] = React.useState<{ top: number; left: number } | null>(null);

  const dayTasks = React.useMemo(() => tasksOn(tasks, date), [tasks, date]);
  const { done, total } = React.useMemo(() => completionOn(tasks, date), [tasks, date]);
  const isToday = date === todayISO();

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
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [place, dayTasks.length]);

  React.useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (panelRef.current?.contains(e.target as Node)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  if (!mounted) return null;

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-label={`Tasks on ${date}`}
      style={{
        width: WIDTH,
        top: pos?.top ?? -9999,
        left: pos?.left ?? -9999,
        visibility: pos ? "visible" : "hidden",
      }}
      className="fixed z-[70] max-h-[62vh] overflow-y-auto rounded-xl border border-line bg-raised p-3 shadow-lg anim-pop"
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "text-[11px] font-semibold uppercase tracking-[0.06em]",
              isToday ? "text-accent" : "text-ink-3",
            )}
          >
            {dayName(date)}
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

        <IconButton
          label="Open in day view"
          size="sm"
          onClick={() => { setCalendarView("day"); onClose(); }}
        >
          <ArrowUpRight />
        </IconButton>
        <IconButton label="Close" size="sm" onClick={onClose}>
          <X />
        </IconButton>
      </div>

      {total > 0 && (
        <div className="mt-3 flex items-center gap-2">
          <Progress value={done} max={total} height={3} className="flex-1" />
          <span className="text-[11.5px] text-ink-3 tnum">
            {done}<span className="text-ink-4">/{total}</span>
          </span>
        </div>
      )}

      <div className="mt-2.5 pl-1">
        <TaskList
          tasks={dayTasks}
          sortable={false}
          composer
          composerDate={date}
          emptyDescription="Nothing on this day yet."
        />
      </div>
    </div>,
    document.body,
  );
}
