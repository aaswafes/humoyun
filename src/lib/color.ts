// =========================================================
// The small amount of colour maths a custom accent needs.
//
// A preset accent ships five tuned values per theme. A colour the user picks
// out of a wheel ships one, so the other four have to be derived — and
// derived well enough that the result is still readable on both grounds.
//
// Everything here is sRGB and deliberately simple. No colour-space library
// for four values.
// =========================================================

export interface Rgb { r: number; g: number; b: number }

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

export function isHex(value: string): boolean {
  return HEX.test(value.trim());
}

export function hexToRgb(hex: string): Rgb | null {
  const m = HEX.exec(hex.trim());
  if (!m) return null;
  let s = m[1];
  if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
  return {
    r: parseInt(s.slice(0, 2), 16),
    g: parseInt(s.slice(2, 4), 16),
    b: parseInt(s.slice(4, 6), 16),
  };
}

const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));

export function rgbToHex({ r, g, b }: Rgb): string {
  return "#" + [r, g, b].map((n) => clamp(n).toString(16).padStart(2, "0")).join("");
}

export function rgba({ r, g, b }: Rgb, alpha: number): string {
  return `rgba(${clamp(r)}, ${clamp(g)}, ${clamp(b)}, ${Math.round(alpha * 1000) / 1000})`;
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function luminance({ r, g, b }: Rgb): number {
  const f = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** Contrast ratio between two colours, 1 to 21. */
export function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

export function mix(a: Rgb, b: Rgb, amount: number): Rgb {
  return {
    r: a.r + (b.r - a.r) * amount,
    g: a.g + (b.g - a.g) * amount,
    b: a.b + (b.b - a.b) * amount,
  };
}

const WHITE: Rgb = { r: 255, g: 255, b: 255 };
const BLACK: Rgb = { r: 0, g: 0, b: 0 };

/**
 * Text that stays readable ON the accent. Whichever of black or white has
 * more contrast wins — which is why a yellow accent gets dark text and a
 * navy one gets light, without either being special-cased.
 */
export function inkOn(base: Rgb): string {
  return contrast(base, WHITE) >= contrast(base, BLACK) ? "#ffffff" : "#141414";
}

export interface AccentVars {
  accent: string;
  accentHover: string;
  accentInk: string;
  accentSoft: string;
  accentLine: string;
  selected: string;
}

/**
 * The five accent tokens, from one colour.
 *
 * Hover moves toward white in dark mode and toward black in light, because
 * "brighter" reads as hover on a dark ground and "deeper" reads as hover on
 * a light one. The soft and line values are alpha rather than mixes so they
 * sit correctly over whatever surface happens to be behind them.
 */
export function accentVars(hex: string, dark: boolean): AccentVars | null {
  const base = hexToRgb(hex);
  if (!base) return null;
  return {
    accent: rgbToHex(base),
    accentHover: rgbToHex(mix(base, dark ? WHITE : BLACK, 0.16)),
    accentInk: inkOn(base),
    accentSoft: rgba(base, dark ? 0.18 : 0.12),
    accentLine: rgba(base, dark ? 0.44 : 0.36),
    selected: rgba(base, dark ? 0.16 : 0.1),
  };
}

/**
 * Whether a chosen accent will actually be legible as text on the page
 * background. Used to warn rather than to forbid — it is the user's app,
 * and a warning they can read beats a colour they cannot pick.
 */
export function accentReadable(hex: string, dark: boolean): boolean {
  const base = hexToRgb(hex);
  if (!base) return false;
  const ground = dark ? { r: 25, g: 25, b: 25 } : WHITE;
  return contrast(base, ground) >= 3;
}
