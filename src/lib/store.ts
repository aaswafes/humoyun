"use client";

import { create } from "zustand";
import { supabase } from "./supabase/client";
import {
  TABLE_OF,
  type Accent,
  type Book,
  type Media,
  type Note,
  type Collections,
  type CollectionKey,
  type DayLog,
  type FocusSession,
  type Goal,
  type Habit,
  type HabitLog,
  type MapEdge,
  type MapNode,
  type Board,
  type Prayer,
  type PrayerName,
  type PrayerStatus,
  type Profile,
  type Recurrence,
  type Review,
  type Tag,
  type Task,
  type Template,
  type Tint,
} from "./types";
import { addDays, todayISO, toISO, startOfWeek, weekday } from "./date";
import { SOLO, SOLO_PROFILE, SOLO_USER_ID, loadLocal, saveLocal } from "./local-db";

// =========================================================
// Helpers
// =========================================================
export const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const nowIso = () => new Date().toISOString();

/** Fractional ordering so a drag between two rows never rewrites the list. */
export function orderBetween(before?: number, after?: number): number {
  if (before == null && after == null) return Date.now();
  if (before == null) return (after as number) - 1;
  if (after == null) return before + 1;
  return (before + after) / 2;
}

function nextOrder(items: { order_index: number }[]): number {
  return items.length ? Math.max(...items.map((i) => i.order_index)) + 1 : 0;
}

export interface Toast {
  id: string;
  title: string;
  description?: string;
  tone?: "default" | "success" | "danger";
  action?: { label: string; run: () => void };
}

export type CalendarView = "day" | "week" | "month" | "agenda";

export interface TimerState {
  taskId: string | null;
  label: string;
  mode: "stopwatch" | "pomodoro";
  startedAt: number | null;   // epoch ms of current run segment
  accumulated: number;        // seconds banked from previous segments
  running: boolean;
  targetMinutes: number;      // pomodoro length
  sessionStart: string | null;
}

const EMPTY_TIMER: TimerState = {
  taskId: null,
  label: "",
  mode: "stopwatch",
  startedAt: null,
  accumulated: 0,
  running: false,
  targetMinutes: 25,
  sessionStart: null,
};

const TIMER_KEY = "humoyun.timer";

/**
 * Every Supabase mutation goes through one FIFO chain.
 *
 * Local state is optimistic, so a caller can create a book and eight reading
 * blocks that reference it in the same tick. Fired in parallel, the tasks
 * regularly reached Postgres before the book did and were rejected by
 * tasks_book_id_fkey — leaving a half-scheduled book behind. Serialising the
 * writes makes "created earlier locally" mean "committed earlier remotely",
 * which is exactly the guarantee foreign keys need.
 *
 * The UI never waits on this; it is already showing the optimistic row.
 */
let writeChain: Promise<unknown> = Promise.resolve();

function enqueue<T>(op: () => PromiseLike<T>): Promise<T> {
  const run = writeChain.then(op, op);
  // A failed write must not poison the queue for everything behind it.
  writeChain = run.then(() => undefined, () => undefined);
  return run as Promise<T>;
}

// =========================================================
// Store
// =========================================================
type CollectionState = { [K in CollectionKey]: Collections[K][] };

interface StoreState extends CollectionState {
  ready: boolean;
  loading: boolean;
  userId: string | null;
  email: string | null;
  profile: Profile | null;

  // ---- ui ----
  selectedDate: string;
  calendarView: CalendarView;
  sidebarOpen: boolean;
  commandOpen: boolean;
  inspectorTaskId: string | null;
  hour12: boolean;
  toasts: Toast[];
  timer: TimerState;
  /** Solo mode booted with an empty database and wants the sample week. */
  soloNeedsSeed: boolean;

  // ---- lifecycle ----
  hydrate: (userId: string, email?: string | null) => Promise<void>;
  reset: () => void;

  // ---- generic crud ----
  insert: <K extends CollectionKey>(key: K, row: Partial<Collections[K]>) => Collections[K];
  patch: <K extends CollectionKey>(key: K, id: string, changes: Partial<Collections[K]>) => void;
  remove: <K extends CollectionKey>(key: K, id: string) => void;
  removeWhere: <K extends CollectionKey>(key: K, pred: (row: Collections[K]) => boolean) => void;

  // ---- ui actions ----
  setSelectedDate: (iso: string) => void;
  setCalendarView: (v: CalendarView) => void;
  toggleSidebar: () => void;
  setCommandOpen: (open: boolean) => void;
  openInspector: (taskId: string | null) => void;
  toast: (t: Omit<Toast, "id">) => void;
  dismissToast: (id: string) => void;
  setAccent: (accent: Accent) => void;
  setTheme: (theme: "light" | "dark" | "system") => void;
  updateProfile: (changes: Partial<Profile>) => void;

