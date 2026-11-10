"use client";

// =========================================================
// Page tours — a first-visit walk through whatever page you are on.
//
//   · A page marks its features with `data-tour="page.thing"` and renders
//     `<PageTour id="page" steps={…} />` once. Nothing else is threaded
//     through — no refs, no wrappers.
//   · A step with no anchor is a centred card (the welcome, the sign-off).
//     A step whose anchor is missing or hidden when the tour starts — an
//     empty state, a fold that is shut, a rail the phone does not show — is
//     dropped rather than pointing at nothing.
//   · Seen-ness lives on the account (`profiles.prefs.tours`), so a tour
//     shows once per person, not once per browser.
//   · Only accounts made after tours shipped get them unprompted. Everyone
//     else — the owner included — has the "?" in the page header.
// =========================================================

import * as React from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowRight, HelpCircle, X } from "lucide-react";
import { useStore } from "@/lib/store";
import { SOLO } from "@/lib/local-db";
import { Button, IconButton } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import type { Profile } from "@/lib/types";

export interface TourStep {
  /** `data-tour` value of the element to point at. Omit for a centred card. */
  anchor?: string;
  title: string;
  body: React.ReactNode;
  /** Force a side; otherwise whichever has room. */
  side?: Side;
}

type Side = "top" | "bottom" | "left" | "right";
type Box = { x: number; y: number; w: number; h: number };

/** Accounts created on or after this day get tours without asking. */
const AUTO_SINCE = "2026-11-10";
const GAP = 14;
const EDGE = 12;
const PAD = 6;

/* ---------------------------------------------------------
   Seen-ness, on the account
   --------------------------------------------------------- */
function seenMap(profile: Profile | null): Record<string, number> {
  const raw = (profile?.prefs as Record<string, unknown> | undefined)?.tours;
  return raw && typeof raw === "object" ? (raw as Record<string, number>) : {};
}

function markSeen(id: string) {
  const { profile, updateProfile } = useStore.getState();
  if (!profile) return;
  const tours = seenMap(profile);
  if (tours[id]) return;
  updateProfile({ prefs: { ...(profile.prefs ?? {}), tours: { ...tours, [id]: 1 } } });
}

/** Settings' "Show the tours again". */
export function resetTours() {
  const { profile, updateProfile } = useStore.getState();
  if (!profile) return;
  updateProfile({ prefs: { ...(profile.prefs ?? {}), tours: {} } });
}

function isNewAccount(profile: Profile | null) {
  if (SOLO) return true;
  return !!profile?.created_at && profile.created_at.slice(0, 10) >= AUTO_SINCE;
}

/* ---------------------------------------------------------
   Which tour the "?" replays. A stack, because Salah's page and
   its open tab both declare one and the innermost should win.
   --------------------------------------------------------- */
type Registered = { key: number; id: string; start: () => void };
let stack: Registered[] = [];
let seq = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}
const current = () => stack[stack.length - 1] ?? null;

/** Only one tour may be on screen; a second auto-start waits its turn. */
let showing = false;

/* ---------------------------------------------------------
   The component a page renders
   --------------------------------------------------------- */
/**
 * `steps` must be a module-level constant: it is a dependency of `start`, and
 * a fresh array each render would re-register the tour on every render.
 */
export function PageTour({ id, steps }: { id: string; steps: TourStep[] }) {
  const profile = useStore((s) => s.profile);
  const [live, setLive] = React.useState<TourStep[] | null>(null);

  const start = React.useCallback(() => {
    if (showing) return;
    const usable = steps.filter((s) => !s.anchor || visibleAnchor(s.anchor));
    if (usable.length === 0) return;
    showing = true;
    setLive(usable);
  }, [steps]);

  const close = React.useCallback(() => {
    showing = false;
    setLive(null);
    markSeen(id);
  }, [id]);

  // Register for the header's "?".
  React.useEffect(() => {
    const entry = { key: ++seq, id, start };
    stack = [...stack, entry];
    emit();
    return () => {
      stack = stack.filter((e) => e.key !== entry.key);
      emit();
    };
  }, [id, start]);

  // Leaving the page mid-tour must free the slot, or no tour could ever
  // start again this session.
  React.useEffect(() => () => {
    if (live) showing = false;
  }, [live]);

  // First visit: start by itself once the page has laid out. Measuring a
  // target mid-paint puts the card in the wrong place, which is worse than
  // a short wait.
  const seen = !!seenMap(profile)[id];
  const auto = !!profile && !seen && isNewAccount(profile);
  React.useEffect(() => {
    if (!auto) return;
    const t = window.setTimeout(start, 900);
    return () => window.clearTimeout(t);
  }, [auto, start]);

  return live ? <TourOverlay steps={live} onClose={close} /> : null;
}

