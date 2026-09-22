import { UMR_CATEGORIES, type UmrCategory } from "./types";
import type {
  Book, FocusSession, Habit, HabitLog, Media, Prayer, Task, TaskKind, Tint, UmrLog,
} from "./types";

export { UMR_CATEGORIES };
export type { UmrCategory, UmrLog };

// =========================================================
// Umr — a lifetime, counted.
//
// Five kinds of living. Every minute this app knows about belongs to one of
// them, and the whole section exists to answer one question honestly: where
// is the life actually going?
//
// Dam is capped at a share of taʼlim. Ten minutes of study buys one minute of
// amusement. That rule is the reason everything here funnels through ONE
// ledger: if study time and game time were counted by two different pieces of
// code, the cap would drift and mean nothing. Every surface — the Umr page,
// its stats, Today, the timer — calls into this file and nowhere else.
//
// Almost nothing here is stored. Focus sessions, minutes on tasks, prayers and
// habit ticks are already rows; Umr reads them. Only two things are written:
// the category on a task or a habit, and `umr_logs` for the minutes nothing
// else records — sleep, meals, a commute, an hour on the phone.
// =========================================================

export interface UmrMeta {
  /** The name, which is the same in both languages — these are the words he uses. */
  label: string;
  /** What it means, for the person who has to decide where a thing goes. */
  gloss: string;
  /** Examples, so the boundary between xordiq and dam is never a guess. */
  examples: string;
  tint: Tint;
}

export const UMR_META: Record<UmrCategory, UmrMeta> = {
  talim: {
    label: "Taʼlim",
    gloss: "Learning",
    examples: "study, reading, courses, practice, anything that leaves you abler than it found you",
    tint: "blue",
  },
  ibodat: {
    label: "Ibodat",
    gloss: "Worship",
    examples: "salah, Qurʼan, dhikr, duʼa, religious study",
    tint: "emerald",
  },
  xordiq: {
    label: "Xordiq",
    gloss: "Restoring yourself",
    examples: "sleep, meals, exercise, a walk, chores — the upkeep a body needs",
    tint: "teal",
  },
  dam: {
    label: "Dam",
    gloss: "Amusement",
    examples: "games, films, scrolling — the hours you would not miss",
    tint: "orange",
  },
  inson: {
    label: "Inson",
    gloss: "People",
    examples: "family, friends, guests, calls, helping someone",
    tint: "violet",
  },
};

export function isUmrCategory(v: unknown): v is UmrCategory {
  return typeof v === "string" && (UMR_CATEGORIES as string[]).includes(v);
}

// ---------------------------------------------------------
// Settings
//
// All of it rides in `profiles.prefs.umr`, so changing a rule never needs a
// migration. Only the per-row category and the manual ledger are columns.
// ---------------------------------------------------------

export type DamWindow = "day" | "week";

export interface UmrPrefs {
  /** Dam earned per minute of taʼlim. 0.1 is the rule he set: ten to one. */
  damRatio: number;
  /** Whether the budget is settled each day or across the week. */
  damWindow: DamWindow;
  /** What one prayer is worth. Nobody stopwatches salah, so this is declared. */
  prayerMinutes: number;
  /** Whether a qadha prayer counts the same as one prayed on time. */
  countQadha: boolean;
  /** Fallback category by task kind, used when a task says nothing itself. */
  kindRules: Partial<Record<TaskKind, UmrCategory>>;
  /** Tag beats kind: `#quran` on a task is a stronger signal than "task". */
  tagRules: Record<string, UmrCategory>;
  /** Minutes one habit tick is worth, by habit id. Absent means it costs none. */
  habitMinutes: Record<string, number>;
  /** Where `day_logs.sleep_hours` lands, or null to leave sleep out entirely. */
  sleepCategory: UmrCategory | null;
}

export const DEFAULT_UMR: UmrPrefs = {
  damRatio: 0.1,
  damWindow: "day",
  prayerMinutes: 10,
  countQadha: true,
  kindRules: {
    reading: "talim",
    watching: "dam",
    prayer: "ibodat",
  },
  tagRules: {},
  habitMinutes: {},
  sleepCategory: "xordiq",
};

