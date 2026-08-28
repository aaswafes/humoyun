// =========================================================
// Natural-language task parsing.
// "read 30 pages tomorrow 9am for 45m #deep !high"
//   -> { title: "read 30 pages", date, start_min, duration_min, tags, priority }
// =========================================================

import { addDays, startOfWeek, todayISO, toISO, fromISO, parseTime, weekday } from "./date";
import type { Tint } from "./types";

export interface ParsedTask {
  title: string;
  date: string | null;
  start_min: number | null;
  end_min: number | null;
  duration_min: number | null;
  tags: string[];
  priority: number;
  color: Tint | null;
  /** character ranges that matched, so the input can highlight them */
  matches: { text: string; kind: "date" | "time" | "tag" | "priority" | "duration" }[];
}

const DOW: Record<string, number> = {
  sunday: 0, sun: 0, monday: 1, mon: 1, tuesday: 2, tue: 2, tues: 2,
  wednesday: 3, wed: 3, thursday: 4, thu: 4, thur: 4, thurs: 4,
  friday: 5, fri: 5, saturday: 6, sat: 6,
};

const MONTHS: Record<string, number> = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
  may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7,
  sep: 8, sept: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10,
  dec: 11, december: 11,
};

const PRIORITY_WORDS: Record<string, number> = {
  "!high": 3, "!h": 3, "!3": 3, "!urgent": 3,
  "!medium": 2, "!med": 2, "!m": 2, "!2": 2,
  "!low": 1, "!l": 1, "!1": 1,
};

/** Next occurrence of a weekday, strictly after today unless it is today and `allowToday`. */
function nextWeekday(target: number, from = todayISO(), allowToday = false): string {
  const start = weekday(from);
  let delta = (target - start + 7) % 7;
  if (delta === 0 && !allowToday) delta = 7;
  return addDays(from, delta);
}

