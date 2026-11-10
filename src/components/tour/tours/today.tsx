import type { TourStep } from "@/components/tour/tour";

export const TODAY_TOUR: TourStep[] = [
  {
    title: "Welcome to Today",
    body: "This is your day on one page: what is due, what is next, and the prayers, habits and reading that go with it.",
  },
  {
    anchor: "today.masthead",
    title: "The day at a glance",
    body: (
      <>
        The date and a one-line read of how the day is going. From 8 pm, or once every task is done,{" "}
        <b>Close the day</b> appears here for a short reflection.
      </>
    ),
  },
  {
    anchor: "today.now",
    title: "What is next",
    body: "The next prayer, your focus timer and your next timed task. Tap Start 25 minutes to begin a focus session.",
  },
  {
    anchor: "today.plan",
    title: "Plan the day",
    body: (
      <>
        Click to open an hour ribbon. <b>Drag</b> a task chip onto a half hour to schedule it, or tap a chip
        to pick a time. On a phone, hold the chip first.
      </>
    ),
  },
  {
    anchor: "today.tasks",
    title: "Today's tasks",
    body: (
      <>
        Overdue, timed and anytime tasks. <b>Drag</b> a row to reorder it, or onto the tray that appears to
        send it to Tomorrow, Next week or the Inbox. On a phone, hold it first.
      </>
    ),
  },
  {
    anchor: "today.rail",
    title: "Folded sections",
    body: (
      <>
        Salah, habits, reading and more. <b>Click</b> a header to open it. In Salah, tap a prayer to cycle
        it through Prayed, Jamaah and Qadha.
      </>
    ),
    side: "left",
  },
  {
    anchor: "today.tomorrow",
    title: "Plan tomorrow",
    body: "Opens tomorrow in the calendar's day view, so you can line it up before you finish tonight.",
  },
  {
    title: "Handy keys",
    body: (
      <>
        Press <b>N</b> anywhere to add a task, <b>G</b> then <b>C</b> for the calendar, <b>G</b> then <b>I</b>{" "}
        for the Inbox, and <b>⌘K</b> to search every command.
      </>
    ),
  },
];
