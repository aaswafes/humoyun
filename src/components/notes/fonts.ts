// =========================================================
// The fonts a note can be written in.
//
// Every stack ends in a family that is certainly installed, because a note is
// worthless if it renders as a fallback nobody chose. The two "Humoyun" faces
// point at the variables the root layout already loads, so a note written in
// them matches the rest of the app rather than looking pasted in.
// =========================================================

export interface FontChoice {
  /** what the menu says */
  label: string;
  /** the CSS font-family value written into the note */
  stack: string;
  /** the group the menu sorts it under */
  group: "App" | "Document" | "Screen" | "Special";
}

export const FONTS: FontChoice[] = [
  { label: "Humoyun Sans", group: "App", stack: 'var(--font-inter), -apple-system, "Segoe UI", system-ui, sans-serif' },
  { label: "Humoyun Serif", group: "App", stack: 'var(--font-serif-display), "Iowan Old Style", Georgia, serif' },

  { label: "Georgia", group: "Document", stack: 'Georgia, "Iowan Old Style", "Times New Roman", serif' },
  { label: "Times New Roman", group: "Document", stack: '"Times New Roman", Times, serif' },
  { label: "Garamond", group: "Document", stack: '"EB Garamond", Garamond, "Apple Garamond", Georgia, serif' },

  { label: "Inter", group: "Screen", stack: 'var(--font-inter), Inter, system-ui, sans-serif' },
  { label: "Helvetica", group: "Screen", stack: 'Helvetica, "Helvetica Neue", Arial, sans-serif' },
  { label: "Verdana", group: "Screen", stack: 'Verdana, Geneva, Tahoma, sans-serif' },

  { label: "Mono", group: "Special", stack: 'ui-monospace, "JetBrains Mono", "SF Mono", Consolas, Menlo, monospace' },
  { label: "Handwriting", group: "Special", stack: '"Ink Free", "Segoe Script", "Bradley Hand", "Brush Script MT", cursive' },
];

export const FONT_GROUPS: FontChoice["group"][] = ["App", "Document", "Screen", "Special"];

export const DEFAULT_FONT = FONTS[0];

/** The readable family names each menu entry can come back as. */
const PROBES: Record<string, string[]> = {
  "Humoyun Sans": ["inter", "-apple-system", "segoe ui", "system-ui"],
  "Humoyun Serif": ["instrument serif", "serif-display", "iowan old style"],
  Georgia: ["georgia"],
  "Times New Roman": ["times new roman", "times"],
  Garamond: ["eb garamond", "garamond"],
  Inter: ["inter"],
  Helvetica: ["helvetica", "arial"],
  Verdana: ["verdana", "geneva", "tahoma"],
  Mono: ["mono", "consolas", "menlo", "courier"],
  Handwriting: ["ink free", "segoe script", "bradley hand", "brush script", "cursive"],
};

const clean = (v: string) =>
  v.replace(/["']/g, "").replace(/s+/g, " ").trim().toLowerCase();

/** Matches a rendered font-family back to the menu entry that wrote it. */
export function fontFromStack(stack: string | null | undefined): FontChoice | null {
  if (!stack) return null;
  const want = clean(stack);
  const head = want.split(",")[0];

  const exact = FONTS.find((f) => clean(f.stack) === want);
  if (exact) return exact;

  // next/font resolves `var(--font-inter)` to a hashed family name, so the
  // comparison has to be "does this contain the readable part", not equality.
  return FONTS.find((f) => (PROBES[f.label] ?? []).some((p) => head.includes(p)))
    ?? FONTS.find((f) => (PROBES[f.label] ?? []).some((p) => want.includes(p)))
    ?? null;
}

// ---------------------------------------------------------
// Size
//
// Document text, not UI text: the app's 10.5–19px scale governs the chrome
// around the note, never what is written inside it. A heading someone sets to
// 36px is the whole point of having a size menu.
// ---------------------------------------------------------
export const FONT_SIZES = [11, 12, 13, 14, 16, 18, 20, 24, 30, 36, 48] as const;

export const DEFAULT_SIZE = 14;

/** The seven text colours the editor offers, as tokens that work in both themes. */
export const TEXT_COLORS: { label: string; value: string }[] = [
  { label: "Default", value: "" },
  { label: "Grey", value: "var(--ink-3)" },
  { label: "Red", value: "#e03e3e" },
  { label: "Orange", value: "#d9730d" },
  { label: "Green", value: "#0f7b6c" },
  { label: "Blue", value: "#0b6bcb" },
  { label: "Violet", value: "#6940a5" },
];

/** Highlights are washes rather than fills, so text stays readable when the theme flips. */
export const HIGHLIGHTS: { label: string; value: string }[] = [
  { label: "None", value: "" },
  { label: "Yellow", value: "rgba(223,171,1,.28)" },
  { label: "Green", value: "rgba(15,123,108,.22)" },
  { label: "Blue", value: "rgba(11,107,203,.20)" },
  { label: "Pink", value: "rgba(173,26,114,.20)" },
  { label: "Grey", value: "rgba(120,119,116,.20)" },
];
