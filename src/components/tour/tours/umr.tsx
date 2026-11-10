import type { TourStep } from "@/components/tour/tour";

// The Umr day page: where today's minutes went, and the Dam budget.
export const UMR_TOUR: TourStep[] = [
  {
    title: "Where your day went",
    body: (
      <>
        Umr sorts your time into six kinds of living. Nothing is estimated: a minute shows up only
        because a timer measured it, a row records it, or you logged it.
      </>
    ),
  },
  {
    anchor: "umr.day",
    title: "Move between days",
    body: (
      <>
        The arrows step back and forward a day. <b>Click</b> the date to jump back to today.
      </>
    ),
  },
  {
    anchor: "umr.split",
    title: "The day, six ways",
    body: (
      <>
        The bar is drawn against the full 24 hours, so time nothing recorded stays visible as
        unaccounted rather than being hidden.
      </>
    ),
  },
  {
    anchor: "umr.dam",
    title: "The Dam budget",
    body: (
      <>
        Taʼlim earns Dam: by default ten minutes of study buy one minute of amusement. It never
        blocks anything, it just says how much is left.
      </>
    ),
  },
  {
    anchor: "umr.log",
    title: "Log what the app can't see",
    body: (
      <>
        Pick a kind, type the minutes or <b>tap</b> a preset like +30m. Sleep, meals, a walk, an hour on
        the phone all go here.
      </>
    ),
  },
  {
    anchor: "umr.triage",
    title: "Answer once",
    body: (
      <>
        Recorded time with no kind waits here. <b>Pick</b> a kind and it is written onto that task or
        habit, so you are never asked about it again.
      </>
    ),
  },
  {
    anchor: "umr.entries",
    title: "Fix the record",
    body: (
      <>
        Every entry has a menu. If a timer was left running, open its menu and <b>fix the length</b>{" "}
        here, on any day.
      </>
    ),
  },
  {
    anchor: "umr.links",
    title: "Stats and settings",
    body: (
      <>
        Stats shows weeks and months of the same ledger. The gear sets the Dam ratio, the budget
        window and how many minutes a prayer counts for.
      </>
    ),
  },
];
