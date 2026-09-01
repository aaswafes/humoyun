"use client";

// =========================================================
// Sample data — a whole life, ninety-one days wide.
//
// Everything is written through the store's normal actions, so the result is
// indistinguishable from data the user typed in themselves. Every value comes
// out of `rand()`, an integer hash of the day offset and a slot number, so the
// same day always produces the same result no matter what order things are
// seeded in — no Math.random, no drift between reloads.
// =========================================================

import { useStore, uid } from "@/lib/store";
import { clearLocal } from "@/lib/local-db";
import { addDays, diffDays, fromISO, startOfWeek, todayISO, weekday } from "@/lib/date";
import { prayerTimesFor } from "@/lib/prayer";
import {
  PRAYER_NAMES,
  TABLE_OF,
  type CollectionKey,
  type FocusSession,
  type MapEdge,
  type MapNode,
  type PrayerStatus,
  type Task,
  type TaskKind,
  type TaskStatus,
  type TemplateItem,
  type Tint,
} from "@/lib/types";

// ---------------------------------------------------------
// Window
// ---------------------------------------------------------
const PAST = 45;
const FUTURE = 45;

/** Bumped whenever the seed changes shape, so an old workspace can be re-seeded. */
export const SAMPLE_VERSION = "sample-v4";
const SEED_PREF_KEY = "sample_seed";
const BOARD_NAME = "Life Map";
const SECOND_BOARD_NAME = "Reading & Ideas";

const H = (h: number, m = 0) => h * 60 + m;

/** A timestamp at a given minute of a given local day. */
function stamp(iso: string, minutes: number): string {
  const d = fromISO(iso);
  d.setHours(Math.floor(minutes / 60), Math.round(minutes) % 60, 0, 0);
  return d.toISOString();
}

/**
 * Deterministic 0..1 from up to three integer coordinates. Hash-based rather
 * than a running generator, so a value depends only on *which* day and slot it
 * describes — reordering the seeder never reshuffles the data.
 */
function rand(a: number, b = 0, c = 0): number {
  let x = (Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul((b | 0) + 1, 0x165667b1) ^ Math.imul((c | 0) + 7, 0x9e3779b1)) >>> 0;
  x = Math.imul(x ^ (x >>> 15), 0x2c1b3c6d) >>> 0;
  x = Math.imul(x ^ (x >>> 13), 0x297a2d39) >>> 0;
  return ((x ^ (x >>> 16)) >>> 0) / 0x1_0000_0000;
}

function pick<T>(list: readonly T[], a: number, b = 0, c = 0): T {
  return list[Math.floor(rand(a, b, c) * list.length) % list.length];
}

/**
 * Small deterministic wobble, so nothing lands on a suspiciously round hour.
 * Snapped to five minutes — real calendars do not start meetings at 3:54.
 */
function jitter(a: number, b: number, spread: number): number {
  return Math.round(((rand(a, b, 77) - 0.5) * 2 * spread) / 5) * 5;
}

// ---------------------------------------------------------
// Content pools
// ---------------------------------------------------------
interface Item {
  title: string;
  kind?: TaskKind;
  start?: number;
  dur?: number;
  priority?: number;
  color?: Tint;
  tags?: string[];
  notes?: string;
  checklist?: string[];
  subtasks?: string[];
  /** Key into the seeded goals, so the task shows up under that goal. */
  goal?: string;
}

const MEETINGS: readonly Item[] = [
  { title: "Design sync with Dilnoza", kind: "event", start: H(11), dur: 45, tags: ["meeting"], color: "violet" },
  { title: "1:1 with Aziz", kind: "event", start: H(15), dur: 30, tags: ["meeting"] },
  { title: "Client call — Farrux", kind: "event", start: H(16), dur: 45, priority: 2, tags: ["meeting"] },
  { title: "Sprint planning", kind: "event", start: H(10, 30), dur: 60, tags: ["meeting"], color: "blue" },
  { title: "Retro — what slowed us down", kind: "event", start: H(17), dur: 45, tags: ["meeting"] },
  { title: "Interview — frontend candidate", kind: "event", start: H(14), dur: 60, priority: 2, tags: ["meeting"] },
  { title: "Investor update call", kind: "event", start: H(18), dur: 30, priority: 2, tags: ["meeting"], color: "emerald" },
  { title: "Coffee with Sanjar", kind: "event", start: H(12, 30), dur: 60, color: "brown", tags: ["meeting"] },
  { title: "Support triage with the team", kind: "event", start: H(13, 30), dur: 40, tags: ["meeting"] },
];

const ADMIN: readonly Item[] = [
  { title: "Inbox to zero", dur: 25, tags: ["admin"], color: "violet" },
  { title: "Review pull requests", dur: 45, tags: ["admin"], color: "blue" },
  { title: "Send invoices", start: H(11), dur: 30, tags: ["admin"] },
  { title: "Expenses and receipts", dur: 30, tags: ["admin"] },
  { title: "Update the roadmap", dur: 40, tags: ["admin"], color: "blue" },
  { title: "Answer the three long emails", dur: 35, tags: ["admin"] },
  { title: "Back up the laptop", dur: 20, tags: ["admin"] },
  { title: "Renew the domain", tags: ["admin"] },
  { title: "Reconcile the bank statement", dur: 40, tags: ["admin"] },
];

const ERRANDS: readonly Item[] = [
  { title: "Grocery run", dur: 45, color: "brown", tags: ["errand"] },
  { title: "Post office — send the contract", dur: 30, color: "brown", tags: ["errand"] },
  { title: "Barber", kind: "event", start: H(16), dur: 45, color: "brown", tags: ["errand"] },
  { title: "Car service", kind: "event", start: H(9), dur: 90, color: "brown", tags: ["errand"], priority: 2 },
  { title: "Pharmacy — refill", dur: 20, color: "brown", tags: ["errand"] },
  { title: "Pick up the parcel", dur: 25, color: "brown", tags: ["errand"] },
  { title: "Pay the utilities", dur: 15, color: "brown", tags: ["errand"] },
  { title: "Fix the kitchen tap", dur: 60, color: "brown", tags: ["errand"] },
];

const FAMILY: readonly Item[] = [
  { title: "Breakfast with Mum", kind: "event", start: H(8, 30), dur: 60, color: "pink", tags: ["family"] },
  { title: "Call Dad", start: H(20), dur: 20, color: "pink", tags: ["family"] },
  { title: "Park with the kids", start: H(16), dur: 90, color: "pink", tags: ["family"] },
  { title: "Family dinner", kind: "event", start: H(19), dur: 90, color: "pink", tags: ["family"] },
  { title: "Visit grandparents", kind: "event", start: H(15), dur: 120, color: "pink", tags: ["family"] },
  { title: "Board games night", start: H(20, 30), dur: 90, color: "pink", tags: ["family"] },
  { title: "Help Nodira move flats", color: "pink", tags: ["family"], priority: 2 },
  { title: "Drive Mum to the clinic", kind: "event", start: H(10), dur: 90, color: "pink", tags: ["family"], priority: 3 },
];

const DEEN: readonly Item[] = [
  { title: "Qur'an — one page after Maghrib", start: H(18, 40), dur: 20, color: "teal", tags: ["deen"] },
  { title: "Tafsir circle after Isha", kind: "event", start: H(20, 30), dur: 60, color: "teal", tags: ["deen"] },
  { title: "Dhikr, ten quiet minutes", start: H(21, 30), dur: 10, color: "teal", tags: ["deen"] },
  { title: "Memorise — three ayahs of Al-Mulk", dur: 25, color: "teal", tags: ["deen"], goal: "mulk" },
  { title: "Arabic — thirty new words", dur: 30, color: "teal", tags: ["study"] },
  { title: "Seerah lecture on the walk home", dur: 45, color: "teal", tags: ["deen"] },
  { title: "Tahajjud", start: H(4, 20), dur: 30, color: "teal", tags: ["deen"] },
  { title: "Sadaqah — set up the monthly transfer", dur: 15, color: "teal", tags: ["deen"] },
];

const HEALTH: readonly Item[] = [
  { title: "Swim", kind: "event", start: H(19), dur: 60, color: "red", tags: ["health"] },
  { title: "Long run — 8 km", start: H(7), dur: 70, color: "red", tags: ["health"], goal: "run" },
  { title: "Stretch and mobility", start: H(22), dur: 20, color: "red", tags: ["health"] },
  { title: "Physio exercises", dur: 20, color: "red", tags: ["health"] },
  { title: "Walk 5 km after dinner", start: H(20), dur: 50, color: "red", tags: ["health"], goal: "run" },
  { title: "Meal prep for the week", start: H(17), dur: 75, color: "red", tags: ["health"] },
];

const CREATIVE: readonly Item[] = [
  { title: "Write the weekly letter", start: H(10), dur: 60, color: "amber", tags: ["writing"] },
  { title: "Draft the launch essay", start: H(9, 30), dur: 90, priority: 2, color: "amber", tags: ["writing"] },
  { title: "Outline the changelog post", dur: 40, color: "amber", tags: ["writing"] },
  { title: "Edit the podcast intro", dur: 45, color: "amber", tags: ["writing"] },
  { title: "Sketch the onboarding flow", dur: 60, color: "violet", tags: ["deep"] },
  { title: "Redraw the pricing page", dur: 75, color: "violet", tags: ["deep"] },
];