const KEY = "umr";

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function num(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

/** Prefs arrive as `unknown` from a jsonb column, so nothing is trusted. */
export function parseUmrPrefs(prefs: Record<string, unknown> | undefined | null): UmrPrefs {
  const raw = isRecord(prefs) ? prefs[KEY] : undefined;
  if (!isRecord(raw)) return DEFAULT_UMR;

  const kindRules: Partial<Record<TaskKind, UmrCategory>> = {};
  if (isRecord(raw.kindRules)) {
    for (const [k, v] of Object.entries(raw.kindRules)) {
      if (isUmrCategory(v)) kindRules[k as TaskKind] = v;
    }
  }

  const tagRules: Record<string, UmrCategory> = {};
  if (isRecord(raw.tagRules)) {
    for (const [k, v] of Object.entries(raw.tagRules)) {
      if (isUmrCategory(v)) tagRules[k.toLowerCase()] = v;
    }
  }

  const habitMinutes: Record<string, number> = {};
  if (isRecord(raw.habitMinutes)) {
    for (const [k, v] of Object.entries(raw.habitMinutes)) {
      const m = num(v, 0);
      if (m > 0) habitMinutes[k] = Math.round(m);
    }
  }

  return {
    // A ratio of 0 would mean no Dam is ever earned, which is a legitimate
    // choice; anything above 1 is not a budget any more, so it is refused.
    damRatio: Math.min(1, Math.max(0, num(raw.damRatio, DEFAULT_UMR.damRatio))),
    damWindow: raw.damWindow === "week" ? "week" : "day",
    prayerMinutes: Math.min(120, Math.max(0, Math.round(num(raw.prayerMinutes, DEFAULT_UMR.prayerMinutes)))),
    countQadha: raw.countQadha !== false,
    kindRules: Object.keys(kindRules).length ? kindRules : DEFAULT_UMR.kindRules,
    tagRules,
    habitMinutes,
    sleepCategory: raw.sleepCategory === null
      ? null
      : isUmrCategory(raw.sleepCategory) ? raw.sleepCategory : DEFAULT_UMR.sleepCategory,
  };
}

/** Merge a change back into the whole prefs bag, ready for `updateProfile`. */
export function writeUmrPrefs(
  prefs: Record<string, unknown> | undefined | null,
  changes: Partial<UmrPrefs>,
): Record<string, unknown> {
  const base = isRecord(prefs) ? prefs : {};
  return { ...base, [KEY]: { ...parseUmrPrefs(base), ...changes } };
}

// ---------------------------------------------------------
// Which kind of living a row belongs to
//
// One function, so five surfaces can never disagree. The order is what a
// person would expect: what the row says about itself beats a rule about its
// tags, which beats a rule about its kind, which beats what it is linked to.
// ---------------------------------------------------------

export interface UmrIndex {
  prefs: UmrPrefs;
  bookById: Map<string, Book>;
  mediaById: Map<string, Media>;
  habitById: Map<string, Habit>;
  taskById: Map<string, Task>;
}

export function buildUmrIndex(
  prefs: UmrPrefs,
  books: Book[],
  media: Media[],
  habits: Habit[],
  tasks: Task[],
): UmrIndex {
  return {
    prefs,
    bookById: new Map(books.map((b) => [b.id, b])),
    mediaById: new Map(media.map((m) => [m.id, m])),
    habitById: new Map(habits.map((h) => [h.id, h])),
    taskById: new Map(tasks.map((t) => [t.id, t])),
  };
}

export function habitCategory(habit: Habit | undefined, prefs: UmrPrefs): UmrCategory | null {
  void prefs;
  return habit && isUmrCategory(habit.umr) ? habit.umr : null;
}

/**
 * The category of a task, or null when nobody has said. Null is deliberate —
 * the Umr page lists exactly the unresolved rows so they can be triaged, and
 * guessing would hide them behind a number that looks settled.
 */
export function taskCategory(task: Task, index: UmrIndex): UmrCategory | null {
  if (isUmrCategory(task.umr)) return task.umr;

  for (const tag of task.tags) {
    const hit = index.prefs.tagRules[tag.toLowerCase()];
    if (hit) return hit;
  }

  if (task.habit_id) {
    const fromHabit = habitCategory(index.habitById.get(task.habit_id), index.prefs);
    if (fromHabit) return fromHabit;
  }

  const byKind = index.prefs.kindRules[task.kind];
  if (byKind) return byKind;

  // A block scheduled off a book or a title inherits from what it is about,
  // even when its kind is the generic "task".
  if (task.book_id && index.bookById.has(task.book_id)) return "talim";
  if (task.media_id && index.mediaById.has(task.media_id)) return "dam";

  // A subtask is part of its parent's work, so it answers the same way.
  if (task.parent_id) {
    const parent = index.taskById.get(task.parent_id);
    if (parent && !parent.parent_id) return taskCategory(parent, index);
  }

  return null;
}

/**
 * Every kind a sitting belongs to.
 *
 * What the sitting says about itself wins: the Focus dial asks before the clock
 * starts, so this is the usual answer and nothing downstream has to guess. Only
 * a sitting that says nothing — one started from a task row — falls back to the
 * task, its tags and the kind rules, and that fallback can only ever name one.
 */
export function sessionCategories(session: FocusSession, index: UmrIndex): UmrCategory[] {
  const own = (session.umr_kinds ?? []).filter(isUmrCategory);
  if (own.length) return [...new Set(own)];

  // A break is time off, whatever the task under it was.
  if (session.mode === "break") return ["xordiq"];

  if (session.task_id) {
    const task = index.taskById.get(session.task_id);
    if (task) {
      const hit = taskCategory(task, index);
      if (hit) return [hit];
    }
  }
  for (const tag of session.tags) {
    const hit = index.prefs.tagRules[tag.toLowerCase()];
    if (hit) return [hit];
  }
  return [];
}

/** The first of them, for the one or two places that can only draw one. */
export function sessionCategory(session: FocusSession, index: UmrIndex): UmrCategory | null {
  return sessionCategories(session, index)[0] ?? null;
}

/**
 * Divide `minutes` between `n` shares, losing nothing.
 *
 * Plain division leaves a remainder that either vanishes or gets counted twice,
 * and the whole ledger rests on every minute being counted exactly once. The
 * remainder goes to the earliest shares, one each, so 25 minutes across two
 * kinds is 13 and 12 rather than 12.5 twice or 12 and 12.
 */
export function splitMinutes(minutes: number, n: number): number[] {
  if (n <= 0) return [];
  const base = Math.floor(minutes / n);
  let rest = minutes - base * n;
  return Array.from({ length: n }, () => base + (rest-- > 0 ? 1 : 0));
}

// ---------------------------------------------------------
// The ledger
// ---------------------------------------------------------

export type UmrSource = "session" | "task" | "prayer" | "habit" | "sleep" | "manual";

export interface UmrEntry {
  id: string;
  date: string;
  /** null when nothing has said which kind of living this was. */
  category: UmrCategory | null;
  minutes: number;
  label: string;
  source: UmrSource;
  /** the row this came from, so a surface can offer to fix it */
  sourceId: string | null;
  /** minutes past midnight when it is known, for the hour profile */
  startMin: number | null;
}

export interface LedgerInput {
  days: string[];
  tasks: Task[];
  sessions: FocusSession[];
  prayers: Prayer[];
  habits: Habit[];
  habitLogs: HabitLog[];
  umrLogs: UmrLog[];
  sleepHoursByDate?: Map<string, number>;
  index: UmrIndex;
}

const localDay = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso.slice(0, 10)
    : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const localStartMin = (iso: string): number | null => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.getHours() * 60 + d.getMinutes();
};

