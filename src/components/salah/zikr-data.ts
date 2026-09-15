// =========================================================
// Zikr — the library, and where a count is kept.
//
// A count lives in `day_logs.data.zikr`, one row per day, exactly like the
// sunnah ticks next door in `data.salah`. That keeps the day's whole record
// in one row, needs no table of its own, and makes the lifetime total a sum
// over rows the app already holds rather than a second source of truth.
// =========================================================

import type { DayLog, Tint } from "@/lib/types";

export type ZikrCategory = "tasbih" | "after-salah" | "morning" | "evening" | "night" | "anytime";

export interface ZikrDef {
  id: string;
  /** The short name a person would say out loud. */
  label: string;
  arabic: string;
  translit: string;
  meaning: string;
  /** What the sunnah says about it — one line, never a sermon. */
  virtue?: string;
  /** Where that line comes from. Named so it can be checked. */
  source?: string;
  /** The count it is normally kept in. Also the default daily target. */
  target: number;
  category: ZikrCategory;
  tint: Tint;
  /** True for anything written by the user rather than shipped with the app. */
  custom?: boolean;
}

export const CATEGORY_LABELS: Record<ZikrCategory, string> = {
  tasbih: "Tasbih",
  "after-salah": "After the fard",
  morning: "Morning",
  evening: "Evening",
  night: "Before sleep",
  anytime: "Any time",
};

export const CATEGORY_ORDER: ZikrCategory[] = [
  "tasbih", "after-salah", "morning", "evening", "night", "anytime",
];

/**
 * The built-in library.
 *
 * Every virtue line names its narration so it can be checked rather than
 * taken on trust, and the wording stays close to the hadith instead of being
 * dressed up. Where a passage is too long to print — Ayat al-Kursi, the three
 * suras — the entry names it and keeps the count, which is all a counter owes.
 */
