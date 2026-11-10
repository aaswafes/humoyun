import type { TourStep } from "@/components/tour/tour";

export const CALENDAR_TOUR: TourStep[] = [
  {
    title: "Your calendar",
    body: "Tasks and events share one timeline here. This short tour shows where things are and how to move them around.",
  },
  {
    anchor: "calendar.nav",
    title: "Get around",
    body: (
      <>
        Step with the arrows, jump back with <b>Today</b>, and switch between Day, Week, Month,
        Agenda and Year. On a keyboard, 1 to 5 switch views and T jumps to today.
      </>
    ),
  },
  {
    anchor: "calendar.grid",
    title: "Plan on the grid",
    body: (
      <>
        In Day and Week, <b>drag</b> across empty hours to make an event, drag a block to move it,
        or pull its edge to resize it. On a phone, press and hold first.
      </>
    ),
  },
  {
    anchor: "calendar.grid",
    title: "Move between days",
    body: (
      <>
        In Month, click a day to peek and double-click to open it. <b>Drag</b> a task onto another
        day to reschedule it.
      </>
    ),
  },
  {
    anchor: "calendar.rail",
    title: "Books onto the calendar",
    body: (
      <>
        Open this rail and <b>drag</b> a book onto any day: the days after fill with reading
        blocks. Films and undated tasks drag on the same way.
      </>
    ),
  },
  {
    anchor: "calendar.options",
    title: "View options",
    body: (
      <>
        Display settings for the current view, plus <b>Books &amp; shelves</b>. On a phone that
        opens your shelves as a sheet, where each card&apos;s calendar button schedules it on the
        selected day.
      </>
    ),
  },
  {
    anchor: "calendar.new",
    title: "Add something",
    body: (
      <>
        <b>New</b> opens quick add for a task or event. Press N anywhere in the app to do the same.
      </>
    ),
  },
];
