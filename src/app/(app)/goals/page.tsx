"use client";

import * as React from "react";
import { ChartNoAxesGantt, Check, Plus, Rows3, Target, Trophy } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import { todayISO } from "@/lib/date";
import type { Horizon } from "@/lib/types";
import { PageBody, PageHeader } from "@/components/shell/page-header";
import { Button, EmptyState, Segmented, Skeleton } from "@/components/ui/primitives";
import { MenuItem, MenuLabel, Popover } from "@/components/ui/overlays";
import { GoalFinished } from "@/components/goals/goal-finished";
import { GoalLadder } from "@/components/goals/goal-ladder";
import { GoalSheet } from "@/components/goals/goal-sheet";
import { GoalTimeline } from "@/components/goals/goal-timeline";
import {
  buildGoalIndex, HORIZON_LABEL, HORIZONS, pct, periodLabel,
} from "@/components/goals/goal-model";
import { useGoalActions } from "@/components/goals/use-goal-actions";

type View = "ladder" | "timeline" | "finished";

const VIEW_OPTIONS = [
  { value: "ladder" as const, label: <><Rows3 className="size-3.5" /><span className="ml-1.5 hidden sm:inline">Ladder</span></>, title: "Goals by horizon" },
  { value: "timeline" as const, label: <><ChartNoAxesGantt className="size-3.5" /><span className="ml-1.5 hidden sm:inline">Timeline</span></>, title: "Goals across the year" },
  { value: "finished" as const, label: <><Trophy className="size-3.5" /><span className="ml-1.5 hidden sm:inline">Finished</span></>, title: "What you actually finished" },
];

const HINT: Record<View, string> = {
  ladder: "Life sets the direction, week does the work. Hover a card to light up its branch.",
  timeline: "Every dated goal as a bar across the year — where they stack up, you are overcommitted.",
  finished: "",
};

export default function GoalsPage() {
  const goals = useStore((s) => s.goals);
  const tasks = useStore((s) => s.tasks);
  const ready = useStore((s) => s.ready);
  const { createGoal } = useGoalActions();

  const [view, setView] = React.useState<View>("ladder");
  const [includeDone, setIncludeDone] = React.useState(false);
  const [openId, setOpenId] = React.useState<string | null>(null);

  const index = React.useMemo(() => buildGoalIndex(goals, tasks), [goals, tasks]);

  const visible = React.useMemo(
    () => (includeDone ? goals : goals.filter((g) => g.status !== "done" && g.status !== "dropped")),
    [goals, includeDone],
  );

  const active = React.useMemo(() => goals.filter((g) => g.status === "active"), [goals]);
  const average = active.length
    ? active.reduce((sum, g) => sum + index.stats(g.id).overall, 0) / active.length
    : 0;

  const create = React.useCallback((horizon: Horizon) => {
    const goal = createGoal({ horizon });
    setOpenId(goal.id);
  }, [createGoal]);

  const subtitle = goals.length
    ? `${active.length} active · ${pct(average)} average progress`
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
        <Segmented value={view} options={VIEW_OPTIONS} onChange={setView} size="sm" className="mr-1" />
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
            {view !== "finished" && (
              <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
                <p className="text-[12.5px] text-ink-3">{HINT[view]}</p>
                <div className="flex-1" />
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
    <div className="flex gap-6 overflow-hidden">
      {HORIZONS.map((horizon, column) => (
        <div key={horizon} className="w-[240px] shrink-0 space-y-2">
          <Skeleton className="h-3 w-16" />
          {Array.from({ length: 3 - (column % 2) }, (_, i) => (
            <Skeleton key={i} className="h-[104px] w-full rounded-lg" />
          ))}
        </div>
      ))}
    </div>
  );
}
