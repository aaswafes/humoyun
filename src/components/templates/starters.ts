import type { Template, TemplateItem, Tint } from "@/lib/types";

export interface Starter {
  name: string;
  description: string;
  icon: string;
  color: Tint;
  scope: Template["scope"];
  items: TemplateItem[];
}

const at = (h: number, m = 0) => h * 60 + m;

/** A clocked block: start and end on the wall clock. */
function clocked(
  title: string,
  start: number,
  end: number,
  extra: Partial<TemplateItem> = {},
): TemplateItem {
  return {
    title,
    kind: "block",
    day_offset: 0,
    start_min: start,
    end_min: end,
    duration_min: end - start,
    priority: 0,
    color: null,
    tags: [],
    ...extra,
  };
}

/** An untimed step: a duration you drop wherever it fits. */
function step(title: string, minutes: number, extra: Partial<TemplateItem> = {}): TemplateItem {
  return {
    title,
    kind: "task",
    day_offset: 0,
    start_min: null,
    end_min: null,
    duration_min: minutes,
    priority: 0,
    color: null,
    tags: [],
    ...extra,
  };
}

/** A step pinned to a day of the week, counting from the day the template lands on. */
function onDay(
  offset: number,
  title: string,
  minutes: number,
  extra: Partial<TemplateItem> = {},
): TemplateItem {
  return step(title, minutes, { ...extra, day_offset: offset });
}

/**
 * Shipped as data, inserted as real rows — once installed a starter is an
 * ordinary template with no special status.
 */
export const STARTERS: Starter[] = [
  {
    name: "Deep Work Day",
    description: "Four protected blocks, shallow work fenced into the gaps, and a hard shutdown.",
    icon: "brain",
    color: "violet",
    scope: "day",
    items: [
      clocked("Plan the day — pick the one thing", at(6, 45), at(7, 15), { priority: 3 }),
      clocked("Deep work — block one", at(7, 15), at(9), { priority: 3, tags: ["deep"] }),
      clocked("Walk, no phone", at(9), at(9, 15)),
      clocked("Deep work — block two", at(9, 15), at(11), { priority: 3, tags: ["deep"] }),
      clocked("Messages and inbox", at(11), at(11, 30), { priority: 1 }),
      clocked("Lunch, away from the desk", at(11, 30), at(12, 30)),
      clocked("Deep work — block three", at(12, 30), at(14, 15), { priority: 2, tags: ["deep"] }),
      clocked("Admin and errands", at(14, 15), at(15), { priority: 1 }),
      clocked("Deep work — block four", at(15), at(16, 30), { priority: 2, tags: ["deep"] }),
      clocked("Shutdown — write tomorrow's one thing", at(16, 30), at(17), { priority: 2 }),
    ],
  },
  {
    name: "Study Block",
    description: "Two and a half hours that end in recall, not re-reading. Drop it on any afternoon.",
    icon: "graduation-cap",
    color: "blue",
    scope: "block",
    items: [
      step("Set the goal for this block", 10, { priority: 2 }),
      step("Read and annotate", 40, { tags: ["study"] }),
      step("Break — stand up, water", 10),
      step("Practice problems", 40, { tags: ["study"] }),
      step("Break — stand up, water", 10),
      step("Recall from memory, no notes", 25, { priority: 3, tags: ["study"] }),
      step("Write the summary card", 15),
    ],
  },
  {
    name: "Morning Routine",
    description: "Prayer, Qur'an, movement and pages — before the day gets a vote.",
    icon: "sunrise",
    color: "amber",
    scope: "day",
    items: [
      clocked("Fajr", at(5), at(5, 20), { kind: "prayer", priority: 3 }),
      clocked("Qur'an — four pages", at(5, 20), at(5, 45), { kind: "reading", priority: 3 }),
      clocked("Journal and pick the day's one thing", at(5, 45), at(6)),
      clocked("Move — walk, run or weights", at(6), at(6, 40), { tags: ["health"] }),
      clocked("Shower and breakfast", at(6, 40), at(7)),
      clocked("Read twenty pages", at(7), at(7, 25), { kind: "reading", tags: ["reading"] }),
    ],
  },
  {
    name: "Weekly Reset",
    description: "Eight touchpoints, Monday's three outcomes through to Sunday's review.",
    icon: "rotate-ccw",
    color: "emerald",
    scope: "week",
    items: [
      onDay(0, "Set the week's three outcomes", 30, { priority: 3 }),
      onDay(0, "Calendar sweep — defend the deep work", 20, { priority: 2 }),
      onDay(2, "Midweek check — are the three still true?", 15, { priority: 1 }),
      onDay(4, "Ship review — close what is open", 45, { priority: 2 }),
      onDay(5, "Inbox to zero", 30),
      onDay(5, "Money — log spending, reconcile", 20),
      onDay(6, "Weekly review and journal", 45, { priority: 3, kind: "block" }),
      onDay(6, "Plan next week", 30, { priority: 2, kind: "block" }),
    ],
  },
];
