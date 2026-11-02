"use client";

import * as React from "react";
import { CloudMoon, Sunrise, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore, tasksOn } from "@/lib/store";
import { addDays, friendlyDate } from "@/lib/date";
import type { Task } from "@/lib/types";
import { Button, IconButton } from "@/components/ui/primitives";

// =========================================================
// Yesterday's leftovers.
//
// The app decided some time ago to stop chasing yesterday — `overdueTasks`
// returns nothing on purpose, and a permanent red Overdue pile is exactly
// the nagging this avoids.
//
// This is the other answer: not a badge that never goes away, but one
// question asked once a day. Each task gets moved, parked or dropped, and
// then the strip is gone until tomorrow. Dismissing it is a real answer too,
// which is why "Not now" is a button and not a hidden gesture.
// =========================================================

const KEY = "humoyun.today.leftovers.dismissed";

// A one-line external store, same shape as `lib/recents.ts`. Reading through
// useSyncExternalStore rather than an effect means no render happens with the
// wrong answer, and a second tab dismissing the strip dismisses it here too.
let cache: string | null = null;
const listeners = new Set<() => void>();

function readDismissed(): string {
  if (cache !== null) return cache;
  try { cache = localStorage.getItem(KEY) ?? ""; } catch { cache = ""; }
  return cache;
}

function writeDismissed(iso: string) {
  cache = iso;
  try { localStorage.setItem(KEY, iso); } catch { /* private mode — ask again next load */ }
  listeners.forEach((fn) => fn());
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

// The server has no localStorage, and "" is the honest answer there: nothing
// has been dismissed, so the strip renders if there is anything to show.
const serverSnapshot = () => "";

/**
 * One answer to "what about this one?". With a mouse it is the quiet icon it
 * always was, named by its tooltip. A finger gets no tooltip — and a sunrise
 * and a cloud mean nothing on their own — so on touch the word sits beside
 * the icon and the button grows to a fingertip.
 */
function LeftoverAction({
  label, title, word = title, icon: Icon, onClick,
}: {
  label: string;
  title: string;
  /** the word shown on touch; defaults to the tooltip */
  word?: string;
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
}) {
  return (
    <IconButton
      label={label}
      title={title}
      size="sm"
      onClick={onClick}
      className="touch:h-8 touch:w-auto touch:gap-1.5 touch:bg-hover touch:px-2.5 touch:text-ink-2 touch:[--touch-hit:-6px_-2px]"
    >
      <Icon />
      <span className="hidden text-[13px] font-medium touch:inline">{word}</span>
    </IconButton>
  );
}

export function Leftovers({ today }: { today: string }) {
  const tasks = useStore((s) => s.tasks);
  const patch = useStore((s) => s.patch);
  const moveTask = useStore((s) => s.moveTask);
  const toast = useStore((s) => s.toast);

  const dismissed = React.useSyncExternalStore(subscribe, readDismissed, serverSnapshot);

  const yesterday = addDays(today, -1);
  const left = React.useMemo(
    () => tasksOn(tasks, yesterday).filter(
      (t) => t.status !== "done" && t.status !== "dropped" && !t.parent_id,
    ),
    [tasks, yesterday],
  );

  if (dismissed === today || left.length === 0) return null;

  function dismiss() {
    writeDismissed(today);
  }

  function moveOne(task: Task, to: "today" | "someday" | "drop") {
    const before = { date: task.date, someday: !!task.someday, status: task.status };
    if (to === "today") moveTask(task.id, today);
    else if (to === "someday") patch("tasks", task.id, { someday: true, date: null });
    else patch("tasks", task.id, { status: "dropped" });

    toast({
      title: to === "today" ? "Moved to today" : to === "someday" ? "Moved to Someday" : "Dropped",
      description: task.title || "Untitled",
      action: {
        label: "Undo",
        run: () => patch("tasks", task.id, before),
      },
    });
  }

  function moveAll() {
    const snapshot = left.map((t) => ({ id: t.id, date: t.date }));
    snapshot.forEach((s) => moveTask(s.id, today));
    dismiss();
    toast({
      title: `Moved ${snapshot.length} to today`,
      tone: "success",
      action: { label: "Undo", run: () => snapshot.forEach((s) => moveTask(s.id, s.date)) },
    });
  }

  return (
    <section
      aria-label={`${left.length} unfinished from ${friendlyDate(yesterday)}`}
      className="surface mb-6 overflow-hidden"
    >
      {/* At 320px the actions do not fit beside the title; they wrap to a
          line of their own instead of breaking the title in two. */}
      <header className="flex items-center gap-2 px-3 py-2.5 hairline-b max-md:flex-wrap max-md:gap-y-1">
        <h2 className="text-[13px] font-semibold tracking-[-0.008em] text-ink max-md:whitespace-nowrap">
          Left from {friendlyDate(yesterday).toLowerCase()}
        </h2>
        <span className="text-[11.5px] tnum text-ink-3">{left.length}</span>
        {/* Wider apart on touch, so the two grown press areas do not overlap. */}
        <div className="ml-auto flex items-center gap-1 touch:gap-2">
          <Button size="xs" variant="ghost" onClick={moveAll} className="[--touch-hit:-10px_-4px]">
            Move all to today
          </Button>
          <IconButton label="Not now — ask again tomorrow" size="sm" onClick={dismiss}>
            <X />
          </IconButton>
        </div>
      </header>

      <ul className="flex flex-col">
        {left.map((task) => (
          <li
            key={task.id}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 hairline-b last:border-b-0",
              // A phone gives the title its own line and the answers the next.
              "max-md:flex-wrap max-md:gap-y-2 max-md:py-2.5",
            )}
          >
            <span className="min-w-0 flex-1 truncate text-[13px] text-ink max-md:basis-full max-md:whitespace-normal max-md:[overflow-wrap:anywhere]">
              {task.title || "Untitled"}
            </span>
            <div className="flex shrink-0 items-center gap-0.5 touch:gap-1.5">
              <LeftoverAction
                label={`Move "${task.title || "Untitled"}" to today`}
                title="Today"
                icon={Sunrise}
                onClick={() => moveOne(task, "today")}
              />
              <LeftoverAction
                label={`Move "${task.title || "Untitled"}" to Someday`}
                title="Someday"
                icon={CloudMoon}
                onClick={() => moveOne(task, "someday")}
              />
              <LeftoverAction
                label={`Drop "${task.title || "Untitled"}"`}
                title="Drop it"
                word="Drop"
                icon={X}
                onClick={() => moveOne(task, "drop")}
              />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
