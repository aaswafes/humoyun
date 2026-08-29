"use client";

import * as React from "react";
import {
  Ban, BellDot, CalendarPlus, CircleCheck, Ellipsis, Flag, Hourglass, Link2Off,
  Pause, PencilLine, Play, Trash2, TrendingDown, Undo2,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import { formatDate } from "@/lib/date";
import type { Goal } from "@/lib/types";
import { IconButton, Progress } from "@/components/ui/primitives";
import { ConfirmDialog, MenuItem, MenuSeparator, Popover } from "@/components/ui/overlays";
import {
  formatGoalRange, formatTarget, HORIZON_LABEL, pct,
  type AttentionFlag, type AttentionKind, type GoalStats,
} from "./goal-model";
import { nextMilestone } from "./goal-meta";

/** One icon per kind of trouble, shared by the card, the sheet and the review. */
export const ATTENTION_ICON: Record<AttentionKind, React.ComponentType<{ className?: string }>> = {
  overdue: Flag,
  checkin: BellDot,
  stalled: Hourglass,
  behind: TrendingDown,
  undated: CalendarPlus,
  undefined: PencilLine,
  unlinked: Link2Off,
};

/** The tint dot that stands in for a goal everywhere in this surface. */
export function GoalDot({ goal, className }: { goal: Goal; className?: string }) {
  if (goal.status === "done") {
    return <CircleCheck className={cn("size-3.5 shrink-0 text-success", className)} />;
  }
  if (goal.status === "paused") {
    return <Pause className={cn("size-3.5 shrink-0 text-ink-3", className)} />;
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

/**
 * State flags as a line of text rather than a wall of outlined pills. Only a
 * genuine failure — a date that has already passed — spends colour; everything
 * else is information, and information is grey.
 */
export function AttentionLine({
  flags, detail = true, className,
}: {
  flags: AttentionFlag[];
  /** false on dense rows, where the label alone carries the state */
  detail?: boolean;
  className?: string;
}) {
  if (!flags.length) return null;
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11.5px]", className)}>
      {flags.map((flag) => {
        const Icon = ATTENTION_ICON[flag.kind];
        return (
          <span
            key={flag.kind}
            title={flag.detail}
            className={cn(
              "inline-flex items-center gap-1",
              flag.tone === "danger" ? "text-danger" : "text-ink-3",
            )}
          >
            <Icon className="size-3 shrink-0" />
            <span className="font-medium">{flag.label}</span>
            {detail && <span className="text-ink-4 tnum">{flag.detail}</span>}
          </span>
        );
      })}
    </span>
  );
}

/** The card's own state line: at most two words, and only one of them coloured. */
export function GoalFlags({ stats, className }: { stats: GoalStats; className?: string }) {
  const flags: { icon: React.ComponentType<{ className?: string }>; text: string; danger?: boolean }[] = [];
  if (stats.overdue) flags.push({ icon: Flag, text: "Overdue", danger: true });
  if (stats.needsCheckIn) flags.push({ icon: BellDot, text: "Check in" });
  if (stats.stalled) flags.push({ icon: Hourglass, text: `${stats.daysQuiet}d quiet` });
  if (!flags.length) return null;

  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      {flags.map((f) => (
        <span
          key={f.text}
          className={cn("inline-flex items-center gap-1 text-[11px]", f.danger ? "text-danger" : "text-ink-3")}
        >
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
 *
 * It shows what a column of cards is scanned for: the name, how far along, and
 * whether it is in trouble. Its horizon is the column it sits in, and its
 * counts, dates and formula are one click away in the sheet — the whole line is
 * still here as the card's tooltip, so nothing needs opening to be read.
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
  const driver = stats.signals.find((s) => s.key === stats.mode);

  const summary = [
    HORIZON_LABEL[goal.horizon],
    formatGoalRange(goal),
    `${pct(progress)} done`,
    target ? `target ${target}` : null,
    stats.subtreeTotal ? `${stats.subtreeDone}/${stats.subtreeTotal} tasks` : null,
    stats.childCount ? `${stats.childDone}/${stats.childCount} child goals` : null,
    stats.milestoneTotal ? `${stats.milestoneDone}/${stats.milestoneTotal} milestones` : null,
    driver ? `driven by ${driver.label.toLowerCase()}` : null,
    stats.pace && !done ? stats.pace : null,
    upcoming?.date
      ? `next: ${upcoming.title || "milestone"} ${formatDate(upcoming.date, { weekday: false })}`
      : null,
  ].filter(Boolean).join(" · ");

  function setStatus(status: Goal["status"], note: string) {
    patch("goals", goal.id, { status });
    toast({ title: note, description: goal.title, tone: status === "done" ? "success" : "default" });
  }

  return (
    <>
      <div
        data-goal-card={goal.id}
        title={summary}
        onMouseEnter={() => onHover?.(goal.id)}
        onMouseLeave={() => onHover?.(null)}
        className={cn(
          "group/goal relative rounded-lg border bg-raised p-3",
          "transition-[background-color,border-color,opacity,box-shadow] duration-200 ease-[var(--ease-out-apple)]",
          "hover:bg-hover focus-within:border-line-strong",
          active ? "border-accent-line" : "border-line hover:border-line-strong",
          dimmed && "opacity-40",
          goal.status === "dropped" && "opacity-60",
          dragging && "opacity-40",
          dropHint === "nest" && "border-accent bg-accent-soft ring-1 ring-accent",
          className,
        )}
      >
        {dragHandle && (
          <div className="absolute -left-[26px] top-2 z-[2]">{dragHandle}</div>
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
                className="relative z-[1] -mr-1 -mt-1 shrink-0 opacity-0 transition-opacity duration-150 focus-visible:opacity-100 group-hover/goal:opacity-100"
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

        <div className="mt-2.5 flex items-center gap-2 pl-[18px]">
          <Progress value={progress * 100} tint={goal.color} height={3} className="min-w-0 flex-1" />
          <span className="shrink-0 text-[11px] text-ink-3 tnum">{pct(progress)}</span>
        </div>

        {!done && (
          <GoalFlags stats={stats} className="mt-2 pl-[18px]" />
        )}
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
