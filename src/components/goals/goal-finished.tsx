"use client";

import * as React from "react";
import { Ban, CircleCheck, Pause, Target, Trophy, Undo2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import { diffDays, formatDate, monthName, yearOf } from "@/lib/date";
import type { Goal } from "@/lib/types";
import { Badge, Button, EmptyState, IconButton } from "@/components/ui/primitives";
import { Fold, useFold } from "./goal-fold";
import {
  finishedOn, formatTarget, HORIZON_LABEL, STATUS_LABEL, type GoalIndex,
} from "./goal-model";

interface Group { key: string; label: string; goals: Goal[] }

/** "What did I actually finish" — done goals, newest first, with the receipts. */
export function GoalFinished({
  goals, index, onOpen, onBrowse,
}: {
  goals: Goal[];
  index: GoalIndex;
  onOpen: (id: string) => void;
  onBrowse: () => void;
}) {
  const patch = useStore((s) => s.patch);
  const toast = useStore((s) => s.toast);
  const archive = useFold("finished.archive", false);

  const done = React.useMemo(
    () => goals.filter((g) => g.status === "done").sort((a, b) => finishedOn(b).localeCompare(finishedOn(a))),
    [goals],
  );

  const archived = React.useMemo(
    () => goals.filter((g) => g.status === "paused" || g.status === "dropped")
      .sort((a, b) => finishedOn(b).localeCompare(finishedOn(a))),
    [goals],
  );

  const groups = React.useMemo(() => {
    const out: Group[] = [];
    for (const goal of done) {
      const on = finishedOn(goal);
      const key = on.slice(0, 7);
      const last = out[out.length - 1];
      if (last?.key === key) last.goals.push(goal);
      else out.push({ key, label: `${monthName(on)} ${yearOf(on)}`, goals: [goal] });
    }
    return out;
  }, [done]);

  const tallies = React.useMemo(() => {
    let tasks = 0;
    let targetsHit = 0;
    let milestones = 0;
    for (const goal of done) {
      const stats = index.stats(goal.id);
      tasks += stats.directDone;
      milestones += stats.milestoneDone;
      if (goal.target != null && goal.current >= goal.target) targetsHit += 1;
    }
    return { tasks, targetsHit, milestones };
  }, [done, index]);

  function restore(goal: Goal) {
    patch("goals", goal.id, { status: "active" });
    toast({ title: "Back on the ladder", description: goal.title || undefined });
  }

  if (!done.length && !archived.length) {
    return (
      <EmptyState
        icon={Trophy}
        title="Nothing finished yet"
        description="Mark a goal complete and it lands here with everything it took: the target you hit, the tasks you closed, and how long it ran."
        action={<Button variant="primary" size="sm" onClick={onBrowse}>Open the ladder</Button>}
      />
    );
  }

  // One headline, and the rest of the receipts on the line under it. Four
  // numerals of the same size were four headlines fighting each other.
  const receipts = [
    `${tallies.tasks} ${tallies.tasks === 1 ? "task" : "tasks"} closed`,
    `${tallies.targetsHit} ${tallies.targetsHit === 1 ? "target" : "targets"} hit`,
    tallies.milestones > 0
      ? `${tallies.milestones} ${tallies.milestones === 1 ? "milestone" : "milestones"} reached`
      : null,
  ].filter(Boolean).join(" · ");

  return (
    <div className="space-y-8">
      {done.length > 0 && (
        <>
          <div>
            <div className="flex items-baseline gap-2.5">
              <span className="display-serif text-[32px] leading-none text-ink tnum">{done.length}</span>
              <span className="text-[13px] text-ink-2">
                {done.length === 1 ? "goal finished" : "goals finished"}
              </span>
            </div>
            <p className="mt-1.5 text-[12px] text-ink-3 tnum">{receipts}</p>
          </div>

          <div className="space-y-6">
            {groups.map((group) => (
              <section key={group.key}>
                <div className="mb-1.5 flex items-baseline gap-2">
                  <h2 className="text-[12.5px] font-medium text-ink-2">{group.label}</h2>
                  <span className="text-[11px] text-ink-4 tnum">{group.goals.length}</span>
                </div>
                <div className="-mx-2">
                  {group.goals.map((goal) => (
                    <FinishedRow
                      key={goal.id}
                      goal={goal}
                      index={index}
                      onOpen={onOpen}
                      onRestore={() => restore(goal)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </>
      )}

      {archived.length > 0 && (
        <Fold
          id="goal-archive-panel"
          label="Paused and dropped"
          summary={`${archived.length} set aside`}
          open={archive.open}
          onToggle={archive.toggle}
        >
          <div className="-mx-2">
            {archived.map((goal) => (
              <div
                key={goal.id}
                className="group/row flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors duration-150 hover:bg-hover"
              >
                {goal.status === "paused"
                  ? <Pause className="size-3.5 shrink-0 text-ink-3" />
                  : <Ban className="size-3.5 shrink-0 text-ink-4" />}
                <button
                  onClick={() => onOpen(goal.id)}
                  className="min-w-0 flex-1 cursor-pointer truncate text-left text-[13px] text-ink-2"
                >
                  {goal.title || "Untitled goal"}
                </button>
                <span className="shrink-0 text-[11.5px] text-ink-4">{STATUS_LABEL[goal.status]}</span>
                <IconButton
                  label={`Reactivate ${goal.title || "goal"}`}
                  size="sm"
                  className="opacity-0 transition-opacity focus-visible:opacity-100 group-hover/row:opacity-100"
                  onClick={() => restore(goal)}
                >
                  <Undo2 />
                </IconButton>
              </div>
            ))}
          </div>
        </Fold>
      )}

      {!done.length && (
        <EmptyState
          icon={Trophy}
          title="Nothing finished yet"
          description="Everything you have set aside is above. Finish a goal and it gets its own entry here."
          action={<Button variant="primary" size="sm" onClick={onBrowse}>Open the ladder</Button>}
        />
      )}
    </div>
  );
}

function FinishedRow({
  goal, index, onOpen, onRestore,
}: {
  goal: Goal;
  index: GoalIndex;
  onOpen: (id: string) => void;
  onRestore: () => void;
}) {
  const stats = index.stats(goal.id);
  const on = finishedOn(goal);
  const target = formatTarget(goal);
  const hit = goal.target != null && goal.current >= goal.target;
  const ran = goal.start_date ? diffDays(on, goal.start_date) + 1 : null;

  // The receipts read as one sentence rather than six separate chips.
  const receipts = [
    stats.subtreeTotal > 0 ? `${stats.subtreeDone}/${stats.subtreeTotal} tasks` : null,
    stats.childCount > 0 ? `${stats.childDone}/${stats.childCount} sub-goals` : null,
    stats.milestoneTotal > 0 ? `${stats.milestoneDone}/${stats.milestoneTotal} milestones` : null,
    stats.meta.checkins.length > 0 ? `${stats.meta.checkins.length} check-ins` : null,
    ran != null && ran > 0 ? `ran ${ran} days` : null,
  ].filter(Boolean).join(" · ");

  return (
    <div className="group/row flex items-start gap-2.5 rounded-md px-2 py-2 transition-colors duration-150 hover:bg-hover">
      <CircleCheck className="mt-[2px] size-4 shrink-0 text-success" />

      <div className="min-w-0 flex-1">
        <button
          onClick={() => onOpen(goal.id)}
          className="block max-w-full cursor-pointer truncate text-left text-[13.5px] font-medium text-ink"
        >
          {goal.title || "Untitled goal"}
        </button>

        <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11.5px] text-ink-3">
          <Badge tint={goal.color}>{HORIZON_LABEL[goal.horizon]}</Badge>
          {target && (
            <span className={cn("inline-flex items-center gap-1 tnum", hit && "text-success")}>
              <Target className="size-3" />
              {target}
            </span>
          )}
          {receipts && <span className="min-w-0 truncate tnum text-ink-4">{receipts}</span>}
        </div>
      </div>

      <span className="shrink-0 pt-0.5 text-[11.5px] text-ink-4 tnum">
        {formatDate(on, { weekday: false })}
      </span>

      <IconButton
        label={`Reopen ${goal.title || "goal"}`}
        size="sm"
        className="opacity-0 transition-opacity focus-visible:opacity-100 group-hover/row:opacity-100"
        onClick={onRestore}
      >
        <Undo2 />
      </IconButton>
    </div>
  );
}
