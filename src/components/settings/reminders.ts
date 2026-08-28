"use client";

// =========================================================
// Reminders.
//
// A single module-level ticker, started once per browser tab. It reads the
// store directly rather than subscribing, so it costs one pass every thirty
// seconds and nothing at all when notifications are off.
//
// Everything here is local: the browser's own Notification API, prayer times
// calculated on the device, tasks already in memory. Nothing is sent anywhere
// and there is no server pushing anything — reminders arrive while Humoyun is
// open in a tab, which the Notifications pane says plainly.
// =========================================================

import { useStore } from "@/lib/store";
import { addDays, formatTime, startOfWeek, todayISO } from "@/lib/date";
import { prayerTimesFor } from "@/lib/prayer";
import { buildLogIndex, habitScheduledOn, isHabitComplete } from "@/lib/habits";
import { PRAYER_LABELS, PRAYER_NAMES } from "@/lib/types";

export interface NotificationPrefs {
  enabled: boolean;
  /** Minutes before a timed task. 0 turns task reminders off. */
  taskLead: number;
  /** Minutes before the adhan. 0 turns prayer reminders off. */
  prayerLead: number;
  /** Minute of day for the morning plan, or null. */
  dailyPlan: number | null;
  /** Minute of day for the unfinished-habits nudge, or null. */
  habitNudge: number | null;
  /** A nudge on the last evening of the week if the review is still empty. */
  weeklyReview: boolean;
  quietFrom: number;
  quietTo: number;
  silent: boolean;
}

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  enabled: false,
  taskLead: 10,
  prayerLead: 10,
  dailyPlan: 8 * 60,
  habitNudge: 20 * 60,
  weeklyReview: true,
  quietFrom: 22 * 60 + 30,
  quietTo: 6 * 60,
  silent: false,
};

const PREF_KEY = "notifications";
const FIRED_KEY = "humoyun.reminders.fired";
const TICK_MS = 30_000;
const MAX_PER_TICK = 3;
const WEEKLY_REVIEW_MINUTE = 18 * 60;

// ---------------------------------------------------------
// Prefs
// ---------------------------------------------------------
const num = (v: unknown, fallback: number, min: number, max: number) => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
};

/** prefs is untyped JSON from the database, so every field is re-validated here. */
export function readNotificationPrefs(prefs: Record<string, unknown> | undefined): NotificationPrefs {
  const raw = (prefs?.[PREF_KEY] ?? {}) as Record<string, unknown>;
  const d = DEFAULT_NOTIFICATION_PREFS;
  return {
    enabled: raw.enabled === true,
    taskLead: num(raw.taskLead, d.taskLead, 0, 120),
    prayerLead: num(raw.prayerLead, d.prayerLead, 0, 60),
    dailyPlan: raw.dailyPlan === null ? null : num(raw.dailyPlan, d.dailyPlan ?? 480, 0, 1439),
    habitNudge: raw.habitNudge === null ? null : num(raw.habitNudge, d.habitNudge ?? 1200, 0, 1439),
    weeklyReview: raw.weeklyReview !== false,
    quietFrom: num(raw.quietFrom, d.quietFrom, 0, 1439),
    quietTo: num(raw.quietTo, d.quietTo, 0, 1439),
    silent: raw.silent === true,
  };
}

export function writeNotificationPrefs(changes: Partial<NotificationPrefs>) {
  const s = useStore.getState();
  const prefs = (s.profile?.prefs ?? {}) as Record<string, unknown>;
  const next = { ...readNotificationPrefs(prefs), ...changes };
  s.updateProfile({ prefs: { ...prefs, [PREF_KEY]: next } });
  return next;
}

// ---------------------------------------------------------
// Browser plumbing
// ---------------------------------------------------------
export type PermissionState = "unsupported" | "default" | "granted" | "denied";

export function notificationPermission(): PermissionState {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission as PermissionState;
}

