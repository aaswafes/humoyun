"use client";

// =========================================================
// Colour-by. The board can be painted by the node's own tint,
// by what kind of thing it is, or by the goal it serves —
// each mode produces the same shape of legend, so the canvas
// and the legend can never disagree about who is what colour.
// =========================================================

import { TINTS, type Goal, type MapNode, type Tint } from "@/lib/types";
import { KIND_META } from "./node-menu";
import type { ColorBy } from "./prefs";

export const TINT_LABELS: Record<Tint, string> = {
  slate: "Slate",
  red: "Red",
  orange: "Orange",
  amber: "Amber",
  emerald: "Emerald",
  teal: "Teal",
  blue: "Blue",
  violet: "Violet",
  pink: "Pink",
  brown: "Brown",
};

export const KIND_TINTS: Record<MapNode["kind"], Tint> = {
  note: "slate",
  idea: "amber",
  question: "violet",
  project: "blue",
  milestone: "pink",
  goal: "emerald",
};

const KINDS: MapNode["kind"][] = ["note", "idea", "question", "project", "milestone", "goal"];

export const NO_GOAL = "__none";

export interface Group {
  key: string;
  label: string;
  tint: Tint;
  count: number;
  /** node ids in this group — the legend uses it to dim everything else */
  ids: Set<string>;
}

export interface Grouping {
  groups: Group[];
  tintOf: (node: MapNode) => Tint;
  keyOf: (node: MapNode) => string;
  /** what the legend calls itself */
  label: string;
}

export function grouping(nodes: MapNode[], colorBy: ColorBy, goals: Goal[]): Grouping {
  if (colorBy === "kind") {
    const groups: Group[] = KINDS.map((k) => ({
      key: k,
      label: KIND_META[k].label,
      tint: KIND_TINTS[k],
      count: 0,
      ids: new Set<string>(),
    }));
    const byKey = new Map(groups.map((g) => [g.key, g]));
    for (const n of nodes) {
      const g = byKey.get(n.kind);
      if (g) { g.count++; g.ids.add(n.id); }
    }
    return {
      groups: groups.filter((g) => g.count > 0),
      tintOf: (n) => KIND_TINTS[n.kind],
      keyOf: (n) => n.kind,
      label: "Type",
    };
  }

  if (colorBy === "goal") {
    const ordered = [...goals].sort(
      (a, b) => a.order_index - b.order_index || a.title.localeCompare(b.title),
    );
    const tintByGoal = new Map<string, Tint>();
    ordered.forEach((g, i) => tintByGoal.set(g.id, g.color ?? TINTS[i % TINTS.length]));

    const groups = new Map<string, Group>();
    for (const n of nodes) {
      const key = n.goal_id ?? NO_GOAL;
      let g = groups.get(key);
      if (!g) {
        g = {
          key,
          label: (n.goal_id ? ordered.find((x) => x.id === n.goal_id)?.title : null) ?? "No goal",
          tint: (n.goal_id ? tintByGoal.get(n.goal_id) : null) ?? "slate",
          count: 0,
          ids: new Set<string>(),
        };
        groups.set(key, g);
      }
      g.count++;
      g.ids.add(n.id);
    }
    const list = [...groups.values()].sort((a, b) =>
      a.key === NO_GOAL ? 1
        : b.key === NO_GOAL ? -1
          : b.count - a.count || a.label.localeCompare(b.label),
    );
    return {
      groups: list,
      tintOf: (n) => (n.goal_id ? tintByGoal.get(n.goal_id) ?? "slate" : "slate"),
      keyOf: (n) => n.goal_id ?? NO_GOAL,
      label: "Goal",
    };
  }

  const byTint = new Map<Tint, Group>();
  for (const n of nodes) {
    let g = byTint.get(n.color);
    if (!g) {
      g = { key: n.color, label: TINT_LABELS[n.color], tint: n.color, count: 0, ids: new Set<string>() };
      byTint.set(n.color, g);
    }
    g.count++;
    g.ids.add(n.id);
  }
  return {
    groups: TINTS.filter((t) => byTint.has(t)).map((t) => byTint.get(t) as Group),
    tintOf: (n) => n.color,
    keyOf: (n) => n.color,
    label: "Colour",
  };
}
