// =========================================================
// Date helpers. Everything user-facing is a local 'yyyy-MM-dd'
// string so no timezone can ever shift a day boundary.
// Times are integer minutes from midnight (0..1439).
// =========================================================

const pad = (n: number) => String(n).padStart(2, "0");

/** Local ISO date string for a Date object. Never uses toISOString (UTC shift). */
export function toISO(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Parse 'yyyy-MM-dd' into a local Date at noon (DST-proof for day math). */
export function fromISO(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1, 12, 0, 0, 0);
}

export function todayISO(): string {
  return toISO(new Date());
}

export function addDays(iso: string, n: number): string {
  const d = fromISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

export function addMonths(iso: string, n: number): string {
  const d = fromISO(iso);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  d.setDate(Math.min(day, daysInMonth(d.getFullYear(), d.getMonth())));
  return toISO(d);
}

export function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

export function diffDays(a: string, b: string): number {
  return Math.round((fromISO(a).getTime() - fromISO(b).getTime()) / 86_400_000);
}

export function isSameDay(a: string | null, b: string | null) {
  return !!a && !!b && a === b;
}

export function isToday(iso: string) {
  return iso === todayISO();
}

export function isPast(iso: string) {
  return iso < todayISO();
}

export function weekday(iso: string): number {
  return fromISO(iso).getDay(); // 0 = Sunday
}

/** Start of the week containing `iso`. weekStart: 0 = Sunday, 1 = Monday. */
export function startOfWeek(iso: string, weekStart = 1): string {
  const d = fromISO(iso);
  const delta = (d.getDay() - weekStart + 7) % 7;
  d.setDate(d.getDate() - delta);
  return toISO(d);
}

export function endOfWeek(iso: string, weekStart = 1): string {
  return addDays(startOfWeek(iso, weekStart), 6);
}

export function weekDates(iso: string, weekStart = 1): string[] {
  const s = startOfWeek(iso, weekStart);
  return Array.from({ length: 7 }, (_, i) => addDays(s, i));
}

export function startOfMonth(iso: string): string {
  const d = fromISO(iso);
  return toISO(new Date(d.getFullYear(), d.getMonth(), 1, 12));
}

export function endOfMonth(iso: string): string {
  const d = fromISO(iso);
  return toISO(new Date(d.getFullYear(), d.getMonth() + 1, 0, 12));
}

/** 6x7 grid of ISO dates covering the month that `iso` falls in. */
export function monthGrid(iso: string, weekStart = 1): string[] {
  const first = startOfMonth(iso);
  const gridStart = startOfWeek(first, weekStart);
  return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
}

export function isSameMonth(a: string, b: string) {
  return a.slice(0, 7) === b.slice(0, 7);
}

export function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  let cur = from;
  let guard = 0;
  while (cur <= to && guard++ < 3660) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

// ---------------------------------------------------------
// Formatting
// ---------------------------------------------------------
const MONTHS = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAYS_MIN = ["S", "M", "T", "W", "T", "F", "S"];

export function monthName(iso: string, short = false) {
  const i = fromISO(iso).getMonth();
  return short ? MONTHS_SHORT[i] : MONTHS[i];
}
export function monthNameOf(index: number, short = false) {
  return short ? MONTHS_SHORT[index] : MONTHS[index];
}
export function dayName(iso: string, form: "long" | "short" | "min" = "long") {
  const i = fromISO(iso).getDay();
  return form === "long" ? DAYS[i] : form === "short" ? DAYS_SHORT[i] : DAYS_MIN[i];
}
export function dayNameOf(index: number, form: "long" | "short" | "min" = "short") {
  return form === "long" ? DAYS[index] : form === "short" ? DAYS_SHORT[index] : DAYS_MIN[index];
}
export function dayNumber(iso: string) {
  return fromISO(iso).getDate();
}
export function yearOf(iso: string) {
  return fromISO(iso).getFullYear();
}

/** Ordered weekday headers respecting weekStart. */
export function weekdayHeaders(weekStart = 1, form: "long" | "short" | "min" = "short") {
  return Array.from({ length: 7 }, (_, i) => dayNameOf((i + weekStart) % 7, form));
}

/** "Fri, 28 Aug" */
export function formatDate(iso: string, opts: { weekday?: boolean; year?: boolean } = {}) {
  const d = fromISO(iso);
  const wd = opts.weekday === false ? "" : `${DAYS_SHORT[d.getDay()]}, `;
  const yr = opts.year ? ` ${d.getFullYear()}` : "";
  return `${wd}${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}${yr}`;
}

/** "Today" / "Tomorrow" / "Yesterday" / "Fri, 28 Aug" */
export function friendlyDate(iso: string): string {
  const delta = diffDays(iso, todayISO());
  if (delta === 0) return "Today";
  if (delta === 1) return "Tomorrow";
  if (delta === -1) return "Yesterday";
  if (delta > 1 && delta < 7) return DAYS[fromISO(iso).getDay()];
  return formatDate(iso);
}

/** Minutes from midnight -> "9:30 AM" or "09:30". */
export function formatTime(min: number | null | undefined, hour12 = true): string {
  if (min == null) return "";
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  if (!hour12) return `${pad(h)}:${pad(mm)}`;
  const suffix = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return mm === 0 ? `${h12} ${suffix}` : `${h12}:${pad(mm)} ${suffix}`;
}

export function formatRange(start: number | null, end: number | null, hour12 = true) {
  if (start == null) return "";
  if (end == null) return formatTime(start, hour12);
  return `${formatTime(start, hour12)} – ${formatTime(end, hour12)}`;
}

/** Parse loose human time input: "9", "9:30", "930", "9pm", "21:15". */
export function parseTime(input: string): number | null {
  const s = input.trim().toLowerCase().replace(/\s+/g, "");
  if (!s) return null;
  const m = s.match(/^(\d{1,2})[:.]?(\d{2})?(am|pm)?$/);
  if (!m) return null;
  let h = Number(m[1]);
  const mm = m[2] ? Number(m[2]) : 0;
  const mer = m[3];
  if (mm > 59) return null;
  if (mer === "pm" && h < 12) h += 12;
  if (mer === "am" && h === 12) h = 0;
  if (h > 23) return null;
  return h * 60 + mm;
}

/** 95 -> "1h 35m", 45 -> "45m", 120 -> "2h" */
export function formatDuration(minutes: number | null | undefined): string {
  if (!minutes || minutes <= 0) return "0m";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (!h) return `${m}m`;
  if (!m) return `${h}h`;
  return `${h}h ${m}m`;
}

/** Seconds -> "01:23:45" (or "23:45" under an hour). */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

export function nowMinutes(): number {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

export function quarterOf(iso: string): number {
  return Math.floor(fromISO(iso).getMonth() / 3) + 1;
}

/** ISO week number — used by the review page. */
export function weekNumber(iso: string): number {
  const d = fromISO(iso);
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dayNr = (target.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = new Date(target.getFullYear(), 0, 4);
  const diff = target.getTime() - firstThursday.getTime();
  return 1 + Math.round(diff / (7 * 86_400_000));
}
