"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { Check, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { TINTS, type Tint } from "@/lib/types";

// =========================================================
// useMounted — portals need the client
// =========================================================
export function useMounted() {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  return mounted;
}

// =========================================================
// Popover — anchored floating panel, flips when it would clip
// =========================================================
export interface PopoverProps {
  trigger: React.ReactElement<{ onClick?: (e: React.MouseEvent) => void; ref?: React.Ref<HTMLElement> }>;
  children: React.ReactNode | ((close: () => void) => React.ReactNode);
  align?: "start" | "center" | "end";
  side?: "bottom" | "top";
  offset?: number;
  className?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function Popover({
  trigger, children, align = "start", side = "bottom", offset = 6, className,
  open: controlledOpen, onOpenChange,
}: PopoverProps) {
  const [uncontrolled, setUncontrolled] = React.useState(false);
  const open = controlledOpen ?? uncontrolled;
  const setOpen = React.useCallback((next: boolean) => {
    if (controlledOpen === undefined) setUncontrolled(next);
    onOpenChange?.(next);
  }, [controlledOpen, onOpenChange]);

  const anchorRef = React.useRef<HTMLSpanElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const [pos, setPos] = React.useState<{ top: number; left: number } | null>(null);
  const mounted = useMounted();

  const place = React.useCallback(() => {
    const anchor = anchorRef.current?.firstElementChild ?? anchorRef.current;
    const panel = panelRef.current;
    if (!anchor || !panel) return;
    const a = anchor.getBoundingClientRect();
    const p = panel.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let top = side === "bottom" ? a.bottom + offset : a.top - p.height - offset;
    if (top + p.height > vh - 8) top = a.top - p.height - offset;
    if (top < 8) top = Math.min(a.bottom + offset, vh - p.height - 8);

    let left = align === "start" ? a.left : align === "end" ? a.right - p.width : a.left + a.width / 2 - p.width / 2;
    left = Math.max(8, Math.min(left, vw - p.width - 8));

    setPos({ top, left });
  }, [align, side, offset]);

  React.useLayoutEffect(() => {
    if (!open) { setPos(null); return; }
    place();
    const onScroll = () => place();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open, place]);

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (panelRef.current?.contains(e.target as Node)) return;
      if (anchorRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); } };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, setOpen]);

  return (
    <>
      <span ref={anchorRef} className="contents">
        {React.cloneElement(trigger, {
          onClick: (e: React.MouseEvent) => {
            trigger.props.onClick?.(e);
            setOpen(!open);
          },
        })}
      </span>
      {mounted && open && createPortal(
        <div
          ref={panelRef}
          role="dialog"
          style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, visibility: pos ? "visible" : "hidden" }}
          className={cn(
            // Above Sheet (90) and Modal (100): a popover opened from inside
            // one is always the most recent thing the user asked for.
            "fixed z-[120] min-w-[180px] rounded-xl border border-line bg-raised p-1 shadow-lg anim-pop",
            className,
          )}
        >
          {typeof children === "function" ? children(() => setOpen(false)) : children}
        </div>,
        document.body,
      )}
    </>
  );
}

// =========================================================
// Menu items
// =========================================================
export function MenuItem({
  children, icon: Icon, onClick, danger, checked, shortcut, className, disabled,
}: {
  children: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  onClick?: () => void;
  danger?: boolean;
  checked?: boolean;
  shortcut?: string;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2 py-[6px] text-[13px] text-left cursor-pointer",
        "transition-colors duration-100 disabled:opacity-40 disabled:pointer-events-none",
        danger ? "text-danger hover:bg-danger-soft" : "text-ink hover:bg-hover",
        className,
      )}
    >
      {Icon && <Icon className="size-4 shrink-0 text-ink-3" />}
      <span className="flex-1 truncate">{children}</span>
      {checked && <Check className="size-3.5 text-accent" />}
      {shortcut && <span className="text-[11px] text-ink-4 tnum">{shortcut}</span>}
    </button>
  );
}

