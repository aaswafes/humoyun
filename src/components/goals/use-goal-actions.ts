"use client";

import * as React from "react";
import { useStore } from "@/lib/store";
import { todayISO } from "@/lib/date";
import type { Goal, Horizon } from "@/lib/types";
import {
  breakdownPlan, childHorizon, HORIZON_LABEL, HORIZON_PLURAL,
  periodLabel, periodRange, splitTarget,
} from "./goal-model";

/** Keep a child inside the window its parent lives in. */
function clampToParent(range: { start: string; end: string }, parent: Goal | null | undefined) {
  if (!parent) return range;
  const start = parent.start_date && range.start < parent.start_date ? parent.start_date : range.start;
  const end = parent.end_date && range.end > parent.end_date ? parent.end_date : range.end;
  return end < start ? { start, end: start } : { start, end };
}

export interface CreateGoalOptions {
  horizon: Horizon;
  parent?: Goal | null;
  title?: string;
  anchor?: string;
  target?: number | null;
}

export function useGoalActions() {
  const goals = useStore((s) => s.goals);
  const insert = useStore((s) => s.insert);
  const weekStart = useStore((s) => s.profile?.week_start ?? 1);
  const toast = useStore((s) => s.toast);

  const createGoal = React.useCallback(
    ({ horizon, parent, title, anchor, target }: CreateGoalOptions): Goal => {
      const today = todayISO();
      // Start the new goal inside its parent's window, not wherever today happens to be.
      const seed = anchor
        ?? (parent?.start_date && parent.start_date > today ? parent.start_date : null)
        ?? (parent?.end_date && parent.end_date < today ? parent.end_date : null)
        ?? today;

      const range = clampToParent(periodRange(horizon, seed, weekStart), parent);
      const siblings = goals.filter((g) => (g.parent_id ?? null) === (parent?.id ?? null) && g.horizon === horizon);

      return insert("goals", {
        title: title ?? `${HORIZON_LABEL[horizon]} goal · ${periodLabel(horizon, range.start)}`,
        horizon,
        parent_id: parent?.id ?? null,
        start_date: range.start,
        end_date: range.end,
        color: parent?.color ?? "blue",
        unit: parent?.unit ?? null,
        target: target ?? null,
        order_index: siblings.length ? Math.max(...siblings.map((s) => s.order_index)) + 1 : 0,
      });
    },
    [goals, insert, weekStart],
  );

  /** One click: fill a goal's range with the child period below it. */
  const breakDown = React.useCallback(
    (goal: Goal): number => {
      const children = goals.filter((g) => g.parent_id === goal.id);
      const plan = breakdownPlan(goal, children, weekStart);
      const horizon = childHorizon(goal.horizon);
      if (!plan || !horizon || !plan.missing) return 0;

      const pending = plan.periods.filter((p) => !p.exists);
      pending.forEach((period, i) => {
        insert("goals", {
          title: `${goal.title || "Goal"} · ${period.label}`,
          horizon,
          parent_id: goal.id,
          start_date: period.start,
          end_date: period.end,
          color: goal.color,
          unit: goal.unit,
          target: splitTarget(goal.target, plan.periods.length, plan.periods.indexOf(period)),
          order_index: i,
        });
      });

      toast({
        title: `Broke down into ${pending.length} ${HORIZON_PLURAL[horizon]}`,
        description: goal.title || undefined,
        tone: "success",
      });
      return pending.length;
    },
    [goals, insert, toast, weekStart],
  );

  return { createGoal, breakDown };
}
