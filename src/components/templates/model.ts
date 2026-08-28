// =========================================================
// The templates surface's own model layer.
//
// `Template.items` is a JSON column typed as `TemplateItem[]` in the shared
// schema. Everything this surface needs beyond that shape — conditions,
// nested template references — rides along as extra keys on the same rows.
// The shared type stays the contract; this file is the extension, and every
// read goes through `itemsOf` so the cast happens in exactly one place.
// =========================================================

import {
  addDays, dayName, dayNameOf, formatDate, monthName, startOfWeek, weekNumber, weekday,
} from "@/lib/date";
import type { Task, Template, TemplateItem } from "@/lib/types";

// ---------------------------------------------------------
// Extended item shape
// ---------------------------------------------------------

export interface ItemRule {
  /** Only create the item when the target date is one of these weekdays (0 = Sunday). */
  weekdays?: number[] | null;
  /** Skip when a task carrying this tag already sits on the target date. */
  skip_if_tag?: string | null;
  /** Skip when a task with the same title is already on the target date. */
  skip_if_duplicate?: boolean;
  /** Skip when the target date already holds this many tasks or more. */
  skip_if_busier_than?: number | null;
}

export interface RichItem extends TemplateItem {
  rule?: ItemRule | null;
  /** When set, this item applies another template instead of creating one task. */
  ref_template_id?: string | null;
}

/** The one place `Template.items` widens to the richer shape. */
export function itemsOf(template: Template): RichItem[] {
  return (template.items ?? []) as RichItem[];
}

export function hasRule(rule: ItemRule | null | undefined): boolean {
  if (!rule) return false;
  return (
    (rule.weekdays?.length ?? 0) > 0 ||
    !!rule.skip_if_tag ||
    !!rule.skip_if_duplicate ||
    (rule.skip_if_busier_than ?? 0) > 0
  );
}

export function ruleCount(rule: ItemRule | null | undefined): number {
  if (!rule) return 0;
  let n = 0;
  if (rule.weekdays?.length) n++;
  if (rule.skip_if_tag) n++;
  if (rule.skip_if_duplicate) n++;
  if ((rule.skip_if_busier_than ?? 0) > 0) n++;
  return n;
}

export const WEEKDAY_PRESETS = {
  weekdays: [1, 2, 3, 4, 5],
  weekends: [0, 6],
} as const;

/** "Mon · Wed · Fri", "Weekdays", "Weekends". */
export function weekdaysLabel(days: number[]): string {
  const set = [...new Set(days)].sort((a, b) => a - b);
  if (!set.length || set.length === 7) return "Any day";
  const key = set.join(",");
  if (key === "1,2,3,4,5") return "Weekdays";
  if (key === "0,6") return "Weekends";
  return set.map((d) => dayNameOf(d, "short")).join(" · ");
}

/** One short line describing every active condition on an item. */
export function ruleLabel(rule: ItemRule | null | undefined): string {
  if (!hasRule(rule)) return "Always";
  const parts: string[] = [];
  if (rule?.weekdays?.length) parts.push(weekdaysLabel(rule.weekdays));
  if (rule?.skip_if_tag) parts.push(`not if #${rule.skip_if_tag.replace(/^#/, "")}`);
  if (rule?.skip_if_duplicate) parts.push("not if duplicate");
  if ((rule?.skip_if_busier_than ?? 0) > 0) parts.push(`only under ${rule?.skip_if_busier_than} tasks`);
  return parts.join(" · ");
}

// ---------------------------------------------------------
// Variables — {{book}}, {{date}}, {{n}} …
//
// A variable is declared by being used. Nothing is stored: the apply dialog
// scans the items it is about to create and asks for whatever it finds.
// ---------------------------------------------------------

const VAR_SOURCE = "\\{\\{\\s*([a-zA-Z][\\w .-]*?)\\s*\\}\\}";

export const BUILT_IN_VARS: Record<string, string> = {
  date: "The date each item lands on — “Fri, 5 Sep”",
  day: "Weekday name — “Friday”",
  month: "Month name — “September”",
  week: "ISO week — “W36”",
  n: "Which repeat this is — 1, 2, 3 …",
};

export const BUILT_IN_NAMES = Object.keys(BUILT_IN_VARS);

export interface VarContext {
  /** The date this item will land on. */
  date: string;
  /** 0-based index of the repeat that produced it. */
  index: number;
  total: number;
}

