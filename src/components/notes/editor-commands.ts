"use client";

// =========================================================
// The commands behind the toolbar.
//
// `document.execCommand` is deprecated and still the only thing every browser
// agrees on for editing a contentEditable range that spans elements. What it
// is bad at is *what* it writes — `<font>` tags, `xx-large`, whatever the
// engine feels like — so nothing here uses its output directly. Every styling
// command goes through `wrapSelection`, which borrows execCommand only to
// split the range correctly and then replaces its markers with one span
// carrying exactly the property asked for.
//
// That is why there is one primitive rather than four: font, size, colour and
// highlight are the same operation with a different declaration.
// =========================================================

/**
 * The markers execCommand is asked to leave behind, and which are immediately
 * replaced by a span carrying the property that was actually wanted.
 *
 * There is one per property rather than one shared marker, and that is the
 * whole point: `fontSize` strips every inline font-size in the range before it
 * writes its own. Borrowing it to mark a *highlight* therefore threw away the
 * size the user had just set. Each command may only clobber the property it is
 * about to define.
 */
const MARK_SIZE = "7";
const MARK_FACE = "--hm-mark";
const MARK_COLOR = "#010203";
const MARK_RGB = "rgb(1, 2, 3)";

function withHtmlMarkup<T>(fn: () => T): T {
  // styleWithCSS off is what makes execCommand emit <font>, which is a tag we
  // can find unambiguously. With it on we would be hunting for a span among
  // spans.
  try { document.execCommand("styleWithCSS", false, "false"); } catch { /* older engines */ }
  return fn();
}

export function exec(command: string, value?: string) {
  try { document.execCommand(command, false, value); } catch { /* nothing to do */ }
}

export function queryState(command: string): boolean {
  try { return document.queryCommandState(command); } catch { return false; }
}

export function queryValue(command: string): string {
  try { return document.queryCommandValue(command); } catch { return ""; }
}

/** True when the caret is inside the editor we are about to command. */
export function selectionInside(root: HTMLElement | null): boolean {
  if (!root) return false;
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return false;
  const node = sel.getRangeAt(0).commonAncestorContainer;
  return root.contains(node.nodeType === 1 ? node : node.parentNode);
}

export type StyleProp = "font-family" | "font-size" | "color" | "background-color";

/**
 * Put one CSS declaration on the selection.
 *
 * Passing an empty value resets rather than removes: `inherit` beats an
 * ancestor span that already carries the property, which "delete the
 * attribute" does not.
 */
const MARKERS: Record<StyleProp, { command: string; value: string; find: string }> = {
  "font-family": { command: "fontName", value: MARK_FACE, find: `font[face="${MARK_FACE}"]` },
  "font-size": { command: "fontSize", value: MARK_SIZE, find: `font[size="${MARK_SIZE}"]` },
  "color": { command: "foreColor", value: MARK_COLOR, find: `font[color="${MARK_COLOR}"]` },
  // hiliteColor is the one command that writes a span whatever styleWithCSS
  // says, and it normalises the marker colour to rgb() on the way.
  "background-color": {
    command: "hiliteColor",
    value: MARK_COLOR,
    find: `span[style*="background-color: ${MARK_RGB}"]`,
  },
};

export function wrapSelection(root: HTMLElement, prop: StyleProp, value: string) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;

  const mark = MARKERS[prop];
  withHtmlMarkup(() => document.execCommand(mark.command, false, mark.value));

  const reset = prop === "background-color" ? "transparent" : "inherit";
  const declared = value || reset;

  const made: HTMLElement[] = [];
  for (const marker of [...root.querySelectorAll(mark.find)]) {
    let target: HTMLElement;

    if (marker.tagName === "SPAN") {
      /**
       * `hiliteColor` merges its declaration into a span that is already
       * there instead of nesting inside it, so the marker element is also
       * carrying the font and the size the user set a moment ago. Rebuilding
       * it from scratch threw those away — highlighting text silently undid
       * its own size. Editing in place is what keeps them.
       */
      target = marker as HTMLElement;
      target.style.setProperty(prop, declared);
    } else {
      // A <font> tag carries nothing worth keeping; it becomes the span.
      const span = document.createElement("span");
      span.style.setProperty(prop, declared);
      while (marker.firstChild) span.appendChild(marker.firstChild);
      marker.replaceWith(span);
      target = span;
    }

    // A nested element carrying the same property would win over the new one.
    for (const inner of [...target.querySelectorAll<HTMLElement>("*")]) {
      inner.style.removeProperty(prop);
      if (!inner.getAttribute("style")) inner.removeAttribute("style");
    }
    made.push(target);
  }

  // Replacing the markers destroyed the nodes the old range pointed at, so
  // the selection has to be laid back over what was just written. Without
  // this, setting a font and then a size applies only the font: the second
  // command arrives to find nothing selected.
  if (made.length) {
    const next = document.createRange();
    next.setStartBefore(made[0]);
    next.setEndAfter(made[made.length - 1]);
    sel.removeAllRanges();
    sel.addRange(next);
  }
}

