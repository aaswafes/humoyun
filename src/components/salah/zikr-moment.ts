// =========================================================
// What this hour of the day asks for.
//
// The adhkar are not a flat list — they are attached to moments: after the
// fard, at first light, before the sun sets, on the way to sleep. The page
// already knows the times, so the companion can name the moment instead of
// making a person pick from twenty-two entries and guess.
// =========================================================

import { PRAYER_LABELS, type PrayerName } from "@/lib/types";
import type { TimesTriple } from "./windows";

export type MomentKey = "after-fard" | "morning" | "evening" | "night" | "day";

export interface Moment {
  key: MomentKey;
  title: string;
  /** One line saying why these, and until when. */
  note: string;
  /** Zikr ids, in the order they are usually said. */
  ids: string[];
}

/** How long after the adhan the after-prayer adhkar still count as "now". */
const AFTER_FARD_MINUTES = 35;

const AFTER_FARD_BASE = [
  "istighfar", "subhanallah", "alhamdulillah", "allahu-akbar",
  "tahlil", "ayat-al-kursi", "ainni-ala-dhikrik",
];

const MORNING = [
  "sayyidul-istighfar", "bismillah-la-yadurr", "radeetu-billah",
  "muawwidhat", "tasbih-hamd", "salawat",
];

const EVENING = [
  "kalimat-tammat", "bismillah-la-yadurr", "radeetu-billah",
  "muawwidhat", "tasbih-hamd", "salawat",
];

const NIGHT = ["ayat-al-kursi", "night-tasbih", "istighfar", "bismika-amutu"];

const DAY = ["istighfar", "salawat", "tasbih-hamd", "hawqala"];

/**
 * The prayer whose adhkar are still owed, if one just finished.
 *
 * Only today's prayers count: Isha's window runs past midnight, but its
 * adhkar were either said last night or they were not, and offering them at
 * four in the morning would be reading the clock rather than the day.
 */
function recentFard(t: TimesTriple, nowMin: number): PrayerName | null {
  const order: PrayerName[] = ["fajr", "dhuhr", "asr", "maghrib", "isha"];
  let found: PrayerName | null = null;
  for (const name of order) {
    const at = t.today[name];
    if (nowMin >= at && nowMin - at <= AFTER_FARD_MINUTES) found = name;
  }
  return found;
}

export function momentFor(t: TimesTriple, nowMin: number): Moment {
  const fard = recentFard(t, nowMin);
  if (fard) {
    // Seven times after Fajr and Maghrib specifically, and before speaking.
    const ids = fard === "fajr" || fard === "maghrib"
      ? [...AFTER_FARD_BASE, "ajirni-min-an-nar"]
      : AFTER_FARD_BASE;
    return {
      key: "after-fard",
      title: `After ${PRAYER_LABELS[fard]}`,
      note: "Said before you get up from where you prayed.",
      ids,
    };
  }

  if (nowMin >= t.today.fajr && nowMin < t.today.dhuhr) {
    return {
      key: "morning",
      title: "Morning adhkar",
      note: "Their time runs from Fajr until the sun is high.",
      ids: MORNING,
    };
  }

  if (nowMin >= t.today.asr && nowMin < t.today.maghrib) {
    return {
      key: "evening",
      title: "Evening adhkar",
      note: "Their time runs from Asr until the sun sets.",
      ids: EVENING,
    };
  }

  if (nowMin >= t.today.isha || nowMin < t.today.fajr) {
    return {
      key: "night",
      title: "Before sleep",
      note: "The last words of the day, once you are in bed.",
      ids: NIGHT,
    };
  }

  return {
    key: "day",
    title: "Through the day",
    note: "Nothing is owed right now — these are the ones with no hour of their own.",
    ids: DAY,
  };
}