  // ---- task semantics ----
  addTask: (partial?: Partial<Task>) => Task;
  toggleTask: (id: string) => void;
  moveTask: (id: string, date: string | null, startMin?: number | null) => void;
  duplicateTask: (id: string) => Task | null;
  addSubtask: (parentId: string, title: string) => Task | null;
  createSeries: (base: Partial<Task>, recurrence: Recurrence) => Task[];
  deleteSeries: (seriesId: string, fromDate?: string) => void;

  // ---- habits ----
  logHabit: (habitId: string, date: string, count?: number) => void;
  toggleHabit: (habitId: string, date: string) => void;

  // ---- salah ----
  setPrayer: (date: string, name: PrayerName, status: PrayerStatus) => void;
  cyclePrayer: (date: string, name: PrayerName) => void;

  // ---- day log ----
  setDayLog: (date: string, changes: Partial<DayLog>) => DayLog;

  // ---- reviews ----
  setReview: (weekStart: string, changes: Partial<Review>) => Review;

  // ---- books ----
  scheduleBook: (bookId: string, opts?: {
    startDate?: string;
    pagesPerDay?: number;
    endDate?: string;
    skipWeekdays?: number[];
    replace?: boolean;
  }) => number;
  unscheduleBook: (bookId: string, fromDate?: string) => void;
  scheduleMedia: (mediaId: string, opts?: {
    startDate?: string;
    episodesPerDay?: number;
    endDate?: string;
    skipWeekdays?: number[];
    replace?: boolean;
  }) => number;
  unscheduleMedia: (mediaId: string, fromDate?: string) => void;
  logWatch: (mediaId: string, episode: number) => void;
  logReading: (bookId: string, page: number) => void;

  // ---- templates ----
  applyTemplate: (templateId: string, date: string) => number;
  saveDayAsTemplate: (date: string, name: string) => Template | null;

  // ---- timer ----
  startTimer: (opts?: { taskId?: string | null; label?: string; mode?: "stopwatch" | "pomodoro"; targetMinutes?: number }) => void;
  pauseTimer: () => void;
  resumeTimer: () => void;
  stopTimer: (save?: boolean) => void;
  timerSeconds: () => number;
}

const COLLECTION_KEYS: CollectionKey[] = [
  "tasks", "books", "media", "notes", "habits", "habitLogs", "goals", "boards",
  "nodes", "edges", "templates", "prayers", "dayLogs",
  "focusSessions", "reviews", "tags",
];

/**
 * Which collections actually carry an `updated_at` column. Five of them do not
 * — they timestamp with `logged_at`, `started_at` or `created_at` instead — and
 * stamping one anyway made Postgres reject the write with "could not find the
 * 'updated_at' column ... in the schema cache".
 *
 * This has to be a stated fact rather than something inferred from the cached
 * row: the old code checked `"updated_at" in prev`, but it had already written
 * that key into local state, so the first edit succeeded and every edit after
 * it failed.
 */
const HAS_UPDATED_AT: Record<CollectionKey, boolean> = {
  tasks: true, books: true, media: true, notes: true, habits: true, goals: true, boards: true,
  nodes: true, templates: true, dayLogs: true, reviews: true,
  habitLogs: false, edges: false, prayers: false, focusSessions: false, tags: false,
};

const emptyCollections = () =>
  Object.fromEntries(COLLECTION_KEYS.map((k) => [k, []])) as unknown as CollectionState;

