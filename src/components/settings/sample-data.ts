"use client";

import { useStore, uid } from "@/lib/store";
import { addDays, fromISO, startOfWeek, todayISO, weekday } from "@/lib/date";
import { prayerTimesFor } from "@/lib/prayer";
import {
  PRAYER_NAMES,
  type FocusSession,
  type MapEdge,
  type MapNode,
  type PrayerStatus,
  type TaskKind,
  type TemplateItem,
  type Tint,
} from "@/lib/types";

const H = (h: number, m = 0) => h * 60 + m;

/** Deterministic 0..1 noise, so the demo week looks organic but never changes. */
function noise(seed: number): number {
  const x = Math.sin(seed) * 10_000;
  return x - Math.floor(x);
}

/** A timestamp at a given minute of a given local day. */
function stamp(iso: string, minutes: number): string {
  const d = fromISO(iso);
  d.setHours(Math.floor(minutes / 60), Math.round(minutes) % 60, 0, 0);
  return d.toISOString();
}

interface TaskSeed {
  day: number;
  title: string;
  kind?: TaskKind;
  start?: number;
  end?: number;
  duration?: number;
  priority?: number;
  color?: Tint;
  tags?: string[];
  notes?: string;
  done?: boolean;
  checklist?: string[];
  subtasks?: string[];
}

const TASKS: TaskSeed[] = [
  { day: -2, title: "Rewrite the landing hero", start: H(9), end: H(10, 30), priority: 2, color: "blue", tags: ["deep"], done: true },
  { day: -1, title: "Clear the three open threads", duration: 30, tags: ["admin"], done: true },
  { day: -1, title: "Swim", start: H(19), end: H(20), color: "teal", tags: ["health"], done: true },

  { day: 0, title: "Morning review — inbox to zero", start: H(8), end: H(8, 20), color: "violet", tags: ["ritual"], done: true },
  {
    day: 0,
    title: "Deep work: finish the settings surface",
    start: H(9), end: H(11, 30), priority: 3, color: "blue", tags: ["deep"],
    notes: "Phone in the drawer. One tab. No music with words in it.",
    checklist: ["Theme picker", "Live prayer times", "Export and import"],
  },
  { day: 0, title: "Standup", kind: "event", start: H(11, 45), end: H(12), tags: ["meeting"] },
  { day: 0, title: "Gym — push day", start: H(18), duration: 60, color: "red", tags: ["health"] },

  {
    day: 1, title: "Draft the Q4 plan", start: H(9, 30), duration: 90, priority: 2, color: "blue",
    subtasks: ["Pull last quarter's numbers", "Write the one-page summary"],
  },
  { day: 1, title: "Call with Aziz", kind: "event", start: H(15), end: H(15, 30), tags: ["meeting"] },

  { day: 2, title: "Grocery run", color: "brown", tags: ["errand"] },
  { day: 2, title: "Write the weekly letter", start: H(10), duration: 60, color: "amber", tags: ["writing"] },

  { day: 3, title: "Dentist", kind: "event", start: H(14), end: H(15), priority: 2 },
  { day: 3, title: "Review pull requests", duration: 45, tags: ["admin"] },

  { day: 4, title: "Cut the first beta build", kind: "milestone", priority: 3, color: "emerald", tags: ["ship"] },

  { day: 5, title: "Family day — no screens", color: "pink" },
  { day: 6, title: "Plan next week", start: H(20), duration: 45, color: "violet", tags: ["ritual"] },
  { day: 7, title: "Send invoices", start: H(11), duration: 30, tags: ["admin"] },
  { day: 8, title: "Barber", kind: "event", start: H(16), end: H(16, 45) },
  { day: 9, title: "Quarterly goal check-in", start: H(9), duration: 60, priority: 2, color: "emerald", tags: ["review"] },
];

const INBOX: TaskSeed[] = [
  { day: 0, title: "Look into spaced repetition for the reading plan", tags: ["idea"] },
  { day: 0, title: "Book December flights", priority: 2, tags: ["errand"] },
  { day: 0, title: "Ask Dilnoza about the design review", tags: ["admin"] },
];

const HABITS: { name: string; icon: string; color: Tint; cadence: "daily" | "weekly"; weekdays: number[]; rate: number }[] = [
  { name: "Fajr in jamaah", icon: "moon", color: "teal", cadence: "daily", weekdays: [0, 1, 2, 3, 4, 5, 6], rate: 0.86 },
  { name: "Read 20 pages", icon: "book-open", color: "amber", cadence: "daily", weekdays: [0, 1, 2, 3, 4, 5, 6], rate: 0.74 },
  { name: "Workout", icon: "dumbbell", color: "red", cadence: "weekly", weekdays: [1, 3, 5], rate: 0.82 },
  { name: "Journal", icon: "pen-line", color: "violet", cadence: "daily", weekdays: [0, 1, 2, 3, 4, 5, 6], rate: 0.62 },
];

