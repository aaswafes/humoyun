import type { TourStep } from "@/components/tour/tour";

// The Stats page: tasks, focus, habits, salah, reading and more over a window.
export const STATS_TOUR: TourStep[] = [
  {
    title: "Your numbers",
    body: (
      <>
        Stats reads what you do across the app, from tasks and focus to habits, prayers and reading.
        Press <b>G</b> then <b>A</b> to come here from anywhere.
      </>
    ),
  },
  {
    anchor: "stats.range",
    title: "Pick a window",
    body: (
      <>
        <b>Switch</b> between the last 7, 30 or 90 days, or this year. Every number on the page
        follows it.
      </>
    ),
  },
  {
    anchor: "stats.filters",
    title: "Filter, compare, export",
    body: (
      <>
        Filters narrows the page to one or more tags, overlays the previous window for comparison,
        and exports the window as a CSV.
      </>
    ),
  },
  {
    anchor: "stats.tiles",
    title: "Tap a number",
    body: (
      <>
        Hover a number for the detail behind it. <b>Click</b> it to jump to the section that
        explains it, opening that section if it was folded.
      </>
    ),
  },
  {
    anchor: "stats.insights",
    title: "The page in sentences",
    body: (
      <>
        Plain-language findings. A reading without enough data behind it is held back, with a note
        saying what it still needs.
      </>
    ),
  },
  {
    anchor: "stats.completion",
    title: "Sections fold",
    body: (
      <>
        Each section shows a one-line summary. <b>Click</b> the header to open or close it. In this
        chart, click a day to open it in the calendar.
      </>
    ),
  },
  {
    anchor: "stats.consistency",
    title: "Every day at a glance",
    body: (
      <>
        Open Consistency for a grid of day scores. <b>Click</b> any square to open that day in the
        calendar.
      </>
    ),
  },
  {
    anchor: "stats.focus",
    title: "Filter by clicking a tag",
    body: (
      <>
        In Where the time went, <b>click</b> a tag bar to narrow the whole page to that tag. It shows
        up as a chip by Filters; click the chip to clear it.
      </>
    ),
  },
];
