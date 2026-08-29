// =========================================================
// Link handling for the YouTube shelf.
//
// The rule everywhere below: a link is a convenience, never a gate. Nothing
// here ever refuses to save — the worst a malformed link earns is a quiet hint
// under the field.
// =========================================================

/** Adds the scheme people leave off, so "youtube.com/watch?v=x" still opens. */
export function normalizeUrl(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  // A bare word is not a link; a bare host is one waiting for its scheme.
  if (/^[\w-]+(\.[\w-]+)+(\/|$|\?)/.test(value)) return `https://${value}`;
  return value;
}

/** Loose on purpose: "does this read like a link", not "is this a valid URL". */
export function looksLikeUrl(raw: string): boolean {
  const value = normalizeUrl(raw);
  if (!value) return false;
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && url.hostname.includes(".");
  } catch {
    return false;
  }
}

const YOUTUBE_HOSTS = ["youtube.com", "youtu.be", "youtube-nocookie.com", "music.youtube.com"];

export function isYoutubeUrl(raw: string): boolean {
  const value = normalizeUrl(raw);
  if (!value) return false;
  try {
    const host = new URL(value).hostname.replace(/^www\./, "").toLowerCase();
    return YOUTUBE_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

/** "youtube.com/watch" — enough to recognise a link without wrapping a line. */
export function urlLabel(raw: string): string {
  const value = normalizeUrl(raw);
  if (!value) return "";
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^www\./, "");
    const path = url.pathname === "/" ? "" : url.pathname;
    const label = `${host}${path}`;
    return label.length > 42 ? `${label.slice(0, 41)}…` : label;
  } catch {
    return value.length > 42 ? `${value.slice(0, 41)}…` : value;
  }
}

/**
 * The one line under the URL field. Empty means the field is happy: a link is
 * optional, an odd-looking one is a note to the user, not an error.
 */
export function urlHint(raw: string): string {
  const value = raw.trim();
  if (!value) return "";
  if (!looksLikeUrl(value)) return "That does not look like a link — it saves either way.";
  if (!isYoutubeUrl(value)) return "Not a youtube.com link, but it will open fine.";
  return "";
}