interface NodeSeed {
  key: string;
  title: string;
  body: string | null;
  kind: MapNode["kind"];
  shape: MapNode["shape"];
  x: number; y: number; w: number; h: number;
  color: Tint;
  day: number;
}

const NODES: NodeSeed[] = [
  { key: "v1", title: "Humoyun v1", body: "Calendar first. Five surfaces that earn their place.", kind: "project", shape: "card", x: 60, y: 60, w: 230, h: 120, color: "blue", day: 21 },
  { key: "beta", title: "Public beta", body: null, kind: "milestone", shape: "diamond", x: 390, y: 80, w: 180, h: 100, color: "emerald", day: 45 },
  { key: "essay", title: "Write the launch essay", body: "Why a calendar, and not another list.", kind: "note", shape: "sticky", x: 70, y: 270, w: 210, h: 110, color: "amber", day: 12 },
  { key: "who", title: "Who is this actually for?", body: null, kind: "question", shape: "pill", x: 380, y: 300, w: 210, h: 70, color: "pink", day: 6 },
  { key: "read", title: "Finish Deep Work", body: null, kind: "idea", shape: "card", x: 680, y: 70, w: 190, h: 90, color: "violet", day: 8 },
  { key: "run", title: "Half marathon", body: "March. Twelve-week block starts in December.", kind: "goal", shape: "circle", x: 700, y: 250, w: 170, h: 170, color: "red", day: 120 },
];

const EDGES: { from: string; to: string; label: string | null; style: MapEdge["style"]; color: Tint }[] = [
  { from: "v1", to: "beta", label: "then", style: "solid", color: "blue" },
  { from: "v1", to: "essay", label: "needs", style: "solid", color: "amber" },
  { from: "essay", to: "who", label: null, style: "dashed", color: "pink" },
  { from: "read", to: "v1", label: "feeds", style: "dotted", color: "violet" },
  { from: "who", to: "beta", label: "blocks", style: "dashed", color: "emerald" },
];

const MORNING: TemplateItem[] = [
  { title: "Fajr + Qur'an", kind: "block", start_min: H(5, 20), end_min: H(6), color: "teal" },
  { title: "Walk, no phone", kind: "task", start_min: H(7), end_min: H(7, 30), color: "emerald" },
  { title: "Deep work — hardest thing first", kind: "block", start_min: H(8), end_min: H(10), priority: 3, color: "blue", tags: ["deep"] },
  { title: "Tea, stand up, look out a window", kind: "task", start_min: H(10), end_min: H(10, 20) },
  { title: "Deep work — second block", kind: "block", start_min: H(10, 20), end_min: H(12), priority: 2, color: "blue", tags: ["deep"] },
];

const RESET: TemplateItem[] = [
  { title: "Inbox to zero", kind: "task", duration_min: 20, color: "violet" },
  { title: "Jumu'ah", kind: "event", start_min: H(13), end_min: H(14), color: "teal" },
  { title: "Read the week back", kind: "task", start_min: H(16), end_min: H(16, 30), color: "amber" },
  { title: "Weekly review", kind: "block", start_min: H(16, 30), end_min: H(17, 30), priority: 2, color: "violet", tags: ["review"] },
  { title: "Plan Monday", kind: "task", start_min: H(17, 30), end_min: H(18) },
  { title: "Call family", kind: "task", start_min: H(20), end_min: H(20, 30), color: "pink" },
];

const FOCUS: { back: number; start: number; minutes: number; label: string; mode: FocusSession["mode"]; tags: string[] }[] = [
  { back: 6, start: H(9), minutes: 52, label: "Landing hero", mode: "pomodoro", tags: ["deep"] },
  { back: 5, start: H(9, 30), minutes: 75, label: "Calendar grid", mode: "pomodoro", tags: ["deep"] },
  { back: 4, start: H(14), minutes: 41, label: "Inbox triage", mode: "stopwatch", tags: ["admin"] },
  { back: 3, start: H(8, 40), minutes: 96, label: "Store rewrite", mode: "pomodoro", tags: ["deep"] },
  { back: 1, start: H(10), minutes: 64, label: "Settings surface", mode: "pomodoro", tags: ["deep"] },
  { back: 0, start: H(9), minutes: 48, label: "Settings surface", mode: "pomodoro", tags: ["deep"] },
];

