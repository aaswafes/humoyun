import type { TourStep } from "@/components/tour/tour";

// =========================================================
// Consumption — Books, Films & Anime, YouTube. Three shelves, one section;
// each tab gets its own short tour. `/consumption` itself only redirects to
// Books, so it has none.
//
// Anchors that need data (insights, shelf) drop out on an empty shelf, which
// is exactly what a new account sees — so the steps that always survive
// (welcome, tabs, add, the calendar card) read as a whole on their own.
// =========================================================

const TABS: TourStep = {
  anchor: "consumption.tabs",
  title: "Three shelves",
  body: (
    <>
      Books, Films &amp; Anime and YouTube each have their own shelf. <b>Switch</b> between
      them here; the number is how many titles sit on each.
    </>
  ),
  side: "bottom",
};

export const BOOKS_TOUR: TourStep[] = [
  {
    title: "Your reading shelf",
    body: "Everything you are reading, planning to read or have finished lives here, with your pace and a projected finish date for each book.",
  },
  TABS,
  {
    anchor: "books.add",
    title: "Add a book",
    body: "Give it a title and a page count. A new book goes to your shelf unscheduled, so nothing lands on a day until you plan it.",
    side: "bottom",
  },
  {
    anchor: "books.insights",
    title: "Insights and Up next",
    body: (
      <>
        These rows <b>open</b> when you tap them. Insights holds your pace and yearly goal; Up next
        is your to-read queue, where you can reorder books and Start one.
      </>
    ),
  },
  {
    anchor: "books.shelf",
    title: "Refile by dragging",
    body: (
      <>
        Grouped by Status, Genre, Topic or Series, you can <b>drag</b> a cover onto another
        group to refile it. On a phone, press and hold the cover first.
      </>
    ),
    side: "top",
  },
  {
    title: "Give a book a plan",
    body: (
      <>
        <b>Open</b> a book and use its Plan section: set a pace and a start date, hit Schedule,
        and a reading block lands on every day until the last page.
      </>
    ),
  },
  {
    title: "Or drop it on a day",
    body: (
      <>
        In Calendar, open the side rail and <b>drag</b> a book onto any day to start it there. On a
        phone, the Books &amp; shelves sheet schedules it on the selected day instead.
      </>
    ),
  },
];

export const FILMS_TOUR: TourStep[] = [
  {
    title: "Films and anime",
    body: "Your watchlist: films, series and anime you are watching, planning or have finished, with your pace toward each finale.",
  },
  TABS,
  {
    anchor: "films.add",
    title: "Add a title",
    body: "Add a film, or a series with its episode count. A film takes one evening; a series can be spread over days.",
    side: "bottom",
  },
  {
    anchor: "films.insights",
    title: "Insights",
    body: (
      <>
        This row <b>opens</b> when you tap it: titles finished this year, episodes this month and
        your watch streak.
      </>
    ),
  },
  {
    anchor: "films.shelf",
    title: "Refile by dragging",
    body: (
      <>
        Grouped by Status, Kind, Genre, Topic or Series, you can <b>drag</b> a poster onto another
        group to refile it. On a phone, press and hold first.
      </>
    ),
    side: "top",
  },
  {
    title: "Getting it on the calendar",
    body: (
      <>
        <b>Open</b> a series and use Plan to set episodes a day, then Schedule. Or, in Calendar,
        drag it from the side rail&apos;s Watch list onto any day.
      </>
    ),
  },
];

export const YOUTUBE_TOUR: TourStep[] = [
  {
    title: "Saved to watch",
    body: "Videos and playlists you mean to get to. They wait here until you want them.",
  },
  TABS,
  {
    anchor: "youtube.add",
    title: "Save a video",
    body: "Paste a YouTube link and give it a channel. A playlist also takes a number of videos.",
    side: "bottom",
  },
  {
    anchor: "youtube.insights",
    title: "Insights",
    body: (
      <>
        This row <b>opens</b> when you tap it, with how many videos and hours you have watched.
      </>
    ),
  },
  {
    anchor: "youtube.shelf",
    title: "Refile by dragging",
    body: (
      <>
        Grouped by Status, Kind, Genre, Topic or Series, you can <b>drag</b> a video onto another
        group to refile it. On a phone, press and hold first.
      </>
    ),
    side: "top",
  },
  {
    title: "Getting it on the calendar",
    body: (
      <>
        <b>Open</b> a single video and tap Put it on today. A playlist gets a Plan instead: set
        videos a day, hit Schedule, and blocks fill the days ahead.
      </>
    ),
  },
];
