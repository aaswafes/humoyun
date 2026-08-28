// =========================================================
// Local preview mode.
//
// With NEXT_PUBLIC_SOLO=1 the app runs with no account and no network: the
// whole store is mirrored into localStorage instead of Supabase. Same data
// model, same code paths — only the persistence target changes — so turning
// the flag off hands everything back to Supabase untouched.
// =========================================================

import type { CollectionKey, Collections, Profile } from "./types";

export const SOLO = process.env.NEXT_PUBLIC_SOLO === "1";

/** A stable id so rows written locally still satisfy the user_id column. */
export const SOLO_USER_ID = "00000000-0000-4000-8000-000000000001";

const KEY = "humoyun.local.v2";

type Snapshot = {
  profile: Profile | null;
  collections: { [K in CollectionKey]?: Collections[K][] };
  seeded?: boolean;
};

export function loadLocal(): Snapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Snapshot) : null;
  } catch {
    return null;
  }
}

let pending: ReturnType<typeof setTimeout> | null = null;

/**
 * Debounced whole-snapshot write. A personal dataset is small enough that
 * rewriting it is cheaper and far less error-prone than tracking dirty rows.
 */
export function saveLocal(snapshot: Snapshot) {
  if (typeof window === "undefined") return;
  if (pending) clearTimeout(pending);
  pending = setTimeout(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(snapshot));
    } catch {
      // Quota or private mode — the session still works, it just won't persist.
    }
  }, 250);
}

export function clearLocal() {
  try { localStorage.removeItem(KEY); } catch { /* noop */ }
}

export const SOLO_PROFILE: Profile = {
  id: SOLO_USER_ID,
  display_name: "Humoyun",
  avatar: null,
  city: "Tashkent",
  latitude: 41.2995,
  longitude: 69.2401,
  timezone: "Asia/Tashkent",
  calc_method: "MuslimWorldLeague",
  madhab: "hanafi",
  week_start: 1,
  theme: "system",
  accent: "blue",
  prefs: {},
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};