export const applyFont = (root: HTMLElement, stack: string) =>
  wrapSelection(root, "font-family", stack);

export const applySize = (root: HTMLElement, px: number | null) =>
  wrapSelection(root, "font-size", px ? `${px}px` : "");

export const applyColor = (root: HTMLElement, color: string) =>
  wrapSelection(root, "color", color);

export const applyHighlight = (root: HTMLElement, color: string) =>
  wrapSelection(root, "background-color", color);

// ---------------------------------------------------------
// Reading back what the caret is sitting in
// ---------------------------------------------------------

function caretElement(root: HTMLElement): HTMLElement | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const node = sel.getRangeAt(0).startContainer;
  const el = (node.nodeType === 1 ? node : node.parentNode) as HTMLElement | null;
  return el && root.contains(el) ? el : null;
}

/** The computed value at the caret, which is what the menus should show. */
export function caretStyle(root: HTMLElement, prop: string): string | null {
  const el = caretElement(root);
  if (!el) return null;
  return getComputedStyle(el).getPropertyValue(prop) || null;
}

export function caretFontSize(root: HTMLElement): number | null {
  const raw = caretStyle(root, "font-size");
  if (!raw) return null;
  const px = Number.parseFloat(raw);
  return Number.isFinite(px) ? Math.round(px) : null;
}

/** The block tag the caret is in: p, h1, blockquote, pre… */
export function caretBlock(root: HTMLElement): string {
  let el = caretElement(root);
  const blocks = new Set(["P", "H1", "H2", "H3", "H4", "H5", "H6", "BLOCKQUOTE", "PRE", "LI", "DIV"]);
  while (el && el !== root) {
    if (blocks.has(el.tagName)) return el.tagName.toLowerCase();
    el = el.parentElement;
  }
  return "p";
}

const BLOCK_TAGS = "p, h1, h2, h3, h4, h5, h6, li, blockquote, pre";

/** The block element the caret sits in, never the editor itself. */
export function caretBlockElement(root: HTMLElement): HTMLElement | null {
  const el = caretElement(root);
  const block = el?.closest(BLOCK_TAGS) as HTMLElement | null;
  return block && block !== root && root.contains(block) ? block : null;
}

/** The list the caret is in, if any — a checklist is a list with a class. */
export function caretList(root: HTMLElement): "ul" | "ol" | "check" | null {
  let el = caretElement(root);
  while (el && el !== root) {
    if (el.tagName === "UL") return el.classList.contains("hm-check") ? "check" : "ul";
    if (el.tagName === "OL") return "ol";
    el = el.parentElement;
  }
  return null;
}

// ---------------------------------------------------------
// Blocks and lists
// ---------------------------------------------------------

export function setBlock(tag: string) {
  // Engines disagree about whether formatBlock wants the angle brackets.
  exec("formatBlock", `<${tag}>`);
}

/**
 * Tidy what the browser leaves behind after a block command.
 *
 * Two things, both of which only matter once the HTML is stored and read back:
 *
 *  - A list or a quote nested inside a `<p>`. The DOM allows it, the parser
 *    does not — re-opening the note would re-parse it into a different shape
 *    than the one on screen when it was written.
 *  - A paragraph with no children at all. It has no `<br>`, so it renders at
 *    zero height and cannot be typed in: debris, not a blank line.
 */
