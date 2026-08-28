"use client";

import * as React from "react";

function isTypingTarget(el: EventTarget | null): boolean {
  const node = el as HTMLElement | null;
  if (!node) return false;
  const tag = node.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || node.isContentEditable;
}

/**
 * Space and Enter belong to whatever control has focus — a button, a link, a
 * checkbox — so a page-level shortcut must not steal them. Every other key is
 * fair game while focus sits on a non-typing element.
 */
function ownsActivationKeys(el: EventTarget | null): boolean {
  const node = el as HTMLElement | null;
  if (!node) return false;
  const tag = node.tagName;
  if (tag === "BUTTON" || tag === "A" || tag === "SUMMARY" || tag === "OPTION") return true;
  const role = node.getAttribute?.("role");
  return role === "button" || role === "checkbox" || role === "switch" ||
    role === "menuitem" || role === "tab" || role === "link" || role === "option";
}

/**
 * Declarative hotkeys. Keys look like "mod+k", "shift+?", "g then c", "escape".
 * Handlers do not fire while the user is typing unless `allowInInput` is set.
 */
export function useHotkeys(
  map: Record<string, (e: KeyboardEvent) => void>,
  { allowInInput = false, enabled = true }: { allowInInput?: boolean; enabled?: boolean } = {},
) {
  const mapRef = React.useRef(map);
  mapRef.current = map;

  React.useEffect(() => {
    if (!enabled) return;
    let chordPrefix: string | null = null;
    let chordTimer: ReturnType<typeof setTimeout> | null = null;

    const onKey = (e: KeyboardEvent) => {
      const typing = isTypingTarget(e.target);
      const key = e.key.toLowerCase();
      const mod = e.metaKey || e.ctrlKey;

      // chord sequences ("g then c")
      if (!typing && !mod && chordPrefix) {
        const combo = `${chordPrefix} then ${key}`;
        const handler = mapRef.current[combo];
        chordPrefix = null;
        if (chordTimer) clearTimeout(chordTimer);
        if (handler) { e.preventDefault(); handler(e); return; }
      }

      const parts: string[] = [];
      if (mod) parts.push("mod");
      if (e.altKey) parts.push("alt");
      if (e.shiftKey && key.length > 1) parts.push("shift");
      parts.push(key);
      const combo = parts.join("+");

      const handler = mapRef.current[combo] ?? (e.shiftKey ? mapRef.current[`shift+${key}`] : undefined);
      if (handler) {
        if (typing && !allowInInput && !mod && key !== "escape") return;
        if (!mod && (key === " " || key === "enter") && ownsActivationKeys(e.target)) return;
        e.preventDefault();
        handler(e);
        return;
      }

      // start a chord if any key in the map opens with this letter
      if (!typing && !mod && key.length === 1) {
        const opens = Object.keys(mapRef.current).some((k) => k.startsWith(`${key} then `));
        if (opens) {
          chordPrefix = key;
          if (chordTimer) clearTimeout(chordTimer);
          chordTimer = setTimeout(() => { chordPrefix = null; }, 1200);
        }
      }
    };

    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (chordTimer) clearTimeout(chordTimer);
    };
  }, [allowInInput, enabled]);
}

/** Re-renders on an interval. Used by clocks, timers and "now" lines. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