const DAY_LOGS: { back: number; mood: number; energy: number; sleep: number; quran: number; water: number; highlight: string; gratitude: string }[] = [
  { back: 4, mood: 4, energy: 3, sleep: 6.5, quran: 3, water: 6, highlight: "Shipped the calendar grid.", gratitude: "Quiet morning, no meetings." },
  { back: 3, mood: 3, energy: 3, sleep: 7, quran: 2, water: 5, highlight: "Long walk with Dad.", gratitude: "Rain finally." },
  { back: 2, mood: 5, energy: 4, sleep: 8, quran: 4, water: 8, highlight: "Two clean deep work blocks.", gratitude: "Health." },
  { back: 1, mood: 4, energy: 4, sleep: 7.5, quran: 3, water: 7, highlight: "Fixed the drag-and-drop bug.", gratitude: "Good coffee, good friends." },
];

/**
 * Seeds a believable demo week. Everything goes through the store's normal
 * writes, so it persists exactly like data the user typed in themselves.
 * Returns the number of rows created.
 */
export function loadSampleData(): number {
  const s = useStore.getState();
  const today = todayISO();
  const weekStart = s.profile?.week_start ?? 1;
  let rows = 0;

  // ---- tasks ----
  const addSeed = (seed: TaskSeed, date: string | null) => {
    const end = seed.end ?? (seed.start != null && seed.duration != null ? seed.start + seed.duration : null);
    const task = s.addTask({
      title: seed.title,
      kind: seed.kind ?? "task",
      date,
      start_min: seed.start ?? null,
      end_min: end,
      all_day: seed.start == null,
      duration_min: seed.duration ?? (seed.start != null && end != null ? end - seed.start : null),
      priority: seed.priority ?? 0,
      color: seed.color ?? null,
      tags: seed.tags ?? [],
      notes: seed.notes ?? null,
      status: seed.done ? "done" : "todo",
      completed_at: seed.done && date ? stamp(date, end ?? H(18)) : null,
      checklist: (seed.checklist ?? []).map((text, i) => ({ id: uid(), text, done: i === 0 })),
    });
    rows++;
    (seed.subtasks ?? []).forEach((title) => {
      if (s.addSubtask(task.id, title)) rows++;
    });
  };

  TASKS.forEach((seed) => addSeed(seed, addDays(today, seed.day)));
  INBOX.forEach((seed) => addSeed(seed, null));

  // Jumu'ah lands on the coming Friday, wherever that falls in the demo week.
  let fridayOffset = 5;
  for (let i = 0; i < 7; i++) {
    if (weekday(addDays(today, i)) === 5) { fridayOffset = i; break; }
  }
  addSeed(
    { day: fridayOffset, title: "Jumu'ah", kind: "event", start: H(13), end: H(14), color: "teal", tags: ["salah"] },
    addDays(today, fridayOffset),
  );

  // ---- books, each with a real reading schedule on the calendar ----
  const deepWork = s.insert("books", {
    title: "Deep Work", author: "Cal Newport", total_pages: 296, current_page: 96,
    color: "blue", status: "reading", order_index: 0,
    notes: "Rule 1 is the whole book. The rest is footnotes.",
  });
  rows++;
  rows += s.scheduleBook(deepWork.id, { startDate: today, pagesPerDay: 25 });

  const nectar = s.insert("books", {
    title: "The Sealed Nectar", author: "S. al-Mubarakpuri", total_pages: 440, current_page: 210,
    color: "emerald", status: "reading", order_index: 1,
  });
  rows++;
  rows += s.scheduleBook(nectar.id, { startDate: today, pagesPerDay: 30, skipWeekdays: [5] });

  // ---- habits + three weeks of history ----
  HABITS.forEach((h, hi) => {
    const habit = s.insert("habits", {
      name: h.name, icon: h.icon, color: h.color, cadence: h.cadence,
      weekdays: h.weekdays, times_per_week: h.weekdays.length, target_count: 1, order_index: hi,
    });
    rows++;

    for (let back = 20; back >= 0; back--) {
      const date = addDays(today, -back);
      if (!h.weekdays.includes(weekday(date))) continue;
      // Recent days lean a little truer, so today's streaks read as alive.
      const threshold = back < 4 ? Math.min(0.95, h.rate + 0.12) : h.rate;
      if (noise(hi * 97 + back * 13 + 1) >= threshold) continue;
      s.insert("habitLogs", { habit_id: habit.id, date, count: 1, logged_at: stamp(date, H(21)) });
      rows++;
    }
  });

  // ---- prayers, the last two weeks ----
  const config = {
    latitude: s.profile?.latitude ?? 41.2995,
    longitude: s.profile?.longitude ?? 69.2401,
    method: s.profile?.calc_method ?? "MuslimWorldLeague",
    madhab: s.profile?.madhab ?? "hanafi",
  };
  const clock = new Date();
  const minutesNow = clock.getHours() * 60 + clock.getMinutes();

  for (let back = 13; back >= 0; back--) {
    const date = addDays(today, -back);
    const times = prayerTimesFor(date, config);
    PRAYER_NAMES.forEach((name, pi) => {
      if (back === 0 && times[name] > minutesNow) return; // never log a prayer that has not come yet
      const p = noise(back * 31 + pi * 7 + 2);
      const status: PrayerStatus = p < 0.5 ? "jamaah" : p < 0.85 ? "prayed" : p < 0.95 ? "late" : "qadha";
      s.insert("prayers", { date, name, status, logged_at: stamp(date, times[name] + 5) });
      rows++;
    });
  }

  // ---- goals ----
  const year = today.slice(0, 4);
  const northStar = s.insert("goals", {
    title: "Build something people open every morning",
    description: "Not a side project. A thing with users who would miss it.",
    horizon: "year", color: "violet",
    start_date: `${year}-01-01`, end_date: `${year}-12-31`, order_index: 0,
  });
  rows++;
  s.insert("goals", {
    parent_id: northStar.id, title: "Ship Humoyun v1", horizon: "quarter",
    target: 100, current: 64, unit: "%", color: "blue",
    start_date: today, end_date: addDays(today, 74), order_index: 1,
  });
  s.insert("goals", {
    title: "Read 24 books", horizon: "year", target: 24, current: 9, unit: "books",
    color: "amber", start_date: `${year}-01-01`, end_date: `${year}-12-31`, order_index: 2,
  });
  s.insert("goals", {
    title: "Memorise Juz Amma", horizon: "year", target: 37, current: 21, unit: "surahs",
    color: "emerald", start_date: `${year}-01-01`, end_date: `${year}-12-31`, order_index: 3,
  });
  s.insert("goals", {
    title: "Run 100 km", horizon: "month", target: 100, current: 38, unit: "km",
    color: "red", start_date: `${today.slice(0, 8)}01`, end_date: addDays(today, 20), order_index: 4,
  });
  rows += 4;

  // ---- mind map ----
  const board = s.insert("boards", { name: "Life Map", icon: "network", color: "violet", order_index: 0 });
  rows++;

  const nodeIds: Record<string, string> = {};
  NODES.forEach((n) => {
    const node = s.insert("nodes", {
      board_id: board.id, title: n.title, body: n.body, kind: n.kind, shape: n.shape,
      x: n.x, y: n.y, w: n.w, h: n.h, color: n.color, date: addDays(today, n.day),
    });
    nodeIds[n.key] = node.id;
    rows++;
  });
  EDGES.forEach((e) => {
    s.insert("edges", {
      board_id: board.id, source_id: nodeIds[e.from], target_id: nodeIds[e.to],
      label: e.label, style: e.style, color: e.color,
    });
    rows++;
  });

  // ---- templates ----
  s.insert("templates", {
    name: "Deep work morning",
    description: "The block that actually ships things.",
    icon: "sunrise", color: "blue", scope: "day", items: MORNING, use_count: 4, order_index: 0,
  });
  s.insert("templates", {
    name: "Friday reset",
    description: "Close the week properly so Monday starts clean.",
    icon: "layout-template", color: "violet", scope: "day", items: RESET, use_count: 11, order_index: 1,
  });
  rows += 2;

  // ---- focus history, day logs, last week's review ----
  FOCUS.forEach((f) => {
    const date = addDays(today, -f.back);
    s.insert("focusSessions", {
      label: f.label, mode: f.mode, tags: f.tags,
      started_at: stamp(date, f.start), ended_at: stamp(date, f.start + f.minutes),
      seconds: f.minutes * 60, completed: true,
    });
    rows++;
  });

  DAY_LOGS.forEach((d) => {
    s.setDayLog(addDays(today, -d.back), {
      mood: d.mood, energy: d.energy, sleep_hours: d.sleep,
      quran_pages: d.quran, water: d.water,
      highlight: d.highlight, gratitude: d.gratitude,
    });
    rows++;
  });

  s.setReview(startOfWeek(addDays(today, -7), weekStart), {
    went_well: "Two uninterrupted mornings. The calendar grid finally feels right.",
    went_bad: "Lost Wednesday to notifications. Skipped the gym twice.",
    learned: "The plan survives contact with reality only if it is on the calendar, not in a list.",
    next_week: "Ship the beta build. Protect 8-11am every single day.",
    rating: 4,
  });
  rows++;

  return rows;
}