export function builtinValue(name: string, ctx: VarContext): string | null {
  switch (name) {
    case "date": return formatDate(ctx.date);
    case "day": return dayName(ctx.date);
    case "month": return monthName(ctx.date);
    case "week": return `W${weekNumber(ctx.date)}`;
    case "n": return String(ctx.index + 1);
    default: return null;
  }
}

/** Distinct variable names across every item, split into built-in and user-supplied. */
export function collectVars(items: RichItem[]): { builtin: string[]; user: string[] } {
  const seen = new Set<string>();
  const builtin: string[] = [];
  const user: string[] = [];

  const scan = (text: string | null | undefined) => {
    if (!text || !text.includes("{{")) return;
    const re = new RegExp(VAR_SOURCE, "g");
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
      const name = match[1].trim().toLowerCase();
      if (seen.has(name)) continue;
      seen.add(name);
      if (BUILT_IN_NAMES.includes(name)) builtin.push(name);
      else user.push(name);
    }
  };

  for (const item of items) {
    scan(item.title);
    scan(item.notes);
    (item.tags ?? []).forEach(scan);
  }
  return { builtin, user };
}

/** True if any item mentions a variable at all. */
export function usesVars(items: RichItem[]): boolean {
  return items.some(
    (i) =>
      i.title.includes("{{") ||
      (i.notes ?? "").includes("{{") ||
      (i.tags ?? []).some((t) => t.includes("{{")),
  );
}

