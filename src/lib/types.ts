// =========================================================
// Humoyun — domain types. Mirrors the Supabase schema 1:1.
// Dates are 'yyyy-MM-dd' strings. Times are minutes from midnight.
// =========================================================

export type Tint =
  | "slate" | "red" | "orange" | "amber" | "emerald"
  | "teal" | "blue" | "violet" | "pink" | "brown";

export const TINTS: Tint[] = [
  "slate", "red", "orange", "amber", "emerald",
  "teal", "blue", "violet", "pink", "brown",
];

export type Accent = "blue" | "violet" | "emerald" | "amber" | "rose" | "graphite";
export const ACCENTS: Accent[] = ["blue", "violet", "emerald", "amber", "rose", "graphite"];

export type TaskStatus = "todo" | "doing" | "done" | "dropped";
export type TaskKind =
  | "task" | "event" | "reading" | "watching"
  | "habit" | "prayer" | "block" | "milestone";
export type Horizon = "life" | "year" | "quarter" | "month" | "week";
export type PrayerName = "fajr" | "dhuhr" | "asr" | "maghrib" | "isha";
export type PrayerStatus = "none" | "prayed" | "jamaah" | "late" | "qadha" | "missed";

export const PRAYER_NAMES: PrayerName[] = ["fajr", "dhuhr", "asr", "maghrib", "isha"];
export const PRAYER_LABELS: Record<PrayerName, string> = {
  fajr: "Fajr", dhuhr: "Dhuhr", asr: "Asr", maghrib: "Maghrib", isha: "Isha",
};

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export interface Recurrence {
  freq: "daily" | "weekly" | "monthly";
  interval: number;
  weekdays?: number[];   // 0 = Sunday
  until?: string | null; // yyyy-MM-dd
  count?: number | null;
}

