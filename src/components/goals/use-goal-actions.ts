"use client";

import * as React from "react";
import { useStore } from "@/lib/store";
import { todayISO } from "@/lib/date";
import type { Goal, Horizon } from "@/lib/types";
import {
  breakdownPlan, childHorizon, HORIZON_LABEL, HORIZON_PLURAL,
  periodLabel, periodRange, splitTarget,
} from "./goal-model";
import {
  metaId, metaPatch, readMeta, sortMilestones, whyPatch,
  type GoalMeta, type Milestone,
} from "./goal-meta";

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

/** How many check-ins one goal keeps. Two years of weekly entries is plenty. */
const CHECKIN_CAP = 120;

/**
 * Writes to the sidecar half of a goal. Every mutation recomposes the whole
 * `description` from the current row, so two edits in a row never lose the
 * prose or each other.
 */
export function useGoalMeta() {
  const patch = useStore((s) => s.patch);
  const toast = useStore((s) => s.toast);

  const setMeta = React.useCallback(
    (goal: Goal, changes: Partial<GoalMeta>) => {
      patch("goals", goal.id, metaPatch(goal, changes));
    },
    [patch],
  );

  const setWhy = React.useCallback(
    (goal: Goal, why: string) => { patch("goals", goal.id, whyPatch(goal, why)); },
    [patch],
  );

  /** A check-in is the honest record: it moves `current` and keeps the receipt. */
  const logCheckIn = React.useCallback(
    (goal: Goal, value: number, note?: string) => {
      const meta = readMeta(goal);
      const today = todayISO();
      const kept = meta.checkins.filter((c) => c.date !== today);
      const checkins = [
        ...kept,
        { id: metaId(), date: today, value, note: note?.trim() || null },
      ]
        .sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? -1 : 1))
        .slice(-CHECKIN_CAP);

      const previous = kept.length ? kept[kept.length - 1].value : goal.current;
      const delta = value - previous;

      patch("goals", goal.id, { ...metaPatch(goal, { checkins }), current: value });
      toast({
        title: "Checked in",
        description: delta === 0
          ? `No change — still ${value}${goal.unit ? ` ${goal.unit}` : ""}`
          : `${delta > 0 ? "+" : ""}${Math.round(delta * 100) / 100}${goal.unit ? ` ${goal.unit}` : ""} since last time`,
        tone: delta >= 0 ? "success" : "default",
      });
    },
    [patch, toast],
  );

  const removeCheckIn = React.useCallback(
    (goal: Goal, id: string) => {
      const meta = readMeta(goal);
      setMeta(goal, { checkins: meta.checkins.filter((c) => c.id !== id) });
    },
    [setMeta],
  );

  const addMilestone = React.useCallback(
    (goal: Goal, title: string, date: string | null) => {
      const meta = readMeta(goal);
      const milestone: Milestone = { id: metaId(), title: title.trim(), date, done: false, done_on: null };
      setMeta(goal, { milestones: sortMilestones([...meta.milestones, milestone]) });
      return milestone;
    },
    [setMeta],
  );

  const updateMilestone = React.useCallback(
    (goal: Goal, id: string, changes: Partial<Milestone>) => {
      const meta = readMeta(goal);
      setMeta(goal, {
        milestones: sortMilestones(
          meta.milestones.map((m) => (m.id === id ? { ...m, ...changes } : m)),
        ),
      });
    },
    [setMeta],
  );

  const toggleMilestone = React.useCallback(
    (goal: Goal, id: string) => {
      const meta = readMeta(goal);
      const target = meta.milestones.find((m) => m.id === id);
      if (!target) return;
      updateMilestone(goal, id, {
        done: !target.done,
        done_on: target.done ? null : todayISO(),
      });
    },
    [updateMilestone],
  );

  const removeMilestone = React.useCallback(
    (goal: Goal, id: string) => {
      const meta = readMeta(goal);
      setMeta(goal, { milestones: meta.milestones.filter((m) => m.id !== id) });
    },
    [setMeta],
  );

  const toggleLink = React.useCallback(
    (goal: Goal, kind: "book_ids" | "habit_ids", id: string) => {
      const meta = readMeta(goal);
      const list = meta[kind];
      setMeta(goal, {
        [kind]: list.includes(id) ? list.filter((x) => x !== id) : [...list, id],
      } as Partial<GoalMeta>);
    },
    [setMeta],
  );

  return {
    setMeta, setWhy, logCheckIn, removeCheckIn,
    addMilestone, updateMilestone, toggleMilestone, removeMilestone, toggleLink,
  };
}
