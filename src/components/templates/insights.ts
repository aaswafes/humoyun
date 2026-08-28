// =========================================================
// Usage insight.
//
// Every task an apply writes carries `template_id`, so the honest answer to
// "does this plan survive contact with the week?" is already in the store —
// no extra bookkeeping, and it stays true if the user deletes the tasks.
// =========================================================

import { toISO } from "@/lib/date";
import type { Task, Template } from "@/lib/types";

export interface ItemStat {
  title: string;
  created: number;
  done: number;
  /** 0..1 */
  rate: number;
}

export interface Insight {
  /** Times the template was applied, counted by the template row itself. */
  applied: number;
  /** Tasks it created that still exist. */
  created: number;
  done: number;
  dropped: number;
  open: number;
  /** done / created, or null when it has never been applied. */
  rate: number | null;
  lastApplied: string | null;
  /** Per-title truth, worst first — the items the plan keeps lying about. */
  items: ItemStat[];
}

export const EMPTY_INSIGHT: Insight = {
  applied: 0, created: 0, done: 0, dropped: 0, open: 0,
  rate: null, lastApplied: null, items: [],
};

interface Bucket {
  created: number;
  done: number;
  dropped: number;
  last: string | null;
  byTitle: Map<string, { title: string; created: number; done: number }>;
}

/**
 * One pass over every task, keyed by template. Cards, the page header and the
 * editor all read from the same map rather than each scanning the list again.
 */
export function buildInsights(tasks: Task[], templates: Template[]): Map<string, Insight> {
  const buckets = new Map<string, Bucket>();

  for (const task of tasks) {
    if (!task.template_id || task.parent_id) continue;
    let bucket = buckets.get(task.template_id);
    if (!bucket) {
      bucket = { created: 0, done: 0, dropped: 0, last: null, byTitle: new Map() };
      buckets.set(task.template_id, bucket);
    }
    bucket.created += 1;
    if (task.status === "done") bucket.done += 1;
    if (task.status === "dropped") bucket.dropped += 1;
    if (!bucket.last || task.created_at > bucket.last) bucket.last = task.created_at;

    // Variables mean two applies can produce different titles for the same row;
    // grouping by title is still the closest honest match we can make.
    const key = task.title.trim().toLowerCase();
    let stat = bucket.byTitle.get(key);
    if (!stat) {
      stat = { title: task.title.trim() || "Untitled", created: 0, done: 0 };
      bucket.byTitle.set(key, stat);
    }
    stat.created += 1;
    if (task.status === "done") stat.done += 1;
  }

  const out = new Map<string, Insight>();
  for (const template of templates) {
    const bucket = buckets.get(template.id);
    const created = bucket?.created ?? 0;
    const done = bucket?.done ?? 0;
    const dropped = bucket?.dropped ?? 0;
    out.set(template.id, {
      applied: template.use_count,
      created,
      done,
      dropped,
      open: Math.max(0, created - done - dropped),
      rate: created > 0 ? done / created : null,
      lastApplied: bucket?.last ? toISO(new Date(bucket.last)) : null,
      items: bucket
        ? [...bucket.byTitle.values()]
            .map((s) => ({ ...s, rate: s.created ? s.done / s.created : 0 }))
            .sort((a, b) => a.rate - b.rate || b.created - a.created)
        : [],
    });
  }
  return out;
}

export function percent(rate: number | null): string {
  return rate == null ? "—" : `${Math.round(rate * 100)}%`;
}

/** A one-line read on whether the template is telling the truth. */
export function verdict(insight: Insight): { text: string; tone: "success" | "warn" | "danger" | "muted" } {
  if (insight.created < 4 || insight.rate == null) {
    return { text: "Not enough history yet", tone: "muted" };
  }
  if (insight.rate >= 0.75) return { text: "You actually do this one", tone: "success" };
  if (insight.rate >= 0.45) return { text: "Half of it sticks", tone: "warn" };
  return { text: "Mostly aspiration — trim it", tone: "danger" };
}
