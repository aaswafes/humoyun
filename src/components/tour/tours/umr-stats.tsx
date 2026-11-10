import type { TourStep } from "@/components/tour/tour";

// The Umr stats page: the same ledger as the day page, over a longer window.
export const UMR_STATS_TOUR: TourStep[] = [
  {
    title: "Umr over time",
    body: (
      <>
        This is the long view of your time ledger, read from the same records as the day page. It
        fills in as you record time.
      </>
    ),
  },
  {
    anchor: "umr.stats.range",
    title: "Choose the window",
    body: (
      <>
        <b>Switch</b> between 7 days, 30, 90, a year or everything. Changes are compared with the
        equally long window just before.
      </>
    ),
  },
  {
    anchor: "umr.stats.window",
    title: "The whole window",
    body: (
      <>
        One bar for the whole period, against the full clock, so the hours with nothing recorded
        stay in view.
      </>
    ),
  },
  {
    anchor: "umr.stats.tiles",
    title: "Tap a number",
    body: (
      <>
        Hover a number for the sentence behind it. <b>Click</b> it to jump to the section that
        explains it, which opens if it was folded.
      </>
    ),
  },
  {
    anchor: "umr.stats.flow",
    title: "Sections fold",
    body: (
      <>
        Each section shows a one-line summary. <b>Click</b> its header to open or close the chart;
        open sections offer a data table with every value.
      </>
    ),
  },
  {
    anchor: "umr.stats.dam",
    title: "The Dam cap",
    body: (
      <>
        Day by day, Dam spent against what Taʼlim earned. A day that went over is drawn in red.
      </>
    ),
  },
  {
    anchor: "umr.stats.sources",
    title: "How measured it is",
    body: (
      <>
        Shows how much of the recorded time a timer measured and how much was declared by hand.
        Open it to see how far to trust the rest.
      </>
    ),
  },
  {
    anchor: "umr.stats.actions",
    title: "Export or go back",
    body: (
      <>
        Export downloads this window as a CSV. Today takes you back to the day page.
      </>
    ),
  },
];