/** The "?" in the page header. Renders nothing on a page without a tour. */
export function TourButton({ className }: { className?: string }) {
  const entry = React.useSyncExternalStore(subscribe, current, () => null);
  if (!entry) return null;
  return (
    <IconButton label="Show me around this page" onClick={entry.start} className={className}>
      <HelpCircle />
    </IconButton>
  );
}

function visibleAnchor(anchor: string) {
  const el = document.querySelector<HTMLElement>(`[data-tour="${anchor}"]`);
  if (!el) return false;
  if (typeof el.checkVisibility === "function" && !el.checkVisibility()) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

/* =========================================================
   Overlay
   ========================================================= */
function TourOverlay({ steps, onClose }: { steps: TourStep[]; onClose: () => void }) {
  const [index, setIndex] = React.useState(0);
  const step = steps[index];
  const last = index === steps.length - 1;
  const [hole, setHole] = React.useState<Box | null>(null);
  const [vp, setVp] = React.useState({ w: 0, h: 0 });
  const [cardH, setCardH] = React.useState(180);
  const cardRef = React.useRef<HTMLDivElement>(null);
  const ringRef = React.useRef<HTMLDivElement>(null);
  const nextRef = React.useRef<HTMLButtonElement>(null);

  const next = React.useCallback(() => {
    if (last) onClose();
    else setIndex((i) => i + 1);
  }, [last, onClose]);
  const back = React.useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  // Give focus back to whatever had it before the tour took over.
  React.useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    return () => before?.focus?.();
  }, []);

  // Measure the target, and keep measuring while the page settles: a smooth
  // scroll takes ~400ms, and a card pinned to a stale rect is the most
  // obvious way for a tour to look broken.
  React.useEffect(() => {
    const el = step.anchor ? document.querySelector<HTMLElement>(`[data-tour="${step.anchor}"]`) : null;
    const same = (a: Box | null, b: Box | null) =>
      a === b || (!!a && !!b && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h);

    const measure = () => {
      setVp((v) => (v.w === window.innerWidth && v.h === window.innerHeight ? v : { w: window.innerWidth, h: window.innerHeight }));
      let box: Box | null = null;
      if (el) {
        const r = el.getBoundingClientRect();
        // A target taller than the screen is clipped to what is visible, so
        // the card can still find room beside it.
        const top = Math.max(r.top, EDGE);
        const bottom = Math.min(r.bottom, window.innerHeight - EDGE);
        box = { x: r.left - PAD, y: top - PAD, w: r.width + PAD * 2, h: Math.max(0, bottom - top) + PAD * 2 };
      }
      setHole((h) => (same(h, box) ? h : box));
    };

    if (el) {
      const r = el.getBoundingClientRect();
      if (r.top < 70 || r.bottom > window.innerHeight - 90) {
        el.scrollIntoView({ block: r.height > window.innerHeight * 0.6 ? "start" : "center", behavior: "smooth" });
      }
    }

    measure();
    let raf = 0;
    const loop = () => { measure(); raf = window.requestAnimationFrame(loop); };
    raf = window.requestAnimationFrame(loop);
    const stopLoop = window.setTimeout(() => window.cancelAnimationFrame(raf), 800);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.clearTimeout(stopLoop);
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [step.anchor]);

  // The glow: the ring flares twice when it lands on something new.
  React.useEffect(() => {
    const ring = ringRef.current;
    if (!ring || !step.anchor || typeof ring.animate !== "function") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const anim = ring.animate(
      [
        { boxShadow: "0 0 0 0 var(--accent-line), 0 0 0 0 var(--accent-soft)" },
        { boxShadow: "0 0 0 6px var(--accent-line), 0 0 32px 10px var(--accent-soft)" },
        { boxShadow: "0 0 0 3px var(--accent-soft), 0 0 18px 4px var(--accent-soft)" },
      ],
      { duration: 700, iterations: 2, direction: "alternate", easing: "ease-out", delay: 280, fill: "forwards" },
    );
    return () => anim.cancel();
  }, [index, step.anchor]);

  React.useLayoutEffect(() => {
    const h = cardRef.current?.offsetHeight;
    if (h && h !== cardH) setCardH(h);
  }, [index, vp.w, cardH]);

  React.useEffect(() => {
    const t = window.setTimeout(() => nextRef.current?.focus({ preventScroll: true }), 60);
    return () => window.clearTimeout(t);
  }, [index]);

  // Escape leaves, arrows move, Tab stays inside the card.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); }
      else if (e.key === "ArrowRight") { e.preventDefault(); next(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); back(); }
      else if (e.key === "Tab" && cardRef.current) {
        const items = Array.from(cardRef.current.querySelectorAll<HTMLElement>("button:not([disabled])"));
        if (items.length === 0) return;
        const first = items[0];
        const lastItem = items[items.length - 1];
        const active = document.activeElement;
        if (e.shiftKey && (active === first || !cardRef.current.contains(active))) { e.preventDefault(); lastItem.focus(); }
        else if (!e.shiftKey && (active === lastItem || !cardRef.current.contains(active))) { e.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [next, back, onClose]);

  const cardW = Math.min(340, Math.max(0, vp.w - EDGE * 2));
  const side = step.side && hole ? step.side : pickSide(hole, vp, cardW, cardH);
  const pos = place(hole, side, vp, cardW, cardH);

  // No anchor: the cut-out shrinks to nothing in the middle, so the whole
  // page dims and the hole glides out from there on the next step.
  const cut = hole ?? { x: vp.w / 2, y: vp.h / 2, w: 0, h: 0 };

  return createPortal(
    <div
      className="fixed inset-0 z-[200]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tour-title"
      aria-describedby="tour-body"
    >
      {/* Swallows clicks so the page cannot be changed under the tour. */}
      <div className="absolute inset-0" aria-hidden />

      {/* The scrim is the shadow of the cut-out, which is what lets the hole
          slide from one target to the next instead of jumping. */}
      <div
        ref={ringRef}
        aria-hidden
        className={cn(
          "pointer-events-none absolute rounded-lg anim-fade",
          "transition-[left,top,width,height] duration-[260ms] ease-[var(--ease-out-apple)]",
          hole && "border-2 border-accent",
        )}
        // The scrim is an outline because box-shadow belongs to the glow.
        style={{
          left: cut.x, top: cut.y, width: cut.w, height: cut.h,
          outline: "9999px solid var(--scrim)",
        }}
      />

      <div
        ref={cardRef}
        key={index}
        className="absolute rounded-lg bg-raised p-4 shadow-[var(--shadow-pop)] anim-pop"
        style={{ left: pos.x, top: pos.y, width: cardW }}
      >
        <div className="mb-1.5 flex items-start gap-2">
          <p className="tnum flex-1 pt-1 text-[11px] uppercase tracking-[0.06em] text-ink-3">
            {index + 1} of {steps.length}
          </p>
          <IconButton label="Close the tour" size="sm" onClick={onClose} className="-mr-1 -mt-0.5">
            <X />
          </IconButton>
        </div>
        <h2 id="tour-title" className="text-[15px] font-semibold tracking-[-0.01em] text-ink">
          {step.title}
        </h2>
        <div id="tour-body" className="mt-1 text-[13px] leading-[1.5] text-ink-2">
          {step.body}
        </div>

        <div className="mt-4 flex items-center gap-2">
          <div className="mr-auto flex items-center gap-1" aria-hidden>
            {steps.map((_, i) => (
              <span
                key={i}
                className={cn(
                  "h-1.5 rounded-full transition-[width,background-color] duration-200",
                  i === index ? "w-4 bg-accent" : "w-1.5 bg-line-strong",
                )}
              />
            ))}
          </div>
          {index === 0 && !last ? (
            <Button size="sm" variant="ghost" onClick={onClose}>Skip</Button>
          ) : index > 0 ? (
            <Button size="sm" variant="ghost" onClick={back}>
              <ArrowLeft className="size-3.5" />
              Back
            </Button>
          ) : null}
          <Button ref={nextRef} size="sm" variant="primary" onClick={next}>
            {last ? "Got it" : "Next"}
            {!last && <ArrowRight className="size-3.5" />}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ---------------------------------------------------------
   Placement
   --------------------------------------------------------- */
function pickSide(hole: Box | null, vp: { w: number; h: number }, w: number, h: number): Side {
  if (!hole) return "bottom";
  const below = vp.h - (hole.y + hole.h);
  const above = hole.y;
  // A phone has no room beside anything; above or below only.
  if (vp.w >= 768) {
    if (vp.w - (hole.x + hole.w) > w + GAP + EDGE) return "right";
    if (hole.x > w + GAP + EDGE) return "left";
  }
  if (below >= h + GAP + EDGE) return "bottom";
  if (above >= h + GAP + EDGE) return "top";
  return below >= above ? "bottom" : "top";
}

function place(hole: Box | null, side: Side, vp: { w: number; h: number }, w: number, h: number) {
  if (!hole) return { x: Math.max(EDGE, vp.w / 2 - w / 2), y: Math.max(EDGE, vp.h / 2 - h / 2) };
  let x: number;
  let y: number;
  if (side === "right") { x = hole.x + hole.w + GAP; y = hole.y + hole.h / 2 - h / 2; }
  else if (side === "left") { x = hole.x - w - GAP; y = hole.y + hole.h / 2 - h / 2; }
  else if (side === "bottom") { x = hole.x + hole.w / 2 - w / 2; y = hole.y + hole.h + GAP; }
  else { x = hole.x + hole.w / 2 - w / 2; y = hole.y - GAP - h; }
  x = Math.min(Math.max(EDGE, x), Math.max(EDGE, vp.w - w - EDGE));
  y = Math.min(Math.max(EDGE, y), Math.max(EDGE, vp.h - h - EDGE));
  return { x, y };
}