/** Project work — these carry the checklists and subtasks. */
const PROJECT: readonly Item[] = [
  {
    title: "Month view — drag to reschedule", dur: 120, priority: 3, color: "blue", tags: ["deep", "ship"], goal: "v1",
    notes: "Keyboard path first, then the pointer one. A drag nobody can do with a keyboard is a bug.",
    checklist: ["Pointer sensor", "Keyboard sensor", "Drop preview", "Undo toast"],
  },
  {
    title: "Task inspector — checklists", dur: 90, priority: 2, color: "blue", tags: ["deep", "ship"], goal: "v1",
    subtasks: ["Reorder items", "Progress in the row", "Convert item to subtask"],
  },
  {
    title: "Habits — the year heatmap", dur: 100, priority: 2, color: "emerald", tags: ["deep", "ship"], goal: "v1",
    checklist: ["Cell scale", "Screen-reader summary", "Streak overlay"],
  },
  {
    title: "Mind map — timeline mode", dur: 120, priority: 3, color: "violet", tags: ["deep", "ship"], goal: "v1",
    notes: "Dated nodes on a horizontal axis. Undated ones sit in a tray underneath.",
    checklist: ["Axis scale", "Node lanes", "Undated tray"],
  },
  {
    title: "Weekly review — guided flow", dur: 90, priority: 2, color: "violet", tags: ["deep", "ship"], goal: "v1",
    subtasks: ["Five steps", "Carry last week forward"],
  },
  {
    title: "Focus dial — ambient sound", dur: 60, color: "orange", tags: ["deep", "ship"], goal: "v1",
  },
  {
    title: "Books — reading plan editor", dur: 110, priority: 2, color: "amber", tags: ["deep", "ship"], goal: "v1",
    checklist: ["Pages per day", "Skip weekdays", "Preview the finish date"],
  },
  {
    title: "Command palette — fuzzy search", dur: 80, color: "blue", tags: ["deep", "ship"], goal: "v1",
  },
  {
    title: "Salah — the Hijri calendar", dur: 90, color: "teal", tags: ["deep", "ship"], goal: "v1",
    subtasks: ["Offset control", "Month grid"],
  },
  {
    title: "Stats — year in review", dur: 120, priority: 2, color: "orange", tags: ["deep", "ship"], goal: "v1",
    checklist: ["Focus hours", "Books finished", "Prayer consistency"],
  },
  {
    title: "Fix the drag-and-drop edge case", dur: 60, priority: 3, color: "red", tags: ["deep"], goal: "v1",
    notes: "Dropping onto a collapsed day silently loses the time. Reproduce, then write the test first.",
  },
  {
    title: "Talk to five users about the calendar", dur: 90, priority: 2, color: "orange", tags: ["deep"], goal: "users",
    checklist: ["Write the five questions", "Book the calls", "Write up what surprised me"],
  },
];

const REST: readonly Item[] = [
  { title: "Cook something new", start: H(18), dur: 90, color: "brown", tags: ["family"] },
  { title: "Photo walk in the old city", start: H(10), dur: 120, color: "brown" },
  { title: "Nothing scheduled — on purpose", color: "slate" },
  { title: "Fix the bike", dur: 60, color: "brown" },
  { title: "Tea and a long read", start: H(16), dur: 60, color: "amber", tags: ["reading"] },
  { title: "Tidy the desk properly", dur: 40, color: "slate" },
];

const STUDY: readonly Item[] = [
  { title: "Systems design — module four", start: H(21), dur: 60, color: "violet", tags: ["study"] },
  { title: "Read two papers on local-first sync", dur: 60, color: "violet", tags: ["study"] },
  { title: "Rebuild the store from memory", dur: 75, color: "violet", tags: ["study"] },
  { title: "Type-level TypeScript exercises", dur: 45, color: "violet", tags: ["study"] },
];

/** Fixed points in the story — these land on an exact day. */
const ANCHORS: { day: number; item: Item }[] = [
  { day: -41, item: { title: "Kick-off — decide what v1 actually is", kind: "milestone", color: "blue", priority: 3, tags: ["ship"], goal: "v1" } },
  { day: -38, item: { title: "v0.4 — calendar grid landed", kind: "milestone", color: "emerald", tags: ["ship"], goal: "v1" } },
  { day: -30, item: { title: "Ramadan planning with the family", kind: "event", start: H(20), dur: 90, color: "teal", tags: ["family", "deen"] } },
  { day: -24, item: { title: "Design review passed", kind: "milestone", color: "emerald", tags: ["ship"], goal: "v1" } },
  { day: -23, item: { title: "Flight to Istanbul", kind: "event", start: H(6, 30), dur: 260, color: "orange", priority: 3, tags: ["travel"] } },
  { day: -22, item: { title: "Conference — day one", kind: "event", start: H(9), dur: 480, color: "orange", tags: ["travel"] } },
  { day: -21, item: { title: "Conference — day two", kind: "event", start: H(9), dur: 480, color: "orange", tags: ["travel"] } },
  { day: -20, item: { title: "Flight home", kind: "event", start: H(19), dur: 260, color: "orange", tags: ["travel"] } },
  { day: -19, item: { title: "Write up what I learned in Istanbul", dur: 60, color: "amber", tags: ["writing"] } },
  { day: -12, item: { title: "Feature freeze for v1", kind: "milestone", color: "emerald", priority: 3, tags: ["ship"], goal: "v1" } },
  { day: -6, item: { title: "First external tester onboarded", kind: "milestone", color: "emerald", tags: ["ship"], goal: "users" } },
  { day: -2, item: { title: "Rewrite the landing hero", start: H(9), dur: 90, priority: 2, color: "blue", tags: ["deep"] } },
  { day: 2, item: { title: "Dentist", kind: "event", start: H(14), dur: 60, priority: 2, tags: ["health"] } },
  { day: 5, item: { title: "Cut the first beta build", kind: "milestone", color: "emerald", priority: 3, tags: ["ship"], goal: "beta" } },
  { day: 9, item: { title: "Quarterly goal check-in", start: H(9), dur: 60, priority: 2, color: "emerald", tags: ["review"] } },
  { day: 12, item: { title: "Public beta — invite the waitlist", kind: "milestone", color: "emerald", priority: 3, tags: ["ship"], goal: "beta", checklist: ["Write the invite email", "Turn on sign-ups", "Watch the logs for an hour"] } },
  { day: 18, item: { title: "Tashkent Dev Days — day one", kind: "event", start: H(10), dur: 420, color: "orange", tags: ["travel"] } },
  { day: 19, item: { title: "Tashkent Dev Days — day two", kind: "event", start: H(10), dur: 420, color: "orange", tags: ["travel"] } },
  { day: 20, item: { title: "Give the lightning talk", kind: "event", start: H(15), dur: 30, color: "orange", priority: 3, tags: ["travel"] } },
  { day: 26, item: { title: "v1.1 — mind map timeline", kind: "milestone", color: "violet", tags: ["ship"], goal: "v1" } },
  { day: 31, item: { title: "Nodira's birthday", kind: "event", color: "pink", priority: 2, tags: ["family"] } },
  { day: 40, item: { title: "Quarter close — write the recap", start: H(10), dur: 120, priority: 2, color: "amber", tags: ["writing", "review"] } },
];

const FILLERS: readonly Item[] = [
  { title: "One long walk, no phone", dur: 45, color: "emerald", tags: ["health"] },
  { title: "Read before bed, not the phone", start: H(22), dur: 30, color: "amber", tags: ["reading"] },
  { title: "Water the plants", dur: 10, color: "emerald" },
  { title: "Ten minutes of silence", start: H(21), dur: 10, color: "slate", tags: ["ritual"] },
];

// ---------------------------------------------------------
// Books — each one appears exactly once
// ---------------------------------------------------------
const BOOKS = [
  {
    key: "pragmatic",
    title: "The Pragmatic Programmer",
    author: "Andrew Hunt & David Thomas",
    pages: 352,
    color: "amber" as Tint,
    notes: "The tracer bullet chapter is the one I keep coming back to.",
  },
  {
    key: "deep",
    title: "Deep Work",
    author: "Cal Newport",
    pages: 296,
    color: "blue" as Tint,
    notes: "Rule one is the whole book. The rest is footnotes.",
  },
  {
    key: "nectar",
    title: "The Sealed Nectar",
    author: "Safiur Rahman al-Mubarakpuri",
    pages: 592,
    color: "emerald" as Tint,
    notes: "Read it slowly. One chapter, then sit with it.",
  },
  {
    key: "thinking",
    title: "Thinking, Fast and Slow",
    author: "Daniel Kahneman",
    pages: 499,
    color: "violet" as Tint,
    notes: "Starts in three days. Twenty-two pages a weekday.",
  },
] as const;

const BOOK_TITLES = new Set<string>(BOOKS.map((b) => b.title));

// ---------------------------------------------------------
// Habits
// ---------------------------------------------------------
interface HabitSeed {
  key: string;
  name: string;
  icon: string;
  color: Tint;
  cadence: "daily" | "weekly" | "custom";
  weekdays: number[];
  timesPerWeek: number;
  target: number;
  unit: string | null;
  /** Chance a scheduled day gets completed. */
  rate: number;
}