export async function requestNotificationPermission(): Promise<PermissionState> {
  if (notificationPermission() === "unsupported") return "unsupported";
  let next: PermissionState;
  try {
    next = (await Notification.requestPermission()) as PermissionState;
  } catch {
    next = notificationPermission();
  }
  publishPermission(next);
  return next;
}

// ---------------------------------------------------------
// Permission as an external store.
//
// The browser owns this value and can change it from its own settings while
// the tab sits open, so components read it through useSyncExternalStore rather
// than copying it into React state on mount.
// ---------------------------------------------------------
const permissionListeners = new Set<() => void>();
let cachedPermission: PermissionState | null = null;

function refreshPermission() {
  publishPermission(notificationPermission());
}

function publishPermission(next: PermissionState) {
  if (cachedPermission === next) return;
  cachedPermission = next;
  permissionListeners.forEach((fn) => fn());
}

export function subscribePermission(fn: () => void) {
  permissionListeners.add(fn);
  if (permissionListeners.size === 1 && typeof document !== "undefined") {
    document.addEventListener("visibilitychange", refreshPermission);
  }
  return () => {
    permissionListeners.delete(fn);
    if (permissionListeners.size === 0 && typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", refreshPermission);
    }
  };
}

export function permissionSnapshot(): PermissionState {
  if (cachedPermission == null) cachedPermission = notificationPermission();
  return cachedPermission;
}

/** The server has no Notification API, so it always renders the "not yet asked" shape. */
export const permissionServerSnapshot = (): PermissionState => "default";

/** Quiet hours may wrap past midnight, so the comparison has two shapes. */
export function inQuietHours(minutes: number, from: number, to: number): boolean {
  if (from === to) return false;
  return from < to ? minutes >= from && minutes < to : minutes >= from || minutes < to;
}

// ---------------------------------------------------------
// Fired-key ledger — survives a reload so nothing repeats itself
// ---------------------------------------------------------
let fired = new Set<string>();
let firedDate = "";

