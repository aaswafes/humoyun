import type { TourStep } from "@/components/tour/tour";

// =========================================================
// Focus — the dial. It times a kind of living, not a task (CONTRACT, Umr).
// The folds only exist once a session is logged, so on a new account that
// step drops out and the tour ends on Deep work.
// =========================================================

export const FOCUS_TOUR: TourStep[] = [
  {
    title: "Focus",
    body: "A timer for one stretch of your day. Every finished block is logged under the kind of living you chose, so your Umr ledger knows where the hours went.",
  },
  {
    anchor: "focus.kind",
    title: "Choose a kind",
    body: (
      <>
        <b>Tap</b> to say what this time is, such as Taʼlim or Ibodat, plus an optional note on what
        exactly. Pick two kinds and the minutes split evenly between them.
      </>
    ),
    side: "bottom",
  },
  {
    anchor: "focus.controls",
    title: "Start and pause",
    body: (
      <>
        Press <b>Space</b> to start or pause. While a block runs, press <b>X</b> to note a
        distraction without stopping the clock, or Stop and log to end early.
      </>
    ),
    side: "bottom",
  },
  {
    anchor: "focus.setup",
    title: "Timer settings",
    body: "Switch between Pomodoro and Stopwatch, pick a preset, and set your daily and weekly targets from this gear.",
    side: "bottom",
  },
  {
    anchor: "focus.deep",
    title: "Deep work",
    body: (
      <>
        Press <b>D</b> or tap here to fill the screen with just the dial. Esc brings you back.
      </>
    ),
    side: "bottom",
  },
  {
    anchor: "focus.folds",
    title: "Today, Sessions, Totals",
    body: (
      <>
        These rows <b>open</b> when you tap them. Tap any logged session to edit it or add a note;
        Sessions also breaks your hours down by kind, tag and time of day.
      </>
    ),
    side: "top",
  },
];
