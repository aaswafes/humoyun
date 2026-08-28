import type { Template, Tint } from "@/lib/types";
import type { ItemRule, RichItem } from "./model";

export type StarterCategory = "Focus" | "Study" | "Routine" | "Rhythm" | "Faith" | "Life";

export const STARTER_CATEGORIES: StarterCategory[] = ["Focus", "Study", "Routine", "Rhythm", "Faith", "Life"];

export interface Starter {
  name: string;
  description: string;
  icon: string;
  color: Tint;
  scope: Template["scope"];
  category: StarterCategory;
  items: RichItem[];
}

const at = (h: number, m = 0) => h * 60 + m;

const WEEKDAYS: ItemRule = { weekdays: [1, 2, 3, 4, 5] };
const WEEKENDS: ItemRule = { weekdays: [0, 6] };

/** A clocked block: start and end on the wall clock. */
function clocked(
  title: string,
  start: number,
  end: number,
  extra: Partial<RichItem> = {},
): RichItem {
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
function step(title: string, minutes: number, extra: Partial<RichItem> = {}): RichItem {
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
  extra: Partial<RichItem> = {},
): RichItem {
  return step(title, minutes, { ...extra, day_offset: offset });
}

/**
 * Shipped as data, inserted as real rows — once installed a starter is an
 * ordinary template with no special status. Several of them lean on the two
 * features that are easy to miss: `{{variables}}` filled in at apply time, and
 * per-item rules that quietly skip an item when the day says no.
 */
export const STARTERS: Starter[] = [
  {
    name: "Deep Work Day",
    description: "Four protected blocks, shallow work fenced into the gaps, and a hard shutdown.",
    icon: "brain",
    color: "violet",
    scope: "day",
    category: "Focus",
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
    description: "Two and a half hours on {{subject}} that end in recall, not re-reading.",
    icon: "graduation-cap",
    color: "blue",
    scope: "block",
    category: "Study",
    items: [
      step("Set the goal for this {{subject}} block", 10, { priority: 2 }),
      step("Read and annotate — {{subject}}", 40, { tags: ["study"] }),
      step("Break — stand up, water", 10),
      step("Practice problems — {{subject}}", 40, { tags: ["study"] }),
      step("Break — stand up, water", 10),
      step("Recall from memory, no notes", 25, { priority: 3, tags: ["study"] }),
      step("Write the {{subject}} summary card", 15),
    ],
  },
  {
    name: "Morning Routine",
    description: "Prayer, Qur'an, movement and pages — before the day gets a vote.",
    icon: "sunrise",
    color: "amber",
    scope: "day",
    category: "Routine",
    items: [
      clocked("Fajr", at(5), at(5, 20), { kind: "prayer", priority: 3 }),
      clocked("Qur'an — four pages", at(5, 20), at(5, 45), { kind: "reading", priority: 3 }),
      clocked("Journal and pick the day's one thing", at(5, 45), at(6)),
      clocked("Move — walk, run or weights", at(6), at(6, 40), {
        tags: ["health"],
        // If a workout is already on the day, the routine bows out.
        rule: { skip_if_tag: "gym" },
      }),
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
    category: "Rhythm",
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
  {
    name: "Shutdown Ritual",
    description: "Twenty-five minutes that let you actually stop thinking about work.",
    icon: "moon",
    color: "slate",
    scope: "block",
    category: "Focus",
    items: [
      step("Close every open loop into the inbox", 8, { priority: 2 }),
      step("Skim tomorrow's calendar", 4),
      step("Write tomorrow's one thing", 5, { priority: 3 }),
      step("Clear the desk and the desktop", 5),
      step("Say the shutdown sentence out loud", 1, { tags: ["ritual"] }),
      step("Phone on the shelf until morning", 2, { tags: ["ritual"] }),
    ],
  },
  {
    name: "Reading Sprint",
    description: "Ninety minutes with {{book}} that leave notes behind, not just pages.",
    icon: "book-open",
    color: "brown",
    scope: "block",
    category: "Study",
    items: [
      step("Skim where you left off in {{book}}", 5),
      step("Read {{book}} — first stretch", 30, { kind: "reading", tags: ["reading"] }),
      step("Note one idea worth keeping", 5, { priority: 2 }),
      step("Read {{book}} — second stretch", 30, { kind: "reading", tags: ["reading"] }),
      step("Write the three-sentence summary", 10, { priority: 3 }),
      step("Log the page you reached", 3),
    ],
  },
  {
    name: "Exam Week",
    description: "Six days of {{subject}} revision that taper instead of cramming.",
    icon: "target",
    color: "red",
    scope: "week",
    category: "Study",
    items: [
      onDay(0, "Map the {{subject}} syllabus — mark the weak spots", 45, { priority: 3 }),
      onDay(0, "Past paper, timed", 90, { priority: 3, kind: "block", tags: ["exam"] }),
      onDay(1, "Weak spot one — teach it out loud", 60, { priority: 3 }),
      onDay(2, "Weak spot two — teach it out loud", 60, { priority: 3 }),
      onDay(3, "Past paper, timed", 90, { priority: 3, kind: "block", tags: ["exam"] }),
      onDay(3, "Mark it honestly and list the misses", 30, { priority: 2 }),
      onDay(4, "Flashcards — everything missed this week", 45, { priority: 2 }),
      onDay(5, "Light review only — no new material", 30, { priority: 1 }),
      onDay(5, "Pack the bag, set two alarms", 10, { priority: 2 }),
      onDay(6, "Rest. Walk. Sleep early.", 30, { rule: WEEKENDS }),
    ],
  },
  {
    name: "Training Split",
    description: "Push, pull, legs and two easy days — with the gym days pinned to weekdays.",
    icon: "dumbbell",
    color: "teal",
    scope: "week",
    category: "Rhythm",
    items: [
      onDay(0, "Push — chest, shoulders, triceps", 60, { tags: ["gym"], priority: 2, rule: WEEKDAYS }),
      onDay(1, "Zone 2 — forty minutes easy", 40, { tags: ["cardio"] }),
      onDay(2, "Pull — back, biceps", 60, { tags: ["gym"], priority: 2, rule: WEEKDAYS }),
      onDay(3, "Mobility and core", 25, { tags: ["health"] }),
      onDay(4, "Legs — squat, hinge, carry", 70, { tags: ["gym"], priority: 2, rule: WEEKDAYS }),
      onDay(5, "Long walk or a swim", 60, { tags: ["cardio"] }),
      onDay(6, "Weigh in, log the week, plan loads", 15, { priority: 1 }),
    ],
  },
  {
    name: "Jumu'ah",
    description: "A Friday shaped around the khutbah — and it only lands on Fridays.",
    icon: "sun",
    color: "emerald",
    scope: "day",
    category: "Faith",
    items: [
      clocked("Ghusl and clean clothes", at(10, 30), at(11), { rule: { weekdays: [5] } }),
      clocked("Surah al-Kahf", at(11), at(11, 30), { kind: "reading", priority: 3, rule: { weekdays: [5] } }),
      clocked("Walk to the masjid early", at(11, 30), at(12), { rule: { weekdays: [5] } }),
      clocked("Khutbah and Jumu'ah", at(12), at(13), { kind: "prayer", priority: 3, rule: { weekdays: [5] } }),
      clocked("Sadaqah and du'a", at(13), at(13, 15), { rule: { weekdays: [5] } }),
      clocked("Family lunch, no screens", at(13, 15), at(14, 30), { rule: { weekdays: [5] } }),
    ],
  },
  {
    name: "Ramadan Day",
    description: "Suhoor to taraweeh, with the Qur'an target front and centre.",
    icon: "moon",
    color: "violet",
    scope: "day",
    category: "Faith",
    items: [
      clocked("Suhoor", at(3, 40), at(4, 10), { priority: 2 }),
      clocked("Fajr", at(4, 20), at(4, 40), { kind: "prayer", priority: 3 }),
      clocked("Qur'an — one juz", at(4, 40), at(5, 40), { kind: "reading", priority: 3, tags: ["quran"] }),
      clocked("Sleep again", at(5, 40), at(8)),
      clocked("Work — the one thing only", at(9), at(12), { priority: 3, tags: ["deep"] }),
      clocked("Dhuhr", at(13), at(13, 20), { kind: "prayer", priority: 3 }),
      clocked("Asr, then rest", at(16, 30), at(17)),
      clocked("Du'a before iftar", at(18, 30), at(18, 50), { priority: 3 }),
      clocked("Iftar and Maghrib", at(18, 50), at(19, 30), { kind: "prayer", priority: 3 }),
      clocked("Isha and taraweeh", at(20, 30), at(22), { kind: "prayer", priority: 3 }),
    ],
  },
  {
    name: "Inbox Zero Hour",
    description: "One hour, once a week, and the backlog stops being a background hum.",
    icon: "list-checks",
    color: "pink",
    scope: "block",
    category: "Life",
    items: [
      step("Email — decide, never re-read", 20, { priority: 2, tags: ["admin"] }),
      step("Messages and voice notes", 10, { tags: ["admin"] }),
      step("Paper pile and photos of receipts", 10, { tags: ["admin"] }),
      step("Task inbox — date it or drop it", 15, { priority: 3 }),
      step("Unsubscribe from two things", 5),
    ],
  },
  {
    name: "Travel Day",
    description: "The list you always half-remember at the airport.",
    icon: "plane",
    color: "orange",
    scope: "day",
    category: "Life",
    items: [
      step("Passport, tickets, cards, charger", 10, { priority: 3, rule: { skip_if_duplicate: true } }),
      step("Download offline maps and a book", 10),
      step("Pack — lay it out first, then bag it", 40, { priority: 2 }),
      step("Empty the fridge, take the bins out", 15),
      clocked("Leave for the airport", at(9), at(9, 15), { priority: 3 }),
      step("Qasr prayers — plan the timings", 10, { kind: "prayer", priority: 2 }),
      step("Message home on arrival", 5),
    ],
  },
];

export function startersIn(category: StarterCategory): Starter[] {
  return STARTERS.filter((s) => s.category === category);
}
