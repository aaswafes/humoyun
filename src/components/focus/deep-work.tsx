"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { Minimize2, Waves } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatDuration, formatTime, nowMinutes } from "@/lib/date";
import { useNow } from "@/hooks/use-hotkeys";
import { useStore } from "@/lib/store";
import { Kbd } from "@/components/ui/primitives";
import { useMounted } from "@/components/ui/overlays";

const CORNER =
  "absolute grid size-8 cursor-pointer place-items-center rounded-md text-ink-4 " +
  "opacity-30 transition-opacity duration-200 hover:bg-hover hover:opacity-100 focus-visible:opacity-100";

/**
 * Ambience, not fullscreen: a plain fixed layer over the whole app so the only
 * thing left is the dial. Paper-on-paper in light, near-black-on-black in dark.
 */
export function DeepWork({
  open, onClose, children, ambient, onToggleAmbient, todayMinutes, dailyGoal,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  ambient: boolean;
  onToggleAmbient: () => void;
  todayMinutes: number;
  dailyGoal: number;
}) {
  const mounted = useMounted();
  const hour12 = useStore((s) => s.hour12);
  const layerRef = React.useRef<HTMLDivElement>(null);
  const restoreTo = React.useRef<HTMLElement | null>(null);
  useNow(20_000);

  // The layer covers the whole app, so the app behind it must leave the tab
  // order — otherwise Tab walks off into a sidebar nobody can see.
  React.useEffect(() => {
    if (!open) return;
    restoreTo.current = document.activeElement as HTMLElement | null;
    layerRef.current?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // A popover or modal opened on top of this layer owns Escape first;
        // this layer is itself a dialog, so more than one means something is above.
        if (document.querySelectorAll('[role="dialog"]').length > 1) return;
        e.preventDefault();
        onClose();
        return;
      }
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
  }, [open, onClose]);

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
      <div className="absolute left-5 top-4 flex items-baseline gap-2.5 opacity-25 transition-opacity duration-300 group-hover/dw:opacity-70">
        <span className="text-[12.5px] text-ink-3 tnum">{formatTime(nowMinutes(), hour12)}</span>
        <span className="text-[11.5px] text-ink-4 tnum">
          {formatDuration(todayMinutes)} of {formatDuration(dailyGoal)} today
        </span>
      </div>

      <button
        onClick={onToggleAmbient}
        aria-label={ambient ? "Turn the breathing ring off" : "Turn the breathing ring on"}
        aria-pressed={ambient}
        title={ambient ? "Breathing ring on" : "Breathing ring off"}
        className={cn(CORNER, "right-14 top-4", ambient && "opacity-60 text-ink-3")}
      >
        <Waves className="size-4" />
      </button>

      <button
        onClick={onClose}
        aria-label="Leave deep work"
        title="Leave deep work"
        className={cn(CORNER, "right-4 top-4")}
      >
        <Minimize2 className="size-4" />
      </button>

      {children}

      <p className="absolute bottom-7 flex items-center gap-1.5 text-[11px] text-ink-4 opacity-0 transition-opacity duration-300 group-hover/dw:opacity-100">
        <Kbd>Space</Kbd> start or pause
        <span aria-hidden>·</span>
        <Kbd>X</Kbd> distracted
        <span aria-hidden>·</span>
        <Kbd>Esc</Kbd> leave
      </p>
    </div>,
    document.body,
  );
}