/**
 * Every minute, once.
 *
 * The overlap that matters: stopping a timer credits `task.actual_min`, so a
 * task and its sessions describe the same minutes. Sessions win — they carry
 * a clock time, which the hour profile needs — and the task contributes only
 * the remainder it can prove beyond them. Taking the larger of the two, the
 * way the Stats page does for a single figure, would double-count here.
 */
export function buildLedger(input: LedgerInput): UmrEntry[] {
  const { days, tasks, sessions, prayers, habitLogs, umrLogs, index } = input;
  const inRange = new Set(days);
  const out: UmrEntry[] = [];

  // ---- tracked sittings ----
  const sessionMinutesByTask = new Map<string, number>();
  for (const s of sessions) {
    // A sitting the store bothered to log is worth at least a minute. Plain
    // rounding dropped anything under thirty seconds, so the Focus page said
    // "1m logged" and Umr said nothing happened at all.
    const minutes = Math.max(s.seconds > 0 ? 1 : 0, Math.round(s.seconds / 60));
    if (minutes <= 0) continue;
    if (s.task_id) {
      sessionMinutesByTask.set(s.task_id, (sessionMinutesByTask.get(s.task_id) ?? 0) + minutes);
    }
    const date = localDay(s.started_at);
    if (!inRange.has(date)) continue;
    const task = s.task_id ? index.taskById.get(s.task_id) : undefined;
    const label = s.label?.trim() || task?.title?.trim() || "Focus";
    const startMin = localStartMin(s.started_at);
    const kinds = sessionCategories(s, index);

    if (kinds.length <= 1) {
      out.push({
        id: `fs-${s.id}`,
        date,
        category: kinds[0] ?? null,
        minutes,
        label,
        source: "session",
        sourceId: s.id,
        startMin,
      });
      continue;
    }

    // An hour that was two things at once is half an hour of each. The shares
    // add back up to the minute, so the day still totals what it should.
    const shares = splitMinutes(minutes, kinds.length);
    kinds.forEach((category, i) => {
      if (shares[i] <= 0) return;
      out.push({
        id: `fs-${s.id}-${category}`,
        date,
        category,
        minutes: shares[i],
        label,
        source: "session",
        sourceId: s.id,
        startMin,
      });
    });
  }

  // ---- minutes written on a task by hand ----
  for (const t of tasks) {
    if (t.deleted_at) continue;
    const residual = Math.round(t.actual_min ?? 0) - (sessionMinutesByTask.get(t.id) ?? 0);
    if (residual <= 0) continue;
    const date = t.date ?? (t.completed_at ? localDay(t.completed_at) : null);
    if (!date || !inRange.has(date)) continue;
    out.push({
      id: `tk-${t.id}`,
      date,
      category: taskCategory(t, index),
      minutes: residual,
      label: t.title || "Untitled task",
      source: "task",
      sourceId: t.id,
      startMin: t.start_min,
    });
  }

  // ---- prayers ----
  // Declared minutes, not measured ones — and the UI says so. A prayer takes
  // the time it takes; pretending to measure it would be the dishonest part.
  const { prayerMinutes, countQadha } = index.prefs;
  if (prayerMinutes > 0) {
    for (const p of prayers) {
      if (!inRange.has(p.date)) continue;
      const counts = p.status === "prayed" || p.status === "jamaah" || p.status === "late"
        || (countQadha && p.status === "qadha");
      if (!counts) continue;
      out.push({
        id: `pr-${p.id}`,
        date: p.date,
        category: "ibodat",
        minutes: prayerMinutes,
        label: p.name.charAt(0).toUpperCase() + p.name.slice(1),
        source: "prayer",
        sourceId: p.id,
        startMin: localStartMin(p.logged_at),
      });
    }
  }

  // ---- habit ticks worth minutes ----
  for (const log of habitLogs) {
    if (!inRange.has(log.date)) continue;
    const per = index.prefs.habitMinutes[log.habit_id] ?? 0;
    if (per <= 0) continue;
    const habit = index.habitById.get(log.habit_id);
    const category = habitCategory(habit, index.prefs);
    out.push({
      id: `hb-${log.id}`,
      date: log.date,
      category,
      minutes: per * Math.max(1, log.count),
      label: habit?.name ?? "Habit",
      source: "habit",
      sourceId: log.habit_id,
      startMin: null,
    });
  }

  // ---- sleep, from the day log ----
  const sleepCategory = index.prefs.sleepCategory;
  if (sleepCategory && input.sleepHoursByDate) {
    for (const [date, hours] of input.sleepHoursByDate) {
      if (!inRange.has(date) || !(hours > 0)) continue;
      out.push({
        id: `sl-${date}`,
        date,
        category: sleepCategory,
        minutes: Math.round(hours * 60),
        label: "Sleep",
        source: "sleep",
        sourceId: null,
        startMin: null,
      });
    }
  }

  // ---- what only you can say ----
  for (const log of umrLogs) {
    if (!inRange.has(log.date) || log.minutes <= 0) continue;
    out.push({
      id: `um-${log.id}`,
      date: log.date,
      category: log.category,
      minutes: log.minutes,
      label: log.label?.trim() || UMR_META[log.category].label,
      source: "manual",
      sourceId: log.id,
      startMin: log.start_min,
    });
  }

  return out;
}

