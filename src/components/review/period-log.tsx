"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight, Ban, Calendar, Check, ChevronRight, Flag,
  Inbox, MoreHorizontal, Sun, Timer,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import { addDays, formatDate, formatDuration, dayName, dayNumber, todayISO } from "@/lib/date";
import type { Horizon, Task } from "@/lib/types";
import { Button, EmptyState, IconButton, Segmented } from "@/components/ui/primitives";
import { ConfirmDialog, MenuItem, MenuLabel, MenuSeparator, Popover } from "@/components/ui/overlays";
import { MiniCalendar } from "@/components/ui/mini-calendar";
import { TaskRow } from "@/components/tasks/task-row";
import { Fold } from "./section";
import { plural } from "./metrics";
import { dayEntries, type DayEntry } from "./derive";
import { SCOPE_NOUN, shiftDateByScope, shiftPeriod, type Period } from "./period";

const DAY_PAGE = 10;
const SLIPPED_PAGE = 25;

type SlipSort = "date" | "priority";

/** A goal made out of a slipped task inherits the review's own horizon. */
const HORIZON_OF: Record<Period["scope"], Horizon> = { week: "week", month: "month", year: "year" };

export function PeriodLog({ period, weekStartDay }: { period: Period; weekStartDay: number }) {
  const router = useRouter();
  const tasks = useStore((s) => s.tasks);
  const focusSessions = useStore((s) => s.focusSessions);
  const moveTask = useStore((s) => s.moveTask);
  const patch = useStore((s) => s.patch);
  const insert = useStore((s) => s.insert);
  const remove = useStore((s) => s.remove);
  const toast = useStore((s) => s.toast);

  const [dayLimit, setDayLimit] = React.useState(DAY_PAGE);
  const [slipLimit, setSlipLimit] = React.useState(SLIPPED_PAGE);
  const [sort, setSort] = React.useState<SlipSort>("date");
  const [confirmDrop, setConfirmDrop] = React.useState(false);

  const noun = SCOPE_NOUN[period.scope];
  const nextStart = shiftPeriod(period.scope, period.start, 1);
  const over = period.phase === "past";

  const { entries, done, slipped, busiest, quietest } = React.useMemo(() => {
    const list = dayEntries(period.days, tasks, focusSessions);
    const withWork = list.filter((d) => d.done.length > 0);
    const open = list.flatMap((d) => d.open);
    return {
      entries: withWork,
      done: withWork.reduce((sum, d) => sum + d.done.length, 0),
      slipped: open,
      busiest: [...withWork].sort((a, b) => b.done.length - a.done.length)[0],
      quietest: [...list].filter((d) => d.date <= todayISO()).sort((a, b) => a.done.length - b.done.length)[0],
    };
  }, [period.days, tasks, focusSessions]);

  const sortedSlipped = React.useMemo(() => {
    const copy = [...slipped];
    if (sort === "priority") {
      copy.sort((a, b) => b.priority - a.priority || (a.date ?? "").localeCompare(b.date ?? ""));
    } else {
      copy.sort((a, b) => (a.date ?? "").localeCompare(b.date ?? "") || a.order_index - b.order_index);
    }
    return copy;
  }, [slipped, sort]);

  // ---- actions -------------------------------------------------
  function moveMany(list: Task[], resolve: (t: Task) => string | null, label: string) {
    if (!list.length) return;
    const before = list.map((t) => ({ id: t.id, date: t.date }));
    list.forEach((t) => moveTask(t.id, resolve(t)));
    toast({
      title: `Moved ${list.length} ${plural(list.length, "task")} ${label}`,
      tone: "success",
      action: { label: "Undo", run: () => before.forEach((b) => moveTask(b.id, b.date)) },
    });
  }

  function dropMany(list: Task[]) {
    if (!list.length) return;
    const before = list.map((t) => ({ id: t.id, status: t.status }));
    list.forEach((t) => patch("tasks", t.id, { status: "dropped" }));
    toast({
      title: `Dropped ${list.length} ${plural(list.length, "task")}`,
      description: "They stay on their date but stop counting.",
      action: { label: "Undo", run: () => before.forEach((b) => patch("tasks", b.id, { status: b.status })) },
    });
  }

  function promote(task: Task) {
    const goal = insert("goals", {
      title: task.title || "Untitled",
      horizon: HORIZON_OF[period.scope],
      start_date: nextStart,
      end_date: shiftDateByScope(period.scope, period.end, 1),
      color: task.color ?? "blue",
      status: "active",
      description: `Promoted from a task that slipped in ${period.title}.`,
    });
    const previous = { date: task.date, goal_id: task.goal_id };
    patch("tasks", task.id, { goal_id: goal.id, date: shiftDateByScope(period.scope, task.date ?? nextStart, 1) });
    toast({
      title: `“${goal.title}” is now a ${HORIZON_OF[period.scope]} goal`,
      description: "The task moved forward and points at it.",
      tone: "success",
      action: {
        label: "Undo",
        run: () => { patch("tasks", task.id, previous); remove("goals", goal.id); },
      },
    });
  }

  const visibleDays = entries.slice(0, dayLimit);
  const visibleSlipped = sortedSlipped.slice(0, slipLimit);

  return (
    <>
      <Fold
        id="review-happened"
        storageKey="log"
        label="What happened"
        summary={
          done
            ? `${done} ${plural(done, "task")} closed across ${entries.length} ${plural(entries.length, "day")}`
            : `nothing closed this ${noun} yet`
        }
      >
        {done === 0 ? (
          <EmptyState
            icon={Sun}
            title={`Nothing was ticked off this ${noun}`}
            description="Completed tasks gather here day by day, so the review starts from what you actually did rather than what you meant to do."
            action={
              <Button size="sm" variant="secondary" onClick={() => router.push("/")}>
                Go to Today
              </Button>
            }
          />
        ) : (
          <div>
            {visibleDays.map((entry, i) => (
              <DayGroup key={entry.date} entry={entry} divided={i > 0} defaultOpen={entries.length <= 3} />
            ))}
            {entries.length > visibleDays.length && (
              <div className="mt-3 flex justify-center">
                <Button variant="ghost" size="sm" onClick={() => setDayLimit((n) => n + DAY_PAGE * 2)}>
                  Show {entries.length - visibleDays.length} more {plural(entries.length - visibleDays.length, "day")}
                </Button>
              </div>
            )}
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-ink-4 tnum">
              {entries.length > 1 && busiest && (
                <span>
                  Best day: {formatDate(busiest.date, { weekday: true })} · {busiest.done.length}
                </span>
              )}
              {quietest && quietest.done.length === 0 && period.phase !== "future" && (
                <span>{formatDate(quietest.date)} closed nothing at all.</span>
              )}
            </div>
          </div>
        )}
      </Fold>

      <Fold
        id="review-slipped"
        storageKey="slipped"
        label={over ? "What slipped" : period.phase === "future" ? "Booked ahead" : "Still open"}
        summary={
          slipped.length
            ? `${slipped.length} ${plural(slipped.length, "task")} dated this ${noun}, ${period.phase === "future" ? "not started" : "unfinished"}`
            : over
              ? "nothing slipped"
              : "nothing outstanding"
        }
      >
        {slipped.length === 0 ? (
          <div className="flex items-center gap-2 py-1 text-[13px] text-ink-3">
            <Check className="size-3.5 shrink-0 text-success" strokeWidth={2.5} />
            {over
              ? `Nothing slipped. Every task dated this ${noun} was closed.`
              : period.phase === "future"
                ? `Nothing is booked for this ${noun} yet.`
                : `Nothing outstanding so far this ${noun}.`}
          </div>
        ) : (
          <div>
            {/* The bulk tools live with the list they act on, not in the page chrome. */}
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Segmented
                size="sm"
                value={sort}
                onChange={setSort}
                options={[
                  { value: "date", label: "By date", title: "Oldest first" },
                  { value: "priority", label: "By priority", title: "Highest flag first" },
                ]}
              />
              <Button
                size="sm"
                variant="secondary"
                title={`Every task keeps its weekday and moves one ${noun} forward`}
                onClick={() => moveMany(sortedSlipped, (t) => shiftDateByScope(period.scope, t.date as string, 1), `to next ${noun}`)}
              >
                <ArrowRight className="size-3.5" />
                Carry over
              </Button>
              <Popover
                align="end"
                className="w-[230px]"
                trigger={<IconButton label="More actions for everything that slipped" size="md"><MoreHorizontal /></IconButton>}
              >
                {(close) => (
                  <>
                    <MenuLabel>All {slipped.length} tasks</MenuLabel>
                    <MenuItem
                      icon={Calendar}
                      onClick={() => { moveMany(sortedSlipped, () => nextStart, `to ${formatDate(nextStart)}`); close(); }}
                    >
                      Stack on {formatDate(nextStart, { weekday: false })}
                    </MenuItem>
                    <MenuItem
                      icon={ArrowRight}
                      onClick={() => { moveMany(sortedSlipped, () => todayISO(), "to today"); close(); }}
                    >
                      Move to today
                    </MenuItem>
                    <MenuItem
                      icon={Inbox}
                      onClick={() => { moveMany(sortedSlipped, () => null, "to the Inbox"); close(); }}
                    >
                      Send to Inbox
                    </MenuItem>
                    <MenuSeparator />
                    <MenuItem icon={Ban} danger onClick={() => { setConfirmDrop(true); close(); }}>
                      Drop all
                    </MenuItem>
                  </>
                )}
              </Popover>
            </div>

            {visibleSlipped.map((task) => (
              <SlippedRow
                key={task.id}
                task={task}
                scope={period.scope}
                weekStartDay={weekStartDay}
                onPush={() => moveMany([task], (t) => shiftDateByScope(period.scope, t.date as string, 1), `to next ${noun}`)}
                onMoveTo={(iso) => moveMany([task], () => iso, `to ${formatDate(iso)}`)}
                onInbox={() => moveMany([task], () => null, "to the Inbox")}
                onDrop={() => dropMany([task])}
                onPromote={() => promote(task)}
              />
            ))}
            {sortedSlipped.length > visibleSlipped.length && (
              <div className="mt-3 flex justify-center">
                <Button variant="ghost" size="sm" onClick={() => setSlipLimit((n) => n + SLIPPED_PAGE * 2)}>
                  Show {sortedSlipped.length - visibleSlipped.length} more
                </Button>
              </div>
            )}
          </div>
        )}
      </Fold>

      <ConfirmDialog
        open={confirmDrop}
        onClose={() => setConfirmDrop(false)}
        onConfirm={() => dropMany(sortedSlipped)}
        title={`Drop ${slipped.length} ${plural(slipped.length, "task")}?`}
        description="They keep their date but stop counting towards anything. You can undo this straight after."
        confirmLabel="Drop them"
      />
    </>
  );
}

