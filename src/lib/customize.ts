// =========================================================
// Everything about how Qalamchi looks, in one object.
//
// It lives in `profiles.prefs` — a jsonb column that already existed — so
// adding a knob here never needs a migration, and an old profile that has
// never seen these settings simply falls back to the defaults.
//
// Applying is one function that writes CSS custom properties onto <html>.
// Nothing re-renders to change a colour: the tokens every component already
// reads just take new values. That is the whole reason the design system was
// built on semantic tokens in the first place.
// =========================================================

import { accentVars, isHex } from "./color";

export type ThemeMode = "light" | "dark" | "system";
export type Palette = "default" | "warm" | "cool" | "contrast" | "midnight";
export type SansFont = "inter" | "manrope" | "figtree" | "plex" | "rubik" | "source";
export type DisplayFont = "instrument" | "playfair" | "fraunces" | "lora" | "body";
export type MonoFont = "jetbrains" | "plex-mono" | "system";
export type MotionPref = "full" | "calm" | "none";
export type TintSet = "notion" | "vivid" | "muted";
export type Lang = "en" | "uz";

/** The six tuned accents. Anything else is a hex the user picked. */
export const ACCENT_PRESETS = ["blue", "violet", "emerald", "amber", "rose", "graphite"] as const;
export type AccentPreset = (typeof ACCENT_PRESETS)[number];

export interface Appearance {
  theme: ThemeMode;
  palette: Palette;
  /** a preset name, or a #rrggbb the user chose */
  accent: string;
  sans: SansFont;
  display: DisplayFont;
  mono: MonoFont;
  /** whole-UI zoom, 0.85–1.3 */
  scale: number;
  /** corner radius multiplier, 0–1.6 */
  radius: number;
  /** lucide stroke width, 1–2.5 */
  iconStroke: number;
  motion: MotionPref;
  tints: TintSet;
  /** the Instrument Serif flourish on big numerals — off makes it all sans */
  serifNumerals: boolean;
  sidebarWidth: number;
  lang: Lang;
}

export const DEFAULT_APPEARANCE: Appearance = {
  theme: "system",
  palette: "default",
  accent: "blue",
  sans: "inter",
  display: "instrument",
  mono: "jetbrains",
  scale: 1,
  radius: 1,
  iconStroke: 2,
  motion: "full",
  tints: "notion",
  serifNumerals: true,
  sidebarWidth: 264,
  lang: "en",
};

// ---------------------------------------------------------
// Fonts
//
// The CSS variables are declared by next/font in layout.tsx. Only the two
// defaults are preloaded; the rest download the first time someone picks
// them, which is why offering eleven families costs a first-time visitor
// nothing.
// ---------------------------------------------------------

const SYSTEM_SANS = `-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif`;
const SYSTEM_SERIF = `"Iowan Old Style", Georgia, serif`;
const SYSTEM_MONO = `ui-monospace, "SF Mono", Menlo, monospace`;

export const SANS_FONTS: Record<SansFont, { label: string; stack: string }> = {
  inter:   { label: "Inter",         stack: `var(--font-inter), ${SYSTEM_SANS}` },
  manrope: { label: "Manrope",       stack: `var(--font-manrope), ${SYSTEM_SANS}` },
  figtree: { label: "Figtree",       stack: `var(--font-figtree), ${SYSTEM_SANS}` },
  plex:    { label: "IBM Plex Sans", stack: `var(--font-plex-sans), ${SYSTEM_SANS}` },
  rubik:   { label: "Rubik",         stack: `var(--font-rubik), ${SYSTEM_SANS}` },
  source:  { label: "Source Sans 3", stack: `var(--font-source-sans), ${SYSTEM_SANS}` },
};