// Defaults applied on insert so callers can pass only what they care about.
function defaultsFor(key: CollectionKey, userId: string): Record<string, unknown> {
  const base = { id: uid(), user_id: userId, created_at: nowIso(), updated_at: nowIso() };
  switch (key) {
    case "tasks":
      return {
        ...base, title: "", notes: null, status: "todo", priority: 0, kind: "task",
        date: null, start_min: null, end_min: null, all_day: true, duration_min: null,
        actual_min: 0, completed_at: null, color: null, icon: null, tags: [], checklist: [],
        order_index: 0, parent_id: null, book_id: null, habit_id: null, goal_id: null,
        node_id: null, template_id: null, page_from: null, page_to: null,
        media_id: null, episode_from: null, episode_to: null,
        recurrence: null, series_id: null,
      };
    case "books":
      return {
        ...base, title: "Untitled", author: null, genre: null, topic: null, series: null,
        cover_url: null, color: "amber",
        total_pages: 100, current_page: 0, pages_per_day: null, start_date: null,
        end_date: null, status: "reading", rating: null, notes: null, order_index: 0,
      };
    case "media":
      return {
        ...base, title: "Untitled", creator: null, kind: "film", genre: null, topic: null,
        series: null, color: "violet", cover_url: null, total_episodes: 1, current_episode: 0,
        episodes_per_day: null, runtime_min: null, start_date: null, end_date: null,
        status: "planned", rating: null, notes: null, order_index: 0,
        url: null, channel: null,
      };
    case "notes":
      return {
        ...base, title: null, body: "", kind: "note", book_id: null, media_id: null,
        task_id: null, goal_id: null, node_id: null, date: null, locator: null,
        tags: [], color: null, pinned: false,
      };
    case "habits":
      return {
        ...base, name: "New habit", icon: "check", color: "emerald", cadence: "daily",
        weekdays: [0, 1, 2, 3, 4, 5, 6], times_per_week: 3, target_count: 1,
        unit: null, archived: false, order_index: 0,
      };
    case "habitLogs":
      return { id: base.id, user_id: userId, habit_id: "", date: todayISO(), count: 1, note: null, logged_at: nowIso() };
    case "goals":
      return {
        ...base, parent_id: null, title: "New goal", description: null, horizon: "month",
        start_date: null, end_date: null, target: null, current: 0, unit: null,
        color: "blue", icon: null, status: "active", order_index: 0,
      };
    case "boards":
      return { ...base, name: "Mind Map", icon: "network", color: "blue", order_index: 0 };
    case "nodes":
      return {
        ...base, board_id: null, title: "Untitled", body: null, x: 0, y: 0, w: 220, h: 120,
        color: "slate", shape: "card", kind: "note", date: null, collapsed: false, goal_id: null,
      };
    case "edges":
      return { id: base.id, user_id: userId, created_at: nowIso(), board_id: null, source_id: "", target_id: "", label: null, style: "solid", color: "slate" };
    case "templates":
      return { ...base, name: "New template", description: null, icon: "layout-template", color: "violet", scope: "day", items: [], use_count: 0, order_index: 0 };
    case "prayers":
      return { id: base.id, user_id: userId, date: todayISO(), name: "fajr", status: "none", logged_at: nowIso() };
    case "dayLogs":
      return {
        ...base, date: todayISO(), mood: null, energy: null, focus_score: null, gratitude: null,
        highlight: null, note: null, quran_pages: 0, water: 0, sleep_hours: null, steps: null, data: {},
      };
    case "focusSessions":
      return { id: base.id, user_id: userId, task_id: null, label: null, tags: [], mode: "stopwatch", started_at: nowIso(), ended_at: null, seconds: 0, completed: false, note: null };
    case "reviews":
      return { ...base, week_start: startOfWeek(todayISO()), went_well: null, went_bad: null, learned: null, next_week: null, rating: null, data: {} };
    case "tags":
      return { id: base.id, user_id: userId, created_at: nowIso(), name: "tag", color: "slate" };
    default:
      return base;
  }
}

function persistTimer(timer: TimerState) {
  try { localStorage.setItem(TIMER_KEY, JSON.stringify(timer)); } catch { /* private mode */ }
}

function restoreTimer(): TimerState {
  try {
    const raw = localStorage.getItem(TIMER_KEY);
    if (!raw) return EMPTY_TIMER;
    const parsed = JSON.parse(raw) as TimerState;
    return { ...EMPTY_TIMER, ...parsed };
  } catch { return EMPTY_TIMER; }
}

/** In solo mode every mutation mirrors the whole store into localStorage. */
function persistSolo(state: StoreState) {
  saveLocal({
    profile: state.profile,
    collections: Object.fromEntries(
      COLLECTION_KEYS.map((k) => [k, state[k]]),
    ) as Record<string, unknown[]>,
    seeded: true,
  });
}