export function normalizeBlocks(root: HTMLElement) {
  const wrappers = new Set<HTMLElement>();
  for (const nested of root.querySelectorAll(
    "p > ul, p > ol, p > blockquote, p > pre, p > h1, p > h2, p > h3, p > h4",
  )) {
    const p = nested.parentElement as HTMLElement | null;
    if (p) wrappers.add(p);
  }
  for (const p of wrappers) p.replaceWith(...p.childNodes);

  const anchor = window.getSelection()?.anchorNode ?? null;
  for (const p of [...root.querySelectorAll("p")]) {
    if (p.childNodes.length) continue;
    if (anchor && (p === anchor || p.contains(anchor))) continue;
    p.remove();
  }
}

/**
 * A checklist is a real `ul` with a class, so every list command, every
 * Enter-splits-the-item behaviour and every paste path keeps working. Only the
 * box in front of the text is ours.
 */
export function toggleChecklist(root: HTMLElement) {
  const current = caretList(root);
  if (current === "check") {
    // Back to an ordinary list rather than to nothing: turning the boxes off
    // should not also flatten the bullets the user built.
    const el = caretElement(root)?.closest("ul.hm-check");
    el?.classList.remove("hm-check");
    el?.querySelectorAll("li").forEach((li) => li.removeAttribute("data-done"));
    return;
  }
  if (current === "ul" || current === "ol") {
    // Already a list: this is a change of kind, and every item comes along.
    const list = caretElement(root)?.closest("ul, ol");
    if (!list) return;
    if (list.tagName === "OL") exec("insertUnorderedList");
    const ul = caretElement(root)?.closest("ul");
    if (!ul) return;
    ul.classList.add("hm-check");
    ul.querySelectorAll("li").forEach((li) => li.setAttribute("data-done", "false"));
    return;
  }

  /**
   * Build the list rather than asking the browser for one.
   *
   * `insertUnorderedList` on a paragraph that happens to sit under an existing
   * list merges the new item into it — so starting a checklist on the line
   * after a bullet list turned that whole list into checkboxes. Constructing
   * the element here starts exactly one list, where the caret is.
   */
  const block = caretBlockElement(root);
  if (!block) return;

  const list = document.createElement("ul");
  list.className = "hm-check";
  const item = document.createElement("li");
  item.setAttribute("data-done", "false");
  while (block.firstChild) item.appendChild(block.firstChild);
  if (!item.firstChild) item.appendChild(document.createElement("br"));
  list.appendChild(item);
  block.replaceWith(list);

  const caret = document.createRange();
  caret.setStart(item, 0);
  caret.collapse(true);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(caret);
}

/**
 * Enter on an empty quote or code block leaves it.
 *
 * The browser's answer is another quote, forever — there is no way out of a
 * blockquote with the keyboard alone. Returns true when it handled the key.
 */
export function exitBlockOnEnter(root: HTMLElement): boolean {
  const block = caretBlockElement(root);
  if (!block) return false;
  if (block.tagName !== "BLOCKQUOTE" && block.tagName !== "PRE") return false;
  if (block.textContent?.trim()) return false;
  setBlock("p");
  return true;
}

/** The click target for a checkbox is the gutter in front of the item. */
export const CHECK_GUTTER = 24;

export function checklistItemAt(target: EventTarget | null, clientX: number): HTMLLIElement | null {
  const el = target instanceof Element ? target : null;
  const li = el?.closest("li");
  if (!li || !li.parentElement?.classList.contains("hm-check")) return null;
  const box = li.getBoundingClientRect();
  return clientX - box.left <= CHECK_GUTTER ? (li as HTMLLIElement) : null;
}

// ---------------------------------------------------------
// Links
// ---------------------------------------------------------

export function insertLink(url: string) {
  const href = /^[a-z][\w+.-]*:/i.test(url) || url.startsWith("/") ? url : `https://${url}`;
  exec("createLink", href);
  const sel = window.getSelection();
  const node = sel?.anchorNode;
  const anchor = (node?.nodeType === 1 ? (node as Element) : node?.parentElement)?.closest("a");
  if (anchor) {
    anchor.setAttribute("target", "_blank");
    anchor.setAttribute("rel", "noopener noreferrer");
  }
}

/**
 * Replace the `[[query` the user is typing with a link to a real note.
 *
 * The id goes on the anchor because a title can be edited afterwards and the
 * graph should not lose an edge when it is.
 */
