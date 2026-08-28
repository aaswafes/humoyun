"use client";

import * as React from "react";
import {
  Coffee, MoreHorizontal, NotebookPen, Play, Search, Timer, Trash2, Watch, Zap,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import { formatDuration, formatRange, friendlyDate } from "@/lib/date";
import type { FocusSession } from "@/lib/types";
import { Badge, Button, IconButton, SectionLabel } from "@/components/ui/primitives";
import { MenuItem, MenuSeparator, Popover } from "@/components/ui/overlays";
import { MiniEmpty, Select, VisuallyHidden } from "@/components/ui/form";
import { visibleTags, type DayGroup, type SessionView } from "./focus-data";
import { deleteSession } from "./session-actions";

const PAGE = 6;

type Filter = "sessions" | "interrupted" | "notes" | "breaks";

const FILTERS: { value: Filter; label: string; description: string }[] = [
  { value: "sessions", label: "Focus", description: "Every logged block" },
  { value: "interrupted", label: "Interrupted", description: "Blocks you were pulled out of" },
  { value: "notes", label: "With notes", description: "Blocks you wrote something on" },
  { value: "breaks", label: "Breaks", description: "Rest taken between blocks" },
];

function Row({
  view, onResume, onOpen,
}: {
  view: SessionView;
  onResume: (s: FocusSession) => void;
  onOpen: (id: string) => void;
}) {
  const tasks = useStore((s) => s.tasks);
  const hour12 = useStore((s) => s.hour12);
  const openInspector = useStore((s) => s.openInspector);

  const { session } = view;
  const task = session.task_id ? tasks.find((t) => t.id === session.task_id) ?? null : null;
  const title = task?.title || session.label || (view.isBreak ? "Break" : "Focus");
  const pomodoro = session.mode === "pomodoro";
  const Icon = view.isBreak ? Coffee : pomodoro ? Timer : Watch;
  const kept = pomodoro && session.completed;
  const tags = [...new Set([...visibleTags(session.tags), ...(task?.tags ?? [])])].slice(0, 2);

  return (
    <div
      className={cn(
        "group/row flex min-h-8 items-center gap-2.5 rounded-md px-1.5 py-1 transition-colors duration-150 hover:bg-hover",
        view.isBreak && "opacity-70",
      )}
    >
      <span
        className="shrink-0"
        title={
          view.isBreak
            ? session.completed ? "Break taken in full" : "Break cut short"
            : pomodoro
              ? kept ? "Pomodoro completed" : "Pomodoro cut short"
              : "Stopwatch"
        }
      >
        <Icon
          className={cn("size-3.5", view.isBreak ? "text-ink-4" : kept ? "text-success" : "text-ink-4")}
          aria-hidden
        />
      </span>

      <span className="hidden w-[126px] shrink-0 text-[12px] text-ink-3 tnum sm:block">
        {formatRange(view.startMin, view.endMin, hour12)}
      </span>

      <div className="min-w-0 flex-1">
        {task ? (
          <button
            onClick={() => openInspector(task.id)}
            className="block max-w-full cursor-pointer truncate text-left text-[13.5px] text-ink transition-colors hover:text-accent"
          >
            {title}
          </button>
        ) : (
          <span className="block truncate text-[13.5px] text-ink-2">{title}</span>
        )}
        {session.note && (
          <p className="truncate text-[11.5px] leading-snug text-ink-4">{session.note}</p>
        )}
      </div>

      {view.interruptions > 0 && (
        <span
          className="hidden shrink-0 items-center gap-1 text-[11.5px] text-warn tnum sm:flex"
          title={`${view.interruptions} interruption${view.interruptions === 1 ? "" : "s"}`}
        >
          <Zap className="size-3" aria-hidden />
          {view.interruptions}
          <VisuallyHidden>interruptions</VisuallyHidden>
        </span>
      )}

      <div className="hidden shrink-0 items-center gap-1 md:flex">
        {tags.map((tag) => (
          <Badge key={tag} tint={task?.color ?? "slate"}>{tag}</Badge>
        ))}
      </div>

      <span className="w-[52px] shrink-0 text-right text-[12.5px] text-ink-2 tnum">
        {formatDuration(view.minutes)}
      </span>

      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover/row:opacity-100">
        {!view.isBreak && (
          <IconButton label={`Focus on ${title} again`} size="sm" onClick={() => onResume(session)}>
            <Play />
          </IconButton>
        )}
        <Popover
          align="end"
          className="w-[200px]"
          trigger={<IconButton label={`Options for ${title}`} size="sm"><MoreHorizontal /></IconButton>}
        >
          {(close) => (
            <>
              {!view.isBreak && (
                <>
                  <MenuItem icon={NotebookPen} onClick={() => { onOpen(session.id); close(); }}>
                    Note, tags, task…
                  </MenuItem>
                  <MenuItem icon={Play} onClick={() => { onResume(session); close(); }}>
                    Focus on this again
                  </MenuItem>
                  <MenuSeparator />
                </>
              )}
              <MenuItem icon={Trash2} danger onClick={() => { deleteSession(session.id); close(); }}>
                Delete session
              </MenuItem>
            </>
          )}
        </Popover>
      </div>
    </div>
  );
}

export const SessionHistory = React.memo(function SessionHistory({
  groups, onResume, onOpen, focusDate,
}: {
  groups: DayGroup[];
  onResume: (session: FocusSession) => void;
  onOpen: (sessionId: string) => void;
  /** A day picked in the heatmap — pulled into view and highlighted. */
  focusDate: string | null;
}) {
  const [days, setDays] = React.useState(PAGE);
  const [query, setQuery] = React.useState("");
  const [filter, setFilter] = React.useState<Filter>("sessions");
  const tasks = useStore((s) => s.tasks);
  const dayRefs = React.useRef(new Map<string, HTMLDivElement | null>());

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const titleOf = (view: SessionView) => {
      const task = view.session.task_id ? tasks.find((t) => t.id === view.session.task_id) : null;
      return [task?.title, view.session.label, view.session.note, ...(task?.tags ?? []),
        ...visibleTags(view.session.tags)]
        .filter(Boolean).join(" ").toLowerCase();
    };

    return groups
      .map((group) => {
        const pool = filter === "breaks" ? group.breaks : group.items;
        const rows = pool.filter((view) => {
          if (filter === "interrupted" && view.interruptions === 0) return false;
          if (filter === "notes" && !view.session.note) return false;
          if (q && !titleOf(view).includes(q)) return false;
          return true;
        });
        return { group, rows };
      })
      .filter((entry) => entry.rows.length > 0);
  }, [groups, tasks, query, filter]);

  const targetIndex = focusDate ? filtered.findIndex((e) => e.group.date === focusDate) : -1;
  const visibleCount = Math.max(days, targetIndex + 1);
  const shown = filtered.slice(0, visibleCount);

  React.useEffect(() => {
    if (!focusDate) return;
    dayRefs.current.get(focusDate)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [focusDate, visibleCount]);

  return (
    <section>
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <SectionLabel>History</SectionLabel>

        <div className="flex items-center gap-2">
          <div className="flex h-7 items-center gap-1.5 rounded-md border border-line px-2 transition-colors focus-within:border-accent">
            <Search className="size-3.5 shrink-0 text-ink-4" aria-hidden />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search sessions"
              aria-label="Search sessions by task, label, note or tag"
              className="w-[130px] bg-transparent text-[12.5px] text-ink outline-none placeholder:text-ink-4"
            />
          </div>
          <div className="w-[124px]">
            <Select<Filter>
              size="sm"
              label="Filter history"
              value={filter}
              onChange={setFilter}
              options={FILTERS}
            />
          </div>
        </div>
      </div>

      {!shown.length ? (
        <MiniEmpty
          action={
            query || filter !== "sessions" ? (
              <Button variant="ghost" size="sm" onClick={() => { setQuery(""); setFilter("sessions"); }}>
                Clear the filter
              </Button>
            ) : undefined
          }
        >
          {query || filter !== "sessions"
            ? "Nothing matches that yet."
            : "Finished sessions land here."}
        </MiniEmpty>
      ) : (
        <div className="space-y-5">
          {shown.map(({ group, rows }) => (
            <div
              key={group.date}
              ref={(el) => { dayRefs.current.set(group.date, el); }}
              className={cn(
                "rounded-lg transition-colors duration-300",
                focusDate === group.date && "bg-selected px-1.5 py-1",
              )}
            >
              <div className="mb-1 flex items-baseline justify-between gap-3 px-1.5">
                <h3 className="text-[12.5px] font-medium text-ink-2">{friendlyDate(group.date)}</h3>
                <span className="text-[11.5px] text-ink-4 tnum">
                  {formatDuration(group.minutes)}
                  {group.interruptions > 0 && ` · ${group.interruptions} interrupted`}
                  {group.breakMinutes > 0 && ` · ${formatDuration(group.breakMinutes)} rest`}
                </span>
              </div>
              {rows
                .slice()
                .reverse()
                .map((view) => (
                  <Row key={view.session.id} view={view} onResume={onResume} onOpen={onOpen} />
                ))}
            </div>
          ))}
        </div>
      )}

      {filtered.length > visibleCount && (
        <div className="mt-5 flex justify-center">
          <Button variant="ghost" size="sm" onClick={() => setDays(visibleCount + PAGE)}>
            Show earlier days
          </Button>
        </div>
      )}
    </section>
  );
});
