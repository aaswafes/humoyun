"use client";

import * as React from "react";
import { CalendarDays, Flag, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import { formatDate, isPast, todayISO } from "@/lib/date";
import type { Goal } from "@/lib/types";
import {
  Button, Checkbox, IconButton, InlineInput, SectionLabel,
} from "@/components/ui/primitives";
import { MiniCalendar } from "@/components/ui/mini-calendar";
import { Popover } from "@/components/ui/overlays";
import { MiniEmpty } from "@/components/ui/form";
import { sortMilestones, type Milestone } from "./goal-meta";
import type { GoalStats } from "./goal-model";
import { useGoalMeta } from "./use-goal-actions";

/**
 * The dated checkpoints inside a goal. They score into progress, they show up
 * as diamonds on the timeline, and a missed one is the earliest honest signal
 * that a goal is in trouble.
 */
export function GoalMilestones({ goal, stats }: { goal: Goal; stats: GoalStats }) {
  const { addMilestone, updateMilestone, toggleMilestone, removeMilestone } = useGoalMeta();
  const list = React.useMemo(() => sortMilestones(stats.meta.milestones), [stats.meta.milestones]);
  const [draft, setDraft] = React.useState("");
  const [composing, setComposing] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => { if (composing) inputRef.current?.focus(); }, [composing]);

  function submit() {
    const title = draft.trim();
    if (title) addMilestone(goal, title, goal.end_date ?? todayISO());
    setDraft("");
  }

  return (
    <section>
      <div className="flex items-center gap-2">
        <SectionLabel>Milestones</SectionLabel>
        <span className="text-[11px] text-ink-4 tnum">
          {stats.milestoneTotal ? `${stats.milestoneDone}/${stats.milestoneTotal}` : "0"}
        </span>
      </div>

      <div className="mt-1.5">
        {list.length === 0 ? (
          <MiniEmpty
            action={
              <Button size="xs" onClick={() => setComposing(true)}>
                <Plus className="size-3.5" />
                Add the first one
              </Button>
            }
          >
            Checkpoints with dates. They plot on the timeline and can drive the bar.
          </MiniEmpty>
        ) : (
          list.map((milestone) => (
            <MilestoneRow
              key={milestone.id}
              goal={goal}
              milestone={milestone}
              onToggle={() => toggleMilestone(goal, milestone.id)}
              onRename={(title) => updateMilestone(goal, milestone.id, { title })}
              onDate={(date) => updateMilestone(goal, milestone.id, { date })}
              onDelete={() => removeMilestone(goal, milestone.id)}
            />
          ))
        )}

        {composing || list.length > 0 ? (
          <div className="mt-0.5 flex items-center gap-2 rounded-md px-1.5 py-[6px] transition-colors duration-150 focus-within:bg-hover">
            <Plus className="size-4 shrink-0 text-ink-4" />
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => { submit(); setComposing(false); }}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); submit(); }
                if (e.key === "Escape") { setDraft(""); setComposing(false); e.currentTarget.blur(); }
              }}
              aria-label="New milestone"
              placeholder="What has to be true along the way?"
              className="min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-4"
            />
          </div>
        ) : null}
      </div>
    </section>
  );
}

function MilestoneRow({
  goal, milestone, onToggle, onRename, onDate, onDelete,
}: {
  goal: Goal;
  milestone: Milestone;
  onToggle: () => void;
  onRename: (title: string) => void;
  onDate: (date: string | null) => void;
  onDelete: () => void;
}) {
  const weekStart = useStore((s) => s.profile?.week_start ?? 1);
  const [title, setTitle] = React.useState(milestone.title);
  const missed = !milestone.done && !!milestone.date && isPast(milestone.date);

  // The row is a container, not a control: everything in it is its own button.
  return (
    <div className="group/ms flex items-center gap-2 rounded-md px-1.5 py-[5px] transition-colors duration-150 hover:bg-hover">
      <Checkbox
        checked={milestone.done}
        onChange={onToggle}
        tint={goal.color}
        size="sm"
        label={milestone.done
          ? `Mark “${milestone.title || "milestone"}” as not reached`
          : `Mark “${milestone.title || "milestone"}” as reached`}
      />

      <InlineInput
        value={title}
        aria-label="Milestone name"
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() => {
          const next = title.trim();
          if (next && next !== milestone.title) onRename(next);
          else setTitle(milestone.title);
        }}
        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
        className={cn(
          "min-w-0 flex-1 text-[13px]",
          milestone.done && "text-ink-3 line-through decoration-ink-4/60",
        )}
      />

      <Popover
        align="end"
        className="w-auto p-2"
        trigger={
          <Button
            size="xs"
            variant="ghost"
            className={cn(
              "shrink-0 gap-1 font-normal tnum",
              missed ? "text-danger" : milestone.date ? "text-ink-3" : "text-ink-4",
            )}
          >
            <CalendarDays className="size-3" />
            {milestone.date ? formatDate(milestone.date, { weekday: false }) : "No date"}
          </Button>
        }
      >
        {(close) => (
          <div className="w-[248px]">
            <MiniCalendar
              value={milestone.date ?? goal.end_date ?? todayISO()}
              weekStart={weekStart}
              onChange={(iso) => { onDate(iso); close(); }}
              footer={
                milestone.date ? (
                  <Button size="xs" variant="ghost" className="w-full" onClick={() => { onDate(null); close(); }}>
                    Clear date
                  </Button>
                ) : undefined
              }
            />
          </div>
        )}
      </Popover>

      <IconButton
        label={`Delete milestone ${milestone.title || ""}`.trim()}
        size="sm"
        tone="danger"
        className="shrink-0 opacity-0 transition-opacity focus-visible:opacity-100 group-hover/ms:opacity-100"
        onClick={onDelete}
      >
        <Trash2 />
      </IconButton>
    </div>
  );
}

/** Milestone diamonds for the timeline strip. */
export function MilestoneMark({
  milestone, tint, left, title,
}: {
  milestone: Milestone;
  tint: string;
  left: number;
  title: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(tint, "pointer-events-none absolute top-1/2 z-[1] -translate-x-1/2 -translate-y-1/2")}
      style={{ left: `${left}%` }}
      title={title}
    >
      <Flag
        className={cn("size-3", milestone.done ? "text-success" : "text-ink-2")}
        strokeWidth={2.5}
      />
    </span>
  );
}