const HABITS: HabitSeed[] = [
  { key: "fajr", name: "Fajr in jamaah", icon: "moon", color: "teal", cadence: "daily", weekdays: [0, 1, 2, 3, 4, 5, 6], timesPerWeek: 7, target: 1, unit: null, rate: 0.83 },
  { key: "read", name: "Read 20 pages", icon: "book-open", color: "amber", cadence: "daily", weekdays: [0, 1, 2, 3, 4, 5, 6], timesPerWeek: 7, target: 1, unit: "pages", rate: 0.74 },
  { key: "workout", name: "Workout", icon: "dumbbell", color: "red", cadence: "weekly", weekdays: [1, 3, 5], timesPerWeek: 3, target: 1, unit: null, rate: 0.79 },
  { key: "journal", name: "Journal", icon: "pen-line", color: "violet", cadence: "daily", weekdays: [0, 1, 2, 3, 4, 5, 6], timesPerWeek: 7, target: 1, unit: null, rate: 0.61 },
  { key: "steps", name: "10,000 steps", icon: "footprints", color: "emerald", cadence: "custom", weekdays: [], timesPerWeek: 5, target: 1, unit: "steps", rate: 0.68 },
  { key: "water", name: "Eight glasses of water", icon: "droplet", color: "blue", cadence: "daily", weekdays: [0, 1, 2, 3, 4, 5, 6], timesPerWeek: 7, target: 8, unit: "glasses", rate: 0.57 },
];

// ---------------------------------------------------------
// Mind map
// ---------------------------------------------------------
interface NodeSeed {
  key: string;
  title: string;
  body: string | null;
  kind: MapNode["kind"];
  shape: MapNode["shape"];
  x: number; y: number; w: number; h: number;
  color: Tint;
  day: number;
  goal?: string;
}

const NODES: NodeSeed[] = [
  { key: "v1", title: "Humoyun v1", body: "Calendar first. Every surface has to earn its place in the sidebar.", kind: "project", shape: "card", x: 60, y: 60, w: 250, h: 130, color: "blue", day: -60, goal: "v1" },
  { key: "beta", title: "Public beta", body: null, kind: "milestone", shape: "diamond", x: 380, y: 60, w: 190, h: 110, color: "emerald", day: 12, goal: "beta" },
  { key: "hundred", title: "First hundred users", body: "Not sign-ups. People who open it on a Tuesday.", kind: "milestone", shape: "diamond", x: 660, y: 60, w: 200, h: 120, color: "emerald", day: 62, goal: "users" },
  { key: "juz", title: "Memorise Juz Amma", body: null, kind: "goal", shape: "circle", x: 930, y: 50, w: 175, h: 175, color: "teal", day: 120, goal: "juz" },

  { key: "essay", title: "Write the launch essay", body: "Why a calendar, and not another list.", kind: "note", shape: "sticky", x: 60, y: 250, w: 230, h: 125, color: "amber", day: -6 },
  { key: "who", title: "Who is this actually for?", body: null, kind: "question", shape: "pill", x: 360, y: 250, w: 235, h: 72, color: "pink", day: -20 },
  { key: "timeline", title: "Mind map timeline", body: "Dated nodes on an axis. The undated ones wait in a tray.", kind: "idea", shape: "card", x: 660, y: 240, w: 220, h: 120, color: "violet", day: 26 },
  { key: "run", title: "Half marathon", body: "March. The twelve-week block starts in December.", kind: "goal", shape: "circle", x: 930, y: 270, w: 180, h: 180, color: "red", day: 150, goal: "run" },

  { key: "bet", title: "Calendar-first is the whole bet", body: "If the calendar is wrong, nothing downstream saves it.", kind: "note", shape: "card", x: 60, y: 430, w: 250, h: 130, color: "slate", day: -45 },
  { key: "pricing", title: "Free, or three dollars a month?", body: null, kind: "question", shape: "pill", x: 360, y: 360, w: 235, h: 72, color: "pink", day: 20 },
  { key: "talk", title: "Talk to ten users", body: "Five before the beta, five after.", kind: "note", shape: "card", x: 360, y: 470, w: 230, h: 115, color: "orange", day: 8, goal: "users" },
  { key: "finish", title: "Finish Deep Work", body: null, kind: "idea", shape: "card", x: 660, y: 420, w: 210, h: 105, color: "blue", day: 17 },

  { key: "offline", title: "Offline-first sync", body: "The local store already looks like this. Make it official.", kind: "idea", shape: "card", x: 660, y: 570, w: 230, h: 120, color: "teal", day: 75 },
  { key: "ramadan", title: "Ramadan mode", body: "Suhoor and iftar on the day view, a lighter task load, a Qur'an plan.", kind: "idea", shape: "card", x: 60, y: 610, w: 250, h: 135, color: "emerald", day: 95 },
  { key: "hire", title: "Hire a designer?", body: null, kind: "question", shape: "pill", x: 360, y: 630, w: 230, h: 72, color: "brown", day: 45 },
  { key: "v04", title: "v0.4 — calendar grid", body: null, kind: "milestone", shape: "diamond", x: 930, y: 500, w: 180, h: 105, color: "slate", day: -38 },
];

const EDGES: { from: string; to: string; label: string | null; style: MapEdge["style"]; color: Tint }[] = [
  { from: "bet", to: "v1", label: "premise", style: "solid", color: "slate" },
  { from: "v04", to: "v1", label: null, style: "solid", color: "slate" },
  { from: "v1", to: "beta", label: "then", style: "solid", color: "blue" },
  { from: "beta", to: "hundred", label: "then", style: "solid", color: "emerald" },
  { from: "v1", to: "essay", label: "needs", style: "solid", color: "amber" },
  { from: "essay", to: "who", label: "answer first", style: "dashed", color: "pink" },
  { from: "who", to: "talk", label: null, style: "dashed", color: "orange" },
  { from: "talk", to: "hundred", label: "feeds", style: "solid", color: "orange" },
  { from: "who", to: "pricing", label: null, style: "dotted", color: "pink" },
  { from: "pricing", to: "hundred", label: "blocks", style: "dashed", color: "emerald" },
  { from: "timeline", to: "v1", label: "after v1", style: "dotted", color: "violet" },
  { from: "finish", to: "v1", label: "feeds", style: "dotted", color: "blue" },
  { from: "offline", to: "beta", label: "not yet", style: "dotted", color: "teal" },
  { from: "hire", to: "beta", label: "if it lands", style: "dashed", color: "brown" },
  { from: "ramadan", to: "juz", label: null, style: "dashed", color: "teal" },
  { from: "run", to: "hundred", label: null, style: "dotted", color: "red" },
];

const SIDE_NODES: NodeSeed[] = [
  { key: "s-read", title: "Reading system", body: "Pages per day beats a finish date. The calendar does the maths.", kind: "project", shape: "card", x: 70, y: 70, w: 250, h: 130, color: "amber", day: -30 },
  { key: "s-notes", title: "Marginalia → notes", body: null, kind: "idea", shape: "card", x: 390, y: 70, w: 220, h: 110, color: "violet", day: 14 },
  { key: "s-spaced", title: "Spaced repetition for books", body: "Re-surface a highlight seven days later, then thirty.", kind: "idea", shape: "sticky", x: 70, y: 260, w: 240, h: 130, color: "orange", day: 40 },
  { key: "s-why", title: "Why do I abandon books at page 60?", body: null, kind: "question", shape: "pill", x: 390, y: 250, w: 250, h: 72, color: "pink", day: -12 },
  { key: "s-24", title: "24 books this year", body: null, kind: "goal", shape: "circle", x: 700, y: 90, w: 170, h: 170, color: "amber", day: 128, goal: "books" },
  { key: "s-shelf", title: "Shelf for next quarter", body: "Seneca, Ghazali, one novel, one biography.", kind: "note", shape: "card", x: 390, y: 400, w: 240, h: 120, color: "brown", day: 55 },
];

const SIDE_EDGES: { from: string; to: string; label: string | null; style: MapEdge["style"]; color: Tint }[] = [
  { from: "s-read", to: "s-24", label: "serves", style: "solid", color: "amber" },
  { from: "s-read", to: "s-notes", label: null, style: "solid", color: "violet" },
  { from: "s-notes", to: "s-spaced", label: "then", style: "dashed", color: "orange" },
  { from: "s-why", to: "s-read", label: "the real problem", style: "dashed", color: "pink" },
  { from: "s-shelf", to: "s-24", label: null, style: "dotted", color: "brown" },
];

// ---------------------------------------------------------
// Templates
// ---------------------------------------------------------
const MORNING: TemplateItem[] = [
  { title: "Fajr, then Qur'an", kind: "block", start_min: H(5, 20), end_min: H(6), color: "teal", tags: ["ritual", "deen"] },
  { title: "Walk, no phone", kind: "task", start_min: H(7), end_min: H(7, 30), color: "emerald", tags: ["health"] },
  { title: "Deep work — hardest thing first", kind: "block", start_min: H(8), end_min: H(10), priority: 3, color: "blue", tags: ["deep"] },
  { title: "Tea, stand up, look out a window", kind: "task", start_min: H(10), end_min: H(10, 15) },
  { title: "Deep work — second block", kind: "block", start_min: H(10, 15), end_min: H(12), priority: 2, color: "blue", tags: ["deep"] },
];

