"use client";

import * as React from "react";
import { useStore } from "@/lib/store";
import { useNow } from "@/hooks/use-hotkeys";
import { todayISO } from "@/lib/date";

export type FocusPhase = "idle" | "focus" | "prompt" | "break";
export type FocusMode = "pomodoro" | "stopwatch";

export interface FocusPreset {
  focus: number;
  short: number;
  long: number;
}

export const FOCUS_PRESETS: FocusPreset[] = [
  { focus: 15, short: 3, long: 12 },
  { focus: 25, short: 5, long: 15 },
  { focus: 50, short: 10, long: 25 },
  { focus: 90, short: 15, long: 30 },
];

/** Pomodoros in a set before the long break. */
export const SET_LENGTH = 4;

export function presetFor(minutes: number): FocusPreset {
  return FOCUS_PRESETS.find((p) => p.focus === minutes) ?? FOCUS_PRESETS[1];
}

export interface FocusSubject {
  taskId: string | null;
  label: string;
}

const ROOM_KEY = "humoyun.focus.room";

interface Room {
  date: string;
  cycles: number;
  minutes: number;
  onBreak: boolean;
  longBreak: boolean;
}

function defaultRoom(): Room {
  return { date: todayISO(), cycles: 0, minutes: 25, onBreak: false, longBreak: false };
}

function loadRoom(): Room {
  const base = defaultRoom();
  if (typeof window === "undefined") return base;
  try {
    const raw = localStorage.getItem(ROOM_KEY);
    if (!raw) return base;
    const saved = JSON.parse(raw) as Partial<Room>;
    // A new day starts a fresh set — only the chosen length carries over.
    if (saved.date !== base.date) return { ...base, minutes: saved.minutes ?? base.minutes };
    return { ...base, ...saved };
  } catch {
    return base;
  }
}

export interface StartOptions {
  taskId?: string | null;
  label?: string;
  mode?: FocusMode;
}

/**
 * The focus room's state machine. Timing itself belongs to the store — this only
 * decides which timer to run next and remembers where you are in the pomodoro set.
 */
