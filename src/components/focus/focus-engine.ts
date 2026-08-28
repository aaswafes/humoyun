"use client";

import * as React from "react";
import { useStore } from "@/lib/store";
import { useNow } from "@/hooks/use-hotkeys";
import { todayISO } from "@/lib/date";
import type { FocusSession } from "@/lib/types";
import { useFocusPrefs, type SessionPreset } from "./focus-prefs";
import { withInterruptions } from "./focus-data";
import { deleteSession } from "./session-actions";

export type FocusPhase = "idle" | "focus" | "break" | "wrap" | "return";
export type FocusMode = "pomodoro" | "stopwatch";

export interface FocusSubject {
  taskId: string | null;
  label: string;
}

/** The block that just ended, kept around so notes can still be written on it. */
export interface LastBlock {
  sessionId: string | null;
  minutes: number;
  interruptions: number;
  completed: boolean;
  mode: FocusMode;
  subject: FocusSubject;
  /** True when the block was too short for the store to log it. */
  discarded: boolean;
}

const ROOM_KEY = "humoyun.focus.room";

interface Room {
  date: string;
  /** Focus blocks finished today — drives the position in the set. */
  cycles: number;
  onBreak: boolean;
  longBreak: boolean;
  /** Minutes added to the running block after it started. */
  extra: number;
  /** Elapsed seconds at each "I got pulled away" tap in the running block. */
  interruptions: number[];
  mode: FocusMode;
}

function defaultRoom(): Room {
  return {
    date: todayISO(),
    cycles: 0,
    onBreak: false,
    longBreak: false,
    extra: 0,
    interruptions: [],
    mode: "pomodoro",
  };
}

function loadRoom(): Room {
  const base = defaultRoom();
  if (typeof window === "undefined") return base;
  try {
    const raw = localStorage.getItem(ROOM_KEY);
    if (!raw) return base;
    const saved = JSON.parse(raw) as Partial<Room>;
    // A new day starts a fresh set — only the chosen mode carries over.
    if (saved.date !== base.date) {
      return { ...base, mode: saved.mode === "stopwatch" ? "stopwatch" : "pomodoro" };
    }
    return {
      ...base,
      ...saved,
      interruptions: Array.isArray(saved.interruptions)
        ? saved.interruptions.filter((n): n is number => typeof n === "number")
        : [],
    };
  } catch {
    return base;
  }
}

const nowIso = () => new Date().toISOString();

/** Read the live timer rather than a render-old copy — callbacks fire late. */
function liveTimer() {
  return useStore.getState().timer;
}

function liveActive(): boolean {
  const t = liveTimer();
  return t.running || t.accumulated > 0 || t.sessionStart != null;
}

export interface StartOptions {
  taskId?: string | null;
  label?: string;
  mode?: FocusMode;
  /** Ignore the preset and run this many minutes. */
  minutes?: number;
}

/**
 * The focus room's state machine. Timing itself belongs to the store — this
 * decides which timer runs next, where you are in the set, and what happens on
 * either side of a block: interruptions during it, a wrap-up after it, a break
 * before the next one.
 */
