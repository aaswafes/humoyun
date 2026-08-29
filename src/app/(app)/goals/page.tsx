"use client";

import * as React from "react";
import {
  ChartNoAxesGantt, Check, Plus, Radar, Rows3, Target, Trophy,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import { todayISO } from "@/lib/date";
import type { Horizon } from "@/lib/types";
import { PageBody, PageHeader } from "@/components/shell/page-header";
import { HiddenColumns } from "@/components/goals/column-header";
import { useColumnPrefs } from "@/components/goals/column-prefs";
import { Button, EmptyState, Segmented, Skeleton } from "@/components/ui/primitives";
import { MenuItem, MenuLabel, Popover } from "@/components/ui/overlays";
import { GoalFinished } from "@/components/goals/goal-finished";
import { Fold, useFold } from "@/components/goals/goal-fold";
import { GoalLadder } from "@/components/goals/goal-ladder";
import { GoalReview } from "@/components/goals/goal-review";
import { GoalSheet } from "@/components/goals/goal-sheet";
import { GoalTimeline } from "@/components/goals/goal-timeline";
import {
  buildGoalIndex, goalAttention, HORIZON_LABEL, HORIZONS, pct, periodLabel,
} from "@/components/goals/goal-model";
import { useGoalActions } from "@/components/goals/use-goal-actions";

type View = "ladder" | "timeline" | "review" | "finished";

const HINT: Record<View, string> = {
  ladder: "Life sets the direction, week does the work. Drag a card onto another to nest it, or between two to reorder — the ⋯ menu does the same from the keyboard.",
  timeline: "Every dated goal as a bar, with its milestones. Where the bars stack up, you are overcommitted.",
  review: "",
  finished: "",
};

const HINT_LABEL: Record<View, string> = {
  ladder: "How the ladder works",
  timeline: "How to read the timeline",
  review: "",
  finished: "",
};

export default function GoalsPage() {
  const goals = useStore((s) => s.goals);
  const tasks = useStore((s) => s.tasks);
  const habitLogs = useStore((s) => s.habitLogs);
  const books = useStore((s) => s.books);
  const ready = useStore((s) => s.ready);
  const { createGoal } = useGoalActions();

  const [view, setView] = React.useState<View>("ladder");
  const [includeDone, setIncludeDone] = React.useState(false);
  const columnPrefs = useColumnPrefs();
  const [openId, setOpenId] = React.useState<string | null>(null);

  // How the surface works is worth reading once, not on every visit.
  const hint = useFold(`hint.${view}`, false);

  // Habit logs and books feed the "has anything actually moved" signal, so a
  // goal held up by a reading plan does not read as stalled.
  const index = React.useMemo(
    () => buildGoalIndex(goals, tasks, { habitLogs, books }),
    [goals, tasks, habitLogs, books],
  );

  const visible = React.useMemo(
    () => (includeDone ? goals : goals.filter((g) => g.status !== "done" && g.status !== "dropped")),
    [goals, includeDone],
  );

  const active = React.useMemo(() => goals.filter((g) => g.status === "active"), [goals]);
  const average = active.length
    ? active.reduce((sum, g) => sum + index.stats(g.id).overall, 0) / active.length
    : 0;

  const needing = React.useMemo(
    () => active.filter((g) => goalAttention(g, index.stats(g.id)).length > 0).length,
    [active, index],
  );

  const viewOptions = React.useMemo(() => [
    {
      value: "ladder" as const,
      label: <><Rows3 className="size-3.5" /><span className="ml-1.5 hidden sm:inline">Ladder</span></>,
      title: "Goals by horizon",
    },
    {
      value: "timeline" as const,
      label: <><ChartNoAxesGantt className="size-3.5" /><span className="ml-1.5 hidden sm:inline">Timeline</span></>,
      title: "Goals across the year",
    },
    {
      value: "review" as const,
      label: (
        <>
          <Radar className="size-3.5" />
          <span className="ml-1.5 hidden sm:inline">Review</span>
          {/* How many goals want something is a fact, not an alarm. */}
          {needing > 0 && (
            <span className="ml-1.5 rounded-full bg-hover px-1 text-[10.5px] font-medium text-ink-3 tnum">
              {needing}
            </span>
          )}
        </>
      ),
      title: `Goals that need attention${needing > 0 ? ` — ${needing} right now` : ""}`,
    },
    {
      value: "finished" as const,
      label: <><Trophy className="size-3.5" /><span className="ml-1.5 hidden sm:inline">Finished</span></>,
      title: "What you actually finished",
    },
  ], [needing]);

  const create = React.useCallback((horizon: Horizon) => {
    const goal = createGoal({ horizon });
    setOpenId(goal.id);
  }, [createGoal]);

  // Two facts, not four — how many are running, and how they are doing. What
  // needs attention is already counted on the Review tab.
  const subtitle = goals.length
    ? `${active.length} active · ${pct(average)} average`
    : "Life · Year · Quarter · Month · Week";

  return (
    <>
      <PageHeader
        title="Goals"
        subtitle={ready ? subtitle : undefined}
        actions={
          <Popover
            align="end"
            className="w-[232px]"
            trigger={
              <Button variant="primary" size="sm">
                <Plus className="size-3.5" />
                New goal
              </Button>
            }
          >
            {(close) => (
              <>
                <MenuLabel>Start a goal at</MenuLabel>
                {HORIZONS.map((horizon) => (
                  <MenuItem
                    key={horizon}
                    onClick={() => { create(horizon); close(); }}
                    shortcut={periodLabel(horizon, todayISO())}
                  >
                    {HORIZON_LABEL[horizon]}
                  </MenuItem>
                ))}
              </>
            )}
          </Popover>
        }
      >
        <Segmented value={view} options={viewOptions} onChange={setView} size="sm" className="mr-1" />
      </PageHeader>

      <PageBody wide>
        {!ready ? (
          <LadderSkeleton />
        ) : goals.length === 0 ? (
          <EmptyState
            icon={Target}
            title="Nothing to aim at yet"
            description="The ladder runs life → year → quarter → month → week. Start at the top with the thing that actually matters, then break it down until a single task can trace all the way up."
            className="py-20"
            action={
              <div className="flex flex-wrap justify-center gap-2">
                {HORIZONS.map((horizon) => (
                  <Button
                    key={horizon}
                    size="sm"
                    variant={horizon === "life" ? "primary" : "secondary"}
                    onClick={() => create(horizon)}
                  >
                    {HORIZON_LABEL[horizon]} goal
                  </Button>
                ))}
              </div>
            }
          />
        ) : (
          <>
            {(view === "ladder" || view === "timeline") && (
              <Fold
                id="goals-hint-panel"
                className="mb-5"
                label={HINT_LABEL[view]}
                open={hint.open}
                onToggle={hint.toggle}
                actions={
                  <div className="flex items-center gap-1">
                    {view === "ladder" && <HiddenColumns prefs={columnPrefs} />}
                    <Button
                      size="xs"
                      variant={includeDone ? "subtle" : "ghost"}
                      onClick={() => setIncludeDone((v) => !v)}
                      aria-pressed={includeDone}
                    >
                      <Check className={cn("size-3.5", !includeDone && "opacity-0")} />
                      Show finished
                    </Button>
                  </div>
                }
              >
                <p className="max-w-[640px] pb-1 text-[12.5px] leading-relaxed text-ink-3">
                  {HINT[view]}
                </p>
              </Fold>
            )}

            {view === "ladder" && (
              <GoalLadder
                goals={visible}
                index={index}
                openId={openId}
                onOpen={setOpenId}
                onCreate={create}
              />
            )}

            {view === "timeline" && (
              <GoalTimeline goals={visible} index={index} openId={openId} onOpen={setOpenId} />
            )}

            {view === "review" && (
              <div className="max-w-[880px]">
                <GoalReview goals={goals} index={index} onOpen={setOpenId} />
              </div>
            )}

            {view === "finished" && (
              <div className="max-w-[820px]">
                <GoalFinished
                  goals={goals}
                  index={index}
                  onOpen={setOpenId}
                  onBrowse={() => setView("ladder")}
                />
              </div>
            )}
          </>
        )}
      </PageBody>

      <GoalSheet
        goalId={openId}
        index={index}
        onClose={() => setOpenId(null)}
        onOpen={setOpenId}
      />
    </>
  );
}

function LadderSkeleton() {
  return (
    <div className="flex gap-10 overflow-hidden">
      {HORIZONS.map((horizon, column) => (
        <div key={horizon} className="w-[240px] shrink-0 space-y-2">
          <Skeleton className="h-3 w-16" />
          {Array.from({ length: 3 - (column % 2) }, (_, i) => (
            <Skeleton key={i} className="h-[92px] w-full rounded-lg" />
          ))}
        </div>
      ))}
    </div>
  );
}