export function fillText(text: string, values: Record<string, string>, ctx: VarContext): string {
  if (!text.includes("{{")) return text;
  const re = new RegExp(VAR_SOURCE, "g");
  return text
    .replace(re, (_full, raw: string) => {
      const name = raw.trim().toLowerCase();
      const built = builtinValue(name, ctx);
      if (built != null) return built;
      const supplied = values[name];
      return supplied ? supplied : "";
    })
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function fillItem(item: RichItem, values: Record<string, string>, ctx: VarContext): RichItem {
  if (!item.title.includes("{{") && !(item.notes ?? "").includes("{{")
    && !(item.tags ?? []).some((t) => t.includes("{{"))) return item;
  return {
    ...item,
    title: fillText(item.title, values, ctx),
    notes: item.notes ? fillText(item.notes, values, ctx) : item.notes ?? null,
    tags: (item.tags ?? []).map((t) => fillText(t, values, ctx)).filter(Boolean),
  };
}

// ---------------------------------------------------------
// Nested templates
// ---------------------------------------------------------

export interface ExpandedItem {
  item: RichItem;
  /** Name of the template this item came from, when it came from a nested one. */
  source: string | null;
  /** The reference pointed at a template that no longer exists. */
  missing?: boolean;
}

const MAX_NESTING = 3;

/**
 * Flattens nested template references into a single item list.
 * `seen` breaks cycles; depth caps a chain that is merely silly rather than circular.
 */
export function expandItems(
  template: Template,
  all: Template[],
  depth = 0,
  seen: ReadonlySet<string> = new Set<string>(),
): ExpandedItem[] {
  if (seen.has(template.id) || depth > MAX_NESTING) return [];
  const next = new Set(seen).add(template.id);
  const out: ExpandedItem[] = [];

  for (const item of itemsOf(template)) {
    if (!item.ref_template_id) {
      out.push({ item, source: null });
      continue;
    }
    const child = all.find((t) => t.id === item.ref_template_id);
    if (!child) {
      out.push({ item, source: null, missing: true });
      continue;
    }
    const base = item.day_offset ?? 0;
    const nested = expandItems(child, all, depth + 1, next);
    if (!nested.length) {
      // A cycle or an empty child: keep the row visible so the preview can explain it.
      out.push({ item: { ...item, title: item.title || child.name }, source: child.name, missing: true });
      continue;
    }
    for (const entry of nested) {
      out.push({
        item: {
          ...entry.item,
          day_offset: base + (entry.item.day_offset ?? 0),
          color: entry.item.color ?? child.color,
          // The reference's own condition gates everything it pulls in, unless
          // the nested item already carries a narrower one of its own.
          rule: entry.item.rule ?? item.rule ?? null,
        },
        source: entry.source ?? child.name,
      });
    }
  }
  return out;
}

/** Templates that can safely be referenced from `template` without making a loop. */
export function referenceable(template: Template, all: Template[]): Template[] {
  const reaches = (candidate: Template, depth = 0): boolean => {
    if (depth > MAX_NESTING) return false;
    if (candidate.id === template.id) return true;
    return itemsOf(candidate).some((i) => {
      if (!i.ref_template_id) return false;
      const child = all.find((t) => t.id === i.ref_template_id);
      return child ? reaches(child, depth + 1) : false;
    });
  };
  return all.filter((t) => t.id !== template.id && !reaches(t));
}

// ---------------------------------------------------------
// What each day already looks like
// ---------------------------------------------------------

export interface DayFacts {
  date: string;
  /** Lowercased titles of the top-level tasks already on the day. */
  titles: Set<string>;
  tags: Set<string>;
  count: number;
}

const emptyFacts = (date: string): DayFacts => ({ date, titles: new Set(), tags: new Set(), count: 0 });

export function factsIndex(tasks: Task[]): Map<string, DayFacts> {
  const map = new Map<string, DayFacts>();
  for (const task of tasks) {
    if (!task.date || task.parent_id) continue;
    let facts = map.get(task.date);
    if (!facts) { facts = emptyFacts(task.date); map.set(task.date, facts); }
    facts.titles.add(task.title.trim().toLowerCase());
    for (const tag of task.tags ?? []) facts.tags.add(tag.toLowerCase());
    facts.count += 1;
  }
  return map;
}

/** Why this item will not be created on this date, or null if it will. */
export function ruleSkip(item: RichItem, facts: DayFacts): string | null {
  const rule = item.rule;
  if (!hasRule(rule)) return null;
  if (rule?.weekdays?.length && !rule.weekdays.includes(weekday(facts.date))) {
    return `${weekdaysLabel(rule.weekdays).toLowerCase()} only`;
  }
  if (rule?.skip_if_tag) {
    const tag = rule.skip_if_tag.replace(/^#/, "").trim().toLowerCase();
    if (tag && facts.tags.has(tag)) return `#${tag} already there`;
  }
  if (rule?.skip_if_duplicate && facts.titles.has(item.title.trim().toLowerCase())) {
    return "already on that day";
  }
  if ((rule?.skip_if_busier_than ?? 0) > 0 && facts.count >= (rule?.skip_if_busier_than ?? 0)) {
    return `day already has ${facts.count}`;
  }
  return null;
}

// ---------------------------------------------------------
// Repeats
// ---------------------------------------------------------

export type RepeatMode = "once" | "daily" | "weekly" | "days";

export interface RepeatSpec {
  mode: RepeatMode;
  /** Days for `daily`, occurrences for `weekly`, weeks for `days`. */
  count: number;
  /** Weekday indices for `days` (0 = Sunday). */
  weekdays: number[];
}

export const DEFAULT_REPEAT: RepeatSpec = { mode: "once", count: 6, weekdays: [] };

export const REPEAT_LABELS: Record<RepeatMode, string> = {
  once: "Just this date",
  daily: "Every day",
  weekly: "Every week",
  days: "Chosen weekdays",
};

export const REPEAT_UNITS: Record<RepeatMode, string> = {
  once: "",
  daily: "days",
  weekly: "weeks",
  days: "weeks",
};

/** Hard ceiling so a fat-fingered count cannot write six hundred tasks. */
export const MAX_ANCHORS = 60;

export function anchorDates(start: string, spec: RepeatSpec, weekStart = 1): string[] {
  const n = Math.max(1, Math.min(52, Math.round(spec.count || 1)));

  if (spec.mode === "once") return [start];
  if (spec.mode === "daily") {
    return Array.from({ length: Math.min(n, MAX_ANCHORS) }, (_, i) => addDays(start, i));
  }
  if (spec.mode === "weekly") {
    return Array.from({ length: Math.min(n, MAX_ANCHORS) }, (_, i) => addDays(start, i * 7));
  }

  const set = spec.weekdays.length
    ? [...new Set(spec.weekdays)].sort((a, b) => a - b)
    : [weekday(start)];

  // Counting weeks from the first matching day means "every Monday for 6 weeks"
  // gives six Mondays even when you picked a Thursday on the calendar.
  let first = start;
  for (let i = 0; i < 7; i++) {
    const candidate = addDays(start, i);
    if (set.includes(weekday(candidate))) { first = candidate; break; }
  }
  const base = startOfWeek(first, weekStart);
  const out: string[] = [];
  for (let w = 0; w < n && out.length < MAX_ANCHORS; w++) {
    for (const d of set) {
      const date = addDays(base, w * 7 + ((d - weekStart + 7) % 7));
      if (date >= first) out.push(date);
      if (out.length >= MAX_ANCHORS) break;
    }
  }
  return [...new Set(out)].sort();
}

export function repeatLabel(spec: RepeatSpec): string {
  const n = Math.max(1, Math.round(spec.count || 1));
  if (spec.mode === "once") return REPEAT_LABELS.once;
  if (spec.mode === "daily") return `Every day for ${n} ${n === 1 ? "day" : "days"}`;
  if (spec.mode === "weekly") return `Every week for ${n} ${n === 1 ? "week" : "weeks"}`;
  const days = spec.weekdays.length ? weekdaysLabel(spec.weekdays) : "the same weekday";
  return `${days} for ${n} ${n === 1 ? "week" : "weeks"}`;
}

// ---------------------------------------------------------
// The plan — the exact set of tasks an apply would write
// ---------------------------------------------------------

export interface PlannedItem {
  key: string;
  /** The repeat date that produced this row. */
  anchor: string;
  item: RichItem;
  /** Name of the nested template it came from, if any. */
  source: string | null;
  /** Reason it will be skipped, or null when it will be created. */
  skip: string | null;
}

export interface PlannedDay {
  date: string;
  /** Everything the plan considered for this day, skipped rows included. */
  items: PlannedItem[];
  /** Only the rows that will actually become tasks. */
  create: PlannedItem[];
  /** Top-level tasks already on the day before the apply. */
  existing: number;
}

function orderForDay(items: PlannedItem[]): PlannedItem[] {
  return [...items].sort((a, b) => {
    const as = a.item.start_min ?? Infinity;
    const bs = b.item.start_min ?? Infinity;
    if (as !== bs) return as - bs;
    return 0;
  });
}

export function buildPlan(opts: {
  template: Template;
  templates: Template[];
  anchors: string[];
  values: Record<string, string>;
  tasks: Task[];
}): PlannedDay[] {
  const { template, templates, anchors, values, tasks } = opts;
  const expanded = expandItems(template, templates);
  const existing = factsIndex(tasks);

  // Conditions read a day that is filling up as the plan is built, so two
  // repeats landing on the same date see each other's items.
  const working = new Map<string, DayFacts>();
  const factsFor = (date: string): DayFacts => {
    let facts = working.get(date);
    if (!facts) {
      const base = existing.get(date);
      facts = base
        ? { date, titles: new Set(base.titles), tags: new Set(base.tags), count: base.count }
        : emptyFacts(date);
      working.set(date, facts);
    }
    return facts;
  };

  const days = new Map<string, PlannedItem[]>();

  anchors.forEach((anchor, index) => {
    expanded.forEach((entry, i) => {
      const date = addDays(anchor, entry.item.day_offset ?? 0);
      const item = fillItem(entry.item, values, { date, index, total: anchors.length });
      const facts = factsFor(date);
      const skip = entry.missing
        ? "linked template is gone"
        : !item.title.trim()
          ? "no title"
          : ruleSkip(item, facts);

      if (!skip) {
        facts.titles.add(item.title.trim().toLowerCase());
        for (const tag of item.tags ?? []) facts.tags.add(tag.toLowerCase());
        facts.count += 1;
      }

      const list = days.get(date) ?? [];
      list.push({ key: `${anchor}:${i}`, anchor, item, source: entry.source, skip });
      days.set(date, list);
    });
  });

  return [...days.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, list]) => {
      const ordered = orderForDay(list);
      return {
        date,
        items: ordered,
        create: ordered.filter((p) => !p.skip),
        existing: existing.get(date)?.count ?? 0,
      };
    });
}

