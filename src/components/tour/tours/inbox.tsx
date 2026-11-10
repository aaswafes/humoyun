import type { TourStep } from "@/components/tour/tour";

export const INBOX_TOUR: TourStep[] = [
  {
    title: "Welcome to the Inbox",
    body: "Everything you capture without a date lands here. This page is for giving each task a day, or letting it go.",
  },
  {
    anchor: "inbox.tabs",
    title: "Five views",
    body: (
      <>
        Inbox holds undated tasks, Upcoming the next 14 days, Someday what you parked. <b>All</b> adds search,
        filters and a Matrix of urgent against important. Done is the archive.
      </>
    ),
    side: "bottom",
  },
  {
    anchor: "inbox.list",
    title: "Your tasks",
    body: (
      <>
        <b>Drag</b> a row to reorder it, or onto a day to schedule it. On a phone, hold the row first. Hover a
        row for one-click dates.
      </>
    ),
  },
  {
    anchor: "inbox.rail",
    title: "Send to",
    body: (
      <>
        <b>Drop</b> a task on Today, Tomorrow, This weekend or Next week. Any day opens a month, and opens by
        itself while you drag.
      </>
    ),
  },
  {
    anchor: "inbox.select",
    title: "Select several",
    body: "Turn on select mode to pick many tasks, then schedule, prioritise or delete them together. Dragging one selected row carries the rest.",
  },
  {
    anchor: "inbox.keys",
    title: "Triage by keyboard",
    body: (
      <>
        <b>J</b> and <b>K</b> move through the list, <b>T</b> sends to today, <b>M</b> to tomorrow, <b>D</b>{" "}
        marks done. Press <b>?</b> for the full list.
      </>
    ),
  },
  {
    anchor: "inbox.new",
    title: "Add a task",
    body: (
      <>
        Capture something new. <b>N</b> does the same from any page.
      </>
    ),
  },
];