export function useFocusEngine() {
  const timer = useStore((s) => s.timer);
  const startTimer = useStore((s) => s.startTimer);
  const pauseTimer = useStore((s) => s.pauseTimer);
  const resumeTimer = useStore((s) => s.resumeTimer);
  const stopTimer = useStore((s) => s.stopTimer);
  const now = useNow(500);

  const [room, setRoom] = React.useState<Room>(loadRoom);
  const [mode, setMode] = React.useState<FocusMode>("pomodoro");
  const [subject, setSubject] = React.useState<FocusSubject>({ taskId: null, label: "" });
  const [logged, setLogged] = React.useState<number | null>(null);

  const patchRoom = React.useCallback((changes: Partial<Room>) => {
    setRoom((prev) => {
      const next = { ...prev, ...changes, date: todayISO() };
      try { localStorage.setItem(ROOM_KEY, JSON.stringify(next)); } catch { /* private mode */ }
      return next;
    });
  }, []);

  const active = timer.running || timer.accumulated > 0;
  const seconds =
    timer.accumulated +
    (timer.running && timer.startedAt ? Math.max(0, Math.floor((now - timer.startedAt) / 1000)) : 0);

  const phase: FocusPhase = !active
    ? logged != null ? "prompt" : "idle"
    : room.onBreak ? "break" : "focus";

  const effectiveMode: FocusMode = active ? timer.mode : mode;
  const minutes = active ? timer.targetMinutes : room.minutes;
  const targetSeconds = minutes * 60;
  const countdown = effectiveMode === "pomodoro";

  const clockSeconds = phase === "prompt" ? 0 : countdown ? Math.max(0, targetSeconds - seconds) : seconds;
  const progress =
    phase === "prompt" ? 1
      : countdown ? (targetSeconds > 0 ? Math.min(1, seconds / targetSeconds) : 0)
        : (seconds % 3600) / 3600;

  /** What happens the moment a countdown reaches its target. */
  const advance = React.useCallback(() => {
    if (room.onBreak) {
      // Rest is not focus — discard it instead of logging it as a session.
      stopTimer(false);
      patchRoom({ onBreak: false, longBreak: false, cycles: room.longBreak ? 0 : room.cycles });
    } else {
      stopTimer(true);
      patchRoom({ cycles: room.cycles + 1 });
      setLogged(minutes);
    }
  }, [room.onBreak, room.longBreak, room.cycles, minutes, stopTimer, patchRoom]);

  // Driven by the clock rather than by a render, so a session banks exactly the
  // minutes it was meant to run even if the tab was busy or in the background.
  React.useEffect(() => {
    if (!active || !countdown) return;
    const id = setInterval(() => {
      const t = useStore.getState().timer;
      if (!t.running || !t.startedAt) return;
      const elapsed = t.accumulated + Math.floor((Date.now() - t.startedAt) / 1000);
      if (elapsed >= t.targetMinutes * 60) advance();
    }, 250);
    return () => clearInterval(id);
  }, [active, countdown, advance]);

  const start = React.useCallback((opts: StartOptions = {}) => {
    // Starting through the store would bank a running break as focus time.
    if (room.onBreak) stopTimer(false);

    const next: FocusSubject = {
      taskId: opts.taskId !== undefined ? opts.taskId : subject.taskId,
      label: opts.label !== undefined ? opts.label : subject.label,
    };
    setSubject(next);
    const nextMode = opts.mode ?? mode;
    setMode(nextMode);
    startTimer({
      taskId: next.taskId,
      label: next.label,
      mode: nextMode,
      targetMinutes: room.minutes,
    });
    patchRoom({ onBreak: false, longBreak: false });
    setLogged(null);
  }, [room.onBreak, room.minutes, subject, mode, startTimer, stopTimer, patchRoom]);

  const filled = room.cycles > 0 && room.cycles % SET_LENGTH === 0 ? SET_LENGTH : room.cycles % SET_LENGTH;
  const longNext = filled === SET_LENGTH;

  const beginBreak = React.useCallback(() => {
    const preset = presetFor(room.minutes);
    const long = room.cycles > 0 && room.cycles % SET_LENGTH === 0;
    startTimer({
      taskId: null,
      label: long ? "Long break" : "Break",
      mode: "pomodoro",
      targetMinutes: long ? preset.long : preset.short,
    });
    patchRoom({ onBreak: true, longBreak: long });
    setLogged(null);
  }, [room.minutes, room.cycles, startTimer, patchRoom]);

  const skipBreak = React.useCallback(() => setLogged(null), []);

  const endSession = React.useCallback(() => {
    if (room.onBreak) {
      stopTimer(false);
      patchRoom({ onBreak: false, longBreak: false, cycles: room.longBreak ? 0 : room.cycles });
    } else {
      stopTimer(true);
    }
    setLogged(null);
  }, [room.onBreak, room.longBreak, room.cycles, stopTimer, patchRoom]);

  /** Space bar: the one key that always does the obvious next thing. */
  const toggle = React.useCallback(() => {
    if (phase === "prompt") { beginBreak(); return; }
    if (!active) { start(); return; }
    if (timer.running) pauseTimer();
    else resumeTimer();
  }, [phase, active, timer.running, start, beginBreak, pauseTimer, resumeTimer]);

  return {
    phase,
    mode: effectiveMode,
    setMode,
    minutes,
    setMinutes: (value: number) => patchRoom({ minutes: value }),
    preset: presetFor(room.minutes),
    seconds,
    clockSeconds,
    progress,
    running: timer.running,
    paused: active && !timer.running,
    active,
    loggedMinutes: logged,
    cycles: room.cycles,
    filled,
    longNext,
    /** While a timer runs the store owns the subject; the picker owns it otherwise. */
    subject: active ? { taskId: timer.taskId, label: timer.label } : subject,
    setSubject,
    start,
    beginBreak,
    skipBreak,
    endSession,
    pause: pauseTimer,
    resume: resumeTimer,
    toggle,
  };
}

export type FocusEngine = ReturnType<typeof useFocusEngine>;
