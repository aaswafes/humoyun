"use client";

import * as React from "react";

// =========================================================
// A fold that remembers. Every panel triage puts away starts closed, states
// what is inside on its summary line, and comes back the way the user left it
// — per browser, under one namespace so nothing else can collide with it.
// =========================================================

const NS = "humoyun.inbox.";

function read(key: string, fallback: boolean): boolean {
  try {
    const raw = localStorage.getItem(NS + key);
    return raw === null ? fallback : raw === "1";
  } catch {
    // Private mode: the fold still works, it just forgets between sessions.
    return fallback;
  }
}

/**
 * `key` is the short name — "railCalendarOpen" becomes
 * "humoyun.inbox.railCalendarOpen".
 *
 * The stored value cannot be read while rendering on the server, so the first
 * client paint uses the default and the effect corrects it. That is one frame,
 * and it is the only honest way to hydrate a value the server never had.
 */
export function useDisclosure(key: string, fallback = false): [boolean, (next: boolean) => void] {
  const [open, setOpen] = React.useState(fallback);

  React.useEffect(() => {
    setOpen(read(key, fallback));
    // Rehydrating on a key change is the point; `fallback` is a constant per call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const set = React.useCallback(
    (next: boolean) => {
      setOpen(next);
      try {
        localStorage.setItem(NS + key, next ? "1" : "0");
      } catch {
        /* nothing to do — the session keeps working without persistence */
      }
    },
    [key],
  );

  return [open, set];
}
