import { Coordinates, CalculationMethod, PrayerTimes, Madhab, SunnahTimes } from "adhan";
import type { PrayerName } from "./types";
import { fromISO } from "./date";

export interface PrayerConfig {
  latitude: number;
  longitude: number;
  method: string;
  madhab: string;
}

export const CALC_METHODS = [
  { id: "MuslimWorldLeague", label: "Muslim World League" },
  { id: "Egyptian", label: "Egyptian General Authority" },
  { id: "Karachi", label: "Univ. of Islamic Sciences, Karachi" },
  { id: "UmmAlQura", label: "Umm al-Qura, Makkah" },
  { id: "Dubai", label: "Dubai" },
  { id: "Qatar", label: "Qatar" },
  { id: "Kuwait", label: "Kuwait" },
  { id: "MoonsightingCommittee", label: "Moonsighting Committee" },
  { id: "Singapore", label: "Singapore" },
  { id: "Turkey", label: "Diyanet, Turkey" },
  { id: "Tehran", label: "Tehran" },
  { id: "NorthAmerica", label: "ISNA, North America" },
] as const;

export const CITY_PRESETS = [
  { name: "Tashkent", latitude: 41.2995, longitude: 69.2401, timezone: "Asia/Tashkent" },
  { name: "Samarkand", latitude: 39.627, longitude: 66.975, timezone: "Asia/Samarkand" },
  { name: "Bukhara", latitude: 39.7676, longitude: 64.4231, timezone: "Asia/Samarkand" },
  { name: "Andijan", latitude: 40.7821, longitude: 72.3442, timezone: "Asia/Tashkent" },
  { name: "Namangan", latitude: 40.9983, longitude: 71.6726, timezone: "Asia/Tashkent" },
  { name: "Istanbul", latitude: 41.0082, longitude: 28.9784, timezone: "Europe/Istanbul" },
  { name: "Makkah", latitude: 21.3891, longitude: 39.8579, timezone: "Asia/Riyadh" },
  { name: "Madinah", latitude: 24.5247, longitude: 39.5692, timezone: "Asia/Riyadh" },
  { name: "Dubai", latitude: 25.2048, longitude: 55.2708, timezone: "Asia/Dubai" },
  { name: "London", latitude: 51.5074, longitude: -0.1278, timezone: "Europe/London" },
  { name: "New York", latitude: 40.7128, longitude: -74.006, timezone: "America/New_York" },
  { name: "Kuala Lumpur", latitude: 3.139, longitude: 101.6869, timezone: "Asia/Kuala_Lumpur" },
];

function methodFor(id: string) {
  const table: Record<string, () => ReturnType<typeof CalculationMethod.MuslimWorldLeague>> = {
    MuslimWorldLeague: CalculationMethod.MuslimWorldLeague,
    Egyptian: CalculationMethod.Egyptian,
    Karachi: CalculationMethod.Karachi,
    UmmAlQura: CalculationMethod.UmmAlQura,
    Dubai: CalculationMethod.Dubai,
    Qatar: CalculationMethod.Qatar,
    Kuwait: CalculationMethod.Kuwait,
    MoonsightingCommittee: CalculationMethod.MoonsightingCommittee,
    Singapore: CalculationMethod.Singapore,
    Turkey: CalculationMethod.Turkey,
    Tehran: CalculationMethod.Tehran,
    NorthAmerica: CalculationMethod.NorthAmerica,
  };
  return (table[id] ?? CalculationMethod.MuslimWorldLeague)();
}

const toMinutes = (d: Date) => d.getHours() * 60 + d.getMinutes();

export interface DayPrayerTimes {
  fajr: number;
  sunrise: number;
  dhuhr: number;
  asr: number;
  maghrib: number;
  isha: number;
  /** Midpoint of the night — the start of the last third is more useful for tahajjud. */
  lastThird: number;
}

/** Calculated locally — works offline, no API call. */
export function prayerTimesFor(iso: string, config: PrayerConfig): DayPrayerTimes {
  const coords = new Coordinates(config.latitude, config.longitude);
  const params = methodFor(config.method);
  params.madhab = config.madhab === "hanafi" ? Madhab.Hanafi : Madhab.Shafi;
  const date = fromISO(iso);
  date.setHours(0, 0, 0, 0);
  const times = new PrayerTimes(coords, date, params);
  const sunnah = new SunnahTimes(times);
  return {
    fajr: toMinutes(times.fajr),
    sunrise: toMinutes(times.sunrise),
    dhuhr: toMinutes(times.dhuhr),
    asr: toMinutes(times.asr),
    maghrib: toMinutes(times.maghrib),
    isha: toMinutes(times.isha),
    lastThird: toMinutes(sunnah.lastThirdOfTheNight),
  };
}

/** Which prayer is currently in its window, and how long until the next one. */
export function currentPrayer(times: DayPrayerTimes, minutesNow: number): {
  current: PrayerName | "sunrise" | "night";
  next: PrayerName;
  nextAt: number;
  minutesUntil: number;
} {
  const order: Array<[PrayerName | "sunrise", number]> = [
    ["fajr", times.fajr],
    ["sunrise", times.sunrise],
    ["dhuhr", times.dhuhr],
    ["asr", times.asr],
    ["maghrib", times.maghrib],
    ["isha", times.isha],
  ];

  for (let i = order.length - 1; i >= 0; i--) {
    if (minutesNow >= order[i][1]) {
      const nextEntry = order.slice(i + 1).find(([n]) => n !== "sunrise");
      if (nextEntry) {
        return {
          current: order[i][0] === "sunrise" ? "sunrise" : (order[i][0] as PrayerName),
          next: nextEntry[0] as PrayerName,
          nextAt: nextEntry[1],
          minutesUntil: nextEntry[1] - minutesNow,
        };
      }
      return { current: "isha", next: "fajr", nextAt: times.fajr, minutesUntil: 1440 - minutesNow + times.fajr };
    }
  }
  return { current: "night", next: "fajr", nextAt: times.fajr, minutesUntil: times.fajr - minutesNow };
}

export const PRAYER_TIME_KEYS: PrayerName[] = ["fajr", "dhuhr", "asr", "maghrib", "isha"];
