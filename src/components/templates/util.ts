import { dayNameOf, formatDuration, formatTime } from "@/lib/date";
import type { Template, TemplateItem, TaskKind } from "@/lib/types";

export type Scope = Template["scope"];

export const SCOPES: Scope[] = ["day", "week", "block"];

export const SCOPE_LABELS: Record<Scope, string> = {
  day: "Day",
  week: "Week",
  block: "Block",
};

export const SCOPE_HINTS: Record<Scope, string> = {
  day: "A clocked plan that lands on one date.",
  week: "Items spread across seven days from the date you pick.",
  block: "A sequence of durations you drop wherever it fits.",
};

export const KIND_LABELS: Record<TaskKind, string> = {
  task: "Task",
  event: "Event",
  reading: "Reading",
  habit: "Habit",
  prayer: "Prayer",
  block: "Block",
  milestone: "Milestone",
};

export const KINDS = Object.keys(KIND_LABELS) as TaskKind[];

export function nextOrder(rows: { order_index: number }[]): number {
  return rows.length ? Math.max(...rows.map((r) => r.order_index)) + 1 : 0;
}

/** The short left-hand column on a preview line: a time, a duration, or nothing. */
export function itemLead(item: TemplateItem, hour12: boolean): string {
  if (item.start_min != null) return formatTime(item.start_min, hour12);
  if (item.duration_min) return formatDuration(item.duration_min);
  return "—";
}

/** Weekday label for a `day_offset`, assuming the template lands on the week's first day. */
export function offsetLabel(offset: number, weekStart: number, form: "short" | "long" = "short") {
  return dayNameOf((weekStart + offset) % 7, form);
}

export function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}