export function useFocusEngine() {
  const timer = useStore((s) => s.timer);
  const startTimer = useStore((s) => s.startTimer);
  const pauseTimer = useStore((s) => s.pauseTimer);
  const resumeTimer = useStore((s) => s.resumeTimer);
  const stopTimer = useStore((s) => s.stopTimer);
  const insert = useStore((s) => s.insert);
  const patch = useStore((s) => s.patch);
  const toast = useStore((s) => s.toast);
  const now = useNow(500);

  const { prefs, presets, preset, setPrefs, selectPreset, savePreset, deletePreset } = useFocusPrefs();

  const [room, setRoom] = React.useState<Room>(loadRoom);
  const [subject, setSubject] = React.useState<FocusSubject>({ taskId: null, label: "" });
  const [last, setLast] = React.useState<LastBlock | null>(null);
  const [prompt, setPrompt] = React.useState<"none" | "wrap" | "return">("none");

  const patchRoom = React.useCallback((changes: Partial<Room>) => {
    setRoom((prev) => {
      const today = todayISO();
      // Crossing midnight with the page open starts a fresh set, not a 30th cycle.
      const base = prev.date === today ? prev : { ...defaultRoom(), mode: prev.mode };
      const next = { ...base, ...changes, date: today };
      try { localStorage.setItem(ROOM_KEY, JSON.stringify(next)); } catch { /* private mode */ }
      return next;
    });
  }, []);

  // "Has a session" cannot depend on the banked count: pausing inside the first
  // second banks zero whole seconds and would otherwise orphan the timer.
  const active = timer.running || timer.accumulated > 0 || timer.sessionStart != null;

  const seconds =
    timer.accumulated +
    (timer.running && timer.startedAt ? Math.max(0, Math.floor((now - timer.startedAt) / 1000)) : 0);

  const phase: FocusPhase = active
    ? room.onBreak ? "break" : "focus"
    : prompt === "return" ? "return"
      : prompt === "wrap" ? "wrap"
        : "idle";

  const mode: FocusMode = active && !room.onBreak ? timer.mode : room.mode;
  const setLength = Math.max(2, preset.cycles);
  const filled = room.cycles > 0 && room.cycles % setLength === 0 ? setLength : room.cycles % setLength;
  const longNext = filled === setLength;
  const breakMinutes = longNext ? preset.long : preset.short;

  // A block finishing and the break that follows it happen inside one handler,
  // so the break length cannot be read off a render that has not happened yet.
  const cyclesRef = React.useRef(room.cycles);
  cyclesRef.current = room.cycles;
  const longBreakDue = () => cyclesRef.current > 0 && cyclesRef.current % setLength === 0;

  /** The block length in play: the store owns it while a timer runs, the preset otherwise. */
  const minutes = active ? timer.targetMinutes + room.extra : preset.focus;
  const targetSeconds = minutes * 60;
  const countdown = active ? room.onBreak || timer.mode === "pomodoro" : mode === "pomodoro";

  const clockSeconds = countdown ? Math.max(0, targetSeconds - seconds) : seconds;
  const progress = countdown
    ? targetSeconds > 0 ? Math.min(1, seconds / targetSeconds) : 0
    : (seconds % 3600) / 3600;

  // -------------------------------------------------------
  // Ending a block
  // -------------------------------------------------------

  /**
   * Stop the focus timer, keep the interruption count with the row the store
   * just wrote, and remember the block so notes can still be attached to it.
   */
  const finishFocus = React.useCallback(
    (silent: boolean): FocusSession | null => {
      const t = liveTimer();
      const before = new Set(useStore.getState().focusSessions.map((s) => s.id));
      const taps = room.interruptions.length;
      const runMode: FocusMode = t.mode === "stopwatch" ? "stopwatch" : "pomodoro";
      const runSubject: FocusSubject = { taskId: t.taskId, label: t.label };

      stopTimer(true);

      const logged = useStore.getState().focusSessions.find((s) => !before.has(s.id)) ?? null;

      if (logged && taps > 0) {
        patch("focusSessions", logged.id, { tags: withInterruptions(logged.tags, taps) });
      }

      // Only a block that ran its full length advances the set.
      const advancedSet = runMode === "pomodoro" && !!logged?.completed;
      cyclesRef.current = advancedSet ? room.cycles + 1 : room.cycles;
      patchRoom({
        onBreak: false,
        longBreak: false,
        extra: 0,
        interruptions: [],
        cycles: advancedSet ? room.cycles + 1 : room.cycles,
      });

      setLast({
        sessionId: logged?.id ?? null,
        minutes: logged ? Math.max(1, Math.round(logged.seconds / 60)) : 0,
        interruptions: taps,
        completed: !!logged?.completed,
        mode: runMode,
        subject: runSubject,
        discarded: !logged,
      });
      if (!silent) setPrompt("wrap");
      return logged;
    },
    [room.interruptions.length, room.cycles, stopTimer, patch, patchRoom],
  );

  /** Rest is never focus: the break timer is discarded, then logged as its own row. */
  const finishBreak = React.useCallback(
    (natural: boolean) => {
      const t = liveTimer();
      const elapsed =
        t.accumulated + (t.running && t.startedAt ? Math.floor((Date.now() - t.startedAt) / 1000) : 0);
      const wasLong = room.longBreak;

      stopTimer(false);

      if (elapsed >= 20) {
        insert("focusSessions", {
          task_id: null,
          label: wasLong ? "Long break" : "Break",
          mode: "break",
          started_at: t.sessionStart ?? nowIso(),
          ended_at: nowIso(),
          seconds: elapsed,
          completed: natural,
        });
      }

      cyclesRef.current = wasLong ? 0 : room.cycles;
      patchRoom({
        onBreak: false,
        longBreak: false,
        extra: 0,
        cycles: wasLong ? 0 : room.cycles,
      });
      setPrompt(natural ? "return" : "none");
    },
    [room.longBreak, room.cycles, stopTimer, insert, patchRoom],
  );

  // -------------------------------------------------------
  // Starting
  // -------------------------------------------------------
  const start = React.useCallback(
    (opts: StartOptions = {}) => {
      // Never let the store's implicit stop bank a break as focus, and never
      // lose the interruptions of a block that is being replaced.
      if (liveActive()) {
        if (room.onBreak) finishBreak(false);
        else finishFocus(true);
      }

      const next: FocusSubject = {
        taskId: opts.taskId !== undefined ? opts.taskId : subject.taskId,
        label: opts.label !== undefined ? opts.label : subject.label,
      };
      setSubject(next);

      const nextMode = opts.mode ?? room.mode;
      startTimer({
        taskId: next.taskId,
        label: next.label,
        mode: nextMode,
        targetMinutes: opts.minutes ?? preset.focus,
      });
      patchRoom({ onBreak: false, longBreak: false, extra: 0, interruptions: [], mode: nextMode });
      setLast(null);
      setPrompt("none");
    },
    [room.onBreak, room.mode, subject, preset.focus, startTimer, patchRoom, finishBreak, finishFocus],
  );

  const beginBreak = React.useCallback(() => {
    if (liveActive()) {
      if (room.onBreak) return;
      finishFocus(true);
    }
    const long = longBreakDue();
    startTimer({
      taskId: null,
      label: long ? "Long break" : "Break",
      mode: "pomodoro",
      targetMinutes: long ? preset.long : preset.short,
    });
    patchRoom({ onBreak: true, longBreak: long, extra: 0, interruptions: [] });
    setPrompt("none");
  }, [room.onBreak, setLength, preset.long, preset.short, startTimer, patchRoom, finishFocus]);

  /** Straight back to work without resting — the position in the set is untouched. */
  const skipBreak = React.useCallback(() => {
    setPrompt("none");
    if (prefs.autoStartFocus) start();
  }, [prefs.autoStartFocus, start]);

  const endSession = React.useCallback(() => {
    if (!liveActive()) return;
    if (room.onBreak) finishBreak(false);
    else finishFocus(false);
  }, [room.onBreak, finishBreak, finishFocus]);

  const dismissWrap = React.useCallback(() => {
    setPrompt("none");
    setLast(null);
  }, []);

  /** Throw away the block that was just logged — its minutes go back to the task. */
  const discardWrapped = React.useCallback(() => {
    if (last?.sessionId) {
      deleteSession(last.sessionId);
      toast({ title: "Session discarded", description: "Those minutes are off the record." });
    }
    setLast(null);
    setPrompt("none");
  }, [last?.sessionId, toast]);

  // -------------------------------------------------------
  // While a block runs
  // -------------------------------------------------------
  const logInterrupt = React.useCallback(() => {
    if (!liveActive() || room.onBreak) return;
    patchRoom({ interruptions: [...room.interruptions, seconds] });
  }, [room.onBreak, room.interruptions, seconds, patchRoom]);

  const undoInterrupt = React.useCallback(() => {
    if (!room.interruptions.length) return;
    patchRoom({ interruptions: room.interruptions.slice(0, -1) });
  }, [room.interruptions, patchRoom]);

  /**
   * "Five more minutes" without restarting the clock. `targetMinutes` belongs
   * to the store and cannot be edited in place, so the bonus is held here and
   * added to every target this hook computes.
   */
  const extend = React.useCallback(
    (add = 5) => {
      if (!liveActive()) return;
      if (!room.onBreak && liveTimer().mode === "stopwatch") return;
      patchRoom({ extra: Math.min(120, room.extra + add) });
    },
    [room.onBreak, room.extra, patchRoom],
  );

  const setMode = React.useCallback(
    (next: FocusMode) => { if (!liveActive()) patchRoom({ mode: next }); },
    [patchRoom],
  );

  // Driven by the clock rather than by a render, so a block banks exactly the
  // minutes it was meant to run even if the tab was busy or in the background.
  const onBreakRef = React.useRef(room.onBreak);
  onBreakRef.current = room.onBreak;
  const extraRef = React.useRef(room.extra);
  extraRef.current = room.extra;

  const advance = React.useCallback(() => {
    if (onBreakRef.current) {
      finishBreak(true);
      if (prefs.autoStartFocus) start();
    } else {
      finishFocus(false);
      if (prefs.autoStartBreaks) beginBreak();
    }
  }, [finishBreak, finishFocus, beginBreak, start, prefs.autoStartBreaks, prefs.autoStartFocus]);

  React.useEffect(() => {
    if (!active || !countdown) return;
    const id = setInterval(() => {
      const t = useStore.getState().timer;
      if (!t.running || !t.startedAt) return;
      const elapsed = t.accumulated + Math.floor((Date.now() - t.startedAt) / 1000);
      if (elapsed >= (t.targetMinutes + extraRef.current) * 60) advance();
    }, 250);
    return () => clearInterval(id);
  }, [active, countdown, advance]);

  /** Space bar: the one key that always does the obvious next thing. */
  const toggle = React.useCallback(() => {
    if (phase === "wrap") { beginBreak(); return; }
    if (phase === "return") { start(); return; }
    if (!active) { start(); return; }
    if (timer.running) pauseTimer();
    else resumeTimer();
  }, [phase, active, timer.running, start, beginBreak, pauseTimer, resumeTimer]);

  return {
    phase,
    mode,
    setMode,
    minutes,
    seconds,
    clockSeconds,
    progress,
    countdown,
    running: timer.running,
    paused: active && !timer.running,
    active,
    onBreak: room.onBreak,
    longBreak: room.longBreak,
    breakMinutes,
    extra: room.extra,

    // the set
    preset,
    presets,
    prefs,
    setPrefs,
    selectPreset,
    savePreset,
    deletePreset,
    cycles: room.cycles,
    filled,
    setLength,
    longNext,

    // interruptions
    interruptions: room.interruptions,
    interruptionCount: room.interruptions.length,
    logInterrupt,
    undoInterrupt,

    // the block that just ended
    last,
    dismissWrap,
    discardWrapped,

    /** While a timer runs the store owns the subject; the picker owns it otherwise. */
    subject: active ? { taskId: timer.taskId, label: timer.label } : subject,
    setSubject,

    start,
    beginBreak,
    skipBreak,
    endSession,
    extend,
    pause: pauseTimer,
    resume: resumeTimer,
    toggle,
  };
}

export type FocusEngine = ReturnType<typeof useFocusEngine>;
export type { SessionPreset };
