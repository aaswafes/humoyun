"use client";

// =========================================================
// Moving a goal: what a drop means, whether it is legal, and the
// keyboard commands that do the same job without a mouse.
//
// The ladder's one invariant is that a parent always sits at a shallower
// horizon than its child. Every move here either preserves it or refuses,
// with a sentence saying why — a silently ignored drag is worse than a "no".
// =========================================================

import * as React from "react";
import { orderBetween, useStore } from "@/lib/store";
import type { Goal, Horizon } from "@/lib/types";
import {
  childHorizon, HORIZON_LABEL, horizonIndex, type GoalIndex,
} from "./goal-model";

export type DropIntent =
  | { kind: "nest"; targetId: string }
  | { kind: "before"; targetId: string }
  | { kind: "after"; targetId: string }
  | { kind: "column"; horizon: Horizon };

export interface MoveChanges {
  parent_id: string | null;
  horizon: Horizon;
  order_index: number;
}

export interface MovePlan {
  goal: Goal;
  changes: MoveChanges;
  /** past tense, for the toast that offers the undo */
  label: string;
}

export interface MoveBlocked { blocked: string }
export type MoveResult = MovePlan | MoveBlocked;

export function isBlocked(result: MoveResult | null): result is MoveBlocked {
  return !!result && "blocked" in result;
}

export interface MoveContext {
  goals: Goal[];
  index: GoalIndex;
}

const quote = (goal: Goal) => `“${goal.title || "Untitled goal"}”`;

/** Siblings a goal would sit among under `parentId` at `horizon`. */
function siblingsIn(
  ctx: MoveContext, parentId: string | null, horizon: Horizon, exceptId: string,
): Goal[] {
  return ctx.goals
    .filter((g) => (g.parent_id ?? null) === parentId && g.horizon === horizon && g.id !== exceptId)
    .sort((a, b) => a.order_index - b.order_index || a.title.localeCompare(b.title));
}

function appendOrder(list: Goal[]): number {
  return list.length ? Math.max(...list.map((g) => g.order_index)) + 1 : 0;
}

/** No child, no constraint — any horizon is deep enough. */
const NO_FLOOR = 99;

/** The deepest horizon a goal may take without swallowing its own children. */
function floorHorizon(ctx: MoveContext, goal: Goal): number {
  const kids = ctx.index.childrenOf.get(goal.id) ?? [];
  if (!kids.length) return NO_FLOOR;
  return Math.min(...kids.map((k) => horizonIndex(k.horizon)));
}

function describe(goal: Goal, changes: MoveChanges, ctx: MoveContext): string {
  const parentChanged = (goal.parent_id ?? null) !== changes.parent_id;
  const horizonChanged = goal.horizon !== changes.horizon;
  const parent = changes.parent_id ? ctx.index.byId.get(changes.parent_id) : null;

  if (parentChanged && parent && horizonChanged) {
    return `Now a ${HORIZON_LABEL[changes.horizon].toLowerCase()} goal under ${quote(parent)}`;
  }
  if (parentChanged && parent) return `Moved under ${quote(parent)}`;
  if (parentChanged) return "Moved to the top level";
  if (horizonChanged) return `Moved to ${HORIZON_LABEL[changes.horizon]}`;
  return "Reordered";
}

function validate(goal: Goal, changes: MoveChanges, ctx: MoveContext): MoveResult {
  const { parent_id: parentId, horizon } = changes;

  if (parentId === goal.id) return { blocked: "A goal cannot be its own parent." };
  if (parentId && ctx.index.descendantsOf(goal.id).includes(parentId)) {
    return { blocked: "That goal already sits underneath this one." };
  }

  const parent = parentId ? ctx.index.byId.get(parentId) : null;
  if (parentId && !parent) return { blocked: "That parent no longer exists." };
  if (parent && horizonIndex(parent.horizon) >= horizonIndex(horizon)) {
    return {
      blocked: `A ${HORIZON_LABEL[horizon].toLowerCase()} goal cannot hang under another ${HORIZON_LABEL[parent.horizon].toLowerCase()} goal.`,
    };
  }

  if (horizonIndex(horizon) >= floorHorizon(ctx, goal)) {
    const kids = ctx.index.childrenOf.get(goal.id) ?? [];
    return {
      blocked: `Move its ${kids.length} child ${kids.length === 1 ? "goal" : "goals"} first — they have to stay below it.`,
    };
  }

  if (
    (goal.parent_id ?? null) === parentId &&
    goal.horizon === horizon &&
    goal.order_index === changes.order_index
  ) {
    return { blocked: "Already there." };
  }

  return { goal, changes, label: describe(goal, changes, ctx) };
}

