"use client";

import * as React from "react";

// =========================================================
// How written text looks, everywhere it appears.
//
// One stylesheet for the editor, the canvas and any read-only render, because
// a note that changes shape when you stop editing it is a note you cannot
// trust. It is injected from here rather than added to globals.css: the shared
// stylesheet belongs to the design system, and these rules belong to one
// surface.
//
// Everything is expressed in tokens, so both themes come out right without a
// single dark-mode override.
// =========================================================

export const DOC_CLASS = "hm-doc";

const CSS = `
.${DOC_CLASS} { color: var(--ink); font-size: 14px; line-height: 1.65; }
.${DOC_CLASS} > *:first-child { margin-top: 0 }
.${DOC_CLASS} > *:last-child { margin-bottom: 0 }
.${DOC_CLASS} p { margin: 0 0 0.55em }
.${DOC_CLASS} h1 { font-size: 1.55em; font-weight: 600; letter-spacing: -0.015em; margin: 1.1em 0 0.35em; line-height: 1.25 }
.${DOC_CLASS} h2 { font-size: 1.28em; font-weight: 600; letter-spacing: -0.012em; margin: 1em 0 0.3em; line-height: 1.3 }
.${DOC_CLASS} h3 { font-size: 1.1em;  font-weight: 600; letter-spacing: -0.008em; margin: 0.9em 0 0.25em }
.${DOC_CLASS} h4, .${DOC_CLASS} h5, .${DOC_CLASS} h6 { font-size: 1em; font-weight: 600; margin: 0.8em 0 0.25em }

/* Tailwind's preflight strips list markers from every ul and ol on the page.
   Prose is the one place they have to come back. */
.${DOC_CLASS} ul, .${DOC_CLASS} ol { margin: 0 0 0.55em; padding-left: 1.35em }
.${DOC_CLASS} ul { list-style: disc }
.${DOC_CLASS} ol { list-style: decimal }
.${DOC_CLASS} ul ul { list-style: circle }
.${DOC_CLASS} ul ul ul { list-style: square }
.${DOC_CLASS} li { margin: 0.1em 0; list-style: inherit }
.${DOC_CLASS} li::marker { color: var(--ink-3) }
.${DOC_CLASS} li > p { margin: 0 }

.${DOC_CLASS} blockquote {
  margin: 0.6em 0; padding: 0.1em 0 0.1em 0.9em;
  border-left: 2px solid var(--line-strong); color: var(--ink-2);
}
.${DOC_CLASS} pre {
  margin: 0.6em 0; padding: 0.7em 0.85em; border-radius: 9px;
  background: var(--sunken); border: 1px solid var(--line);
  font-family: var(--font-mono); font-size: 0.88em; line-height: 1.55;
  white-space: pre-wrap; overflow-wrap: anywhere;
}
.${DOC_CLASS} code { font-family: var(--font-mono); font-size: 0.9em }
.${DOC_CLASS} hr { margin: 1.1em 0; border: 0; border-top: 1px solid var(--line) }

.${DOC_CLASS} a { color: var(--accent); text-decoration: underline; text-underline-offset: 2px }
.${DOC_CLASS} a.hm-wiki {
  text-decoration: none; cursor: pointer;
  padding: 0 3px; margin: 0 -1px; border-radius: 4px;
  background: var(--accent-soft); color: var(--accent);
  font-weight: 500;
}
.${DOC_CLASS} a.hm-wiki:hover { background: var(--selected) }

.${DOC_CLASS} mark { background: rgba(223,171,1,.28); color: inherit; border-radius: 3px; padding: 0 2px }

/* ---- checklists ----------------------------------------
   A real <ul> with a class, so every list behaviour still works. Only the box
   in front of the item is ours, and it is the first 24px of the row — which
   is exactly the gutter the click handler tests against.
--------------------------------------------------------- */
.${DOC_CLASS} ul.hm-check { list-style: none; padding-left: 2px }
.${DOC_CLASS} ul.hm-check > li { position: relative; padding-left: 24px; list-style: none }
.${DOC_CLASS} ul.hm-check > li::before {
  content: ""; position: absolute; left: 1px; top: 0.32em;
  width: 14px; height: 14px; border-radius: 4px;
  border: 1.5px solid var(--line-strong); background: transparent;
  cursor: pointer; transition: background-color 150ms, border-color 150ms;
}
.${DOC_CLASS} ul.hm-check > li:hover::before { border-color: var(--accent-line) }
.${DOC_CLASS} ul.hm-check > li[data-done="true"]::before {
  background: var(--accent); border-color: var(--accent);
}
.${DOC_CLASS} ul.hm-check > li[data-done="true"]::after {
  content: ""; position: absolute; left: 6px; top: 0.46em;
  width: 3.5px; height: 7.5px;
  border: solid var(--accent-ink); border-width: 0 1.8px 1.8px 0;
  transform: rotate(43deg);
}
.${DOC_CLASS} ul.hm-check > li[data-done="true"] { color: var(--ink-3); text-decoration: line-through }

/* ---- the editor itself ---- */
.${DOC_CLASS}[contenteditable] { outline: none; caret-color: var(--accent) }
.${DOC_CLASS}[data-empty="true"]::before {
  content: attr(data-placeholder);
  color: var(--ink-4);
  pointer-events: none;
  position: absolute;
}

@media (prefers-reduced-motion: reduce) {
  .${DOC_CLASS} ul.hm-check > li::before { transition: none }
}
`;

/**
 * Rendered by anything that shows a note body. React 19 hoists a `<style>`
 * with a `precedence` into the head and keeps exactly one copy per `href`, so
 * an editor, a sheet and a canvas full of cards can all ask for it without
 * stacking the rules three deep.
 */
export function DocStyles() {
  return <style href="hm-doc-styles" precedence="medium">{CSS}</style>;
}