export const ZIKR_LIBRARY: ZikrDef[] = [
  {
    id: "subhanallah",
    label: "SubhanAllah",
    arabic: "سُبْحَانَ اللَّهِ",
    translit: "Subhan Allah",
    meaning: "Glory be to Allah",
    virtue: "Thirty-three after every fard prayer.",
    source: "Muslim 597",
    target: 33,
    category: "tasbih",
    tint: "emerald",
  },
  {
    id: "alhamdulillah",
    label: "Alhamdulillah",
    arabic: "الْحَمْدُ لِلَّهِ",
    translit: "Al-hamdu lillah",
    meaning: "All praise belongs to Allah",
    virtue: "It fills the scale.",
    source: "Muslim 223",
    target: 33,
    category: "tasbih",
    tint: "blue",
  },
  {
    id: "allahu-akbar",
    label: "Allahu Akbar",
    arabic: "اللَّهُ أَكْبَرُ",
    translit: "Allahu akbar",
    meaning: "Allah is greater",
    virtue: "Thirty-four, which completes the hundred after the fard.",
    source: "Muslim 597",
    target: 34,
    category: "tasbih",
    tint: "violet",
  },
  {
    id: "tahlil",
    label: "Tahlil",
    arabic: "لَا إِلَهَ إِلَّا اللَّهُ وَحْدَهُ لَا شَرِيكَ لَهُ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ",
    translit: "La ilaha illa Allahu wahdahu la sharika lah, lahul-mulku wa lahul-hamd, wa huwa ala kulli shay'in qadir",
    meaning: "There is no god but Allah alone, with no partner; His is the dominion and the praise, and He is able to do all things",
    virtue: "Said a hundred times in a day, it weighs as much as freeing ten slaves.",
    source: "Bukhari 3293 · Muslim 2691",
    target: 100,
    category: "after-salah",
    tint: "amber",
  },
  {
    id: "istighfar",
    label: "Istighfar",
    arabic: "أَسْتَغْفِرُ اللَّهَ",
    translit: "Astaghfirullah",
    meaning: "I seek Allah's forgiveness",
    virtue: "The Prophet ﷺ sought forgiveness more than seventy times a day.",
    source: "Bukhari 6307",
    target: 100,
    category: "anytime",
    tint: "slate",
  },
  {
    id: "istighfar-tawba",
    label: "Istighfar with tawba",
    arabic: "أَسْتَغْفِرُ اللَّهَ الْعَظِيمَ وَأَتُوبُ إِلَيْهِ",
    translit: "Astaghfirullah al-Azim wa atubu ilayh",
    meaning: "I seek the forgiveness of Allah the Magnificent, and I turn to Him",
    target: 100,
    category: "anytime",
    tint: "slate",
  },
  {
    id: "salawat",
    label: "Salawat",
    arabic: "اللَّهُمَّ صَلِّ عَلَى مُحَمَّدٍ وَعَلَى آلِ مُحَمَّدٍ",
    translit: "Allahumma salli ala Muhammadin wa ala ali Muhammad",
    meaning: "O Allah, send blessings upon Muhammad and upon the family of Muhammad",
    virtue: "One blessing sent on him returns as ten.",
    source: "Muslim 408",
    target: 100,
    category: "anytime",
    tint: "pink",
  },
  {
    id: "tasbih-hamd",
    label: "SubhanAllahi wa bihamdihi",
    arabic: "سُبْحَانَ اللَّهِ وَبِحَمْدِهِ",
    translit: "Subhan Allahi wa bihamdih",
    meaning: "Glory be to Allah, and praise be to Him",
    virtue: "Said a hundred times a day, sins fall away though they be like the foam of the sea.",
    source: "Bukhari 6405 · Muslim 2691",
    target: 100,
    category: "anytime",
    tint: "teal",
  },
  {
    id: "tasbih-azim",
    label: "SubhanAllahil-Azim",
    arabic: "سُبْحَانَ اللَّهِ الْعَظِيمِ وَبِحَمْدِهِ",
    translit: "Subhan Allahil-Azim wa bihamdih",
    meaning: "Glory be to Allah the Magnificent, and praise be to Him",
    virtue: "Light on the tongue, heavy on the scale, beloved to the Most Merciful.",
    source: "Bukhari 6682 · Muslim 2694",
    target: 100,
    category: "anytime",
    tint: "teal",
  },
  {
    id: "hawqala",
    label: "La hawla wa la quwwata",
    arabic: "لَا حَوْلَ وَلَا قُوَّةَ إِلَّا بِاللَّهِ",
    translit: "La hawla wa la quwwata illa billah",
    meaning: "There is no power and no strength except with Allah",
    virtue: "A treasure from the treasures of Paradise.",
    source: "Bukhari 6384 · Muslim 2704",
    target: 100,
    category: "anytime",
    tint: "violet",
  },
  {
    id: "baqiyat",
    label: "Al-Baqiyat as-Salihat",
    arabic: "سُبْحَانَ اللَّهِ وَالْحَمْدُ لِلَّهِ وَلَا إِلَهَ إِلَّا اللَّهُ وَاللَّهُ أَكْبَرُ",
    translit: "Subhan Allah, wal-hamdu lillah, wa la ilaha illa Allah, wallahu akbar",
    meaning: "Glory be to Allah, all praise belongs to Allah, there is no god but Allah, and Allah is greater",
    virtue: "The four words dearest to Allah — it does not matter which you begin with.",
    source: "Muslim 2137",
    target: 33,
    category: "anytime",
    tint: "emerald",
  },
  {
    id: "hasbunallah",
    label: "Hasbunallah",
    arabic: "حَسْبُنَا اللَّهُ وَنِعْمَ الْوَكِيلُ",
    translit: "Hasbunallahu wa ni'mal-wakil",
    meaning: "Allah is enough for us, and He is the best guardian",
    virtue: "What Ibrahim said in the fire, and the believers when the armies gathered.",
    source: "Bukhari 4563",
    target: 7,
    category: "anytime",
    tint: "amber",
  },
  {
    id: "ayat-al-kursi",
    label: "Ayat al-Kursi",
    arabic: "اللَّهُ لَا إِلَهَ إِلَّا هُوَ الْحَيُّ الْقَيُّومُ …",
    translit: "Allahu la ilaha illa huwal-Hayyul-Qayyum …",
    meaning: "Al-Baqarah 255, read to the end",
    virtue: "Read after every fard, nothing stands between the reader and Paradise but death.",
    source: "an-Nasa'i, al-Kubra 9848",
    target: 1,
    category: "after-salah",
    tint: "violet",
  },
  {
    id: "ajirni-min-an-nar",
    label: "Allahumma ajirni min an-nar",
    arabic: "اللَّهُمَّ أَجِرْنِي مِنَ النَّارِ",
    translit: "Allahumma ajirni min an-nar",
    meaning: "O Allah, save me from the Fire",
    virtue: "Seven times after Fajr and after Maghrib, before anyone is spoken to.",
    source: "Abu Dawud 5079",
    target: 7,
    category: "after-salah",
    tint: "pink",
  },
  {
    id: "ainni-ala-dhikrik",
    label: "Allahumma a'inni ala dhikrik",
    arabic: "اللَّهُمَّ أَعِنِّي عَلَى ذِكْرِكَ وَشُكْرِكَ وَحُسْنِ عِبَادَتِكَ",
    translit: "Allahumma a'inni ala dhikrika wa shukrika wa husni ibadatik",
    meaning: "O Allah, help me to remember You, thank You, and worship You well",
    virtue: "The Prophet ﷺ told Mu'adh never to leave it at the end of a prayer.",
    source: "Abu Dawud 1522 · an-Nasa'i 1303",
    target: 1,
    category: "after-salah",
    tint: "blue",
  },
  {
    id: "sayyidul-istighfar",
    label: "Sayyidul Istighfar",
    arabic: "اللَّهُمَّ أَنْتَ رَبِّي لَا إِلَهَ إِلَّا أَنْتَ، خَلَقْتَنِي وَأَنَا عَبْدُكَ …",
    translit: "Allahumma anta Rabbi, la ilaha illa anta, khalaqtani wa ana abduk …",
    meaning: "The master of seeking forgiveness, said morning and evening",
    virtue: "Said with certainty by day or by night, whoever dies that day or night enters Paradise.",
    source: "Bukhari 6306",
    target: 1,
    category: "morning",
    tint: "violet",
  },
  {
    id: "bismillah-la-yadurr",
    label: "Bismillahilladhi la yadurru",
    arabic: "بِسْمِ اللَّهِ الَّذِي لَا يَضُرُّ مَعَ اسْمِهِ شَيْءٌ فِي الْأَرْضِ وَلَا فِي السَّمَاءِ وَهُوَ السَّمِيعُ الْعَلِيمُ",
    translit: "Bismillahilladhi la yadurru ma'asmihi shay'un fil-ardi wa la fis-sama', wa huwas-Sami'ul-Alim",
    meaning: "In the name of Allah, with whose name nothing on earth or in heaven can cause harm; He is the All-Hearing, the All-Knowing",
    virtue: "Three times morning and evening — nothing then harms the one who says it.",
    source: "Abu Dawud 5088 · Tirmidhi 3388",
    target: 3,
    category: "morning",
    tint: "teal",
  },
  {
    id: "radeetu-billah",
    label: "Radeetu billahi Rabba",
    arabic: "رَضِيتُ بِاللَّهِ رَبًّا، وَبِالْإِسْلَامِ دِينًا، وَبِمُحَمَّدٍ صَلَّى اللَّهُ عَلَيْهِ وَسَلَّمَ نَبِيًّا",
    translit: "Radeetu billahi Rabban, wa bil-Islami dinan, wa bi-Muhammadin sallallahu alayhi wa sallama Nabiyya",
    meaning: "I am content with Allah as Lord, Islam as religion, and Muhammad ﷺ as Prophet",
    virtue: "Three times morning and evening — Allah has promised to please the one who says it.",
    source: "Abu Dawud 5072 · Tirmidhi 3389",
    target: 3,
    category: "morning",
    tint: "amber",
  },
  {
    id: "muawwidhat",
    label: "Al-Mu'awwidhat",
    arabic: "الْإِخْلَاص · الْفَلَق · النَّاس",
    translit: "Al-Ikhlas, Al-Falaq, An-Nas",
    meaning: "The three suras, read three times morning and evening",
    virtue: "They suffice a person against everything.",
    source: "Abu Dawud 5082 · Tirmidhi 3575",
    target: 3,
    category: "evening",
    tint: "violet",
  },
  {
    id: "kalimat-tammat",
    label: "A'udhu bikalimatillah",
    arabic: "أَعُوذُ بِكَلِمَاتِ اللَّهِ التَّامَّاتِ مِنْ شَرِّ مَا خَلَقَ",
    translit: "A'udhu bikalimatillahit-tammati min sharri ma khalaq",
    meaning: "I take refuge in the perfect words of Allah from the evil of what He created",
    virtue: "Three times in the evening — nothing harms the one who says it that night.",
    source: "Muslim 2709",
    target: 3,
    category: "evening",
    tint: "violet",
  },
  {
    id: "night-tasbih",
    label: "Tasbih before sleep",
    arabic: "سُبْحَانَ اللَّهِ ٣٣ · الْحَمْدُ لِلَّهِ ٣٣ · اللَّهُ أَكْبَرُ ٣٤",
    translit: "Subhan Allah 33, al-hamdu lillah 33, Allahu akbar 34",
    meaning: "The hundred Fatimah was taught in place of a servant",
    virtue: "Better for you than a servant.",
    source: "Bukhari 3705 · Muslim 2727",
    target: 100,
    category: "night",
    tint: "blue",
  },
  {
    id: "bismika-amutu",
    label: "Bismika amutu wa ahya",
    arabic: "بِاسْمِكَ اللَّهُمَّ أَمُوتُ وَأَحْيَا",
    translit: "Bismika Allahumma amutu wa ahya",
    meaning: "In Your name, O Allah, I die and I live",
    virtue: "The last words before sleep.",
    source: "Bukhari 6324",
    target: 1,
    category: "night",
    tint: "slate",
  },
];