export function insertWikiLink(noteId: string, title: string, typed: number) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return;
  const range = sel.getRangeAt(0);
  const node = range.startContainer;
  if (node.nodeType !== Node.TEXT_NODE) return;

  // `typed` counts the "[[" and everything after it, back from the caret.
  const start = Math.max(0, range.startOffset - typed);
  const replace = document.createRange();
  replace.setStart(node, start);
  replace.setEnd(node, range.startOffset);
  replace.deleteContents();

  const anchor = document.createElement("a");
  anchor.className = "hm-wiki";
  anchor.setAttribute("data-note", noteId);
  anchor.textContent = title;
  replace.insertNode(anchor);

  // A trailing space, so the caret leaves the link rather than extending it.
  const after = document.createTextNode(" ");
  anchor.after(after);

  const next = document.createRange();
  next.setStart(after, 1);
  next.collapse(true);
  sel.removeAllRanges();
  sel.addRange(next);
}

/** What the user has typed since an unclosed `[[`, or null. */
export function wikiQueryAtCaret(root: HTMLElement): { query: string; typed: number } | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return null;
  const range = sel.getRangeAt(0);
  const node = range.startContainer;
  if (node.nodeType !== Node.TEXT_NODE || !root.contains(node)) return null;

  const before = (node.textContent ?? "").slice(0, range.startOffset);
  const match = /\[\[([^\][]*)$/.exec(before);
  if (!match) return null;
  return { query: match[1], typed: match[0].length };
}

// ---------------------------------------------------------
// Markdown shorthand
//
// Typing is faster than reaching for a button, and these five are the ones
// muscle memory already knows. Anything more would be a second, hidden syntax
// to learn on top of a visible toolbar.
// ---------------------------------------------------------

const SHORTHAND: { test: RegExp; run: (root: HTMLElement) => void }[] = [
  { test: /^#$/, run: () => setBlock("h1") },
  { test: /^##$/, run: () => setBlock("h2") },
  { test: /^###$/, run: () => setBlock("h3") },
  { test: /^>$/, run: () => setBlock("blockquote") },
  { test: /^```$/, run: () => setBlock("pre") },
  { test: /^[-*]$/, run: () => exec("insertUnorderedList") },
  { test: /^1\.$/, run: () => exec("insertOrderedList") },
  { test: /^\[\]$|^\[ \]$/, run: (root) => toggleChecklist(root) },
];

/**
 * Called on the space that would follow the marker. Returns true when it
 * consumed the keystroke, so the caller can prevent the space itself.
 */
export function applyShorthand(root: HTMLElement): boolean {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return false;
  const range = sel.getRangeAt(0);
  const node = range.startContainer;
  if (node.nodeType !== Node.TEXT_NODE) return false;

  const before = (node.textContent ?? "").slice(0, range.startOffset);
  const rule = SHORTHAND.find((r) => r.test.test(before));
  if (!rule) return false;

  // "#" mid-sentence is a hash, not a heading. The marker only counts when
  // nothing else in the block comes before it.
  //
  // The block must be strictly inside the editor. `closest` would otherwise
  // answer with the editor itself — it is a div too — and the range from its
  // start to the caret is the entire note, which deleteContents would erase.
  const found = (node.parentElement as HTMLElement | null)?.closest(
    "p, h1, h2, h3, h4, h5, h6, li, blockquote, pre, div",
  );
  const block = found && found !== root && root.contains(found) ? found : null;

  const lead = document.createRange();
  if (block) lead.setStart(block, 0);
  else lead.setStart(node, 0);
  lead.setEnd(node, range.startOffset);
  if (lead.toString() !== before) return false;

  lead.deleteContents();

  /**
   * Give the emptied line something to be, then stand on it.
   *
   * Taking the marker out leaves a block with no children at all — not even a
   * `<br>` — and the browser does not treat that as a line. Every block command
   * then walks backwards looking for one and converts the *previous* paragraph:
   * typing "- " on a fresh line turned the sentence above it into the bullet.
   *
   * The placeholder break is what the browser puts in an empty paragraph
   * itself; supplying it here is only restoring what the deletion removed.
   */
  const line = block ?? (node.parentElement as HTMLElement | null);
  // An empty text node is left behind by the deletion and counts as a child
  // without being a line, so the test is for content, not for children.
  if (line && !line.textContent && !line.querySelector("br, img, hr")) {
    line.replaceChildren(document.createElement("br"));
  }

  const caret = document.createRange();
  caret.setStart(line ?? node, 0);
  caret.collapse(true);
  sel.removeAllRanges();
  sel.addRange(caret);

  rule.run(root);
  normalizeBlocks(root);
  return true;
}