// ---------------------------------------------------------
function DayGroup({ entry, divided, defaultOpen }: { entry: DayEntry; divided: boolean; defaultOpen: boolean }) {
  const [open, setOpen] = React.useState(defaultOpen);

  return (
    <div className={cn(divided && "hairline-t")}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-md px-1.5 py-2 text-left cursor-pointer",
          "transition-colors duration-150 hover:bg-hover",
        )}
      >
        <ChevronRight
          className={cn(
            "size-3.5 shrink-0 text-ink-4 transition-transform duration-200 ease-[var(--ease-out-apple)]",
            open && "rotate-90",
          )}
        />
        <span className="w-5 shrink-0 text-[13px] font-medium text-ink-3 tnum">
          {dayNumber(entry.date)}
        </span>
        <span className="text-[13px] font-medium text-ink-2">{dayName(entry.date, "long")}</span>
        {entry.focusMinutes > 0 && (
          <span className="inline-flex items-center gap-1 text-[11.5px] text-ink-4 tnum">
            <Timer className="size-3" />
            {formatDuration(entry.focusMinutes)}
          </span>
        )}
        <span className="ml-auto text-[12px] text-ink-3 tnum">
          {entry.done.length} {plural(entry.done.length, "task")}
          {entry.open.length > 0 && ` · ${entry.open.length} left`}
        </span>
      </button>

      {open && (
        <div className="anim-fade pb-2 pl-7 pr-1">
          {entry.done.map((task) => (
            <TaskRow key={task.id} task={task} compact showSubtasks={false} dragHandle={<span />} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------
function SlippedRow({
  task, scope, weekStartDay, onPush, onMoveTo, onInbox, onDrop, onPromote,
}: {
  task: Task;
  scope: Period["scope"];
  weekStartDay: number;
  onPush: () => void;
  onMoveTo: (iso: string) => void;
  onInbox: () => void;
  onDrop: () => void;
  onPromote: () => void;
}) {
  const target = shiftDateByScope(scope, task.date as string, 1);
  const noun = SCOPE_NOUN[scope];

  return (
    <div className="flex items-center gap-1 pl-4">
      <div className="min-w-0 flex-1">
        <TaskRow task={task} showDate compact showSubtasks={false} dragHandle={<span />} />
      </div>

      <button
        onClick={onPush}
        aria-label={`Move ${task.title || "task"} to ${formatDate(target)}`}
        title={`Move to ${formatDate(target)}`}
        className={cn(
          "inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-[12px] font-medium cursor-pointer",
          "text-ink-3 hover:bg-hover hover:text-ink active:scale-[0.97]",
          "transition-[background-color,color,transform] duration-150 ease-[var(--ease-out-apple)]",
        )}
      >
        <span className="hidden sm:inline">Next {noun}</span>
        <ArrowRight className="size-3.5" />
      </button>

      <Popover
        align="end"
        className="w-[236px]"
        trigger={
          <IconButton label={`More options for ${task.title || "this task"}`} size="md">
            <MoreHorizontal />
          </IconButton>
        }
      >
        {(close) => (
          <>
            <MenuItem icon={ArrowRight} onClick={() => { onMoveTo(todayISO()); close(); }}>
              Move to today
            </MenuItem>
            <MenuItem icon={ArrowRight} onClick={() => { onMoveTo(addDays(todayISO(), 1)); close(); }}>
              Move to tomorrow
            </MenuItem>
            <MenuItem icon={Inbox} onClick={() => { onInbox(); close(); }}>
              Send to Inbox
            </MenuItem>
            <MenuSeparator />
            <MenuItem icon={Flag} onClick={() => { onPromote(); close(); }}>
              Make it a {HORIZON_OF[scope]} goal
            </MenuItem>
            <MenuItem icon={Ban} danger onClick={() => { onDrop(); close(); }}>
              Drop it
            </MenuItem>
            <MenuSeparator />
            <MenuLabel>Move to date</MenuLabel>
            <div className="px-1 pb-1">
              <MiniCalendar
                value={task.date ?? todayISO()}
                weekStart={weekStartDay}
                onChange={(iso) => { onMoveTo(iso); close(); }}
              />
            </div>
          </>
        )}
      </Popover>
    </div>
  );
}

/** The same two lists, as text, for the copyable summary. */
export function logLines(period: Period, tasks: Task[], limit = 12): string[] {
  const inRange = new Set(period.days);
  const scoped = tasks.filter((t) => !!t.date && inRange.has(t.date) && !t.parent_id && t.status !== "dropped");
  const done = scoped.filter((t) => t.status === "done");
  const open = scoped.filter((t) => t.status !== "done");
  const lines: string[] = [];

  lines.push(`Closed (${done.length}):`);
  done.slice(0, limit).forEach((t) => lines.push(`  - ${t.title || "Untitled"} (${formatDate(t.date as string)})`));
  if (done.length > limit) lines.push(`  …and ${done.length - limit} more`);

  lines.push(`Still open (${open.length}):`);
  open.slice(0, limit).forEach((t) => lines.push(`  - ${t.title || "Untitled"} (${formatDate(t.date as string)})`));
  if (open.length > limit) lines.push(`  …and ${open.length - limit} more`);

  return lines;
}
