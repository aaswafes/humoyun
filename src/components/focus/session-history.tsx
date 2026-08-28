"use client";

import * as React from "react";
import { Play, Timer, Watch } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import { formatDuration, formatRange, friendlyDate } from "@/lib/date";
import type { FocusSession } from "@/lib/types";
import { Badge, Button, IconButton, SectionLabel } from "@/components/ui/primitives";
import type { DayGroup, SessionView } from "./focus-data";

const PAGE = 6;

function Row({ view, onResume }: { view: SessionView; onResume: (s: FocusSession) => void }) {
  const tasks = useStore((s) => s.tasks);
  const hour12 = useStore((s) => s.hour12);
  const openInspector = useStore((s) => s.openInspector);

  const { session } = view;
  const task = session.task_id ? tasks.find((t) => t.id === session.task_id) ?? null : null;
  const title = task?.title || session.label || "Focus";
  const pomodoro = session.mode === "pomodoro";
  const Icon = pomodoro ? Timer : Watch;
  const kept = pomodoro && session.completed;

  return (
    <div className="group/row flex h-8 items-center gap-2.5 rounded-md px-1.5 transition-colors duration-150 hover:bg-hover">
      <span
        className="shrink-0"
        title={pomodoro ? (kept ? "Pomodoro completed" : "Pomodoro cut short") : "Stopwatch"}
      >
        <Icon className={cn("size-3.5", kept ? "text-success" : "text-ink-4")} aria-hidden />
      </span>

      <span className="hidden w-[126px] shrink-0 text-[12px] text-ink-3 tnum sm:block">
        {formatRange(view.startMin, view.endMin, hour12)}
      </span>

      {task ? (
        <button
          onClick={() => openInspector(task.id)}
          className="min-w-0 flex-1 cursor-pointer truncate text-left text-[13.5px] text-ink transition-colors hover:text-accent"
        >
          {title}
        </button>
      ) : (
        <span className="min-w-0 flex-1 truncate text-[13.5px] text-ink-2">{title}</span>
      )}

      <div className="hidden shrink-0 items-center gap-1 md:flex">
        {(task?.tags ?? []).slice(0, 2).map((tag) => (
          <Badge key={tag} tint={task?.color ?? "slate"}>{tag}</Badge>
        ))}
      </div>

      <span className="w-[52px] shrink-0 text-right text-[12.5px] text-ink-2 tnum">
        {formatDuration(view.minutes)}
      </span>

      <IconButton
        label={`Focus on ${title} again`}
        size="sm"
        className="opacity-0 transition-opacity focus-visible:opacity-100 group-hover/row:opacity-100"
        onClick={() => onResume(session)}
      >
        <Play />
      </IconButton>
    </div>
  );
}

export const SessionHistory = React.memo(function SessionHistory({
  groups, onResume,
}: {
  groups: DayGroup[];
  onResume: (session: FocusSession) => void;
}) {
  const [days, setDays] = React.useState(PAGE);
  const shown = groups.slice(0, days);

  return (
    <section>
      <SectionLabel className="mb-2.5">History</SectionLabel>

      <div className="space-y-6">
        {shown.map((group) => (
          <div key={group.date}>
            <div className="mb-1 flex items-baseline justify-between gap-3 px-1.5">
              <h3 className="text-[12.5px] font-medium text-ink-2">{friendlyDate(group.date)}</h3>
              <span className="text-[11.5px] text-ink-4 tnum">{formatDuration(group.minutes)}</span>
            </div>
            {group.items
              .slice()
              .reverse()
              .map((view) => (
                <Row key={view.session.id} view={view} onResume={onResume} />
              ))}
          </div>
        ))}
      </div>

      {groups.length > days && (
        <div className="mt-5 flex justify-center">
          <Button variant="ghost" size="sm" onClick={() => setDays((d) => d + PAGE)}>
            Show earlier days
          </Button>
        </div>
      )}
    </section>
  );
});