// ---------------------------------------------------------
// Totals
// ---------------------------------------------------------

export type UmrTotals = Record<UmrCategory, number>;

export const ZERO_TOTALS = (): UmrTotals => ({
  talim: 0, ibodat: 0, xordiq: 0, dam: 0, inson: 0,
});

export interface UmrDay {
  date: string;
  totals: UmrTotals;
  /** minutes nothing has categorised yet */
  unassigned: number;
  /** every category added up, unassigned included */
  accounted: number;
}

export function totalsOf(entries: UmrEntry[]): { totals: UmrTotals; unassigned: number } {
  const totals = ZERO_TOTALS();
  let unassigned = 0;
  for (const e of entries) {
    if (e.category) totals[e.category] += e.minutes;
    else unassigned += e.minutes;
  }
  return { totals, unassigned };
}

export function sumTotals(t: UmrTotals): number {
  return UMR_CATEGORIES.reduce((n, c) => n + t[c], 0);
}

export function buildDays(days: string[], entries: UmrEntry[]): UmrDay[] {
  const byDate = new Map<string, UmrEntry[]>();
  for (const e of entries) {
    const list = byDate.get(e.date);
    if (list) list.push(e);
    else byDate.set(e.date, [e]);
  }
  return days.map((date) => {
    const { totals, unassigned } = totalsOf(byDate.get(date) ?? []);
    return { date, totals, unassigned, accounted: sumTotals(totals) + unassigned };
  });
}

