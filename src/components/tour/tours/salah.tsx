import type { TourStep } from "@/components/tour/tour";

/** Salah's Today tab — also the one place the five tabs are introduced. */
export const SALAH_TOUR: TourStep[] = [
  {
    title: "Your prayer day",
    body: "This page keeps your five daily prayers: their times, how long each window has left, and a record of how you prayed them.",
  },
  {
    anchor: "salah.tabs",
    title: "Six tabs",
    body: (
      <>
        <b>Switch</b> between Today, Tahajjud, Qazo (the prayers you owe from before you prayed regularly), Rhythm (jamaah, qadha, the Hijri date and the qibla), Quran (your khatm and reading plan) and Zikr.
      </>
    ),
    side: "bottom",
  },
  {
    anchor: "salah.now",
    title: "Time left",
    body: "Today's date and the Hijri date sit on the left. The big number counts down what is left of the open prayer, or the time until the next one.",
  },
  {
    anchor: "salah.prayers",
    title: "Tap to record",
    body: (
      <>
        <b>Tap</b> a prayer to cycle it: not marked, prayed, jamaah, qadha. The arrow on the right opens it for late, missed, its sunnah and the adhkar after it.
      </>
    ),
  },
  {
    anchor: "salah.sunnah",
    title: "Sunnah and nafl",
    body: (
      <>
        <b>Turn this on</b> to add duha and witr to the day and track the sunnah prayers around each fard.
      </>
    ),
  },
  {
    anchor: "salah.month",
    title: "The whole month",
    body: (
      <>
        Each prayer is a square. <b>Tap</b> a past one to record a prayer you forgot to mark, and use the arrows to change month.
      </>
    ),
  },
  {
    anchor: "salah.location",
    title: "Where times come from",
    body: (
      <>
        Times use this city, calculation method and madhab. <b>Change</b> opens Settings if they look off.
      </>
    ),
  },
  {
    title: "That's the page",
    body: (
      <>
        Press <b>G</b> then <b>S</b> from anywhere to come back here. The ? in the header replays this guide.
      </>
    ),
  },
];

/** Salah's Zikr tab. */
export const SALAH_ZIKR_TOUR: TourStep[] = [
  {
    title: "Your zikr record",
    body: "You count on your tasbih; this keeps the record. One press logs the whole count, and everything else shows what it adds up to.",
  },
  {
    anchor: "salah.zikr.day",
    title: "Pick the day",
    body: (
      <>
        Use the arrows to log against an earlier day, say a tasbih you finished last night. <b>Tap</b> the date to jump back to today.
      </>
    ),
  },
  {
    anchor: "salah.zikr.board",
    title: "Press to record",
    body: (
      <>
        Each tile adds its full amount in one <b>press</b>. A set adds several zikr at once. Use the dashed tiles to make new ones.
      </>
    ),
  },
  {
    anchor: "salah.zikr.today",
    title: "Take one back",
    body: (
      <>
        Pressed twice by mistake? <b>Tap</b> the minus next to a count to take one press off.
      </>
    ),
  },
  {
    anchor: "salah.zikr.stats",
    title: "Statistics and history",
    body: (
      <>
        <b>Tap</b> this row to open or close your counts by week, month, year and all time.
      </>
    ),
  },
  {
    anchor: "salah.zikr.manage",
    title: "Manage your buttons",
    body: (
      <>
        <b>Open</b> Manage to add, edit or delete zikr and sets. Deleting a button keeps every count it already recorded.
      </>
    ),
  },
  {
    anchor: "salah.zikr.lifetime",
    title: "Lifetime",
    body: "Everything you have recorded in total, with your current streak, your longest one and your best day.",
  },
];

/** Salah's Tahajjud tab. */
export const SALAH_TAHAJJUD_TOUR: TourStep[] = [
  {
    title: "The night prayer",
    body: "Tahajjud gets its own tab and its own numbers. It never counts toward the five.",
  },
  {
    anchor: "salah.tahajjud.now",
    title: "Until the last third",
    body: "This counts down to the last third of the night. Once the last third starts, it counts down to Fajr instead.",
  },
  {
    anchor: "salah.tahajjud.night",
    title: "Tonight's timeline",
    body: "Isha, midnight, the last third and Fajr, worked out from tonight's prayer times. The part of the night you're in is highlighted.",
  },
  {
    anchor: "salah.tahajjud.record",
    title: "Mark it prayed",
    body: (
      <>
        <b>Tap</b> to mark the night kept. Then set how many rakat you prayed and, if you like, the time you got up.
      </>
    ),
  },
  {
    anchor: "salah.tahajjud.month",
    title: "Nights of the month",
    body: (
      <>
        Each square is the night that ends that morning. <b>Tap</b> one to mark it kept and open it in the card. Tapping a kept night only opens it.
      </>
    ),
  },
  {
    anchor: "salah.tahajjud.stats",
    title: "Your numbers",
    body: "Once you have marked nights, this fills in: totals at a glance, the last year night by night, the nights of the week you rise most, and every night recorded.",
  },
];

/** Salah's Qazo tab. */
export const SALAH_QAZO_TOUR: TourStep[] = [
  {
    title: "Qazo",
    body: "Count the fard prayers you missed between the day salah became fard on you and the day you started praying regularly, then pay them back here.",
  },
  {
    anchor: "salah.qazo.total",
    title: "What's left",
    body: "The total still owed, and the date you've made up to. Days are paid back in order, oldest first.",
  },
  {
    anchor: "salah.qazo.today",
    title: "Record as you pray",
    body: (
      <>
        <b>Tap +</b> after each qazo prayer, or <b>One whole day</b> after you pray all of a day&rsquo;s prayers.
      </>
    ),
  },
  {
    anchor: "salah.qazo.month",
    title: "Where you are",
    body: (
      <>
        This opens on the month you&rsquo;ve reached. <b>Tap</b> a day to mark everything up to it as made up.
      </>
    ),
  },
  {
    anchor: "salah.qazo.stats",
    title: "Your numbers",
    body: "Your pace over the last 30 days, your streak, and roughly when you'll finish at that pace.",
  },
];
