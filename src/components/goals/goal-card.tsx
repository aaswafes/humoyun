"use client";

import * as React from "react";
import {
  Ban, CircleCheck, Ellipsis, Layers, ListChecks, Pause, Play, Target, Trash2, Undo2,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import type { Goal } from "@/lib/types";
import { Badge, IconButton, Progress } from "@/components/ui/primitives";
import { ConfirmDialog, MenuItem, MenuSeparator, Popover } from "@/components/ui/overlays";
import {
  formatGoalRange, formatTarget, HORIZON_LABEL, pct, type GoalStats,
} from "./goal-model";

const PACE_CLASS = {
  ahead: "text-success",
  "on track": "text-ink-3",
  behind: "text-warn",
} as const;

/** The tint dot that stands in for a goal everywhere in this surface. */
export function GoalDot({ goal, className }: { goal: Goal; className?: string }) {
  if (goal.status === "done") {
    return <CircleCheck className={cn("size-3.5 shrink-0 text-success", className)} />;
  }
  if (goal.status === "paused") {
    return <Pause className={cn("size-3.5 shrink-0 text-warn", className)} />;
  }
  if (goal.status === "dropped") {
    return <Ban className={cn("size-3.5 shrink-0 text-ink-4", className)} />;
  }
  return (
    <span
      className={cn(`tint-${goal.color}`, "size-2.5 shrink-0 rounded-full", className)}
      style={{ background: "var(--tint)" }}
    />
  );
}

export interface GoalCardProps {
  goal: Goal;
  stats: GoalStats;
  onOpen: (id: string) => void;
  onHover?: (id: string | null) => void;
  dimmed?: boolean;
  active?: boolean;
  className?: string;
}

/**
 * One rung of the ladder. The data attribute is how the ladder finds this
 * card's laid-out box when it draws the line down from the parent.
 */
export function GoalCard({
  goal, stats, onOpen, onHover, dimmed, active, className,
}: GoalCardProps) {
  const patch = useStore((s) => s.patch);
  const remove = useStore((s) => s.remove);
  const toast = useStore((s) => s.toast);
  const [confirming, setConfirming] = React.useState(false);

  const done = goal.status === "done";
  const target = formatTarget(goal);
  const progress = done ? 1 : stats.overall;

  function setStatus(status: Goal["status"], note: string) {
    patch("goals", goal.id, { status });
    toast({ title: note, description: goal.title, tone: status === "done" ? "success" : "default" });
  }

  return (
    <>
      <div
        data-goal-card={goal.id}
        onClick={() => onOpen(goal.id)}
        onMouseEnter={() => onHover?.(goal.id)}
        onMouseLeave={() => onHover?.(null)}
        className={cn(
          "group/goal relative cursor-pointer rounded-lg border bg-raised p-2.5",
          "transition-[background-color,border-color,opacity,transform] duration-200 ease-[var(--ease-out-apple)]",
          "hover:bg-hover active:scale-[0.992]",
          active ? "border-accent-line" : "border-line hover:border-line-strong",
          dimmed && "opacity-40",
          goal.status === "dropped" && "opacity-60",
          className,
        )}
      >
        <div className="flex items-start gap-2">
          <span className="mt-[3px]"><GoalDot goal={goal} /></span>

          <button
            onClick={(e) => { e.stopPropagation(); onOpen(goal.id); }}
            className={cn(
              "min-w-0 flex-1 cursor-pointer truncate text-left text-[13.5px] font-medium leading-[1.35]",
              done ? "text-ink-3 line-through decoration-ink-4/60" : "text-ink",
            )}
          >
            {goal.title || <span className="text-ink-4">Untitled goal</span>}
          </button>

          <Popover
            align="end"
            className="w-[188px]"
            trigger={
              <IconButton
                label={`Options for ${goal.title || "goal"}`}
                size="sm"
                onClick={(e) => e.stopPropagation()}
                className="-mr-0.5 -mt-0.5 shrink-0 opacity-0 transition-opacity duration-150 focus-visible:opacity-100 group-hover/goal:opacity-100"
              >
                <Ellipsis />
              </IconButton>
            }
          >
            {(close) => (
              <div onClick={(e) => e.stopPropagation()}>
                {done ? (
                  <MenuItem icon={Undo2} onClick={() => { setStatus("active", "Reopened"); close(); }}>
                    Reopen goal
                  </MenuItem>
                ) : (
                  <MenuItem icon={CircleCheck} onClick={() => { setStatus("done", "Goal completed"); close(); }}>
                    Mark complete
                  </MenuItem>
                )}
                {goal.status === "paused" ? (
                  <MenuItem icon={Play} onClick={() => { setStatus("active", "Resumed"); close(); }}>
                    Resume
                  </MenuItem>
                ) : goal.status === "active" ? (
                  <MenuItem icon={Pause} onClick={() => { setStatus("paused", "Paused"); close(); }}>
                    Pause
                  </MenuItem>
                ) : null}
                {goal.status !== "dropped" && (
                  <MenuItem icon={Ban} onClick={() => { setStatus("dropped", "Dropped"); close(); }}>
                    Drop
                  </MenuItem>
                )}
                <MenuSeparator />
                <MenuItem icon={Trash2} danger onClick={() => { close(); setConfirming(true); }}>
                  Delete
                </MenuItem>
              </div>
            )}
          </Popover>
        </div>

        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 pl-[18px]">
          <Badge tint={goal.color}>{HORIZON_LABEL[goal.horizon]}</Badge>
          <span className="truncate text-[11.5px] text-ink-3 tnum">{formatGoalRange(goal)}</span>
        </div>

        <div className="mt-2 pl-[18px]">
          <Progress value={progress * 100} tint={goal.color} />

          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px] tnum">
            <span className="font-medium text-ink-2">{pct(progress)}</span>
            {target && (
              <span className="inline-flex items-center gap-1 text-ink-3" title="Target progress">
                <Target className="size-3" />
                {target}
              </span>
            )}
            {stats.subtreeTotal > 0 && (
              <span className="inline-flex items-center gap-1 text-ink-3" title="Linked tasks completed">
                <ListChecks className="size-3" />
                {stats.subtreeDone}/{stats.subtreeTotal}
              </span>
            )}
            {stats.childCount > 0 && (
              <span className="inline-flex items-center gap-1 text-ink-3" title="Child goals completed">
                <Layers className="size-3" />
                {stats.childDone}/{stats.childCount}
              </span>
            )}
            {stats.pace && !done && (
              <span className={cn("ml-auto font-medium", PACE_CLASS[stats.pace])}>{stats.pace}</span>
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={() => {
          remove("goals", goal.id);
          toast({ title: "Goal deleted", description: goal.title, tone: "danger" });
        }}
        title="Delete this goal?"
        description={
          stats.childCount > 0
            ? `${goal.title || "This goal"} has ${stats.childCount} child ${stats.childCount === 1 ? "goal" : "goals"}. They stay, but lose their parent.`
            : `${goal.title || "This goal"} will be removed. Linked tasks are kept.`
        }
      />
    </>
  );
}
