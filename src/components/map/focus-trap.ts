"use client";

// =========================================================
// The node menu is portaled to the end of <body>, so without
// help the next Tab after opening it lands nowhere near where
// the panel appears. This moves focus in, keeps it inside,
// and hands it back to the trigger on close.
// =========================================================

import * as React from "react";

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useFocusTrap(
  ref: React.RefObject<HTMLElement | null>,
  { active = true, onClose }: { active?: boolean; onClose?: () => void } = {},
) {
  React.useEffect(() => {
    if (!active) return;
    const panel = ref.current;
    if (!panel) return;

    const restore = document.activeElement as HTMLElement | null;
    const items = () => [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)];

    // Wait a frame: the panel measures and positions itself first, and focusing
    // before that scrolls the page to wherever it was briefly parked.
    const raf = requestAnimationFrame(() => {
      const first = items()[0];
      if (first) first.focus();
      else panel.focus();
    });

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose?.();
        return;
      }
      if (e.key !== "Tab") return;
      const list = items();
      if (!list.length) return;
      const first = list[0];
      const last = list[list.length - 1];
      const current = document.activeElement;
      if (e.shiftKey && (current === first || !panel.contains(current))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (current === last || !panel.contains(current))) {
        e.preventDefault();
        first.focus();
      }
    };

    // One capture listener only — a second on the panel would run the same
    // handler twice for keys pressed inside it and double-step the focus ring.
    document.addEventListener("keydown", onKey, true);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKey, true);
      if (restore && document.body.contains(restore)) restore.focus();
    };
  }, [ref, active, onClose]);
}
