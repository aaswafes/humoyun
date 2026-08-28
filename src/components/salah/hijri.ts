// =========================================================
// Hijri date — the tabular (civil) Islamic calendar, computed here.
// No library and no network: the arithmetic below is the standard
// 30-year cycle used by civil calendars everywhere.
//
// A tabular date can sit a day either side of a local moon sighting,
// which is exactly why `offset` exists rather than being hidden.
// =========================================================

export interface HijriDate {
  year: number;
  month: number; // 1..12
  day: number;   // 1..30
}

export const HIJRI_MONTHS = [
  "Muharram", "Safar", "Rabi' al-Awwal", "Rabi' al-Thani",
  "Jumada al-Ula", "Jumada al-Akhirah", "Rajab", "Sha'ban",
  "Ramadan", "Shawwal", "Dhu al-Qa'dah", "Dhu al-Hijjah",
];

export const HIJRI_MONTHS_SHORT = [
  "Muh", "Saf", "Rab I", "Rab II", "Jum I", "Jum II",
  "Raj", "Sha", "Ram", "Shw", "Qad", "Hij",
];

/** Julian Day Number for a proleptic Gregorian y/m/d. */
export function julianDayNumber(year: number, month: number, day: number): number {
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  return (
    day + Math.floor((153 * m + 2) / 5) + 365 * y +
    Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) - 32045
  );
}

/** Kuwaiti algorithm — the arithmetic Islamic calendar, civil epoch. */
export function hijriFromJDN(jdn: number): HijriDate {
  let l = jdn - 1948440 + 10632;
  const n = Math.floor((l - 1) / 10631);
  l = l - 10631 * n + 354;
  const j =
    Math.floor((10985 - l) / 5316) * Math.floor((50 * l) / 17719) +
    Math.floor(l / 5670) * Math.floor((43 * l) / 15238);
  l =
    l -
    Math.floor((30 - j) / 15) * Math.floor((17719 * j) / 50) -
    Math.floor(j / 16) * Math.floor((15238 * j) / 43) +
    29;
  const month = Math.floor((24 * l) / 709);
  const day = l - Math.floor((709 * month) / 24);
  const year = 30 * n + j - 30;
  return { year, month, day };
}

/**
 * Hijri date for a 'yyyy-MM-dd' Gregorian day.
 * `offset` shifts by whole days to match a local sighting.
 * `afterMaghrib` advances a day, because the Islamic day turns at sunset.
 */
export function hijriFor(iso: string, offset = 0, afterMaghrib = false): HijriDate {
  const [y, m, d] = iso.split("-").map(Number);
  return hijriFromJDN(julianDayNumber(y, m, d) + offset + (afterMaghrib ? 1 : 0));
}

export function formatHijri(h: HijriDate, opts: { short?: boolean; year?: boolean } = {}): string {
  const month = opts.short ? HIJRI_MONTHS_SHORT[h.month - 1] : HIJRI_MONTHS[h.month - 1];
  return opts.year === false ? `${h.day} ${month}` : `${h.day} ${month} ${h.year}`;
}

/**
 * A day worth naming. Nothing here is an obligation — it is context, so a
 * date on the grid can tell you why it felt different.
 */
export function hijriNote(h: HijriDate): string | null {
  const { month, day } = h;
  if (month === 9) return `Ramadan · day ${day}`;
  if (month === 10 && day === 1) return "Eid al-Fitr";
  if (month === 12 && day === 9) return "Day of Arafah";
  if (month === 12 && day === 10) return "Eid al-Adha";
  if (month === 12 && day >= 11 && day <= 13) return "Days of Tashriq";
  if (month === 12 && day <= 8) return `First ten of Dhu al-Hijjah · day ${day}`;
  if (month === 1 && day === 1) return "Hijri new year";
  if (month === 1 && day === 9) return "Tasu'a";
  if (month === 1 && day === 10) return "Ashura";
  if (month === 8 && day === 15) return "Nisf Sha'ban";
  if (day >= 13 && day <= 15) return "Ayyam al-Bid";
  return null;
}