export const LIBRARY_BY_ID: Record<string, ZikrDef> =
  Object.fromEntries(ZIKR_LIBRARY.map((z) => [z.id, z]));

// ---------------------------------------------------------
// Storage — `day_logs.data.zikr`
// ---------------------------------------------------------

/** Counts for one day, keyed by zikr id. Absent means zero, never null. */
export type ZikrCounts = Record<string, number>;

const EMPTY: ZikrCounts = {};

/** Reads the zikr block out of a day log, tolerating anything else in there. */
export function zikrCountsOf(log: DayLog | undefined): ZikrCounts {
  const raw = (log?.data as Record<string, unknown> | undefined)?.zikr;
  if (!raw || typeof raw !== "object") return EMPTY;
  const out: ZikrCounts = {};
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    const n = Number(value);
    // A row written by an older build, or edited by hand, can hold anything.
    if (Number.isFinite(n) && n > 0) out[id] = Math.floor(n);
  }
  return out;
}

/**
 * Merges the counts back into the day log's `data` without touching whatever
 * else another surface has parked there — the sunnah ticks live next door.
 */
export function withZikrCounts(log: DayLog | undefined, next: ZikrCounts): Record<string, unknown> {
  const clean: ZikrCounts = {};
  for (const [id, n] of Object.entries(next)) if (n > 0) clean[id] = n;
  return { ...(log?.data ?? {}), zikr: clean };
}

export function totalOf(counts: ZikrCounts): number {
  let sum = 0;
  for (const n of Object.values(counts)) sum += n;
  return sum;
}

/** A number a person can read at a glance: 12,400 rather than 12400. */
export function groupNumber(n: number): string {
  return n.toLocaleString("en-US");
}

/** Compact, for a tight rail: 12.4k, 1.2M. */
export function shortNumber(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  if (n < 1_000_000) return `${Math.round(n / 1000)}k`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
}