function loadFired(date: string) {
  if (firedDate === date && fired.size) return;
  firedDate = date;
  fired = new Set();
  try {
    const raw = localStorage.getItem(FIRED_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as { date?: string; keys?: string[] };
    if (parsed.date === date && Array.isArray(parsed.keys)) fired = new Set(parsed.keys);
  } catch { /* private mode */ }
}

function remember(key: string) {
  fired.add(key);
  try {
    localStorage.setItem(FIRED_KEY, JSON.stringify({ date: firedDate, keys: [...fired] }));
  } catch { /* quota or private mode */ }
}

function show(key: string, title: string, body: string, silent: boolean): boolean {
  if (fired.has(key)) return false;
  remember(key);
  try {
    const n = new Notification(title, { body, tag: key, silent });
    n.onclick = () => { window.focus(); n.close(); };
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------
// The tick
// ---------------------------------------------------------
function tick() {
  if (notificationPermission() !== "granted") return;

  const s = useStore.getState();
  if (!s.ready || !s.profile) return;

  const prefs = readNotificationPrefs(s.profile.prefs as Record<string, unknown>);
  if (!prefs.enabled) return;

  const now = new Date();
  const minutes = now.getHours() * 60 + now.getMinutes();
  if (inQuietHours(minutes, prefs.quietFrom, prefs.quietTo)) return;

  const today = todayISO();
  loadFired(today);

  const hour12 = s.hour12;
  let sent = 0;
  const push = (key: string, title: string, body: string) => {
    if (sent >= MAX_PER_TICK) return;
    if (show(`${today}:${key}`, title, body, prefs.silent)) sent++;
  };

  // ---- a timed task is coming up ----
  if (prefs.taskLead > 0) {
    for (const t of s.tasks) {
      if (t.date !== today || t.start_min == null) continue;
      if (t.status === "done" || t.status === "dropped") continue;
      const lead = t.start_min - prefs.taskLead;
      if (minutes < lead || minutes > t.start_min) continue;
      const left = Math.max(0, t.start_min - minutes);
      push(
        `task:${t.id}`,
        t.title,
        left <= 1 ? "Starting now." : `Starts in ${left} minutes — ${formatTime(t.start_min, hour12)}.`,
      );
    }
  }

  // ---- the next prayer ----
  if (prefs.prayerLead > 0) {
    const times = prayerTimesFor(today, {
      latitude: s.profile.latitude,
      longitude: s.profile.longitude,
      method: s.profile.calc_method,
      madhab: s.profile.madhab,
    });
    for (const name of PRAYER_NAMES) {
      const at = times[name];
      if (minutes < at - prefs.prayerLead || minutes > at) continue;
      const left = Math.max(0, at - minutes);
      push(
        `prayer:${name}`,
        PRAYER_LABELS[name],
        left <= 1 ? `It is time — ${formatTime(at, hour12)}.` : `In ${left} minutes, at ${formatTime(at, hour12)}.`,
      );
    }
  }

  // ---- the morning plan ----
  if (prefs.dailyPlan != null && minutes >= prefs.dailyPlan && minutes < prefs.dailyPlan + 3) {
    const todays = s.tasks.filter((t) => t.date === today && !t.parent_id && t.status !== "dropped");
    const open = todays.filter((t) => t.status !== "done").length;
    const timed = todays.filter((t) => t.start_min != null).length;
    push(
      "plan",
      open ? `${open} things today` : "Nothing on today",
      open
        ? `${timed} of them have a time. Open Humoyun to walk the day.`
        : "An empty calendar. Put one thing on it that matters.",
    );
  }

  // ---- habits still open this evening ----
  if (prefs.habitNudge != null && minutes >= prefs.habitNudge && minutes < prefs.habitNudge + 3) {
    const index = buildLogIndex(s.habitLogs);
    const weekStart = s.profile.week_start ?? 1;
    const open = s.habits.filter((h) => {
      const counts = index.get(h.id) ?? new Map<string, number>();
      return habitScheduledOn(h, today, counts, weekStart) && !isHabitComplete(h, counts.get(today));
    });
    if (open.length) {
      push(
        "habits",
        open.length === 1 ? "One habit left today" : `${open.length} habits left today`,
        open.slice(0, 3).map((h) => h.name).join(" · "),
      );
    }
  }

  // ---- the weekly review, on the last evening of the week ----
  if (prefs.weeklyReview && minutes >= WEEKLY_REVIEW_MINUTE && minutes < WEEKLY_REVIEW_MINUTE + 3) {
    const weekStart = startOfWeek(today, s.profile.week_start ?? 1);
    const lastDay = addDays(weekStart, 6);
    if (today === lastDay) {
      const review = s.reviews.find((r) => r.week_start === weekStart);
      const written = review && (review.went_well || review.went_bad || review.learned || review.next_week);
      if (!written) push("review", "The week is nearly done", "Fifteen minutes of review buys back the next one.");
    }
  }
}

// ---------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------
let timer: ReturnType<typeof setInterval> | null = null;

/**
 * Idempotent. Called from the Settings page on mount and again whenever the
 * preferences change; the ticker itself outlives the page so reminders keep
 * arriving after you navigate away.
 */
export function startReminders() {
  if (typeof window === "undefined" || timer) return;
  timer = setInterval(tick, TICK_MS);
  tick();
}

export function stopReminders() {
  if (timer) { clearInterval(timer); timer = null; }
}

export function remindersRunning(): boolean {
  return timer !== null;
}

/** Fires straight away, ignoring the ledger, so "test" always shows something. */
export function sendTestNotification(): boolean {
  if (notificationPermission() !== "granted") return false;
  try {
    const n = new Notification("Humoyun", {
      body: "Reminders are working. This is what one looks like.",
      tag: `test-${Date.now()}`,
    });
    n.onclick = () => { window.focus(); n.close(); };
    return true;
  } catch {
    return false;
  }
}