const RESET: TemplateItem[] = [
  { title: "Inbox to zero", kind: "task", duration_min: 20, color: "violet", tags: ["admin"] },
  { title: "Jumu'ah", kind: "event", start_min: H(13), end_min: H(14), color: "teal", tags: ["deen"] },
  { title: "Read the week back", kind: "task", start_min: H(16), end_min: H(16, 30), color: "amber", tags: ["review"] },
  { title: "Weekly review", kind: "block", start_min: H(16, 30), end_min: H(17, 30), priority: 2, color: "violet", tags: ["review"] },
  { title: "Plan Monday", kind: "task", start_min: H(17, 30), end_min: H(18) },
  { title: "Call family", kind: "task", start_min: H(20), end_min: H(20, 30), color: "pink", tags: ["family"] },
];

const TRAVEL: TemplateItem[] = [
  { title: "Pack — list on the fridge", kind: "task", duration_min: 30, color: "orange", tags: ["travel"], checklist: [] },
  { title: "Leave for the airport", kind: "event", start_min: H(5), end_min: H(6), color: "orange", priority: 3, tags: ["travel"] },
  { title: "Flight", kind: "event", start_min: H(7), end_min: H(11), color: "orange", tags: ["travel"] },
  { title: "Offline work — no wifi, no excuses", kind: "block", start_min: H(7, 30), end_min: H(10), color: "blue", tags: ["deep"] },
  { title: "Check in, then walk the neighbourhood", kind: "task", start_min: H(13), end_min: H(14, 30), color: "brown" },
  { title: "Call home", kind: "task", start_min: H(21), end_min: H(21, 20), color: "pink", tags: ["family"] },
];

const RECOVERY: TemplateItem[] = [
  { title: "Sleep in — no alarm", kind: "task", color: "slate" },
  { title: "Long walk", kind: "task", start_min: H(10), end_min: H(11, 30), color: "emerald", tags: ["health"] },
  { title: "Cook properly", kind: "task", start_min: H(13), end_min: H(14, 30), color: "brown" },
  { title: "Read on the balcony", kind: "task", start_min: H(16), end_min: H(17, 30), color: "amber", tags: ["reading"] },
  { title: "No screens after Maghrib", kind: "block", start_min: H(18, 30), end_min: H(22), color: "slate", tags: ["ritual"] },
];

const STUDY_BLOCK: TemplateItem[] = [
  { title: "Arabic — thirty words", kind: "task", start_min: H(20), end_min: H(20, 30), color: "teal", tags: ["study"] },
  { title: "One paper, properly", kind: "block", start_min: H(20, 30), end_min: H(21, 30), color: "violet", tags: ["study"] },
  { title: "Write down what I did not understand", kind: "task", start_min: H(21, 30), end_min: H(21, 45), color: "violet", tags: ["study"] },
];

// ---------------------------------------------------------
// Tags
// ---------------------------------------------------------
const TAGS: { name: string; color: Tint }[] = [
  { name: "deep", color: "blue" },
  { name: "ship", color: "emerald" },
  { name: "admin", color: "slate" },
  { name: "meeting", color: "violet" },
  { name: "health", color: "red" },
  { name: "family", color: "pink" },
  { name: "errand", color: "brown" },
  { name: "ritual", color: "teal" },
  { name: "deen", color: "teal" },
  { name: "reading", color: "amber" },
  { name: "writing", color: "amber" },
  { name: "study", color: "violet" },
  { name: "review", color: "orange" },
  { name: "travel", color: "orange" },
  { name: "idea", color: "orange" },
];

// ---------------------------------------------------------
// Day-log prose
// ---------------------------------------------------------
const HIGHLIGHTS = [
  "Two clean deep work blocks before anyone woke up.",
  "The calendar grid finally feels right under the hand.",
  "Long walk with Dad along the canal.",
  "Fixed the drag-and-drop bug that has been mocking me for a week.",
  "Read forty pages without once reaching for the phone.",
  "Prayed all five in jamaah.",
  "Cooked for everyone and nobody complained.",
  "Shipped the reading planner.",
  "Said no to a meeting and nothing bad happened.",
  "Wrote 900 words of the essay in one sitting.",
  "Ran further than I planned to.",
  "A quiet day. That was the point.",
];

const GRATITUDE = [
  "A quiet morning and nobody needing anything.",
  "Rain, finally.",
  "Health. All of it.",
  "Good coffee, good friends.",
  "Parents still a phone call away.",
  "Work that is worth being tired from.",
  "The city in September.",
  "Being able to read at all.",
];

const FOCUS_LABELS = [
  "Month view drag",
  "Task inspector",
  "Store rewrite",
  "Habits heatmap",
  "Settings surface",
  "Reading planner",
  "Landing hero",
  "Launch essay",
  "Inbox triage",
  "Timeline mode",
  "Command palette",
  "Salah calendar",
];

// ---------------------------------------------------------
// Shape of a day
// ---------------------------------------------------------
/** How much of a past day actually got done. Weekends are looser; some days fall apart. */
function dayQuality(date: string, offset: number): number {
  if (offset > 0) return 0;
  const dow = weekday(date);
  const weekend = dow === 0 || dow === 6;
  const r = rand(offset, 11);
  if (r < 0.055) return 0.10;          // sick, travelling, or it simply fell apart
  if (r < 0.155) return 0.46;          // half a day survived
  const recency = offset >= -10 ? 0.06 : offset >= -25 ? 0.02 : 0;
  const travel = offset <= -20 && offset >= -23 ? -0.18 : 0;
  return Math.min(0.97, (weekend ? 0.70 : 0.85) + recency + travel + rand(offset, 12) * 0.09);
}

/**
 * Past this many days an unfinished task stops being overdue and becomes a
 * thing that never happened. Without it the Inbox fills with sixty items from
 * six weeks ago, which nobody's real backlog looks like.
 */
const STALE_AFTER = 14;

function resolveStatus(
  offset: number, slot: number, quality: number, startMin: number | null, minutesNow: number,
): TaskStatus {
  if (offset > 0) return "todo";
  if (offset === 0) {
    if (startMin == null) return rand(slot, 0, 21) < 0.4 ? "done" : "todo";
    if (startMin + 25 > minutesNow) return "todo";
    return rand(slot, 0, 22) < 0.82 ? "done" : "todo";
  }
  const r = rand(offset, slot, 23);
  if (r < quality) return "done";
  if (offset < -STALE_AFTER) return rand(offset, slot, 24) < 0.84 ? "dropped" : "todo";
  return r < quality + 0.07 ? "dropped" : "todo";
}

// ---------------------------------------------------------
// Seeding context
// ---------------------------------------------------------
interface Ctx {
  today: string;
  minutesNow: number;
  weekStart: number;
  goals: Record<string, string>;
  projects: Record<string, string>;
  habits: Record<string, string>;
  deepWorkByDate: Map<string, string>;
  rows: number;
}

const store = () => useStore.getState();

/**
 * The store's CRUD is generic per collection key; looping over the key union
 * erases that link. The two casts the seeder needs live here and nowhere else.
 */
const clearCollection = (key: CollectionKey) =>
  (store().removeWhere as unknown as (k: CollectionKey, p: () => boolean) => void)(key, () => true);

function addItem(item: Item, date: string | null, offset: number, slot: number, ctx: Ctx): Task {
  const s = store();
  const quality = dayQuality(date ?? ctx.today, offset);
  const start = item.start != null ? Math.max(0, item.start + jitter(offset, slot, 8)) : null;
  const dur = item.dur ?? null;
  const end = start != null && dur != null ? Math.min(1439, start + dur) : null;
  const status = date == null ? "todo" : resolveStatus(offset, slot, quality, start, ctx.minutesNow);

  const task = s.addTask({
    title: item.title,
    kind: item.kind ?? "task",
    date,
    start_min: start,
    end_min: end,
    all_day: start == null,
    duration_min: dur ?? (start != null && end != null ? end - start : null),
    priority: item.priority ?? 0,
    color: item.color ?? null,
    tags: item.tags ?? [],
    notes: item.notes ?? null,
    status,
    completed_at: status === "done" && date ? stamp(date, end ?? start ?? H(18, 30)) : null,
    goal_id: item.goal ? (ctx.goals[item.goal] ?? null) : null,
    checklist: (item.checklist ?? []).map((text, i) => ({
      id: uid(),
      text,
      // A finished task has its list ticked off; a day still ahead has nothing ticked.
      done: status === "done" || (offset <= 0 && date != null && rand(offset, slot, 30 + i) < 0.45),
    })),
  });
  ctx.rows++;

  (item.subtasks ?? []).forEach((title, i) => {
    const child = s.addSubtask(task.id, title);
    if (!child) return;
    ctx.rows++;
    const childDone = status === "done" || rand(offset, slot, 40 + i) < quality * 0.7;
    if (childDone && date) {
      s.patch("tasks", child.id, { status: "done", completed_at: stamp(date, end ?? H(17)) });
    }
  });

  return task;
}

// ---------------------------------------------------------
// Detection
// ---------------------------------------------------------
/**
 * Has this workspace already been seeded? The pref is the fast path; the seeded
 * rows themselves are the fallback, because prefs can be lost to a fresh profile
 * or an imported backup and a second seed would duplicate every book.
 */