/** How many distinct days one application of the template touches. */
export function spreadDays(template: Template, all: Template[]): number {
  const offsets = new Set(expandItems(template, all).map((e) => e.item.day_offset ?? 0));
  return Math.max(1, offsets.size);
}

/** date -> the [start, end] spans already booked on it. Built once per dialog. */
export function busyIndex(tasks: Task[]): Map<string, [number, number][]> {
  const map = new Map<string, [number, number][]>();
  for (const task of tasks) {
    if (!task.date || task.parent_id || task.start_min == null) continue;
    const start = task.start_min;
    const end = task.end_min ?? start + (task.duration_min ?? 30);
    const list = map.get(task.date) ?? [];
    list.push([start, end]);
    map.set(task.date, list);
  }
  return map;
}

/** Timed rows in the plan that land on top of something already on the day. */
export function clashesOn(day: PlannedDay, busy: Map<string, [number, number][]>): number {
  const spans = busy.get(day.date);
  if (!spans || !spans.length) return 0;

  let hits = 0;
  for (const planned of day.create) {
    const start = planned.item.start_min;
    if (start == null) continue;
    const end = planned.item.end_min ?? start + (planned.item.duration_min ?? 30);
    if (spans.some(([bs, be]) => start < be && end > bs)) hits += 1;
  }
  return hits;
}
