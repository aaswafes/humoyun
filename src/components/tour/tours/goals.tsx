import type { TourStep } from "@/components/tour/tour";

export const GOALS_TOUR: TourStep[] = [
  {
    title: "Your goals",
    body: (
      <>
        What you are aiming at, filed by when it is due. Give a goal a date and it finds its own
        column. <b>G</b> then <b>G</b> brings you back.
      </>
    ),
  },
  {
    anchor: "goals.views",
    title: "Five ways to look",
    body: "By date is the board below. Ladder nests goals inside bigger ones, Timeline lays them across the year, Review lists what needs attention, Finished is what you closed.",
  },
  {
    anchor: "goals.new",
    title: "Add a goal",
    body: "Name it and give it a date, or leave it for someday. It lands in the right column on its own.",
  },
  {
    anchor: "goals.board",
    title: "Drag to re-date",
    body: (
      <>
        <b>Drag</b> a goal to another column and its due date moves with it. On a phone, press and
        hold the card first.
      </>
    ),
  },
  {
    anchor: "goals.column",
    title: "Add straight to a column",
    body: (
      <>
        Hover a column and press its <b>+</b> to add a goal already due in that window. On a phone
        the + is always there.
      </>
    ),
  },
  {
    anchor: "goals.card",
    title: "Open a goal",
    body: (
      <>
        <b>Click</b> a goal to open its milestones, check-ins and links. Double-click the name to
        rename it in place.
      </>
    ),
  },
  {
    title: "Nesting on the Ladder",
    body: (
      <>
        On the Ladder, <b>drag</b> one card onto another to nest it, or between two to reorder. The
        card&rsquo;s ⋯ menu does the same from the keyboard.
      </>
    ),
  },
];