export function sampleDataPresent(): boolean {
  const s = store();
  const prefs = (s.profile?.prefs ?? {}) as Record<string, unknown>;
  if (prefs[SEED_PREF_KEY] === SAMPLE_VERSION) return true;
  if (s.books.some((b) => BOOK_TITLES.has(b.title))) return true;
  if (s.boards.some((b) => b.name === BOARD_NAME || b.name === SECOND_BOARD_NAME)) return true;
  return false;
}

// ---------------------------------------------------------
// The seeder
// ---------------------------------------------------------
/**
 * Fills the workspace with ninety-one days of a believable life.
 * Returns the number of rows created — 0 if the sample is already here.
 */
export function loadSampleData(): number {
  if (sampleDataPresent()) return 0;

  const s = store();
  const today = todayISO();
  const clock = new Date();

  const ctx: Ctx = {
    today,
    minutesNow: clock.getHours() * 60 + clock.getMinutes(),
    weekStart: s.profile?.week_start ?? 1,
    goals: {},
    projects: {},
    habits: {},
    deepWorkByDate: new Map(),
    rows: 0,
  };

  seedTags(ctx);
  seedGoals(ctx);
  seedProjects(ctx);
  seedHabits(ctx);
  seedRoutines(ctx);
  seedBooks(ctx);
  seedDays(ctx);
  seedInbox(ctx);
  fillEmptyDays(ctx);
  seedHabitLogs(ctx);
  seedPrayers(ctx);
  seedFocus(ctx);
  seedDayLogs(ctx);
  seedReviews(ctx);
  seedMap(ctx);
  seedTemplates(ctx);

  s.updateProfile({
    prefs: { ...(s.profile?.prefs ?? {}), [SEED_PREF_KEY]: SAMPLE_VERSION },
  });

  return ctx.rows;
}

/**
 * Fills in pieces the sample grew after this workspace was first seeded. It
 * only ever adds — an existing row is never touched — so it is safe to run on
 * every boot.
 */
export function topUpSampleData(): number {
  const s = store();
  if (!sampleDataPresent()) return 0;
  if (s.projects.length > 0) return 0;

  const clock = new Date();
  const ctx: Ctx = {
    today: todayISO(),
    minutesNow: clock.getHours() * 60 + clock.getMinutes(),
    weekStart: s.profile?.week_start ?? 1,
    goals: {},
    projects: {},
    habits: {},
    deepWorkByDate: new Map(),
    rows: 0,
  };
  // The sample's goals are found by name, since this workspace was seeded
  // before the projects registry existed to remember their ids.
  const byTitle = (title: string) => s.goals.find((g) => g.title === title)?.id;
  ctx.goals.v1 = byTitle("Ship Humoyun v1") ?? "";
  ctx.goals.beta = byTitle("Public beta build out the door") ?? "";
  ctx.goals.juz = byTitle("Memorise Juz Amma") ?? "";

  seedProjects(ctx);
  return ctx.rows;
}

/** Wipes every collection, forgets the seed marker and lays the sample down again. */
export function resetSampleData(): number {
  const keys = Object.keys(TABLE_OF) as CollectionKey[];
  keys.forEach(clearCollection);

  const s = store();
  const prefs = { ...((s.profile?.prefs ?? {}) as Record<string, unknown>) };
  delete prefs[SEED_PREF_KEY];
  s.updateProfile({ prefs });

  // The local snapshot is rewritten by the seed below; clearing it first means a
  // failure halfway through leaves an empty workspace rather than half a life.
  clearLocal();
  return loadSampleData();
}

// ---------------------------------------------------------
// Pieces
// ---------------------------------------------------------
function seedTags(ctx: Ctx) {
  const s = store();
  TAGS.forEach((t) => { s.insert("tags", t); ctx.rows++; });
}

function seedGoals(ctx: Ctx) {
  const s = store();
  const { today } = ctx;
  const year = today.slice(0, 4);
  const monthStart = `${today.slice(0, 8)}01`;

  const northStar = s.insert("goals", {
    title: "Build something people open every morning",
    description: "Not a side project. A thing with users who would miss it if it disappeared.",
    horizon: "year", color: "violet", icon: "sunrise",
    start_date: `${year}-01-01`, end_date: `${year}-12-31`, order_index: 0,
  });
  ctx.goals.north = northStar.id;
  ctx.rows++;

  const books = s.insert("goals", {
    title: "Read 24 books", horizon: "year", target: 24, current: 11, unit: "books",
    color: "amber", icon: "book-open",
    start_date: `${year}-01-01`, end_date: `${year}-12-31`, order_index: 1,
  });
  ctx.goals.books = books.id;
  ctx.rows++;

  const juz = s.insert("goals", {
    title: "Memorise Juz Amma", horizon: "year", target: 37, current: 23, unit: "surahs",
    color: "teal", icon: "moon",
    start_date: `${year}-01-01`, end_date: `${year}-12-31`, order_index: 2,
  });
  ctx.goals.juz = juz.id;
  ctx.rows++;

  const v1 = s.insert("goals", {
    parent_id: northStar.id, title: "Ship Humoyun v1",
    description: "Feature-complete, no dead ends, both themes checked.",
    horizon: "quarter", target: 100, current: 68, unit: "%", color: "blue",
    start_date: addDays(today, -52), end_date: addDays(today, 38), order_index: 3,
  });
  ctx.goals.v1 = v1.id;
  ctx.rows++;

  const users = s.insert("goals", {
    parent_id: northStar.id, title: "First 100 real users",
    horizon: "quarter", target: 100, current: 12, unit: "users", color: "orange",
    start_date: addDays(today, -10), end_date: addDays(today, 80), order_index: 4,
  });
  ctx.goals.users = users.id;
  ctx.rows++;

  const quarterBooks = s.insert("goals", {
    parent_id: books.id, title: "Six books this quarter",
    horizon: "quarter", target: 6, current: 3, unit: "books", color: "amber",
    start_date: addDays(today, -52), end_date: addDays(today, 38), order_index: 5,
  });
  ctx.goals.qbooks = quarterBooks.id;
  ctx.rows++;

  const beta = s.insert("goals", {
    parent_id: v1.id, title: "Public beta build out the door",
    horizon: "month", target: 1, current: 0, unit: "release", color: "emerald",
    start_date: monthStart, end_date: addDays(today, 14), order_index: 6,
  });
  ctx.goals.beta = beta.id;
  ctx.rows++;

  const settings = s.insert("goals", {
    parent_id: v1.id, title: "Settings and data surface",
    horizon: "month", target: 100, current: 82, unit: "%", color: "blue",
    start_date: monthStart, end_date: addDays(today, 9), order_index: 7,
  });
  ctx.goals.settings = settings.id;
  ctx.rows++;

  const run = s.insert("goals", {
    title: "Run 100 km", horizon: "month", target: 100, current: 62, unit: "km",
    color: "red", icon: "footprints",
    start_date: monthStart, end_date: addDays(today, 16), order_index: 8,
  });
  ctx.goals.run = run.id;
  ctx.rows++;

  const mulk = s.insert("goals", {
    parent_id: juz.id, title: "Surah Al-Mulk, all thirty ayahs",
    horizon: "month", target: 30, current: 18, unit: "ayahs", color: "teal",
    start_date: monthStart, end_date: addDays(today, 22), order_index: 9,
  });
  ctx.goals.mulk = mulk.id;
  ctx.rows++;

  const week = s.insert("goals", {
    parent_id: settings.id, title: "Close every open review finding",
    horizon: "week", target: 7, current: 5, unit: "findings", color: "violet",
    start_date: startOfWeek(today, ctx.weekStart), end_date: addDays(startOfWeek(today, ctx.weekStart), 6),
    order_index: 10,
  });
  ctx.goals.findings = week.id;
  ctx.rows++;
}

/**
 * Work with an end, and the tasks that make it up.
 *
 * Statuses are stated rather than rolled: a sample project has to read as a
 * plan that is genuinely part-done, and `rand` would reshuffle which parts.
 */
interface SampleProject {
  key: string;
  name: string;
  brief: string;
  status: "idea" | "active" | "paused" | "done";
  color: Tint;
  icon: string;
  goal?: string;
  start?: number | null;
  due?: number | null;
  tasks: { title: string; day: number; done?: boolean; dur?: number; priority?: number }[];
  milestones: { title: string; day: number; done?: boolean }[];
}