export const useStore = create<StoreState>((set, get) => ({
  ...emptyCollections(),
  ready: false,
  loading: false,
  userId: null,
  email: null,
  profile: null,

  selectedDate: todayISO(),
  calendarView: "month",
  sidebarOpen: true,
  commandOpen: false,
  inspectorTaskId: null,
  hour12: true,
  toasts: [],
  timer: EMPTY_TIMER,
  soloNeedsSeed: false,

  // -------------------------------------------------------
  async hydrate(userId, email) {
    if (get().loading) return;
    set({ loading: true, userId, email: email ?? null });

    if (SOLO) {
      const saved = loadLocal();
      const collections = emptyCollections();
      if (saved?.collections) {
        for (const key of COLLECTION_KEYS) {
          const rows = saved.collections[key];
          if (Array.isArray(rows)) {
            (collections as Record<string, unknown[]>)[key] = rows;
          }
        }
      }
      const profile = saved?.profile ?? SOLO_PROFILE;
      set({
        ...collections,
        profile,
        hour12: (profile.prefs as Record<string, unknown>)?.hour12 !== false,
        timer: restoreTimer(),
        soloNeedsSeed: !saved?.seeded,
        ready: true,
        loading: false,
      });
      return;
    }

    const tables = COLLECTION_KEYS.map((k) => [k, TABLE_OF[k]] as const);
    const [{ data: profile }, ...results] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
      ...tables.map(([, table]) => supabase.from(table).select("*").limit(5000)),
    ]);

    const next: Partial<CollectionState> = {};
    results.forEach((res, i) => {
      const key = tables[i][0];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (next as any)[key] = (res as any).data ?? [];
    });

    let resolvedProfile = profile as Profile | null;
    if (!resolvedProfile) {
      const row = {
        id: userId,
        display_name: email?.split("@")[0] ?? "You",
        city: "Tashkent", latitude: 41.2995, longitude: 69.2401,
        timezone: "Asia/Tashkent", calc_method: "MuslimWorldLeague", madhab: "hanafi",
        week_start: 1, theme: "system", accent: "blue", prefs: {},
      };
      const { data } = await supabase.from("profiles").upsert(row).select().maybeSingle();
      resolvedProfile = (data as Profile) ?? (row as unknown as Profile);
    }

    set({
      ...(next as CollectionState),
      profile: resolvedProfile,
      hour12: (resolvedProfile?.prefs as Record<string, unknown>)?.hour12 !== false,
      timer: restoreTimer(),
      ready: true,
      loading: false,
    });
  },

  reset() {
    set({ ...emptyCollections(), ready: false, userId: null, email: null, profile: null, timer: EMPTY_TIMER });
  },

  // -------------------------------------------------------
  // Generic optimistic CRUD
  // -------------------------------------------------------
  insert(key, row) {
    const userId = get().userId;
    if (!userId) throw new Error("Not signed in");
    const full = { ...defaultsFor(key, userId), ...row } as unknown as Collections[typeof key];
    set((s) => ({ [key]: [...(s[key] as unknown[]), full] } as unknown as Partial<StoreState>));

    if (SOLO) { persistSolo(get()); return full; }

    enqueue(() => supabase.from(TABLE_OF[key]).insert(full as object)).then(({ error }) => {
      if (error) {
        set((s) => ({
          [key]: (s[key] as { id: string }[]).filter((r) => r.id !== (full as { id: string }).id),
        } as unknown as Partial<StoreState>));
        get().toast({ title: "Couldn't save", description: error.message, tone: "danger" });
      }
    });
    return full;
  },

  patch(key, id, changes) {
    const list = get()[key] as { id: string }[];
    const prev = list.find((r) => r.id === id);
    if (!prev) return;
    const stamped = HAS_UPDATED_AT[key];
    const merged = stamped
      ? { ...prev, ...changes, updated_at: nowIso() }
      : { ...prev, ...changes };
    set((s) => ({
      [key]: (s[key] as { id: string }[]).map((r) => (r.id === id ? merged : r)),
    } as unknown as Partial<StoreState>));

    if (SOLO) { persistSolo(get()); return; }

    const payload = { ...changes } as Record<string, unknown>;
    if (stamped) payload.updated_at = (merged as { updated_at: string }).updated_at;
    enqueue(() => supabase.from(TABLE_OF[key]).update(payload).eq("id", id)).then(({ error }) => {
      if (error) {
        set((s) => ({
          [key]: (s[key] as { id: string }[]).map((r) => (r.id === id ? prev : r)),
        } as unknown as Partial<StoreState>));
        get().toast({ title: "Couldn't update", description: error.message, tone: "danger" });
      }
    });
  },

  remove(key, id) {
    const list = get()[key] as { id: string }[];
    const prev = list.find((r) => r.id === id);
    if (!prev) return;
    set((s) => ({
      [key]: (s[key] as { id: string }[]).filter((r) => r.id !== id),
    } as unknown as Partial<StoreState>));

    if (SOLO) { persistSolo(get()); return; }

    enqueue(() => supabase.from(TABLE_OF[key]).delete().eq("id", id)).then(({ error }) => {
      if (error) {
        set((s) => ({ [key]: [...(s[key] as unknown[]), prev] } as unknown as Partial<StoreState>));
        get().toast({ title: "Couldn't delete", description: error.message, tone: "danger" });
      }
    });
  },

  removeWhere(key, pred) {
    const victims = (get()[key] as Collections[typeof key][]).filter(pred);
    victims.forEach((v) => get().remove(key, (v as { id: string }).id));
  },

  // -------------------------------------------------------
  // UI
  // -------------------------------------------------------
  setSelectedDate: (iso) => set({ selectedDate: iso }),
  setCalendarView: (v) => set({ calendarView: v }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setCommandOpen: (open) => set({ commandOpen: open }),
  openInspector: (taskId) => set({ inspectorTaskId: taskId }),

  toast(t) {
    const id = uid();
    set((s) => ({ toasts: [...s.toasts, { ...t, id }] }));
    setTimeout(() => get().dismissToast(id), t.tone === "danger" ? 6000 : 3600);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  setAccent(accent) {
    document.documentElement.setAttribute("data-accent", accent);
    get().updateProfile({ accent });
  },

  setTheme(theme) {
    const root = document.documentElement;
    const dark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    root.classList.toggle("dark", dark);
    try { localStorage.setItem("humoyun.theme", theme); } catch { /* noop */ }
    get().updateProfile({ theme });
  },

  updateProfile(changes) {
    const profile = get().profile;
    if (!profile) return;
    const merged = { ...profile, ...changes };
    set({ profile: merged });
    if (SOLO) { persistSolo(get()); return; }
    enqueue(() => supabase.from("profiles").update(changes as object).eq("id", profile.id)).then(({ error }) => {
      if (error) set({ profile });
    });
  },

  // -------------------------------------------------------
  // Tasks
  // -------------------------------------------------------
  addTask(partial = {}) {
    const siblings = get().tasks.filter(
      (t) => t.date === (partial.date ?? null) && t.parent_id === (partial.parent_id ?? null),
    );
    return get().insert("tasks", { order_index: nextOrder(siblings), ...partial });
  },

  toggleTask(id) {
    const task = get().tasks.find((t) => t.id === id);
    if (!task) return;
    const done = task.status === "done";
    get().patch("tasks", id, {
      status: done ? "todo" : "done",
      completed_at: done ? null : nowIso(),
    });

    // A reading block completing moves the bookmark forward.
    if (!done && task.book_id && task.page_to) {
      const book = get().books.find((b) => b.id === task.book_id);
      if (book && task.page_to > book.current_page) {
        get().patch("books", book.id, {
          current_page: Math.min(task.page_to, book.total_pages),
          status: task.page_to >= book.total_pages ? "finished" : book.status,
        });
      }
    }
    if (!done && task.media_id && task.episode_to) {
      const item = get().media.find((m) => m.id === task.media_id);
      if (item && task.episode_to > item.current_episode) {
        get().patch("media", item.id, {
          current_episode: Math.min(task.episode_to, item.total_episodes),
          status: task.episode_to >= item.total_episodes ? "finished" : item.status,
        });
      }
    }
    // A habit block completing writes the habit log.
    if (!done && task.habit_id && task.date) get().logHabit(task.habit_id, task.date);
  },

  moveTask(id, date, startMin) {
    const changes: Partial<Task> = { date };
    if (startMin !== undefined) {
      changes.start_min = startMin;
      changes.all_day = startMin == null;
      const task = get().tasks.find((t) => t.id === id);
      if (startMin != null && task) {
        const span = task.end_min != null && task.start_min != null
          ? task.end_min - task.start_min
          : (task.duration_min ?? 60);
        changes.end_min = Math.min(1439, startMin + span);
      }
    }
    get().patch("tasks", id, changes);
  },

  duplicateTask(id) {
    const task = get().tasks.find((t) => t.id === id);
    if (!task) return null;
    const { id: _id, created_at: _c, updated_at: _u, ...rest } = task;
    void _id; void _c; void _u;
    return get().addTask({ ...rest, status: "todo", completed_at: null, actual_min: 0 });
  },

  addSubtask(parentId, title) {
    const parent = get().tasks.find((t) => t.id === parentId);
    if (!parent) return null;
    return get().addTask({ title, parent_id: parentId, date: parent.date, kind: "task" });
  },

  createSeries(base, recurrence) {
    const seriesId = uid();
    const start = base.date ?? todayISO();
    const limit = recurrence.count ?? 60;
    const until = recurrence.until ?? addDays(start, 365);
    const created: Task[] = [];
    let cursor = start;
    let made = 0;
    let guard = 0;

    while (made < limit && cursor <= until && guard++ < 800) {
      const dow = weekday(cursor);
      const matches =
        recurrence.freq === "daily" ||
        (recurrence.freq === "weekly" && (recurrence.weekdays?.length ? recurrence.weekdays.includes(dow) : true)) ||
        (recurrence.freq === "monthly" && Number(cursor.slice(8)) === Number(start.slice(8)));

      if (matches) {
        created.push(get().addTask({ ...base, date: cursor, series_id: seriesId, recurrence }));
        made++;
      }
      cursor = recurrence.freq === "monthly" && matches ? addDays(cursor, 28) : addDays(cursor, 1);
    }
    return created;
  },

  deleteSeries(seriesId, fromDate) {
    get().removeWhere("tasks", (t) =>
      (t as Task).series_id === seriesId && (!fromDate || ((t as Task).date ?? "") >= fromDate));
  },

  // -------------------------------------------------------
  // Habits
  // -------------------------------------------------------
  logHabit(habitId, date, count = 1) {
    const existing = get().habitLogs.find((l) => l.habit_id === habitId && l.date === date);
    if (existing) get().patch("habitLogs", existing.id, { count, logged_at: nowIso() });
    else get().insert("habitLogs", { habit_id: habitId, date, count });
  },

  toggleHabit(habitId, date) {
    const existing = get().habitLogs.find((l) => l.habit_id === habitId && l.date === date);
    const habit = get().habits.find((h) => h.id === habitId);
    const target = habit?.target_count ?? 1;
    if (!existing) { get().insert("habitLogs", { habit_id: habitId, date, count: 1 }); return; }
    if (existing.count < target) { get().patch("habitLogs", existing.id, { count: existing.count + 1 }); return; }
    get().remove("habitLogs", existing.id);
  },

  // -------------------------------------------------------
  // Salah
  // -------------------------------------------------------
  setPrayer(date, name, status) {
    const existing = get().prayers.find((p) => p.date === date && p.name === name);
    if (existing) get().patch("prayers", existing.id, { status, logged_at: nowIso() });
    else get().insert("prayers", { date, name, status });
  },

  cyclePrayer(date, name) {
    const cycle: PrayerStatus[] = ["none", "prayed", "jamaah", "qadha"];
    const existing = get().prayers.find((p) => p.date === date && p.name === name);
    const idx = cycle.indexOf(existing?.status ?? "none");
    get().setPrayer(date, name, cycle[(idx + 1) % cycle.length]);
  },

  // -------------------------------------------------------
  // Day log / reviews
  // -------------------------------------------------------
  setDayLog(date, changes) {
    const existing = get().dayLogs.find((d) => d.date === date);
    if (existing) { get().patch("dayLogs", existing.id, changes); return { ...existing, ...changes }; }
    return get().insert("dayLogs", { date, ...changes });
  },

  setReview(weekStart, changes) {
    const existing = get().reviews.find((r) => r.week_start === weekStart);
    if (existing) { get().patch("reviews", existing.id, changes); return { ...existing, ...changes }; }
    return get().insert("reviews", { week_start: weekStart, ...changes });
  },

  // -------------------------------------------------------
  // Books — the drag-onto-calendar auto-scheduler
  // -------------------------------------------------------
  scheduleBook(bookId, opts = {}) {
    const book = get().books.find((b) => b.id === bookId);
    if (!book) return 0;

    const start = opts.startDate ?? book.start_date ?? todayISO();
    const skip = opts.skipWeekdays ?? [];
    const remaining = Math.max(0, book.total_pages - book.current_page);
    if (!remaining) return 0;

    // Working days available between start and an explicit end date decide the rate.
    let perDay = opts.pagesPerDay ?? book.pages_per_day ?? 0;
    const endDate = opts.endDate ?? null;
    if (!perDay && endDate) {
      let days = 0;
      let cur = start;
      let guard = 0;
      while (cur <= endDate && guard++ < 2000) {
        if (!skip.includes(weekday(cur))) days++;
        cur = addDays(cur, 1);
      }
      perDay = Math.max(1, Math.ceil(remaining / Math.max(1, days)));
    }
    if (!perDay) perDay = 30;

    if (opts.replace !== false) get().unscheduleBook(bookId, start);

    let page = book.current_page;
    let cursor = start;
    let created = 0;
    let guard = 0;

    while (page < book.total_pages && guard++ < 1200) {
      if (skip.includes(weekday(cursor))) { cursor = addDays(cursor, 1); continue; }
      const from = page + 1;
      const to = Math.min(book.total_pages, page + perDay);
      get().addTask({
        title: `${book.title} — p.${from}–${to}`,
        kind: "reading",
        date: cursor,
        book_id: book.id,
        page_from: from,
        page_to: to,
        color: book.color,
        duration_min: Math.max(10, Math.round((to - from + 1) * 1.4)),
        tags: ["reading"],
      });
      page = to;
      cursor = addDays(cursor, 1);
      created++;
    }

    get().patch("books", bookId, {
      pages_per_day: perDay,
      start_date: start,
      end_date: addDays(cursor, -1),
      status: "reading",
    });
    return created;
  },

  scheduleMedia(mediaId, opts = {}) {
    const item = get().media.find((m) => m.id === mediaId);
    if (!item) return 0;

    const start = opts.startDate ?? item.start_date ?? todayISO();
    const skip = opts.skipWeekdays ?? [];
    const remaining = Math.max(0, item.total_episodes - item.current_episode);
    if (!remaining) return 0;

    // A film is one sitting: one block, no rate, whatever the caller passed.
    const single = item.total_episodes <= 1;
    let perDay = single ? 1 : (opts.episodesPerDay ?? item.episodes_per_day ?? 0);

    const endDate = opts.endDate ?? null;
    if (!single && !perDay && endDate) {
      let days = 0;
      let cur = start;
      let guard = 0;
      while (cur <= endDate && guard++ < 2000) {
        if (!skip.includes(weekday(cur))) days++;
        cur = addDays(cur, 1);
      }
      perDay = Math.max(1, Math.ceil(remaining / Math.max(1, days)));
    }
    if (!perDay) perDay = 1;

    if (opts.replace !== false) get().unscheduleMedia(mediaId, start);

    let episode = item.current_episode;
    let cursor = start;
    let created = 0;
    let guard = 0;

    while (episode < item.total_episodes && guard++ < 1200) {
      if (skip.includes(weekday(cursor))) { cursor = addDays(cursor, 1); continue; }
      const from = episode + 1;
      const to = Math.min(item.total_episodes, episode + perDay);
      const count = to - from + 1;
      get().addTask({
        title: single
          ? item.title
          : `${item.title} — ${count > 1 ? `ep. ${from}–${to}` : `ep. ${from}`}`,
        kind: "watching",
        date: cursor,
        media_id: item.id,
        episode_from: from,
        episode_to: to,
        color: item.color,
        duration_min: item.runtime_min ? item.runtime_min * count : null,
        tags: [item.kind],
      });
      episode = to;
      cursor = addDays(cursor, 1);
      created++;
    }

    get().patch("media", mediaId, {
      episodes_per_day: single ? null : perDay,
      start_date: start,
      end_date: addDays(cursor, -1),
      status: "watching",
    });
    return created;
  },

  unscheduleMedia(mediaId, fromDate) {
    const cut = fromDate ?? todayISO();
    get().removeWhere("tasks", (t) => {
      const task = t as Task;
      return task.media_id === mediaId && task.status !== "done" && (task.date ?? "") >= cut;
    });
  },

  logWatch(mediaId, episode) {
    const item = get().media.find((m) => m.id === mediaId);
    if (!item) return;
    const next = Math.max(0, Math.min(episode, item.total_episodes));
    get().patch("media", mediaId, {
      current_episode: next,
      status: next >= item.total_episodes
        ? "finished"
        : item.status === "finished" ? "watching" : item.status,
    });
  },

  unscheduleBook(bookId, fromDate) {
    const cut = fromDate ?? todayISO();
    get().removeWhere("tasks", (t) => {
      const task = t as Task;
      return task.book_id === bookId && task.status !== "done" && (task.date ?? "") >= cut;
    });
  },

  logReading(bookId, page) {
    const book = get().books.find((b) => b.id === bookId);
    if (!book) return;
    get().patch("books", bookId, {
      current_page: Math.max(0, Math.min(page, book.total_pages)),
      status: page >= book.total_pages ? "finished" : book.status === "finished" ? "reading" : book.status,
    });
  },

  // -------------------------------------------------------
  // Templates
  // -------------------------------------------------------
  applyTemplate(templateId, date) {
    const template = get().templates.find((t) => t.id === templateId);
    if (!template) return 0;
    let count = 0;
    template.items.forEach((item, i) => {
      const target = addDays(date, item.day_offset ?? 0);
      get().addTask({
        title: item.title,
        kind: item.kind ?? "task",
        date: target,
        start_min: item.start_min ?? null,
        end_min: item.end_min ?? null,
        all_day: item.start_min == null,
        duration_min: item.duration_min ?? null,
        priority: item.priority ?? 0,
        color: item.color ?? template.color,
        icon: item.icon ?? null,
        tags: item.tags ?? [],
        notes: item.notes ?? null,
        checklist: item.checklist ?? [],
        template_id: template.id,
        order_index: i,
      });
      count++;
    });
    get().patch("templates", templateId, { use_count: template.use_count + 1 });
    return count;
  },

  saveDayAsTemplate(date, name) {
    const items = get().tasks
      .filter((t) => t.date === date && !t.parent_id)
      .sort((a, b) => a.order_index - b.order_index)
      .map((t) => ({
        title: t.title, kind: t.kind, day_offset: 0,
        start_min: t.start_min, end_min: t.end_min, duration_min: t.duration_min,
        priority: t.priority, color: t.color, icon: t.icon, tags: t.tags,
        notes: t.notes, checklist: t.checklist,
      }));
    if (!items.length) return null;
    return get().insert("templates", { name, scope: "day", items });
  },

  // -------------------------------------------------------
  // Focus timer
  // -------------------------------------------------------
  startTimer(opts = {}) {
    const current = get().timer;
    if (current.running || current.accumulated > 0) get().stopTimer(true);
    const timer: TimerState = {
      taskId: opts.taskId ?? null,
      label: opts.label ?? "",
      mode: opts.mode ?? "stopwatch",
      startedAt: Date.now(),
      accumulated: 0,
      running: true,
      targetMinutes: opts.targetMinutes ?? 25,
      sessionStart: nowIso(),
    };
    set({ timer });
    persistTimer(timer);
  },

  pauseTimer() {
    const t = get().timer;
    if (!t.running || !t.startedAt) return;
    const timer: TimerState = {
      ...t,
      accumulated: t.accumulated + Math.floor((Date.now() - t.startedAt) / 1000),
      startedAt: null,
      running: false,
    };
    set({ timer });
    persistTimer(timer);
  },

  resumeTimer() {
    const t = get().timer;
    if (t.running) return;
    const timer: TimerState = { ...t, startedAt: Date.now(), running: true };
    set({ timer });
    persistTimer(timer);
  },

  stopTimer(save = true) {
    const t = get().timer;
    const seconds = t.accumulated + (t.running && t.startedAt ? Math.floor((Date.now() - t.startedAt) / 1000) : 0);
    if (save && seconds >= 20) {
      get().insert("focusSessions", {
        task_id: t.taskId,
        label: t.label || null,
        mode: t.mode,
        started_at: t.sessionStart ?? nowIso(),
        ended_at: nowIso(),
        seconds,
        completed: t.mode === "pomodoro" ? seconds >= t.targetMinutes * 60 : true,
      });
      if (t.taskId) {
        const task = get().tasks.find((x) => x.id === t.taskId);
        if (task) get().patch("tasks", task.id, { actual_min: task.actual_min + Math.round(seconds / 60) });
      }
      get().toast({ title: "Session logged", description: `${Math.round(seconds / 60)} minutes of focus.`, tone: "success" });
    }
    set({ timer: EMPTY_TIMER });
    persistTimer(EMPTY_TIMER);
  },

  timerSeconds() {
    const t = get().timer;
    return t.accumulated + (t.running && t.startedAt ? Math.floor((Date.now() - t.startedAt) / 1000) : 0);
  },
}));

