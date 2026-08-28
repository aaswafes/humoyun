// =========================================================
// The optional half of a prayer: rawatib, nafl and adhkar.
//
// None of it is required, none of it is scored. It lives in
// `day_logs.data.salah` so the day's record stays in one row.
// =========================================================

import type { DayLog, PrayerName } from "@/lib/types";

export type SunnahSlot = "before" | "after" | "nafl";

export interface SunnahDef {
  id: string;
  label: string;
  detail: string;
  rakat: string;
  slot: SunnahSlot;
  /** Mu'akkadah — the strongly kept ones — versus the rest. */
  emphasis: "muakkadah" | "ghayr";
}

export interface Rawatib {
  before?: SunnahDef;
  after?: SunnahDef;
}

/**
 * The Hanafi and Shafi'i counts differ before Dhuhr, and the profile
 * already knows which asr the user follows, so use it here too.
 */
export function rawatibFor(madhab: string): Record<PrayerName, Rawatib> {
  const hanafi = madhab === "hanafi";
  return {
    fajr: {
      before: {
        id: "fajr:before", label: "Before Fajr", detail: "The most emphasised of them all",
        rakat: "2 rakat", slot: "before", emphasis: "muakkadah",
      },
    },
    dhuhr: {
      before: {
        id: "dhuhr:before", label: "Before Dhuhr", detail: hanafi ? "Four in one salam" : "Two before the adhan settles",
        rakat: hanafi ? "4 rakat" : "2 rakat", slot: "before", emphasis: "muakkadah",
      },
      after: {
        id: "dhuhr:after", label: "After Dhuhr", detail: "Straight after the fard",
        rakat: "2 rakat", slot: "after", emphasis: "muakkadah",
      },
    },
    asr: {
      before: {
        id: "asr:before", label: "Before Asr", detail: "Ghayr mu'akkadah — kept when there is room",
        rakat: "4 rakat", slot: "before", emphasis: "ghayr",
      },
    },
    maghrib: {
      after: {
        id: "maghrib:after", label: "After Maghrib", detail: "Before the room empties",
        rakat: "2 rakat", slot: "after", emphasis: "muakkadah",
      },
    },
    isha: {
      after: {
        id: "isha:after", label: "After Isha", detail: "Before witr closes the night",
        rakat: "2 rakat", slot: "after", emphasis: "muakkadah",
      },
    },
  };
}

/** Nafl that stand on their own rather than attaching to a fard. */
export const NAFL: SunnahDef[] = [
  {
    id: "nafl:duha", label: "Duha", detail: "Mid-morning, once the sun has risen a spear's length",
    rakat: "2–8 rakat", slot: "nafl", emphasis: "ghayr",
  },
  {
    id: "nafl:witr", label: "Witr", detail: "The odd prayer that seals the night",
    rakat: "1–3 rakat", slot: "nafl", emphasis: "muakkadah",
  },
  {
    id: "nafl:tahajjud", label: "Tahajjud", detail: "In the last third of the night",
    rakat: "2+ rakat", slot: "nafl", emphasis: "ghayr",
  },
];

export const NAFL_BY_ID: Record<string, SunnahDef> = Object.fromEntries(NAFL.map((n) => [n.id, n]));

export interface DhikrDef {
  id: string;
  label: string;
  detail: string;
}

/** The adhkar kept after the fard, in the order they are usually said. */
export const ADHKAR: DhikrDef[] = [
  { id: "istighfar", label: "Istighfar", detail: "Astaghfirullah ×3" },
  { id: "salam", label: "Allahumma antas-salam", detail: "You are peace, and from you is peace" },
  { id: "ayat-al-kursi", label: "Ayat al-Kursi", detail: "Al-Baqarah 255, once" },
  { id: "tasbih", label: "Tasbih", detail: "Subhanallah ×33" },
  { id: "tahmid", label: "Tahmid", detail: "Alhamdulillah ×33" },
  { id: "takbir", label: "Takbir", detail: "Allahu akbar ×34" },
  { id: "tahlil", label: "Tahlil", detail: "La ilaha illallah, to complete the hundred" },
  { id: "muawwidhat", label: "Mu'awwidhat", detail: "Al-Ikhlas, Al-Falaq, An-Nas" },
];

export const ADHKAR_IDS = ADHKAR.map((d) => d.id);

// ---------------------------------------------------------
// Storage
// ---------------------------------------------------------
export interface SalahDayData {
  /** Sunnah ids ticked today. */
  sunnah: string[];
  /** Dhikr ids ticked, keyed by the prayer they followed. */
  adhkar: Partial<Record<PrayerName, string[]>>;
}

const EMPTY: SalahDayData = { sunnah: [], adhkar: {} };

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

/** Reads the salah block out of a day log, tolerating anything else in there. */
export function salahDataOf(log: DayLog | undefined): SalahDayData {
  const raw = (log?.data as Record<string, unknown> | undefined)?.salah;
  if (!raw || typeof raw !== "object") return EMPTY;
  const obj = raw as Record<string, unknown>;
  const adhkarRaw = (obj.adhkar ?? {}) as Record<string, unknown>;
  const adhkar: Partial<Record<PrayerName, string[]>> = {};
  for (const [key, value] of Object.entries(adhkarRaw)) {
    const list = asStringArray(value);
    if (list.length) adhkar[key as PrayerName] = list;
  }
  return { sunnah: asStringArray(obj.sunnah), adhkar };
}

/**
 * Merges the salah block back into the day log's `data` without touching
 * whatever else another surface has parked there.
 */
export function withSalahData(log: DayLog | undefined, next: SalahDayData): Record<string, unknown> {
  return { ...(log?.data ?? {}), salah: next };
}

export function toggleInList(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

export function adhkarFor(data: SalahDayData, prayer: PrayerName): string[] {
  return data.adhkar[prayer] ?? [];
}

export function setAdhkar(data: SalahDayData, prayer: PrayerName, ids: string[]): SalahDayData {
  const adhkar = { ...data.adhkar };
  if (ids.length) adhkar[prayer] = ids;
  else delete adhkar[prayer];
  return { ...data, adhkar };
}

/** Every sunnah id that exists for a given madhab — used by the day summary. */
export function allSunnahIds(madhab: string): string[] {
  const rawatib = rawatibFor(madhab);
  const ids: string[] = [];
  for (const slot of Object.values(rawatib)) {
    if (slot.before) ids.push(slot.before.id);
    if (slot.after) ids.push(slot.after.id);
  }
  return [...ids, ...NAFL.map((n) => n.id)];
}