/** The whole day, so "unaccounted" is a number rather than a shrug. */
export const MINUTES_IN_DAY = 1440;

// ---------------------------------------------------------
// The Dam budget — the rule the section was built for
// ---------------------------------------------------------

export interface DamBalance {
  /** taʼlim minutes inside the window */
  earned: number;
  /** what that buys, at the ratio */
  budget: number;
  /** dam minutes already spent inside the window */
  spent: number;
  /** budget − spent; negative is a debt, and is shown as one */
  left: number;
  /** 0–1 for the meter, clamped; over budget pins at 1 */
  used: number;
  over: boolean;
  ratio: number;
  window: DamWindow;
}

export function damBalance(talimMinutes: number, damMinutes: number, prefs: UmrPrefs): DamBalance {
  const budget = Math.floor(talimMinutes * prefs.damRatio);
  const left = budget - damMinutes;
  return {
    earned: talimMinutes,
    budget,
    spent: damMinutes,
    left,
    used: budget > 0 ? Math.min(1, damMinutes / budget) : damMinutes > 0 ? 1 : 0,
    over: left < 0,
    ratio: prefs.damRatio,
    window: prefs.damWindow,
  };
}

/** How much taʼlim would have to be done to afford `minutes` more of dam. */
export function talimNeededFor(minutes: number, prefs: UmrPrefs): number {
  if (prefs.damRatio <= 0) return Infinity;
  return Math.ceil(minutes / prefs.damRatio);
}

/** "1 min of dam per 10 min of taʼlim" — the rule, in words. */
export function ratioPhrase(prefs: UmrPrefs): string {
  if (prefs.damRatio <= 0) return "Dam earns nothing — the cap is off";
  const per = Math.round(1 / prefs.damRatio);
  return `1 minute of Dam per ${per} ${per === 1 ? "minute" : "minutes"} of Taʼlim`;
}
