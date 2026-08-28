"use client";

import * as React from "react";
import {
  Ban, BellDot, CircleCheck, Ellipsis, Flag, Hourglass, Layers, ListChecks,
  Pause, Play, Target, Trash2, Undo2,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import { formatDate } from "@/lib/date";
import type { Goal } from "@/lib/types";
import { Badge, IconButton, Progress } from "@/components/ui/primitives";
import { ConfirmDialog, MenuItem, MenuSeparator, Popover } from "@/components/ui/overlays";
import {
  formatGoalRange, formatTarget, HORIZON_LABEL, pct, type GoalStats,
} from "./goal-model";
import { nextMilestone } from "./goal-meta";

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

/** State flags, each carried by an icon and a word — never by colour alone. */
export function GoalFlags({ stats, className }: { stats: GoalStats; className?: string }) {
  const flags: { icon: React.ComponentType<{ className?: string }>; text: string; tone: string }[] = [];
  if (stats.overdue) flags.push({ icon: Flag, text: "Overdue", tone: "text-danger" });
  if (stats.needsCheckIn) flags.push({ icon: BellDot, text: "Check in", tone: "text-warn" });
  if (stats.stalled) flags.push({ icon: Hourglass, text: `${stats.daysQuiet}d quiet`, tone: "text-warn" });
  if (!flags.length) return null;

  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      {flags.map((f) => (
        <span key={f.text} className={cn("inline-flex items-center gap-1 text-[11px] font-medium", f.tone)}>
          <f.icon className="size-3" />
          {f.text}
        </span>
      ))}
    </span>
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
  /** the ladder's drag grip, parked in the gutter to the card's left */
  dragHandle?: React.ReactNode;
  /** where a drop would land this card's neighbour */
  dropHint?: "before" | "after" | "nest" | null;
  dragging?: boolean;
  /** move commands, injected by whoever owns the layout */
  menuExtra?: (close: () => void) => React.ReactNode;
}

/**
 * One rung of the ladder. The data attribute is how the ladder finds this
 * card's laid-out box when it draws the line down from the parent.
 *
 * The card is a plain container: the title button is stretched across it so the
 * whole surface stays clickable while staying a single, focusable target — a
 * clickable div would leave the card unreachable by keyboard.
 */
export function GoalCard({
  goal, stats, onOpen, onHover, dimmed, active, className,
  dragHandle, dropHint, dragging, menuExtra,
}: GoalCardProps) {
  const patch = useStore((s) => s.patch);
  const remove = useStore((s) => s.remove);
  const toast = useStore((s) => s.toast);
  const [confirming, setConfirming] = React.useState(false);

  const done = goal.status === "done";
  const target = formatTarget(goal);
  const progress = done ? 1 : stats.overall;
  const upcoming = React.useMemo(() => nextMilestone(stats.meta), [stats.meta]);

  function setStatus(status: Goal["status"], note: string) {
    patch("goals", goal.id, { status });
    toast({ title: note, description: goal.title, tone: status === "done" ? "success" : "default" });
  }

  return (
    <>
      <div
        data-goal-card={goal.id}
        onMouseEnter={() => onHover?.(goal.id)}
        onMouseLeave={() => onHover?.(null)}
        className={cn(
          "group/goal relative rounded-lg border bg-raised p-2.5",
          "transition-[background-color,border-color,opacity,box-shadow] duration-200 ease-[var(--ease-out-apple)]",
          "hover:bg-hover focus-within:border-line-strong",
          active ? "border-accent-line" : "border-line hover:border-line-strong",
          dimmed && "opacity-40",
          goal.status === "dropped" && "opacity-60",
          dragging && "opacity-40",
          dropHint === "nest" && "border-accent bg-accent-soft ring-2 ring-accent",
          className,
        )}
      >
        {dragHandle && (
          <div className="absolute -left-[26px] top-1.5 z-[2]">{dragHandle}</div>
        )}

        {(dropHint === "before" || dropHint === "after") && (
          <span
            aria-hidden
            className={cn(
              "absolute inset-x-0 h-[2px] rounded-full bg-accent",
              dropHint === "before" ? "-top-[5px]" : "-bottom-[5px]",
            )}
          >
            <span className="absolute -left-[2px] -top-[2px] size-1.5 rounded-full bg-accent" />
          </span>
        )}

        <div className="flex items-start gap-2">
          <span className="mt-[3px]"><GoalDot goal={goal} /></span>

          <button
            onClick={() => onOpen(goal.id)}
            onFocus={() => onHover?.(goal.id)}
            onBlur={() => onHover?.(null)}
            className={cn(
              "min-w-0 flex-1 cursor-pointer truncate text-left text-[13.5px] font-medium leading-[1.35]",
              "after:absolute after:inset-0 after:rounded-lg after:content-['']",
              done ? "text-ink-3 line-through decoration-ink-4/60" : "text-ink",
            )}
          >
            {goal.title || <span className="text-ink-4">Untitled goal</span>}
          </button>

          <Popover
            align="end"
            className="w-[218px]"
            trigger={
              <IconButton
                label={`Options for ${goal.title || "goal"}`}
                size="sm"
                className="relative z-[1] -mr-0.5 -mt-0.5 shrink-0 opacity-0 transition-opacity duration-150 focus-visible:opacity-100 group-hover/goal:opacity-100"
              >
                <Ellipsis />
              </IconButton>
            }
          >
            {(close) => (
              <>
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
                {menuExtra?.(close)}
                <MenuSeparator />
                <MenuItem icon={Trash2} danger onClick={() => { close(); setConfirming(true); }}>
                  Delete
                </MenuItem>
              </>
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
            {stats.mode !== "auto" && (
              <span
                className="text-[11px] text-ink-4"
                title={`Progress driven by ${stats.signals.find((s) => s.key === stats.mode)?.label.toLowerCase()} alone`}
              >
                {stats.signals.find((s) => s.key === stats.mode)?.label.toLowerCase()}
              </span>
            )}
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
            {stats.milestoneTotal > 0 && (
              <span className="inline-flex items-center gap-1 text-ink-3" title="Milestones reached">
                <Flag className="size-3" />
                {stats.milestoneDone}/{stats.milestoneTotal}
              </span>
            )}
            {stats.pace && !done && (
              <span className={cn("ml-auto font-medium", PACE_CLASS[stats.pace])}>{stats.pace}</span>
            )}
          </div>

          {(upcoming?.date || stats.overdue || stats.needsCheckIn || stats.stalled) && !done && (
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 pt-1.5 hairline-t">
              <GoalFlags stats={stats} />
              {upcoming?.date && (
                <span className="inline-flex min-w-0 items-center gap-1 text-[11px] text-ink-3">
                  <Flag className="size-3 shrink-0" />
                  <span className="truncate">{upcoming.title || "Next milestone"}</span>
                  <span className="shrink-0 tnum">{formatDate(upcoming.date, { weekday: false })}</span>
                </span>
              )}
            </div>
          )}
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