const PROJECTS: readonly SampleProject[] = [
  {
    key: "v1",
    name: "Humoyun v1",
    brief: "Every surface finished, both themes checked, nothing that dead-ends.",
    status: "active", color: "blue", icon: "rocket", goal: "v1",
    start: -52, due: 38,
    tasks: [
      { title: "Rebuild the stats page", day: -21, done: true, dur: 180 },
      { title: "Calm pass on the goals board", day: -12, done: true, dur: 120 },
      { title: "Projects surface", day: -2, done: true, dur: 240, priority: 3 },
      { title: "Fix the timeline on a narrow screen", day: 1, dur: 90, priority: 2 },
      { title: "Onboarding copy for an empty workspace", day: 6, dur: 60 },
      { title: "Keyboard pass over every drag surface", day: 12, dur: 120, priority: 2 },
    ],
    milestones: [
      { title: "Both themes checked end to end", day: -6, done: true },
      { title: "Feature freeze", day: 21 },
      { title: "v1 tagged", day: 37 },
    ],
  },
  {
    key: "beta",
    name: "Public beta",
    brief: "Twenty people using it who did not build it.",
    status: "active", color: "emerald", icon: "launch", goal: "beta",
    start: -10, due: 14,
    tasks: [
      { title: "Waitlist page", day: -7, done: true, dur: 90 },
      { title: "Record the sixty-second demo", day: 2, dur: 120, priority: 3 },
      { title: "Draft the launch post", day: 4, dur: 90 },
      { title: "Write the first-run email", day: 8, dur: 45 },
    ],
    milestones: [{ title: "First twenty invites out", day: 7 }],
  },
  {
    key: "office",
    name: "Rebuild the office corner",
    brief: "A desk I actually want to sit at before winter.",
    status: "paused", color: "brown", icon: "home",
    start: -30, due: null,
    tasks: [
      { title: "Measure the alcove", day: -28, done: true, dur: 30 },
      { title: "Price the desk and the shelf", day: -24, done: true, dur: 45 },
      { title: "Sell the old chair", day: -3, dur: 30 },
      { title: "Order the lamp", day: 9, dur: 20 },
    ],
    milestones: [],
  },
  {
    key: "site",
    name: "Personal site refresh",
    brief: "One page that says what I build, with the writing on it.",
    status: "idea", color: "violet", icon: "design",
    start: null, due: null,
    tasks: [],
    milestones: [],
  },
  {
    key: "khatm",
    name: "Ramadan reading plan",
    brief: "A juz a day, planned before it starts rather than during.",
    status: "done", color: "amber", icon: "book", goal: "juz",
    start: -70, due: -20,
    tasks: [
      { title: "Work out the daily pages", day: -68, done: true, dur: 40 },
      { title: "Put the plan on the calendar", day: -66, done: true, dur: 30 },
      { title: "Print the tracker", day: -60, done: true, dur: 15 },
    ],
    milestones: [{ title: "Khatm", day: -20, done: true }],
  },
];

function seedProjects(ctx: Ctx) {
  const s = store();
  const { today } = ctx;
  const at = (offset: number | null | undefined) =>
    offset == null ? null : addDays(today, offset);

  PROJECTS.forEach((spec, i) => {
    const project = s.insert("projects", {
      name: spec.name,
      description: spec.brief,
      status: spec.status,
      color: spec.color,
      icon: spec.icon,
      start_date: at(spec.start),
      due_date: at(spec.due),
      // `|| null` and not `??`: a goal missing from the registry is the empty
      // string, and an empty string is not a foreign key.
      goal_id: spec.goal ? (ctx.goals[spec.goal] || null) : null,
      order_index: i,
    });
    ctx.projects[spec.key] = project.id;
    ctx.rows++;

    const rows = [
      ...spec.tasks.map((t) => ({ ...t, kind: "task" as TaskKind })),
      ...spec.milestones.map((m) => ({
        ...m, kind: "milestone" as TaskKind, dur: undefined, priority: undefined,
      })),
    ];

    rows.forEach((row, slot) => {
      const date = addDays(today, row.day);
      const done = !!row.done;
      s.addTask({
        title: row.title,
        kind: row.kind,
        date,
        all_day: true,
        duration_min: row.dur ?? null,
        priority: row.priority ?? 0,
        color: spec.color,
        project_id: project.id,
        goal_id: project.goal_id,
        status: done ? "done" : "todo",
        completed_at: done ? stamp(date, H(17, 30) + slot) : null,
      });
      ctx.rows++;
    });
  });
}

function seedHabits(ctx: Ctx) {
  const s = store();
  HABITS.forEach((h, i) => {
    const habit = s.insert("habits", {
      name: h.name, icon: h.icon, color: h.color, cadence: h.cadence,
      weekdays: h.weekdays, times_per_week: h.timesPerWeek,
      target_count: h.target, unit: h.unit, order_index: i,
    });
    ctx.habits[h.key] = habit.id;
    ctx.rows++;
  });
}

/** Was this habit completed on this day? Shared by the logs and the habit-linked tasks. */
function habitDone(index: number, offset: number, rate: number): boolean {
  const recency = offset >= -7 ? 0.1 : offset >= -21 ? 0.04 : 0;
  const slump = offset <= -20 && offset >= -26 ? -0.3 : 0;
  return rand(offset, index, 61) < rate + recency + slump;
}

/** Custom-cadence habits pick their own days; five weekdays out of seven. */
function stepsDay(offset: number, date: string): boolean {
  const dow = weekday(date);
  if (dow === 5) return false;              // Friday is the rest day
  return rand(offset, 3, 62) < 0.86;
}

function seedRoutines(ctx: Ctx) {
  const s = store();
  const { today } = ctx;
  const start = addDays(today, -PAST);
  const until = addDays(today, FUTURE);

  // ---- the daily anchor: every single day in the window has this ----
  const fajr = s.createSeries(
    {
      title: "Fajr, then Qur'an", kind: "block", date: start,
      start_min: H(5, 20), end_min: H(6), all_day: false, duration_min: 40,
      color: "teal", tags: ["ritual", "deen"], priority: 1,
      notes: "Phone stays in the other room until this is done.",
    },
    { freq: "daily", interval: 1, until, count: PAST + FUTURE + 1 },
  );
  ctx.rows += fajr.length;
  settleSeries(fajr, ctx, 0.88);

  // ---- weekday deep work ----
  const deep = s.createSeries(
    {
      title: "Deep work — hardest thing first", kind: "block", date: start,
      start_min: H(8), end_min: H(10), all_day: false, duration_min: 120,
      color: "blue", tags: ["deep"], priority: 3, goal_id: ctx.goals.v1 ?? null,
    },
    { freq: "weekly", interval: 1, weekdays: [1, 2, 3, 4, 5], until, count: 80 },
  );
  ctx.rows += deep.length;
  settleSeries(deep, ctx, 0.82);
  deep.forEach((t) => { if (t.date) ctx.deepWorkByDate.set(t.date, t.id); });

  // ---- standup ----
  const standup = s.createSeries(
    {
      title: "Standup", kind: "event", date: start,
      start_min: H(10, 15), end_min: H(10, 30), all_day: false, duration_min: 15,
      tags: ["meeting"],
    },
    { freq: "weekly", interval: 1, weekdays: [1, 2, 3, 4, 5], until, count: 80 },
  );
  ctx.rows += standup.length;
  settleSeries(standup, ctx, 0.94);

  // ---- gym, tied to the Workout habit so the two agree ----
  const gym = s.createSeries(
    {
      title: "Workout — gym", kind: "habit", date: start,
      start_min: H(18, 30), end_min: H(19, 30), all_day: false, duration_min: 60,
      color: "red", tags: ["health"], habit_id: ctx.habits.workout ?? null,
    },
    { freq: "weekly", interval: 1, weekdays: [1, 3, 5], until, count: 45 },
  );
  ctx.rows += gym.length;
  gym.forEach((t) => {
    if (!t.date || t.date >= ctx.today) return;
    const offset = diffDays(t.date, ctx.today);
    if (habitDone(2, offset, HABITS[2].rate)) {
      s.patch("tasks", t.id, { status: "done", completed_at: stamp(t.date, H(19, 30)) });
    } else if (offset < -STALE_AFTER) {
      s.patch("tasks", t.id, { status: "dropped" });
    }
  });

  // ---- Jumu'ah, every Friday ----
  let firstFriday = start;
  for (let i = 0; i < 7; i++) {
    if (weekday(addDays(start, i)) === 5) { firstFriday = addDays(start, i); break; }
  }
  const jumuah = s.createSeries(
    {
      title: "Jumu'ah", kind: "event", date: firstFriday,
      start_min: H(13), end_min: H(14), all_day: false, duration_min: 60,
      color: "teal", tags: ["deen"], priority: 2,
    },
    { freq: "weekly", interval: 1, weekdays: [5], until, count: 16 },
  );
  ctx.rows += jumuah.length;
  settleSeries(jumuah, ctx, 0.96);

  // ---- weekly review ----
  let firstSunday = start;
  for (let i = 0; i < 7; i++) {
    if (weekday(addDays(start, i)) === 0) { firstSunday = addDays(start, i); break; }
  }
  const review = s.createSeries(
    {
      title: "Weekly review", kind: "block", date: firstSunday,
      start_min: H(17), end_min: H(18), all_day: false, duration_min: 60,
      color: "violet", tags: ["ritual", "review"], priority: 2,
    },
    { freq: "weekly", interval: 1, weekdays: [0], until, count: 16 },
  );
  ctx.rows += review.length;
  settleSeries(review, ctx, 0.72);
}

/** Marks the past occurrences of a series done at the given rate. */
function settleSeries(tasks: Task[], ctx: Ctx, rate: number) {
  const s = store();
  tasks.forEach((t, i) => {
    if (!t.date) return;
    const offset = diffDays(t.date, ctx.today);
    if (offset > 0) return;
    if (offset === 0 && (t.start_min ?? 0) + 20 > ctx.minutesNow) return;
    const quality = dayQuality(t.date, offset);
    if (rand(offset, i, 71) > Math.min(0.98, rate * (0.55 + quality * 0.5))) {
      // A routine you skipped a month ago did not happen — it is not still due.
      if (offset < -STALE_AFTER && rand(offset, i, 72) < 0.88) {
        s.patch("tasks", t.id, { status: "dropped" });
      }
      return;
    }
    s.patch("tasks", t.id, {
      status: "done",
      completed_at: stamp(t.date, t.end_min ?? t.start_min ?? H(18)),
    });
  });
}