export const DISPLAY_FONTS: Record<DisplayFont, { label: string; stack: string; italic: boolean }> = {
  instrument: { label: "Instrument Serif", stack: `var(--font-instrument), ${SYSTEM_SERIF}`, italic: true },
  playfair:   { label: "Playfair Display", stack: `var(--font-playfair), ${SYSTEM_SERIF}`,   italic: true },
  fraunces:   { label: "Fraunces",         stack: `var(--font-fraunces), ${SYSTEM_SERIF}`,   italic: false },
  lora:       { label: "Lora",             stack: `var(--font-lora), ${SYSTEM_SERIF}`,       italic: true },
  // "Match the body font" — for anyone who does not want the flourish at all.
  body:       { label: "Same as body",     stack: `var(--ui-font-sans)`,                    italic: false },
};

export const MONO_FONTS: Record<MonoFont, { label: string; stack: string }> = {
  jetbrains:  { label: "JetBrains Mono", stack: `var(--font-jetbrains), ${SYSTEM_MONO}` },
  "plex-mono":{ label: "IBM Plex Mono",  stack: `var(--font-plex-mono), ${SYSTEM_MONO}` },
  system:     { label: "System",         stack: SYSTEM_MONO },
};

export const PALETTE_LABELS: Record<Palette, string> = {
  default:  "Default",
  warm:     "Warm paper",
  cool:     "Cool grey",
  contrast: "High contrast",
  midnight: "Midnight",
};

export const MOTION_LABELS: Record<MotionPref, string> = {
  full: "Full", calm: "Calm", none: "None",
};

export const TINT_SET_LABELS: Record<TintSet, string> = {
  notion: "Notion", vivid: "Vivid", muted: "Muted",
};

// ---------------------------------------------------------
// Reading and writing
// ---------------------------------------------------------

