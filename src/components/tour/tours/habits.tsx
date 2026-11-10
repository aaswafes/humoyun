import type { TourStep } from "@/components/tour/tour";

export const HABITS_TOUR: TourStep[] = [
  {
    title: "Your habits",
    body: (
      <>
        The things you want to do on a rhythm: every day, on set weekdays, or a few times a week.
        Log them here and the streaks keep count. <b>G</b> then <b>H</b> brings you back.
      </>
    ),
  },
  {
    anchor: "habits.new",
    title: "Add a habit",
    body: "Name it, pick when it repeats and how many times a day counts as done.",
  },
  {
    anchor: "habits.today",
    title: "Today's habits",
    body: (
      <>
        <b>Tap</b> a pill to log one; tapping a finished one clears it. The <b>⋯</b> beside it
        skips today as a rest day, so the streak holds.
      </>
    ),
  },
  {
    anchor: "habits.list",
    title: "Reorder by dragging",
    body: (
      <>
        <b>Drag</b> a habit up or down to reorder it. Drop it among another part of the day and it
        moves there. On a phone, press and hold first.
      </>
    ),
  },
  {
    anchor: "habits.row",
    title: "One habit",
    body: (
      <>
        <b>Click</b> the name for its full history. The <b>⋯</b> menu shows this week, where you can
        fix past days, and edits, moves or archives it.
      </>
    ),
  },
  {
    anchor: "habits.progress",
    title: "Progress, folded",
    body: "This week's and this month's numbers rest here as one line. Click it to open the stats and the last two weeks.",
  },
  {
    anchor: "habits.archived",
    title: "Archived habits",
    body: "Habits you put down keep every log here. Click to open the list and restore one; its streak picks up where it stopped.",
  },
];
