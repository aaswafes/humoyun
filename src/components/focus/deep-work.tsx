"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { Minimize2 } from "lucide-react";
import { Kbd } from "@/components/ui/primitives";
import { useMounted } from "@/components/ui/overlays";

const EXIT =
  "absolute right-4 top-4 grid size-8 cursor-pointer place-items-center rounded-md text-ink-4 " +
  "opacity-30 transition-opacity duration-200 hover:bg-hover hover:opacity-100 focus-visible:opacity-100";

/**
 * Ambience, not fullscreen: a plain fixed layer over the whole app so the only
 * thing left is the dial. Paper-on-paper in light, near-black-on-black in dark.
 */
export function DeepWork({
  open, onClose, children,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const mounted = useMounted();
  const layerRef = React.useRef<HTMLDivElement>(null);
  const restoreTo = React.useRef<HTMLElement | null>(null);

  // The layer covers the whole app, so the app behind it must leave the tab
  // order — otherwise Tab walks off into a sidebar nobody can see.
  React.useEffect(() => {
    if (!open) return;
    restoreTo.current = document.activeElement as HTMLElement | null;
    layerRef.current?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const layer = layerRef.current;
      if (!layer) return;
      const focusable = layer.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable.length) { e.preventDefault(); return; }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const target = e.target as Node;
      if (!layer.contains(target)) { e.preventDefault(); first.focus(); return; }
      if (e.shiftKey && target === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && target === last) { e.preventDefault(); first.focus(); }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      restoreTo.current?.focus?.();
    };
  }, [open]);

  if (!mounted || !open) return null;

  return createPortal(
    <div
      ref={layerRef}
      role="dialog"
      aria-modal="true"
      aria-label="Deep work"
      tabIndex={-1}
      className="group/dw fixed inset-0 z-[70] flex flex-col items-center justify-center bg-sunken anim-fade outline-none"
    >
      <button onClick={onClose} aria-label="Leave deep work" title="Leave deep work" className={EXIT}>
        <Minimize2 className="size-4" />
      </button>

      {children}

      <p className="absolute bottom-7 flex items-center gap-1.5 text-[11px] text-ink-4 opacity-0 transition-opacity duration-300 group-hover/dw:opacity-100">
        <Kbd>Space</Kbd> start or pause
        <span aria-hidden>·</span>
        <Kbd>Esc</Kbd> leave
      </p>
    </div>,
    document.body,
  );
}