const NUM = (v: unknown, lo: number, hi: number, fallback: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;

const ONE_OF = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;

/**
 * Pull a complete Appearance out of whatever `prefs` happens to contain.
 * Every field is validated, because prefs is jsonb and a hand-edited row or
 * an older build could put anything in there.
 */
export function readAppearance(
  prefs: Record<string, unknown> | undefined | null,
  /**
   * The two settings that predate this system and still have real columns.
   * They are the fallback so an account that has never opened the new
   * Appearance pane keeps the theme and accent it already chose.
   */
  legacy?: { theme?: ThemeMode | null; accent?: string | null },
): Appearance {
  const ui = (prefs?.ui ?? {}) as Record<string, unknown>;
  const d = DEFAULT_APPEARANCE;

  const rawAccent = ui.accent ?? legacy?.accent ?? undefined;
  const accent = typeof rawAccent === "string"
    && ((ACCENT_PRESETS as readonly string[]).includes(rawAccent) || isHex(rawAccent))
    ? rawAccent : d.accent;

  return {
    theme: ONE_OF(ui.theme ?? legacy?.theme ?? undefined, ["light", "dark", "system"] as const, d.theme),
    palette: ONE_OF(ui.palette, Object.keys(PALETTE_LABELS) as Palette[], d.palette),
    accent,
    sans: ONE_OF(ui.sans, Object.keys(SANS_FONTS) as SansFont[], d.sans),
    display: ONE_OF(ui.display, Object.keys(DISPLAY_FONTS) as DisplayFont[], d.display),
    mono: ONE_OF(ui.mono, Object.keys(MONO_FONTS) as MonoFont[], d.mono),
    scale: NUM(ui.scale, 0.85, 1.3, d.scale),
    radius: NUM(ui.radius, 0, 1.6, d.radius),
    iconStroke: NUM(ui.iconStroke, 1, 2.5, d.iconStroke),
    motion: ONE_OF(ui.motion, ["full", "calm", "none"] as const, d.motion),
    tints: ONE_OF(ui.tints, ["notion", "vivid", "muted"] as const, d.tints),
    serifNumerals: typeof ui.serifNumerals === "boolean" ? ui.serifNumerals : d.serifNumerals,
    sidebarWidth: NUM(ui.sidebarWidth, 200, 380, d.sidebarWidth),
    lang: ONE_OF(ui.lang, ["en", "uz"] as const, d.lang),
  };
}

/**
 * The base radius ramp, in px, at multiplier 1. These are the `--r-*`
 * variables `@theme` points at — NOT `--radius-*`, which Tailwind inlines
 * into utilities and therefore cannot be re-pointed at runtime.
 */
const RADII: [string, number][] = [
  ["--r-xs", 4], ["--r-sm", 6], ["--r-md", 9],
  ["--r-lg", 13], ["--r-xl", 18], ["--r-2xl", 24],
];

export function resolveDark(theme: ThemeMode): boolean {
  if (theme === "dark") return true;
  if (theme === "light") return false;
  return typeof window !== "undefined"
    && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/**
 * Write the whole appearance onto the document. Safe to call as often as you
 * like — it only ever sets properties, and setting the same value twice
 * costs nothing.
 */
export function applyAppearance(a: Appearance) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const dark = resolveDark(a.theme);

  root.classList.toggle("dark", dark);
  root.setAttribute("data-palette", a.palette);
  root.setAttribute("data-tints", a.tints);
  root.setAttribute("data-motion", a.motion);
  root.setAttribute("lang", a.lang);

  // A preset hands its values to CSS; a custom hex is computed here and set
  // inline, which then wins over whatever the preset rule said.
  if (isHex(a.accent)) {
    root.setAttribute("data-accent", "custom");
    const v = accentVars(a.accent, dark);
    if (v) {
      root.style.setProperty("--accent", v.accent);
      root.style.setProperty("--accent-hover", v.accentHover);
      root.style.setProperty("--accent-ink", v.accentInk);
      root.style.setProperty("--accent-soft", v.accentSoft);
      root.style.setProperty("--accent-line", v.accentLine);
      root.style.setProperty("--selected", v.selected);
    }
  } else {
    root.setAttribute("data-accent", a.accent);
    for (const p of ["--accent", "--accent-hover", "--accent-ink", "--accent-soft", "--accent-line", "--selected"]) {
      root.style.removeProperty(p);
    }
  }

  root.style.setProperty("--ui-font-sans", SANS_FONTS[a.sans].stack);
  root.style.setProperty("--ui-font-serif", DISPLAY_FONTS[a.display].stack);
  root.style.setProperty("--ui-font-mono", MONO_FONTS[a.mono].stack);
  // Only some display faces are meant to be italic; Fraunces set in italic
  // looks like a mistake rather than a flourish.
  root.style.setProperty("--display-style", DISPLAY_FONTS[a.display].italic ? "italic" : "normal");
  root.style.setProperty(
    "--display-family",
    a.serifNumerals ? "var(--ui-font-serif)" : "var(--ui-font-sans)",
  );

  root.style.setProperty("--ui-scale", String(a.scale));
  root.style.setProperty("--icon-stroke", String(a.iconStroke));
  root.style.setProperty("--sidebar-w", `${Math.round(a.sidebarWidth)}px`);

  for (const [name, px] of RADII) {
    root.style.setProperty(name, `${Math.round(px * a.radius * 10) / 10}px`);
  }
}

/**
 * The subset worth mirroring into localStorage, so the pre-paint script in
 * layout.tsx can apply it before React exists and the page never flashes the
 * wrong theme, font or size.
 */
export const BOOT_KEY = "humoyun.appearance";

export function cacheForBoot(a: Appearance) {
  try {
    localStorage.setItem(BOOT_KEY, JSON.stringify({
      theme: a.theme, palette: a.palette, accent: a.accent, sans: a.sans,
      display: a.display, mono: a.mono, scale: a.scale, radius: a.radius,
      iconStroke: a.iconStroke, motion: a.motion, tints: a.tints,
      serifNumerals: a.serifNumerals, sidebarWidth: a.sidebarWidth, lang: a.lang,
    }));
  } catch { /* private mode — the app just paints defaults first */ }
}
