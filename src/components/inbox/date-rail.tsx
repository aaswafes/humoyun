"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import { formatDate, todayISO } from "@/lib/date";
import { Kbd } from "@/components/ui/primitives";
import { useTriage } from "./triage-context";
import { useTriageActions } from "./actions";
import { DateDropZone } from "./triage-dnd";
import { RailCalendar } from "./rail-calendar";
import { schedulePresets } from "./quick-schedule";
import { targetLabel } from "./triage-keys";
import { Fold } from "./fold";

/**
 * The date rail. Drop a row on a door and it goes through it; click the same
 * door and whatever the keyboard is pointing at goes through instead. Both
 * paths run the same action, so both undo the same way.
 *
 * It used to be three bordered cards — targets, a month, and a permanent
 * keyboard cheatsheet. Now it is one quiet column: the five doors on spacing
 * alone, the month folded behind a line that says what it is, and the
 * cheatsheet moved to the "?" in the header where a reference belongs.
 */
export function DateRail() {
  const tasks = useStore((s) => s.tasks);
  const weekStart = useStore((s) => s.profile?.week_start ?? 1);
  const toast = useStore((s) => s.toast);
  const { targetIds, count, dragIds } = useTriage();
  const actions = useTriageActions();

  const today = todayISO();
  const presets = React.useMemo(() => schedulePresets(weekStart, today), [weekStart, today]);

  // Open, top-level tasks per day — the same number the calendar dots use.
  const counts = React.useMemo(() => {
    const map = new Map<string, number>();
    tasks.forEach((t) => {
      if (!t.date || t.parent_id || t.status === "done" || t.status === "dropped") return;
      map.set(t.date, (map.get(t.date) ?? 0) + 1);
    });
    return map;
  }, [tasks]);

  const inboxCount = React.useMemo(
    () => tasks.filter((t) => !t.date && !t.parent_id && t.status !== "done").length,
    [tasks],
  );

  const dragging = dragIds.length > 0;
  const armed = targetIds.length > 0;
  const label = targetLabel(tasks, targetIds, count);

  function send(iso: string | null) {
    if (!armed) {
      toast({ title: "Pick a task first", description: "Click a row, or press J to step into the list." });
      return;
    }
    actions.moveToDate(targetIds, iso);
  }

  return (
    <div className="flex flex-col gap-6">
      <section aria-label="Send to">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">
          {dragging ? "Drop to schedule" : "Send to"}
        </h2>

        <p className={cn("mt-1 mb-2 truncate text-[12px]", armed || dragging ? "text-ink-3" : "text-ink-4")}>
          {dragging
            ? `Moving ${dragIds.length} ${dragIds.length === 1 ? "task" : "tasks"}`
            : label}
        </p>

        <div className="flex flex-col">
          {presets.map((p) => {
            const n = p.iso ? counts.get(p.iso) ?? 0 : inboxCount;
            return (
              <DateDropZone key={p.key} iso={p.iso} className="rounded-md">
                {({ isOver, active }) => (
                  <button
                    type="button"
                    onClick={() => send(p.iso)}
                    title={
                      armed
                        ? `Move ${label} to ${p.label}`
                        : "Pick a task first — click a row or press J"
                    }
                    className={cn(
                      "flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[12.5px] cursor-pointer",
                      "transition-[background-color,color,box-shadow,transform] duration-150 ease-[var(--ease-out-apple)]",
                      "active:scale-[0.985]",
                      isOver
                        ? "bg-accent text-accent-ink shadow-sm"
                        : active
                          ? "bg-hover text-ink"
                          : armed
                            ? "text-ink-2 hover:bg-hover hover:text-ink"
                            : "text-ink-3 hover:bg-hover hover:text-ink",
                    )}
                  >
                    <p.icon className={cn("size-3.5 shrink-0", isOver ? "" : "text-ink-4")} />
                    <span className="min-w-0 flex-1 truncate">{p.label}</span>
                    <span className={cn("shrink-0 text-[11px] tnum", isOver ? "opacity-70" : "text-ink-4")}>
                      {p.iso ? formatDate(p.iso, { weekday: false }) : "Inbox"}
                    </span>
                    <span
                      className={cn("w-4 shrink-0 text-right text-[11px] tnum", isOver ? "opacity-80" : "text-ink-4")}
                      title={n > 0 ? `${n} open` : undefined}
                    >
                      {n > 0 ? n : ""}
                    </span>
                    <span className={cn("shrink-0", isOver && "opacity-80")}>
                      <Kbd>{p.hint}</Kbd>
                    </span>
                  </button>
                )}
              </DateDropZone>
            );
          })}
        </div>
      </section>

      {/* A drag needs every drop target on screen, so it opens the month itself. */}
      <Fold
        storageKey="railCalendarOpen"
        forceOpen={dragging}
        label="Any day"
        summary="pick from the month"
      >
        <RailCalendar
          value={today}
          weekStart={weekStart}
          counts={counts}
          onPick={(iso) => send(iso)}
        />
      </Fold>
    </div>
  );
}