// =========================================================
// Derived selectors — plain functions so components stay lean.
// =========================================================
export function tasksOn(tasks: Task[], date: string): Task[] {
  return tasks
    .filter((t) => t.date === date && !t.parent_id)
    .sort((a, b) => {
      if (a.all_day !== b.all_day) return a.all_day ? 1 : -1;
      if (!a.all_day && !b.all_day) return (a.start_min ?? 0) - (b.start_min ?? 0);
      return a.order_index - b.order_index;
    });
}

export function subtasksOf(tasks: Task[], parentId: string): Task[] {
  return tasks.filter((t) => t.parent_id === parentId).sort((a, b) => a.order_index - b.order_index);
}

export function inboxTasks(tasks: Task[]): Task[] {
  return tasks.filter((t) => !t.date && !t.parent_id && t.status !== "done")
    .sort((a, b) => a.order_index - b.order_index);
}

export function overdueTasks(tasks: Task[], today = todayISO()): Task[] {
  return tasks.filter((t) => t.date && t.date < today && t.status !== "done" && t.status !== "dropped" && !t.parent_id)
    .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
}

export function completionOn(tasks: Task[], date: string): { done: number; total: number } {
  const list = tasks.filter((t) => t.date === date && !t.parent_id && t.status !== "dropped");
  return { done: list.filter((t) => t.status === "done").length, total: list.length };
}