function seedBooks(ctx: Ctx) {
  const s = store();
  const { today } = ctx;

  // 1. Finished — its reading blocks are written by hand so they all land in the past.
  const pragmatic = BOOKS[0];
  const finished = s.insert("books", {
    title: pragmatic.title, author: pragmatic.author, total_pages: pragmatic.pages,
    current_page: pragmatic.pages, color: pragmatic.color, status: "finished",
    rating: 5, notes: pragmatic.notes, pages_per_day: 18,
    start_date: addDays(today, -45), end_date: addDays(today, -26), order_index: 0,
  });
  ctx.rows++;

  let page = 0;
  for (let off = -45; off <= -26 && page < pragmatic.pages; off++) {
    const date = addDays(today, off);
    const from = page + 1;
    const to = Math.min(pragmatic.pages, page + 18);
    s.addTask({
      title: `${pragmatic.title} — p.${from}–${to}`,
      kind: "reading", date, book_id: finished.id, page_from: from, page_to: to,
      color: pragmatic.color, duration_min: Math.max(10, Math.round((to - from + 1) * 1.4)),
      tags: ["reading"], status: "done", completed_at: stamp(date, H(22, 30)),
    });
    ctx.rows++;
    page = to;
  }

  // 2 & 3. In progress — the store's own scheduler lays the blocks down.
  const deep = BOOKS[1];
  const deepBook = s.insert("books", {
    title: deep.title, author: deep.author, total_pages: deep.pages,
    current_page: 0, color: deep.color, status: "reading",
    notes: deep.notes, order_index: 1,
  });
  ctx.rows++;
  ctx.rows += s.scheduleBook(deepBook.id, {
    startDate: addDays(today, -25), pagesPerDay: 10, skipWeekdays: [5, 6],
  });
  settleBook(deepBook.id, 0.84, ctx);

  const nectar = BOOKS[2];
  const nectarBook = s.insert("books", {
    title: nectar.title, author: nectar.author, total_pages: nectar.pages,
    current_page: 0, color: nectar.color, status: "reading",
    notes: nectar.notes, order_index: 2,
  });
  ctx.rows++;
  ctx.rows += s.scheduleBook(nectarBook.id, {
    startDate: addDays(today, -40), pagesPerDay: 14, skipWeekdays: [2, 4],
  });
  settleBook(nectarBook.id, 0.78, ctx);

  // 4. Starts in three days — the whole plan sits in the future.
  const thinking = BOOKS[3];
  const thinkingBook = s.insert("books", {
    title: thinking.title, author: thinking.author, total_pages: thinking.pages,
    current_page: 0, color: thinking.color, status: "planned",
    notes: thinking.notes, order_index: 3,
  });
  ctx.rows++;
  ctx.rows += s.scheduleBook(thinkingBook.id, {
    startDate: addDays(today, 3), pagesPerDay: 22, skipWeekdays: [0, 6],
  });
  // The scheduler flips a book to "reading" the moment it lays out a plan. This
  // one has a plan but not a first page, so it goes back on the planned shelf.
  s.patch("books", thinkingBook.id, { status: "planned" });
}

/** Marks a book's past reading blocks done and moves the bookmark to match. */
function settleBook(bookId: string, rate: number, ctx: Ctx) {
  const s = store();
  const blocks = s.tasks
    .filter((t) => t.book_id === bookId && t.date != null && t.date < ctx.today)
    .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));

  let furthest = 0;
  blocks.forEach((t, i) => {
    const offset = diffDays(t.date as string, ctx.today);
    if (rand(offset, i, 81) > rate) {
      if (offset < -STALE_AFTER) s.patch("tasks", t.id, { status: "dropped" });
      return;
    }
    s.patch("tasks", t.id, { status: "done", completed_at: stamp(t.date as string, H(22, 15)) });
    furthest = Math.max(furthest, t.page_to ?? 0);
  });

  if (furthest > 0) s.patch("books", bookId, { current_page: furthest });
}

function seedDays(ctx: Ctx) {
  const { today } = ctx;

  // Fixed story beats first, so a day never doubles up on the same slot.
  ANCHORS.forEach((a, i) => {
    addItem(a.item, addDays(today, a.day), a.day, 900 + i, ctx);
  });
  const anchored = new Set(ANCHORS.map((a) => a.day));

  for (let off = -PAST; off <= FUTURE; off++) {
    const date = addDays(today, off);
    const dow = weekday(date);
    const weekend = dow === 0 || dow === 6;
    const friday = dow === 5;
    const travelling = off >= -23 && off <= -20;
    if (travelling) continue;             // those days already have their own shape

    const busy = anchored.has(off) ? 1 : 0;
    let slot = 0;
    const maybe = (pool: readonly Item[], chance: number, salt: number) => {
      if (rand(off, salt, 91) >= chance) return;
      addItem(pick(pool, off, salt, 92), date, off, slot++, ctx);
    };

    if (weekend) {
      maybe(FAMILY, 0.88 - busy * 0.2, 1);
      maybe(REST, 0.62, 2);
      maybe(DEEN, 0.66, 3);
      maybe(ERRANDS, 0.55, 4);
      maybe(HEALTH, 0.45, 5);
      maybe(CREATIVE, 0.22, 6);
    } else {
      maybe(MEETINGS, 0.7 - busy * 0.25, 1);
      maybe(PROJECT, 0.62 - busy * 0.2, 2);
      maybe(ADMIN, 0.58, 3);
      maybe(DEEN, 0.5, 4);
      maybe(friday ? FAMILY : ERRANDS, 0.42, 5);
      maybe(HEALTH, 0.34, 6);
      maybe(CREATIVE, 0.3, 7);
      maybe(STUDY, 0.26, 8);
    }
  }
}

function seedInbox(ctx: Ctx) {
  const inbox: Item[] = [
    { title: "Look into spaced repetition for the reading plan", tags: ["idea"], color: "orange" },
    { title: "Book the December flights", priority: 2, tags: ["errand"], color: "brown" },
    { title: "Ask Dilnoza about the design review", tags: ["admin"] },
    { title: "Compare the two hosting bills", tags: ["admin"], priority: 1 },
    { title: "Idea: a Ramadan mode for the day view", tags: ["idea"], color: "emerald", notes: "Suhoor and iftar as anchors. Lighter task load. A Qur'an plan that fits the month." },
    { title: "Find a barber that opens before eight", tags: ["errand"], color: "brown" },
    { title: "Read the paper Sanjar sent", tags: ["study"], color: "violet" },
    { title: "Decide on pricing before the beta", priority: 3, tags: ["ship"], color: "emerald", goal: "beta" },
  ];
  inbox.forEach((item, i) => addItem(item, null, 0, 800 + i, ctx));
}

/** Nothing in the window is allowed to be an empty cell. */
function fillEmptyDays(ctx: Ctx) {
  const dates = new Set(store().tasks.map((t) => t.date).filter(Boolean) as string[]);
  for (let off = -PAST; off <= FUTURE; off++) {
    const date = addDays(ctx.today, off);
    if (dates.has(date)) continue;
    addItem(pick(FILLERS, off, 5, 93), date, off, 700, ctx);
  }
}

function seedHabitLogs(ctx: Ctx) {
  const s = store();
  for (let i = 0; i < HABITS.length; i++) {
    const h = HABITS[i];
    const habitId = ctx.habits[h.key];
    if (!habitId) continue;

    for (let off = -59; off <= 0; off++) {
      const date = addDays(ctx.today, off);
      if (h.cadence === "weekly" && !h.weekdays.includes(weekday(date))) continue;
      if (h.cadence === "custom" && !stepsDay(off, date)) continue;
      if (off === 0 && ctx.minutesNow < H(9)) continue;

      const done = habitDone(i, off, h.rate);
      if (h.target > 1) {
        // A multi-count habit records the partial days too — that is the point of it.
        const count = done
          ? h.target
          : Math.floor(rand(off, i, 63) * (h.target - 1)) + 1;
        if (!done && count < 3) continue;
        s.insert("habitLogs", { habit_id: habitId, date, count, logged_at: stamp(date, H(21, 30)) });
        ctx.rows++;
        continue;
      }
      if (!done) continue;
      s.insert("habitLogs", {
        habit_id: habitId, date, count: 1,
        logged_at: stamp(date, h.key === "fajr" ? H(5, 40) : H(21)),
      });
      ctx.rows++;
    }
  }
}

