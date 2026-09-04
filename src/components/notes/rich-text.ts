// =========================================================
// A note's body, in two shapes.
//
// Everything written before the rich editor is plain text and stays that way
// until it is opened; everything written since is HTML. One pair of functions
// converts between them and one sanitiser decides what HTML is allowed to be,
// so no other file ever has to ask which shape it is holding.
//
// `htmlToText` is deliberately regex-only and touches no DOM: cards and lists
// render on the server as well as the client, and a summary that disagreed
// between the two would be a hydration mismatch on every note on the page.
// =========================================================

import type { Note } from "@/lib/types";

// ---------------------------------------------------------
// Escaping and conversion
// ---------------------------------------------------------

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Plain text as paragraphs. A blank line separates them; a single one breaks. */
export function plainToHtml(text: string): string {
  const html = text
    .split(/\n{2,}/)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, "<br>") || "<br>"}</p>`)
    .join("");
  return html || "<p><br></p>";
}

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
};

/** Blocks that end a line when they close, so text does not run together. */
const BLOCK_CLOSE = /<\/(p|div|li|h[1-6]|blockquote|pre|tr|section|article)\s*>/gi;

export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(BLOCK_CLOSE, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&(?:amp|lt|gt|quot|#39|apos|nbsp);/g, (m) => ENTITIES[m] ?? m)
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * A note's words, whichever shape its body is stored in.
 *
 * A locked note has none as far as everything else is concerned: its body is
 * ciphertext, and running search, previews or word counts over base64 would
 * both be nonsense and leak how long the note is. One guard here keeps every
 * caller honest without any of them having to know about encryption.
 */
export function noteText(note: Pick<Note, "body" | "format" | "lock">): string {
  if (note.lock) return "";
  return note.format === "html" ? htmlToText(note.body) : note.body;
}

/** True when there is nothing written — an empty paragraph counts as nothing. */
export function isEmptyBody(note: Pick<Note, "body" | "format" | "lock">): boolean {
  return noteText(note).trim() === "";
}

/**
 * What the editor opens with, given a body that may still be plain.
 *
 * Never called for a locked note: the editor holds the decrypted text itself
 * and hands it in, because this function has no password to work with.
 */
export function bodyAsHtml(note: Pick<Note, "body" | "format">): string {
  if (note.format === "html") return note.body || "<p><br></p>";
  return plainToHtml(note.body);
}

// ---------------------------------------------------------
// Sanitising
//
// The editor is the only writer, but paste brings in whatever was on the
// clipboard — a whole web page, with its scripts and its handlers. This is an
// allowlist rather than a blocklist: anything not named here is unwrapped
// (its text kept) or dropped, and nothing can be added to it by accident.
// ---------------------------------------------------------

const ALLOWED_TAGS = new Set([
  "p", "div", "br", "span", "b", "strong", "i", "em", "u", "s", "strike", "del",
  "mark", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "blockquote",
  "pre", "code", "a", "hr", "sub", "sup",
]);

/** Tags whose content is not text, and so must go with them. */
const DROP_WHOLE = new Set([
  "script", "style", "iframe", "object", "embed", "video", "audio", "canvas",
  "form", "input", "button", "select", "textarea", "svg", "math", "link", "meta",
]);

const ALLOWED_STYLES = new Set([
  "font-family", "font-size", "font-weight", "font-style",
  "text-decoration", "text-decoration-line", "color", "background-color",
  "text-align", "line-height",
]);

/** The only classes the editor writes, and so the only ones it trusts back. */
const ALLOWED_CLASSES = new Set(["hm-check", "hm-wiki", "hm-code"]);

const SAFE_HREF = /^(https?:|mailto:|tel:|#|\/)/i;

function cleanStyle(value: string): string {
  const kept: string[] = [];
  for (const rule of value.split(";")) {
    const at = rule.indexOf(":");
    if (at < 0) continue;
    const prop = rule.slice(0, at).trim().toLowerCase();
    const val = rule.slice(at + 1).trim();
    if (!ALLOWED_STYLES.has(prop)) continue;
    // url() reaches the network and expression() used to reach the parser.
    if (/url\s*\(|expression\s*\(|javascript:/i.test(val)) continue;
    kept.push(prop + ": " + val);
  }
  return kept.join("; ");
}

function cleanClasses(value: string): string {
  return value.split(/\s+/).filter((c) => ALLOWED_CLASSES.has(c)).join(" ");
}

function scrub(el: Element) {
  for (const attr of [...el.attributes]) {
    const name = attr.name.toLowerCase();

    if (name === "style") {
      const style = cleanStyle(attr.value);
      if (style) el.setAttribute("style", style);
      else el.removeAttribute("style");
      continue;
    }
    if (name === "class") {
      const cls = cleanClasses(attr.value);
      if (cls) el.setAttribute("class", cls);
      else el.removeAttribute("class");
      continue;
    }
    if (name === "data-done" && el.tagName === "LI") continue;
    if (name === "data-note" && el.tagName === "A") continue;
    if (name === "href" && el.tagName === "A") {
      if (!SAFE_HREF.test(attr.value.trim())) el.removeAttribute("href");
      continue;
    }
    // Everything else — every on* handler, every id, every src — goes.
    el.removeAttribute(attr.name);
  }

  if (el.tagName === "A" && el.getAttribute("href")) {
    el.setAttribute("rel", "noopener noreferrer");
    el.setAttribute("target", "_blank");
  }
}

/** Replace an element with its own children, keeping the words. */
function unwrap(el: Element) {
  const parent = el.parentNode;
  if (!parent) return;
  while (el.firstChild) parent.insertBefore(el.firstChild, el);
  parent.removeChild(el);
}

/**
 * Client only — it needs a DOM. Stored HTML is not re-sanitised on the way out
 * because it was sanitised on the way in, which is the one place untrusted
 * markup can enter.
 */
export function sanitizeHtml(html: string): string {
  if (typeof window === "undefined" || typeof DOMParser === "undefined") return html;
  const doc = new DOMParser().parseFromString("<body>" + html + "</body>", "text/html");

  for (const el of [...doc.body.querySelectorAll("*")]) {
    const tag = el.tagName.toLowerCase();
    if (DROP_WHOLE.has(tag)) { el.remove(); continue; }
    if (!ALLOWED_TAGS.has(tag)) { unwrap(el); continue; }
    scrub(el);
  }

  return doc.body.innerHTML;
}

// ---------------------------------------------------------
// Links between notes
//
// Two ways to point at another note, both of which the graph reads as an edge:
// [[a title]] typed anywhere, and an anchor the picker wrote carrying the id it
// resolved to. The id is the reliable one — a title can be edited afterwards —
// so it is tried first and the text is the fallback.
// ---------------------------------------------------------

export const WIKILINK_RE = /\[\[([^\][]{1,120})\]\]/g;

/** The note ids an HTML body points at through anchors the picker wrote. */
export function linkedNoteIds(html: string): string[] {
  const out = new Set<string>();
  for (const m of html.matchAll(/data-note="([^"]+)"/g)) out.add(m[1]);
  return [...out];
}

/** The titles a body points at with [[…]], whatever shape the body is in. */
export function linkedTitles(note: Pick<Note, "body" | "format" | "lock">): string[] {
  const out = new Set<string>();
  for (const m of noteText(note).matchAll(WIKILINK_RE)) {
    const name = m[1].trim();
    if (name) out.add(name);
  }
  return [...out];
}

/** Both kinds of link, resolved to ids, for one note. */
export function outgoingLinks(
  note: Pick<Note, "body" | "format" | "lock">,
  byTitle: Map<string, string>,
): string[] {
  const ids = new Set<string>(
    !note.lock && note.format === "html" ? linkedNoteIds(note.body) : [],
  );
  for (const title of linkedTitles(note)) {
    const id = byTitle.get(title.toLowerCase());
    if (id) ids.add(id);
  }
  return [...ids];
}