/** Turn a drop onto a card, a gap or a column into a concrete set of changes. */
export function planMove(goal: Goal, intent: DropIntent, ctx: MoveContext): MoveResult {
  if (intent.kind === "column") {
    const parent = goal.parent_id ? ctx.index.byId.get(goal.parent_id) ?? null : null;
    const keepsParent = parent && horizonIndex(parent.horizon) < horizonIndex(intent.horizon);
    const parentId = keepsParent ? (parent as Goal).id : null;
    return validate(goal, {
      parent_id: parentId,
      horizon: intent.horizon,
      order_index: appendOrder(siblingsIn(ctx, parentId, intent.horizon, goal.id)),
    }, ctx);
  }

  const target = ctx.index.byId.get(intent.targetId);
  if (!target) return { blocked: "That goal is gone." };
  if (target.id === goal.id) return { blocked: "Already there." };

  if (intent.kind === "nest") {
    // Dropping onto a card means "belong to this", so the horizon follows the
    // parent rather than refusing a drop the user clearly meant.
    const deeper = horizonIndex(goal.horizon) > horizonIndex(target.horizon);
    const horizon = deeper ? goal.horizon : childHorizon(target.horizon);
    if (!horizon) {
      return { blocked: `A ${HORIZON_LABEL[target.horizon].toLowerCase()} goal is the last rung — nothing hangs below it.` };
    }
    return validate(goal, {
      parent_id: target.id,
      horizon,
      order_index: appendOrder(siblingsIn(ctx, target.id, horizon, goal.id)),
    }, ctx);
  }

  const parentId = target.parent_id ?? null;
  const row = siblingsIn(ctx, parentId, target.horizon, goal.id);
  const at = row.findIndex((g) => g.id === target.id);
  const before = intent.kind === "before" ? row[at - 1] : target;
  const after = intent.kind === "before" ? target : row[at + 1];

  return validate(goal, {
    parent_id: parentId,
    horizon: target.horizon,
    order_index: orderBetween(before?.order_index, after?.order_index),
  }, ctx);
}

// ---------------------------------------------------------
// The keyboard path — every drag above has a menu item here
// ---------------------------------------------------------
export interface MoveCommand {
  key: string;
  label: string;
  plan: MoveResult;
}

export function moveCommands(goal: Goal, ctx: MoveContext): MoveCommand[] {
  const row = siblingsIn(ctx, goal.parent_id ?? null, goal.horizon, goal.id);
  const mine = ctx.goals
    .filter((g) => (g.parent_id ?? null) === (goal.parent_id ?? null) && g.horizon === goal.horizon)
    .sort((a, b) => a.order_index - b.order_index || a.title.localeCompare(b.title));
  const at = mine.findIndex((g) => g.id === goal.id);
  const prev = at > 0 ? mine[at - 1] : null;
  const next = at >= 0 && at < mine.length - 1 ? mine[at + 1] : null;

  const out: MoveCommand[] = [];

  if (prev) {
    out.push({ key: "up", label: "Move up", plan: planMove(goal, { kind: "before", targetId: prev.id }, ctx) });
  }
  if (next) {
    out.push({ key: "down", label: "Move down", plan: planMove(goal, { kind: "after", targetId: next.id }, ctx) });
  }
  if (row.length > 1 && prev) {
    out.push({ key: "top", label: "Move to top", plan: planMove(goal, { kind: "before", targetId: row[0].id }, ctx) });
  }
  if (row.length > 1 && next) {
    out.push({
      key: "bottom", label: "Move to bottom",
      plan: planMove(goal, { kind: "after", targetId: row[row.length - 1].id }, ctx),
    });
  }
  if (prev) {
    out.push({
      key: "indent",
      label: `Nest under ${prev.title || "the goal above"}`,
      plan: planMove(goal, { kind: "nest", targetId: prev.id }, ctx),
    });
  }

  const parent = goal.parent_id ? ctx.index.byId.get(goal.parent_id) ?? null : null;
  if (parent) {
    const grandparent = parent.parent_id ? ctx.index.byId.get(parent.parent_id) ?? null : null;
    const parentId = grandparent?.id ?? null;
    out.push({
      key: "outdent",
      label: grandparent ? `Move up to ${grandparent.title || "the level above"}` : "Move to the top level",
      plan: (() => {
        const changes: MoveChanges = {
          parent_id: parentId,
          horizon: goal.horizon,
          order_index: appendOrder(siblingsIn(ctx, parentId, goal.horizon, goal.id)),
        };
        return validate(goal, changes, ctx);
      })(),
    });
  }

  return out.filter((c) => !isBlocked(c.plan));
}

/** Every horizon this goal could legally sit in right now. */
export function horizonMoves(goal: Goal, ctx: MoveContext): { horizon: Horizon; plan: MoveResult }[] {
  return (["life", "year", "quarter", "month", "week"] as Horizon[])
    .filter((h) => h !== goal.horizon)
    .map((horizon) => ({ horizon, plan: planMove(goal, { kind: "column", horizon }, ctx) }));
}

// ---------------------------------------------------------
// Apply, with an undo
// ---------------------------------------------------------
export function useGoalMove() {
  const patch = useStore((s) => s.patch);
  const toast = useStore((s) => s.toast);

  return React.useCallback((result: MoveResult | null) => {
    if (!result) return false;
    if (isBlocked(result)) {
      if (result.blocked !== "Already there.") {
        toast({ title: "Can't move that there", description: result.blocked, tone: "danger" });
      }
      return false;
    }

    const { goal, changes, label } = result;
    const previous: MoveChanges = {
      parent_id: goal.parent_id ?? null,
      horizon: goal.horizon,
      order_index: goal.order_index,
    };
    patch("goals", goal.id, changes);
    toast({
      title: label,
      description: goal.title || undefined,
      action: { label: "Undo", run: () => patch("goals", goal.id, previous) },
    });
    return true;
  }, [patch, toast]);
}
