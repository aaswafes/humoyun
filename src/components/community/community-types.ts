import type { PrayerName, PrayerStatus, TaskStatus, Tint } from "@/lib/types";

/**
 * Community rows live here rather than in `@/lib/types` for the same reason
 * they live outside the store: they are not one person's rows. Everything in
 * the global types file has a `user_id` the store stamps on write, and a
 * community does not have one.
 */

export type MemberRole = "owner" | "member";

export interface Community {
  id: string;
  name: string;
  description: string | null;
  color: Tint;
  invite_code: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface Membership {
  id: string;
  community_id: string;
  user_id: string;
  role: MemberRole;
  share_plan: boolean;
  share_salah: boolean;
  share_shelf: boolean;
  joined_at: string;
}

/** The three switches, named once so the UI and the writer cannot drift. */
export type ShareKey = "share_plan" | "share_salah" | "share_shelf";

export const SHARE_KEYS: ShareKey[] = ["share_plan", "share_salah", "share_shelf"];

/**
 * A joint habit.
 *
 * The scheduling fields are named exactly as `Habit` names them, so
 * `asHabit()` can hand one straight to `@/lib/habits` — the single place that
 * answers "is this due today?". Never read `weekdays` here directly either.
 */
export interface CommunityHabit {
  id: string;
  community_id: string;
  name: string;
  icon: string;
  color: Tint;
  cadence: "daily" | "weekly" | "custom";
  /** Weekday indices (0 = Sunday). Meaningful for the "weekly" cadence. */
  weekdays: number[];
  /** Days per week for the "custom" cadence. */
  times_per_week: number;
  /** Completions needed within a single day. */
  target_count: number;
  unit: string | null;
  archived: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

/** One person's tick, on one habit, on one day. */
export interface CommunityHabitLog {
  id: string;
  habit_id: string;
  user_id: string;
  date: string;
  count: number;
  note: string | null;
  logged_at: string;
}

export type RecKind = "book" | "film" | "anime" | "series" | "youtube" | "other";

export const REC_KINDS: RecKind[] = ["book", "film", "anime", "series", "youtube", "other"];

export const REC_KIND_LABELS: Record<RecKind, string> = {
  book: "Book",
  film: "Film",
  anime: "Anime",
  series: "Series",
  youtube: "YouTube",
  other: "Other",
};

/** What the "creator" field is actually called, per kind. */
export const REC_CREATOR_LABELS: Record<RecKind, string> = {
  book: "Author",
  film: "Director",
  anime: "Studio",
  series: "Creator",
  youtube: "Channel",
  other: "By",
};

export interface Rec {
  id: string;
  community_id: string;
  user_id: string;
  kind: RecKind;
  title: string;
  creator: string | null;
  url: string | null;
  note: string | null;
  color: Tint;
  created_at: string;
  updated_at: string;
}

export interface RecSave {
  id: string;
  rec_id: string;
  user_id: string;
  created_at: string;
}

/**
 * One row of `community_feed`. `plan` and `salah` are null when that member
 * has the matching switch off — null means "not shared", an empty array means
 * "shared, and there is nothing there today". The page has to say those two
 * differently or it accuses people of doing nothing.
 */
export interface FeedMember {
  user_id: string;
  display_name: string;
  avatar: string | null;
  role: MemberRole;
  is_self: boolean;
  shares_plan: boolean;
  shares_salah: boolean;
  shares_shelf: boolean;
  plan: { title: string; status: TaskStatus }[] | null;
  salah: { name: PrayerName; status: PrayerStatus }[] | null;
}
