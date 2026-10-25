"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { create } from "zustand";
import { cn } from "@/lib/cn";
import { useMounted } from "@/components/ui/overlays";
import { useT } from "@/lib/i18n";
import { SidebarContent } from "./sidebar";

// =========================================================
// The phone's sidebar: the same contents, as a drawer from the left.
//
// Its open state lives here rather than in the store's `sidebarOpen`, which
// means "the desktop column is showing" and is remembered. Opening the drawer
// on a phone must never collapse the sidebar on the laptop, and a drawer is
// closed every time the app starts.
// =========================================================

export const useMobileNav = create<{ open: boolean; setOpen: (open: boolean) => void }>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));

const FOCUSABLE = 'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])';

/** A drag this far to the left closes the drawer, the way it was pulled open. */
const SWIPE_CLOSE_PX = 56;

export function MobileNav() {
  const open = useMobileNav((s) => s.open);
  const setOpen = useMobileNav((s) => s.setOpen);
  const pathname = usePathname();
  const mounted = useMounted();
  const { t } = useT();
  const panelRef = React.useRef<HTMLDivElement>(null);
  const close = React.useCallback(() => setOpen(false), [setOpen]);

  // Wherever navigation came from — a row, the command palette, a link in the
  // account menu — arriving somewhere is the end of the drawer's job.
  React.useEffect(() => { close(); }, [pathname, close]);

  // Focus moves in, stays in, and goes back where it came from.
  React.useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    panel?.querySelector<HTMLElement>(FOCUSABLE)?.focus({ preventScroll: true });

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { close(); return; }
      if (e.key !== "Tab" || !panel) return;
      const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus?.({ preventScroll: true });
    };
  }, [open, close]);

  // Swipe to dismiss. Horizontal only, and only once the finger has clearly
  // chosen horizontal — a vertical scroll through the nav must never close it.
  const swipe = React.useRef<{ x: number; y: number; dx: number; horizontal: boolean | null } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    const p = e.touches[0];
    swipe.current = { x: p.clientX, y: p.clientY, dx: 0, horizontal: null };
  };
  const onTouchMove = (e: React.TouchEvent) => {
    const s = swipe.current;
    const panel = panelRef.current;
    if (!s || !panel) return;
    const p = e.touches[0];
    const dx = p.clientX - s.x;
    const dy = p.clientY - s.y;
    if (s.horizontal === null && Math.hypot(dx, dy) > 8) s.horizontal = Math.abs(dx) > Math.abs(dy);
    if (!s.horizontal) return;
    s.dx = Math.min(0, dx);
    panel.style.transition = "none";
    panel.style.transform = `translateX(${s.dx}px)`;
  };
  const onTouchEnd = () => {
    const s = swipe.current;
    const panel = panelRef.current;
    swipe.current = null;
    if (!s || !panel) return;
    panel.style.transition = "";
    panel.style.transform = "";
    if (s.horizontal && s.dx < -SWIPE_CLOSE_PX) close();
  };

  if (!mounted || !open) return null;

  return createPortal(
    // z-95: above a Sheet (90) so it can be opened over a page that has one,
    // below Modal (100) and Popover (120), both of which it can open.
    <div className="fixed inset-0 z-[95] md:hidden">
      <div className="absolute inset-0 bg-scrim anim-fade" onClick={close} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={t("nav.menu")}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
        // `backwards`, not `both`: a filled-forwards animation would hold
        // transform:none over the inline transform the swipe writes.
        style={{ animation: "hm-drawer-in 260ms var(--ease-out-apple) backwards" }}
        className={cn(
          "absolute inset-y-0 left-0 flex w-[min(320px,86vw)] flex-col bg-sunken shadow-pop hairline-r",
          "pt-[var(--safe-top)] pb-[var(--safe-bottom)] pl-[var(--safe-left)]",
          "transition-transform duration-200 ease-[var(--ease-out-apple)]",
        )}
      >
        <style>{`@keyframes hm-drawer-in { from { transform: translateX(-100%) } to { transform: none } }`}</style>
        <SidebarContent onNavigate={close} />
      </div>
    </div>,
    document.body,
  );
}