function seedPrayers(ctx: Ctx) {
  const s = store();
  const config = {
    latitude: s.profile?.latitude ?? 41.2995,
    longitude: s.profile?.longitude ?? 69.2401,
    method: s.profile?.calc_method ?? "MuslimWorldLeague",
    madhab: s.profile?.madhab ?? "hanafi",
  };

  for (let off = -PAST; off <= 0; off++) {
    const date = addDays(ctx.today, off);
    const times = prayerTimesFor(date, config);
    const isFriday = weekday(date) === 5;

    PRAYER_NAMES.forEach((name, pi) => {
      if (off === 0 && times[name] > ctx.minutesNow) return;   // not due yet
      if (off < -14 && rand(off, pi, 43) < 0.04) return;       // a day that never got logged

      // How loose the whole day is, then how each prayer fared inside it.
      // Missing one is what breaks a streak, so it has to be genuinely rare on
      // a good day and clustered in the rough weeks — not sprinkled evenly.
      const era = off >= -12 ? 0.45 : off <= -23 && off >= -32 ? 1.9 : 1;
      const looseness = era * (0.5 + rand(off, 0, 44));
      const slip = Math.min(0.5, (name === "fajr" ? 0.17 : 0.07) * looseness);

      const jamaahShare = Math.min(0.92,
        (name === "fajr" ? 0.44 : name === "isha" ? 0.56 : 0.64)
        + (isFriday && name === "dhuhr" ? 0.28 : isFriday ? 0.1 : 0)
        + (off >= -12 ? 0.08 : 0));

      const p = rand(off, pi, 41);
      const kept = 1 - slip;
      const status: PrayerStatus =
        p >= kept
          ? (p < kept + slip * 0.55 ? "late" : p < kept + slip * 0.86 ? "qadha" : "missed")
          : p < kept * jamaahShare ? "jamaah" : "prayed";

      s.insert("prayers", {
        date, name, status,
        logged_at: stamp(date, Math.min(1439, times[name] + 8)),
      });
      ctx.rows++;
    });
  }
}

function seedFocus(ctx: Ctx) {
  const s = store();
  const slots = [H(8, 45), H(10, 25), H(14, 15), H(16, 5), H(21, 10)];

  for (let off = -PAST; off <= 0; off++) {
    const date = addDays(ctx.today, off);
    const dow = weekday(date);
    const weekend = dow === 0 || dow === 6;
    const quality = dayQuality(date, off);
    if (off <= -20 && off >= -23) continue;   // conference days, no deep work

    const roll = rand(off, 0, 51);
    const count = quality < 0.25
      ? (roll < 0.3 ? 1 : 0)                       // the day that fell apart
      : weekend
        ? (roll < 0.42 ? 1 : 0)
        : roll < quality - 0.2 ? 3 : roll < quality + 0.2 ? 2 : 1;

    for (let i = 0; i < count; i++) {
      const start = slots[(i + (weekend ? 4 : 0)) % slots.length] + jitter(off, i + 10, 14);
      const minutes = 25 + Math.round(rand(off, i, 52) * 70);
      if (off === 0 && start + minutes > ctx.minutesNow) continue;

      const pomodoro = rand(off, i, 53) < 0.72;
      const mode: FocusSession["mode"] = pomodoro ? "pomodoro" : "stopwatch";
      const label = pick(FOCUS_LABELS, off, i, 54);
      const linked = i === 0 ? ctx.deepWorkByDate.get(date) ?? null : null;

      s.insert("focusSessions", {
        task_id: linked,
        label,
        mode,
        tags: pomodoro ? ["deep"] : ["admin"],
        started_at: stamp(date, start),
        ended_at: stamp(date, Math.min(1439, start + minutes)),
        seconds: minutes * 60,
        completed: rand(off, i, 55) > 0.13,
        note: rand(off, i, 56) < 0.16 ? "Phone in the other room. It worked." : null,
      });
      ctx.rows++;

      // The break that follows a long pomodoro is worth seeing in the history.
      if (pomodoro && minutes > 55 && rand(off, i, 57) < 0.45) {
        s.insert("focusSessions", {
          label: "Break", mode: "break", tags: [],
          started_at: stamp(date, Math.min(1439, start + minutes)),
          ended_at: stamp(date, Math.min(1439, start + minutes + 10)),
          seconds: 600, completed: true,
        });
        ctx.rows++;
      }
    }
  }
}

function seedDayLogs(ctx: Ctx) {
  const s = store();
  for (let off = -PAST; off <= 0; off++) {
    const date = addDays(ctx.today, off);
    if (off < 0 && rand(off, 0, 101) < 0.22) continue;   // not every day gets written up

    const quality = dayQuality(date, off);
    const mood = Math.max(1, Math.min(5, Math.round(1.6 + quality * 3.2 + (rand(off, 1, 102) - 0.5))));
    const energy = Math.max(1, Math.min(5, Math.round(1.4 + quality * 3.4 + (rand(off, 2, 103) - 0.5))));
    const sleep = Math.round((5.4 + rand(off, 3, 104) * 3.2) * 2) / 2;
    const writeUp = off < 0 && rand(off, 4, 105) < 0.55;

    s.setDayLog(date, {
      mood,
      energy,
      focus_score: Math.max(1, Math.min(5, Math.round(quality * 5))),
      sleep_hours: sleep,
      quran_pages: Math.round(rand(off, 5, 106) * 6),
      water: 3 + Math.round(rand(off, 6, 107) * 6),
      steps: 2800 + Math.round(rand(off, 7, 108) * 11_500),
      highlight: writeUp ? pick(HIGHLIGHTS, off, 8, 109) : null,
      gratitude: writeUp ? pick(GRATITUDE, off, 9, 110) : null,
      note: off < 0 && rand(off, 10, 111) < 0.16
        ? "Slow start, but the afternoon block saved it."
        : null,
    });
    ctx.rows++;
  }
}

function seedReviews(ctx: Ctx) {
  const s = store();
  const lastWeek = startOfWeek(addDays(ctx.today, -7), ctx.weekStart);
  const weekBefore = startOfWeek(addDays(ctx.today, -14), ctx.weekStart);

  s.setReview(lastWeek, {
    went_well: "Two uninterrupted mornings and the calendar grid finally feels right under the hand. Prayed Fajr in jamaah five days out of seven.",
    went_bad: "Lost Wednesday to notifications. Skipped the gym twice and did not write the letter.",
    learned: "The plan only survives contact with reality when it is on the calendar, not in a list. A task without a time is a wish.",
    next_week: "Ship the beta build. Protect 8–10am every single day. Say no to the two meetings I do not need.",
    rating: 4,
  });
  ctx.rows++;

  s.setReview(weekBefore, {
    went_well: "Came back from Istanbul with a page of notes worth acting on. Finished The Pragmatic Programmer.",
    went_bad: "Travel wrecked the routine — three days with no deep work and Fajr slipped badly.",
    learned: "A conference is not a holiday and it is not a work week. Plan it as its own thing next time.",
    next_week: "Rebuild the morning block before anything else. Reading plan back on the calendar.",
    rating: 3,
  });
  ctx.rows++;
}

function seedMap(ctx: Ctx) {
  const s = store();

  const board = s.insert("boards", { name: BOARD_NAME, icon: "network", color: "violet", order_index: 0 });
  ctx.rows++;

  const ids: Record<string, string> = {};
  NODES.forEach((n) => {
    const node = s.insert("nodes", {
      board_id: board.id, title: n.title, body: n.body, kind: n.kind, shape: n.shape,
      x: n.x, y: n.y, w: n.w, h: n.h, color: n.color,
      date: addDays(ctx.today, n.day),
      goal_id: n.goal ? (ctx.goals[n.goal] ?? null) : null,
    });
    ids[n.key] = node.id;
    ctx.rows++;
  });
  EDGES.forEach((e) => {
    if (!ids[e.from] || !ids[e.to]) return;
    s.insert("edges", {
      board_id: board.id, source_id: ids[e.from], target_id: ids[e.to],
      label: e.label, style: e.style, color: e.color,
    });
    ctx.rows++;
  });

  const side = s.insert("boards", { name: SECOND_BOARD_NAME, icon: "book-open", color: "amber", order_index: 1 });
  ctx.rows++;

  const sideIds: Record<string, string> = {};
  SIDE_NODES.forEach((n) => {
    const node = s.insert("nodes", {
      board_id: side.id, title: n.title, body: n.body, kind: n.kind, shape: n.shape,
      x: n.x, y: n.y, w: n.w, h: n.h, color: n.color,
      date: addDays(ctx.today, n.day),
      goal_id: n.goal ? (ctx.goals[n.goal] ?? null) : null,
    });
    sideIds[n.key] = node.id;
    ctx.rows++;
  });
  SIDE_EDGES.forEach((e) => {
    if (!sideIds[e.from] || !sideIds[e.to]) return;
    s.insert("edges", {
      board_id: side.id, source_id: sideIds[e.from], target_id: sideIds[e.to],
      label: e.label, style: e.style, color: e.color,
    });
    ctx.rows++;
  });
}

function seedTemplates(ctx: Ctx) {
  const s = store();
  const templates = [
    { name: "Deep work morning", description: "The block that actually ships things.", icon: "sunrise", color: "blue" as Tint, scope: "day" as const, items: MORNING, use_count: 9 },
    { name: "Friday reset", description: "Close the week properly so Monday starts clean.", icon: "layout-template", color: "violet" as Tint, scope: "day" as const, items: RESET, use_count: 14 },
    { name: "Travel day", description: "Airports, offline work, and one call home.", icon: "plane", color: "orange" as Tint, scope: "day" as const, items: TRAVEL, use_count: 3 },
    { name: "Recovery Sunday", description: "Deliberately empty. Walk, cook, read, no screens.", icon: "sun", color: "emerald" as Tint, scope: "day" as const, items: RECOVERY, use_count: 6 },
    { name: "Study evening", description: "Ninety minutes, three steps, no phone.", icon: "graduation-cap", color: "violet" as Tint, scope: "block" as const, items: STUDY_BLOCK, use_count: 11 },
  ];
  templates.forEach((t, i) => {
    s.insert("templates", { ...t, order_index: i });
    ctx.rows++;
  });
}
