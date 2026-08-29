"use client";

import * as React from "react";
import { ArrowRight, Flag, History } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore, completionOn } from "@/lib/store";
import { addDays, formatDate, formatTime } from "@/lib/date";
import { Button } from "@/components/ui/primitives";
import { RailCard, RailEmpty, RailRow, RailMeta } from "./rail-card";

const PRIORITY_CLASS = ["", "text-ink-3", "text-warn", "text-danger"];
const VISIBLE = 5;

/**
 * Only yesterday — everything older lives in the Overdue section upstairs.
 * One tap pulls a task forward; the header pulls the lot.
 */
export function LeftoversCard({ date }: { date: string }) {
  const tasks = useStore((s) => s.tasks);
  const dayLogs = useStore((s) => s.dayLogs);
  const hour12 = useStore((s) => s.hour12);
  const moveTask = useStore((s) => s.moveTask);
  const patch = useStore((s) => s.patch);
  const toast = useStore((s) => s.toast);

  const yesterday = addDays(date, -1);
  const leftovers = React.useMemo(
    () => tasks
      .filter((t) => t.date === yesterday && !t.parent_id && t.status !== "done" && t.status !== "dropped")
      .sort((a, b) => b.priority - a.priority || (a.start_min ?? 1440) - (b.start_min ?? 1440)),
    [tasks, yesterday],
  );

  const { done, total } = completionOn(tasks, yesterday);
  const log = dayLogs.find((d) => d.date === yesterday);

  function pull(id: string, title: string) {
    moveTask(id, date);
    toast({
      title: "Pulled to today",
      description: title,
      action: { label: "Undo", run: () => patch("tasks", id, { date: yesterday }) },
    });
  }

  function pullAll() {
    const snapshot = leftovers.map((t) => t.id);
    snapshot.forEach((id) => moveTask(id, date));
    toast({
      title: `Pulled ${snapshot.length} task${snapshot.length === 1 ? "" : "s"} forward`,
      tone: "success",
      action: { label: "Undo", run: () => snapshot.forEach((id) => patch("tasks", id, { date: yesterday })) },
    });
  }

  const summary = leftovers.length
    ? `${leftovers.length} left over · ${done}/${total} done`
    : total
      ? `all ${total} finished`
      : "nothing was planned";

  return (
    <RailCard
      icon={History}
      title="Yesterday"
      foldKey="rail.yesterday"
      summary={summary}
      accessory={
        leftovers.length > 1 ? (
          <Button size="xs" variant="ghost" onClick={pullAll}>
            Pull all
          </Button>
        ) : undefined
      }
      footer={
        <div>
          <RailMeta value={total ? `${done}/${total}` : "—"}>
            {formatDate(yesterday)}
            {total === 0 ? " · nothing planned" : done === total ? " · closed clean" : " · done"}
          </RailMeta>
          {log?.highlight && (
            <p className="mt-1.5 line-clamp-2 text-[11.5px] italic leading-snug text-ink-3">
              “{log.highlight}”
            </p>
          )}
        </div>
      }
    >
      {leftovers.length === 0 ? (
        <RailEmpty>
          {total === 0
            ? "Yesterday had nothing on it."
            : `Nothing slipped — all ${total} finished.`}
        </RailEmpty>
      ) : (
        <>
          {leftovers.slice(0, VISIBLE).map((task) => (
            <RailRow
              key={task.id}
              onClick={() => pull(task.id, task.title)}
              ariaLabel={`Move ${task.title || "Untitled"} to today`}
              className="group/leftover"
            >
              {task.priority > 0 ? (
                <Flag
                  aria-hidden
                  className={cn("size-3 shrink-0", PRIORITY_CLASS[task.priority])}
                  fill="currentColor"
                />
              ) : (
                <span
                  aria-hidden
                  className={cn("size-1.5 shrink-0 rounded-full bg-ink-4", task.color && `tint-${task.color}`)}
                  style={task.color ? { background: "var(--tint)" } : undefined}
                />
              )}

              <span className="min-w-0 flex-1 truncate text-[13px] text-ink">
                {task.title || "Untitled"}
              </span>

              {task.start_min != null && (
                <span className="shrink-0 text-[11.5px] text-ink-4 tnum">
                  {formatTime(task.start_min, hour12)}
                </span>
              )}

              <ArrowRight
                aria-hidden
                className="size-3.5 shrink-0 text-ink-4 transition-transform duration-150 ease-[var(--ease-out-apple)] group-hover/leftover:translate-x-0.5 group-hover/leftover:text-ink-2"
              />
            </RailRow>
          ))}
          {leftovers.length > VISIBLE && (
            <p className="px-2 pb-1 pt-1.5 text-[11.5px] text-ink-4 tnum">
              +{leftovers.length - VISIBLE} more in Overdue
            </p>
          )}
        </>
      )}
    </RailCard>
  );
}