export interface Profile {
  id: string;
  display_name: string | null;
  avatar: string | null;
  city: string;
  latitude: number;
  longitude: number;
  timezone: string;
  calc_method: string;
  madhab: string;
  week_start: number;
  theme: "light" | "dark" | "system";
  accent: Accent;
  prefs: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: string;
  user_id: string;
  title: string;
  notes: string | null;
  status: TaskStatus;
  priority: number;          // 0 none, 1 low, 2 medium, 3 high
  kind: TaskKind;
  date: string | null;       // null = Inbox
  start_min: number | null;
  end_min: number | null;
  all_day: boolean;
  duration_min: number | null;
  actual_min: number;
  completed_at: string | null;
  color: Tint | null;
  icon: string | null;
  tags: string[];
  checklist: ChecklistItem[];
  order_index: number;
  parent_id: string | null;
  book_id: string | null;
  media_id: string | null;
  habit_id: string | null;
  goal_id: string | null;
  project_id: string | null;
  template_id: string | null;
  page_from: number | null;
  page_to: number | null;
  episode_from: number | null;
  episode_to: number | null;
  recurrence: Recurrence | null;
  series_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Book {
  id: string;
  user_id: string;
  title: string;
  author: string | null;
  /** Shelf-level classification: fiction, history, sirah, tafsir… */
  genre: string | null;
  /** What it is actually about, finer than genre: habits, Ottoman era, fiqh… */
  topic: string | null;
  /** Collection or cycle a book belongs to. */
  series: string | null;
  cover_url: string | null;
  color: Tint;
  total_pages: number;
  current_page: number;
  pages_per_day: number | null;
  start_date: string | null;
  end_date: string | null;
  status: "planned" | "reading" | "finished" | "paused" | "dropped";
  rating: number | null;
  notes: string | null;
  order_index: number;
  created_at: string;
  updated_at: string;
}

export type MediaKind = "film" | "anime" | "series" | "youtube" | "playlist";

export const MEDIA_KINDS: MediaKind[] = ["film", "anime", "series"];
/** The YouTube shelf is the same model, listed separately. */
export const YOUTUBE_KINDS: MediaKind[] = ["youtube", "playlist"];
export const MEDIA_KIND_LABELS: Record<MediaKind, string> = {
  film: "Film",
  anime: "Anime",
  series: "Series",
  youtube: "Video",
  playlist: "Playlist",
};

/**
 * A film is a one-episode title. Keeping films and series in one shape means
 * the shelf, the scheduler and the calendar do not need to know the difference
 * — only the UI hides the pacing controls when there is a single episode.
 */
export interface Media {
  id: string;
  user_id: string;
  title: string;
  /** Director for a film, studio for a series. */
  creator: string | null;
  kind: MediaKind;
  genre: string | null;
  topic: string | null;
  series: string | null;
  color: Tint;
  cover_url: string | null;
  url: string | null;
  channel: string | null;
  total_episodes: number;
  current_episode: number;
  episodes_per_day: number | null;
  /** Minutes per episode, or the film's running time. */
  runtime_min: number | null;
  start_date: string | null;
  end_date: string | null;
  status: "planned" | "watching" | "finished" | "paused" | "dropped";
  rating: number | null;
  notes: string | null;
  order_index: number;
  created_at: string;
  updated_at: string;
}

export type NoteKind = "note" | "highlight" | "thought" | "daily" | "idea" | "summary";

export const NOTE_KINDS: NoteKind[] = ["note", "highlight", "thought", "daily", "idea", "summary"];
export const NOTE_KIND_LABELS: Record<NoteKind, string> = {
  note: "Note",
  highlight: "Highlight",
  thought: "Thought",
  daily: "Daily",
  idea: "Idea",
  summary: "Summary",
};

/**
 * How a note's body is stored. Everything written before the rich editor is
 * 'plain' and stays that way until it is opened and edited — so no note ever
 * has to be migrated in place, and a body is never guessed at.
 */
export type NoteFormat = "plain" | "html";

/**
 * Where a note has been put on the notes board, and how big it was made.
 *
 * `null` means nobody has moved it: the board lays it out itself, in reading
 * order, and will keep doing so as the window changes width. The moment it is
 * dragged or resized this is written, and from then on that card stays exactly
 * where it was put.
 *
 * `z` is stored rather than derived from list order so that bringing a card to
 * the front survives a re-sort.
 */
export interface NoteLayout {
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
}

/**
 * A shelf a note can sit on — Books, Films, Sirah. Unlike `kind`, which is one
 * word for what a note *is*, a note belongs to as many categories as apply.
 *
 * The name is stored on the note as text; this row only carries the colour,
 * the icon and the order. A category with no row still works, it just draws
 * slate — which is what makes typing a new one into the picker safe.
 */
export interface NoteCategory {
  id: string;
  user_id: string;
  name: string;
  icon: string | null;
  color: Tint;
  order_index: number;
  created_at: string;
  updated_at: string;
}

/**
 * What is needed to try a password against a locked note.
 *
 * Deliberately not a password, a hash of one, or anything derived from one:
 * a salt and an IV are public inputs. The key is derived in the browser from
 * what the reader types and never leaves it, so a locked note is unreadable to
 * the database, to the network and to whoever is looking over your shoulder —
 * and to you, permanently, if the password is forgotten.
 */
export interface NoteLock {
  /** scheme version, so the derivation can change without stranding old notes */
  v: 1;
  /** base64, 16 bytes, unique per note */
  salt: string;
  /** base64, 12 bytes, re-rolled on every save */
  iv: string;
  /** an optional nudge, shown on the unlock prompt. Never the password. */
  hint?: string | null;
}

/**
 * A note stands on its own but usually came from somewhere — a book, a film,
 * a day. Those links are what let the same note appear on the shelf it belongs
 * to and in one list of everything written.
 */
export interface Note {
  id: string;
  user_id: string;
  title: string | null;
  body: string;
  kind: NoteKind;
  book_id: string | null;
  media_id: string | null;
  task_id: string | null;
  goal_id: string | null;
  project_id: string | null;
  /** the day a daily note belongs to */
  date: string | null;
  /** page for a book, minutes for a film, episode for a series */
  locator: number | null;
  tags: string[];
  /** the shelves it sits on — many at once, unlike `kind` */
  categories: string[];
  color: Tint | null;
  pinned: boolean;
  format: NoteFormat;
  /** folded down to its title on the cards and the board */
  collapsed: boolean;
  /** set when `body` is ciphertext rather than words */
  lock: NoteLock | null;
  /** a template is a note held back from the lists and offered when writing */
  is_template: boolean;
  /** its place on the canvas, or null when it has not been put there */
  layout: NoteLayout | null;
  created_at: string;
  updated_at: string;
}

export interface Habit {
  id: string;
  user_id: string;
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
  order_index: number;
  created_at: string;
  updated_at: string;
}

export interface HabitLog {
  id: string;
  user_id: string;
  habit_id: string;
  date: string;
  count: number;
  note: string | null;
  logged_at: string;
}

export interface Goal {
  id: string;
  user_id: string;
  parent_id: string | null;
  title: string;
  description: string | null;
  horizon: Horizon;
  start_date: string | null;
  end_date: string | null;
  target: number | null;
  current: number;
  unit: string | null;
  color: Tint;
  icon: string | null;
  status: "active" | "done" | "paused" | "dropped";
  order_index: number;
  created_at: string;
  updated_at: string;
}

export type ProjectStatus = "idea" | "active" | "paused" | "done" | "dropped";

/**
 * A body of work with an end. A goal says what you are aiming at; a project is
 * the thing you actually build to get there, and it owns tasks.
 *
 * Milestones are not a separate table — a task with `kind: "milestone"` and a
 * date is one, which is why the calendar and the timeline can already draw
 * them without knowing projects exist.
 */
export interface Project {
  id: string;
  user_id: string;
  name: string;
  /** the brief: what finished looks like */
  description: string | null;
  status: ProjectStatus;
  color: Tint;
  icon: string | null;
  start_date: string | null;
  due_date: string | null;
  /** the goal this work serves */
  goal_id: string | null;
  order_index: number;
  created_at: string;
  updated_at: string;
}

export interface TemplateItem {
  title: string;
  kind?: TaskKind;
  day_offset?: number;      // 0 = the day it is applied to
  start_min?: number | null;
  end_min?: number | null;
  duration_min?: number | null;
  priority?: number;
  color?: Tint | null;
  icon?: string | null;
  tags?: string[];
  notes?: string | null;
  checklist?: ChecklistItem[];
}

export interface Template {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  icon: string;
  color: Tint;
  scope: "day" | "week" | "block";
  items: TemplateItem[];
  use_count: number;
  order_index: number;
  created_at: string;
  updated_at: string;
}

export interface Prayer {
  id: string;
  user_id: string;
  date: string;
  name: PrayerName;
  status: PrayerStatus;
  logged_at: string;
}

export interface DayLog {
  id: string;
  user_id: string;
  date: string;
  mood: number | null;
  energy: number | null;
  focus_score: number | null;
  gratitude: string | null;
  highlight: string | null;
  note: string | null;
  quran_pages: number;
  water: number;
  sleep_hours: number | null;
  steps: number | null;
  data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface FocusSession {
  id: string;
  user_id: string;
  task_id: string | null;
  label: string | null;
  tags: string[];
  mode: "stopwatch" | "pomodoro" | "break";
  started_at: string;
  ended_at: string | null;
  seconds: number;
  completed: boolean;
  note: string | null;
}

export interface Review {
  id: string;
  user_id: string;
  week_start: string;
  went_well: string | null;
  went_bad: string | null;
  learned: string | null;
  next_week: string | null;
  rating: number | null;
  data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Tag {
  id: string;
  user_id: string;
  name: string;
  color: Tint;
  created_at: string;
}

// ---------------------------------------------------------
// Collection registry — used by the generic store CRUD.
// ---------------------------------------------------------
export interface Collections {
  tasks: Task;
  books: Book;
  media: Media;
  notes: Note;
  noteCategories: NoteCategory;
  habits: Habit;
  habitLogs: HabitLog;
  goals: Goal;
  projects: Project;
  templates: Template;
  prayers: Prayer;
  dayLogs: DayLog;
  focusSessions: FocusSession;
  reviews: Review;
  tags: Tag;
}

export type CollectionKey = keyof Collections;

export const TABLE_OF: Record<CollectionKey, string> = {
  tasks: "tasks",
  books: "books",
  media: "media",
  notes: "notes",
  noteCategories: "note_categories",
  habits: "habits",
  habitLogs: "habit_logs",
  goals: "goals",
  projects: "projects",
  templates: "templates",
  prayers: "prayers",
  dayLogs: "day_logs",
  focusSessions: "focus_sessions",
  reviews: "reviews",
  tags: "tags",
};

export const PRIORITY_LABELS = ["None", "Low", "Medium", "High"] as const;