export function parseTask(raw: string, weekStart = 1): ParsedTask {
  const result: ParsedTask = {
    title: raw,
    date: null,
    start_min: null,
    end_min: null,
    duration_min: null,
    tags: [],
    priority: 0,
    color: null,
    matches: [],
  };

  let text = ` ${raw} `;

  const consume = (re: RegExp, kind: ParsedTask["matches"][number]["kind"], take: (m: RegExpMatchArray) => boolean) => {
    const m = text.match(re);
    if (!m) return;
    if (!take(m)) return;
    result.matches.push({ text: m[0].trim(), kind });
    text = text.replace(m[0], " ");
  };

  // ---- tags: #focus ----
  let tagMatch: RegExpExecArray | null;
  const tagRe = /\s#([\w-]+)/g;
  while ((tagMatch = tagRe.exec(text)) !== null) {
    result.tags.push(tagMatch[1].toLowerCase());
    result.matches.push({ text: `#${tagMatch[1]}`, kind: "tag" });
  }
  text = text.replace(/\s#[\w-]+/g, " ");

  // ---- priority: !high / !2 ----
  consume(/\s(![\w]+)/i, "priority", (m) => {
    const p = PRIORITY_WORDS[m[1].toLowerCase()];
    if (p === undefined) return false;
    result.priority = p;
    return true;
  });

  // ---- duration: "for 45m", "90 min", "1h30", "2h" ----
  consume(/\s(?:for\s+)?(\d+)\s*h(?:ours?|rs?)?\s*(\d+)?\s*m?(?:ins?|inutes?)?\b/i, "duration", (m) => {
    result.duration_min = Number(m[1]) * 60 + (m[2] ? Number(m[2]) : 0);
    return true;
  });
  if (result.duration_min == null) {
    consume(/\s(?:for\s+)?(\d+)\s*m(?:ins?|inutes?)\b/i, "duration", (m) => {
      result.duration_min = Number(m[1]);
      return true;
    });
  }

  // ---- explicit time range: "9-10:30", "at 9am", "14:00" ----
  consume(/\s(?:at\s+|from\s+)?(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*(?:-|–|to)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\b/i, "time", (m) => {
    const a = parseTime(m[1]);
    const b = parseTime(m[2]);
    if (a == null || b == null) return false;
    result.start_min = a;
    result.end_min = b;
    return true;
  });
  if (result.start_min == null) {
    consume(/\s(?:at\s+)?(\d{1,2}(?::\d{2})?\s*(?:am|pm))\b/i, "time", (m) => {
      const a = parseTime(m[1]);
      if (a == null) return false;
      result.start_min = a;
      return true;
    });
  }
  if (result.start_min == null) {
    consume(/\sat\s+(\d{1,2}(?::\d{2})?)\b/i, "time", (m) => {
      const a = parseTime(m[1]);
      if (a == null) return false;
      result.start_min = a;
      return true;
    });
  }

  // ---- relative dates ----
  const today = todayISO();
  consume(/\s(today|tonight)\b/i, "date", () => { result.date = today; return true; });
  if (!result.date) consume(/\s(tomorrow|tmr|tmw)\b/i, "date", () => { result.date = addDays(today, 1); return true; });
  if (!result.date) consume(/\syesterday\b/i, "date", () => { result.date = addDays(today, -1); return true; });
  if (!result.date) consume(/\sin\s+(\d+)\s+days?\b/i, "date", (m) => { result.date = addDays(today, Number(m[1])); return true; });
  if (!result.date) consume(/\sin\s+(\d+)\s+weeks?\b/i, "date", (m) => { result.date = addDays(today, Number(m[1]) * 7); return true; });
  if (!result.date) consume(/\snext\s+week\b/i, "date", () => { result.date = addDays(startOfWeek(today, weekStart), 7); return true; });
  if (!result.date) consume(/\snext\s+month\b/i, "date", () => { result.date = addDays(today, 30); return true; });

  // ---- "next friday" / "friday" / "on monday" ----
  if (!result.date) {
    consume(/\s(?:on\s+|next\s+)?(sunday|sun|monday|mon|tuesday|tues|tue|wednesday|wed|thursday|thurs|thur|thu|friday|fri|saturday|sat)\b/i, "date", (m) => {
      const target = DOW[m[1].toLowerCase()];
      if (target === undefined) return false;
      result.date = nextWeekday(target, today, /today/i.test(m[0]));
      return true;
    });
  }

  // ---- "28 aug" / "aug 28" / "28/09" ----
  if (!result.date) {
    consume(/\s(\d{1,2})\s+(jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)\b/i, "date", (m) => {
      const day = Number(m[1]);
      const month = MONTHS[m[2].toLowerCase()];
      const year = fromISO(today).getFullYear();
      let iso = toISO(new Date(year, month, day, 12));
      if (iso < today) iso = toISO(new Date(year + 1, month, day, 12));
      result.date = iso;
      return true;
    });
  }
  if (!result.date) {
    consume(/\s(jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)\s+(\d{1,2})\b/i, "date", (m) => {
      const month = MONTHS[m[1].toLowerCase()];
      const day = Number(m[2]);
      const year = fromISO(today).getFullYear();
      let iso = toISO(new Date(year, month, day, 12));
      if (iso < today) iso = toISO(new Date(year + 1, month, day, 12));
      result.date = iso;
      return true;
    });
  }
  if (!result.date) {
    consume(/\s(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?\b/, "date", (m) => {
      const day = Number(m[1]);
      const month = Number(m[2]) - 1;
      if (month < 0 || month > 11 || day < 1 || day > 31) return false;
      const rawYear = m[3] ? Number(m[3]) : fromISO(today).getFullYear();
      const year = rawYear < 100 ? 2000 + rawYear : rawYear;
      result.date = toISO(new Date(year, month, day, 12));
      return true;
    });
  }

  // If a time was given without a date, assume today (or tomorrow if it already passed).
  if (result.start_min != null && !result.date) {
    const now = new Date().getHours() * 60 + new Date().getMinutes();
    result.date = result.start_min >= now ? today : addDays(today, 1);
  }

  if (result.start_min != null && result.end_min == null && result.duration_min) {
    result.end_min = Math.min(1439, result.start_min + result.duration_min);
  }
  if (result.start_min != null && result.end_min != null && !result.duration_min) {
    result.duration_min = result.end_min - result.start_min;
  }

  result.title = text.replace(/\s+/g, " ").trim();
  if (!result.title) result.title = raw.trim();
  return result;
}

/** Human summary of what the parser understood, shown under the input. */
export function describeParsed(p: ParsedTask): string[] {
  const bits: string[] = [];
  if (p.date) bits.push(p.date);
  if (p.start_min != null) bits.push("timed");
  if (p.duration_min) bits.push(`${p.duration_min}m`);
  if (p.priority) bits.push(["", "low", "medium", "high"][p.priority]);
  p.tags.forEach((t) => bits.push(`#${t}`));
  return bits;
}