export function MenuSeparator() {
  return <div className="my-1 h-px bg-line" />;
}

export function MenuLabel({ children }: { children: React.ReactNode }) {
  return <div className="px-2 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-4">{children}</div>;
}

// =========================================================
// Modal
// =========================================================
export function Modal({
  open, onClose, children, title, className, width = 480,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: React.ReactNode;
  className?: string;
  width?: number;
}) {
  const mounted = useMounted();

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!mounted || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] grid place-items-center p-4">
      <div className="absolute inset-0 bg-scrim anim-fade" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        style={{ width }}
        className={cn(
          "relative max-h-[86vh] w-full overflow-hidden rounded-2xl border border-line bg-raised shadow-pop anim-pop",
          className,
        )}
      >
        {title && (
          <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
            <h2 className="text-[14.5px] font-semibold text-ink">{title}</h2>
            <button
              onClick={onClose}
              aria-label="Close"
              className="grid size-6 place-items-center rounded-md text-ink-3 hover:bg-hover hover:text-ink cursor-pointer transition-colors"
            >
              <X className="size-4" />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>,
    document.body,
  );
}

// =========================================================
// Sheet — right-hand inspector panel
// =========================================================
export function Sheet({
  open, onClose, children, width = 400, className,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  width?: number;
  className?: string;
}) {
  const mounted = useMounted();

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!mounted || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[90]">
      <div className="absolute inset-0 bg-scrim anim-fade" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        style={{ width, animation: "hm-sheet-in 260ms var(--ease-out-apple) both" }}
        className={cn(
          "absolute right-0 top-0 flex h-full max-w-[92vw] flex-col border-l border-line bg-canvas shadow-pop",
          className,
        )}
      >
        <style>{`@keyframes hm-sheet-in { from { transform: translateX(16px); opacity: 0 } to { transform: none; opacity: 1 } }`}</style>
        {children}
      </div>
    </div>,
    document.body,
  );
}

// =========================================================
// Confirm — destructive actions get a beat of friction
// =========================================================
export function ConfirmDialog({
  open, onClose, onConfirm, title, description, confirmLabel = "Delete", tone = "danger",
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  tone?: "danger" | "primary";
}) {
  return (
    <Modal open={open} onClose={onClose} width={380}>
      <div className="p-5">
        <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
        {description && <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">{description}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="h-8 rounded-md border border-line bg-raised px-3 text-[13px] font-medium text-ink hover:bg-hover cursor-pointer transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => { onConfirm(); onClose(); }}
            className={cn(
              "h-8 rounded-md px-3 text-[13px] font-medium cursor-pointer transition-colors",
              tone === "danger"
                ? "bg-danger text-white hover:brightness-110"
                : "bg-accent text-accent-ink hover:bg-accent-hover",
            )}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// =========================================================
// Colour picker — the Notion tint swatches
// =========================================================
export function TintPicker({
  value, onChange, allowNone,
}: {
  value: Tint | null;
  onChange: (t: Tint | null) => void;
  allowNone?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1 p-1">
      {allowNone && (
        <button
          onClick={() => onChange(null)}
          aria-label="No colour"
          className={cn(
            "grid size-6 place-items-center rounded-full border border-line-strong cursor-pointer transition-transform hover:scale-110",
            value === null && "ring-2 ring-accent ring-offset-2 ring-offset-[var(--raised)]",
          )}
        >
          <X className="size-3 text-ink-3" />
        </button>
      )}
      {TINTS.map((t) => (
        <button
          key={t}
          onClick={() => onChange(t)}
          aria-label={t}
          title={t}
          className={cn(
            `tint-${t}`,
            "size-6 rounded-full cursor-pointer transition-transform hover:scale-110",
            value === t && "ring-2 ring-accent ring-offset-2 ring-offset-[var(--raised)]",
          )}
          style={{ background: "var(--tint)" }}
        />
      ))}
    </div>
  );
}