export function habitStreak(logs: HabitLog[], habitId: string, upTo = todayISO()): number {
  const set = new Set(logs.filter((l) => l.habit_id === habitId).map((l) => l.date));
  let streak = 0;
  let cursor = upTo;
  if (!set.has(cursor)) cursor = addDays(cursor, -1); // today still open
  while (set.has(cursor) && streak < 3650) { streak++; cursor = addDays(cursor, -1); }
  return streak;
}

export function prayerStreak(prayers: Prayer[], upTo = todayISO()): number {
  const byDate = new Map<string, number>();
  prayers.forEach((p) => {
    if (p.status === "prayed" || p.status === "jamaah" || p.status === "late") {
      byDate.set(p.date, (byDate.get(p.date) ?? 0) + 1);
    }
  });
  let streak = 0;
  let cursor = upTo;
  if ((byDate.get(cursor) ?? 0) < 5) cursor = addDays(cursor, -1);
  while ((byDate.get(cursor) ?? 0) >= 5 && streak < 3650) { streak++; cursor = addDays(cursor, -1); }
  return streak;
}

export function focusMinutesOn(sessions: FocusSession[], date: string): number {
  return Math.round(
    sessions
      .filter((s) => toISO(new Date(s.started_at)) === date)
      .reduce((sum, s) => sum + s.seconds, 0) / 60,
  );
}

export type {
  Task, Book, Media, Note, Habit, HabitLog, Goal, Board, MapNode, MapEdge,
  Template, Prayer, DayLog, FocusSession, Review, Tag, Profile, Tint,
};
