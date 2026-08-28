"use client";

import * as React from "react";
import { Keyboard } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import { formatDate, todayISO } from "@/lib/date";
import { Kbd } from "@/components/ui/primitives";
import { useTriage } from "./triage-context";
import { useTriageActions } from "./actions";
import { DateDropZone } from "./triage-dnd";
import { RailCalendar } from "./rail-calendar";
import { schedulePresets } from "./quick-schedule";
import { TRIAGE_LEGEND, targetLabel } from "./triage-keys";

function RailCard({
  title, children, action, className,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("surface p-2.5", className)}>
      <div className="mb-2 flex items-center gap-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">{title}</h2>
        <div className="flex-1" />
        {action}
      </div>
      {children}
    </section>
  );
}

/**
 * The date rail. Drop a row on a door and it goes through it; click the same
 * door and whatever the keyboard is pointing at goes through instead. Both
 * paths run the same action, so both undo the same way.
 */
export function DateRail() {
  const tasks = useStore((s) => s.tasks);
  const weekStart = useStore((s) => s.profile?.week_start ?? 1);
  const toast = useStore((s) => s.toast);
  const { targetIds, count, dragIds, legendOpen, setLegendOpen } = useTriage();
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
    <div className="flex flex-col gap-3">
      <RailCard
        title={dragging ? "Drop to schedule" : "Send to"}
        action={
          <span className="truncate text-[11px] text-ink-4 tnum">
            {count > 1 ? `${count} selected` : ""}
          </span>
        }
      >
        <p className={cn("mb-2 truncate text-[12px]", armed ? "text-ink-2" : "text-ink-4")}>
          {dragging ? `Moving ${dragIds.length} ${dragIds.length === 1 ? "task" : "tasks"}` : label}
        </p>

        <div className="flex flex-col gap-0.5">
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
                          ? "bg-hover text-ink ring-1 ring-dashed ring-line-strong"
                          : armed
                            ? "text-ink-2 hover:bg-hover hover:text-ink"
                            : "text-ink-4 hover:bg-hover hover:text-ink-2",
                    )}
                  >
                    <p.icon className={cn("size-3.5 shrink-0", isOver ? "" : "text-ink-3")} />
                    <span className="min-w-0 flex-1 truncate font-medium">{p.label}</span>
                    <span className={cn("shrink-0 text-[11px] tnum", isOver ? "opacity-80" : "text-ink-4")}>
                      {p.iso ? formatDate(p.iso, { weekday: false }) : "Inbox"}
                    </span>
                    {n > 0 && (
                      <span
                        className={cn(
                          "shrink-0 rounded-full px-1.5 text-[10.5px] font-medium tnum",
                          isOver ? "bg-canvas/25" : "bg-hover text-ink-3",
                        )}
                      >
                        {n}
                      </span>
                    )}
                    <span className={cn("shrink-0 text-[10.5px] tnum", isOver ? "opacity-70" : "text-ink-4")}>
                      {p.hint}
                    </span>
                  </button>
                )}
              </DateDropZone>
            );
          })}
        </div>
      </RailCard>

      <RailCard title="Any day">
        <RailCalendar
          value={today}
          weekStart={weekStart}
          counts={counts}
          onPick={(iso) => send(iso)}
        />
      </RailCard>

      <RailCard
        title="Keyboard"
        action={
          <button
            type="button"
            onClick={() => setLegendOpen(!legendOpen)}
            aria-expanded={legendOpen}
            className="inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-[11px] text-ink-3 hover:bg-hover hover:text-ink cursor-pointer transition-colors"
          >
            <Keyboard aria-hidden className="size-3.5" />
            {legendOpen ? "Less" : "All keys"}
          </button>
        }
      >
        <LegendList compact={!legendOpen} />
      </RailCard>
    </div>
  );
}

/** The legend itself — compact in the rail, complete in the modal. */
export function LegendList({ compact }: { compact?: boolean }) {
  const sections = compact ? TRIAGE_LEGEND.slice(0, 2) : TRIAGE_LEGEND;
  return (
    <div className={cn("flex flex-col gap-3", !compact && "sm:grid sm:grid-cols-2 sm:gap-x-6")}>
      {sections.map((section) => (
        <div key={section.title}>
          <p className="mb-1 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-ink-4">
            {section.title}
          </p>
          <ul className="flex flex-col gap-1">
            {section.items.map((item) => (
              <li key={item.label} className="flex items-center gap-2">
                <span className="flex shrink-0 items-center gap-0.5">
                  {item.keys.map((k) => (
                    <Kbd key={k}>{k}</Kbd>
                  ))}
                </span>
                <span className="min-w-0 flex-1 truncate text-[11.5px] text-ink-3">{item.label}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
