"use client";

import * as React from "react";

export type SaveStatus = "idle" | "pending" | "saved";

/**
 * Debounced autosave for inline writing surfaces.
 *
 * The first run is skipped so seeding a field from the store never writes it
 * back, and anything still pending is flushed on unmount — leaving the page
 * mid-sentence must not lose the sentence.
 */
export function useAutosave<T>(
  value: T,
  save: (value: T) => void,
  delay = 700,
): { status: SaveStatus; flush: () => void } {
  const [status, setStatus] = React.useState<SaveStatus>("idle");
  const saveRef = React.useRef(save);
  // Kept in an effect, not in render: the timeout below fires long after paint.
  React.useEffect(() => { saveRef.current = save; });

  const pending = React.useRef<{ value: T } | null>(null);
  const seeded = React.useRef(false);

  React.useEffect(() => {
    if (!seeded.current) { seeded.current = true; return; }
    pending.current = { value };
    setStatus("pending");
    const id = setTimeout(() => {
      saveRef.current(value);
      pending.current = null;
      setStatus("saved");
    }, delay);
    return () => clearTimeout(id);
  }, [value, delay]);

  React.useEffect(() => () => {
    if (pending.current) saveRef.current(pending.current.value);
  }, []);

  const flush = React.useCallback(() => {
    if (!pending.current) return;
    saveRef.current(pending.current.value);
    pending.current = null;
    setStatus("saved");
  }, []);

  return { status, flush };
}
