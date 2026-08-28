"use client";

import * as React from "react";
import { CalendarDays, Minus, Plus, Star } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/date";
import { MiniCalendar } from "@/components/ui/mini-calendar";
import { Popover } from "@/components/ui/overlays";

// =========================================================
// Field — label above control, the shape every form row uses here
// =========================================================
export function Field({
  label, hint, children, className,
}: {
  label: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  // A div, not a <label> — several of these wrap buttons that open popovers,
  // and an implicit label would fire the trigger twice.
  return (
    <div className={cn("block", className)}>
      <div className="mb-1.5 flex items-baseline gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">{label}</span>
        {hint && <span className="text-[11.5px] text-ink-4">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

// =========================================================
// Toggle — iOS switch. The kit has no switch, so it lives here.
// =========================================================
export function Toggle({
  checked, onChange, label, description, className,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] text-ink">{label}</p>
        {description && <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-3">{description}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-[20px] w-[34px] shrink-0 rounded-full cursor-pointer",
          "transition-[background-color] duration-200 ease-[var(--ease-out-apple)] active:scale-[0.97]",
          checked ? "bg-accent" : "bg-active",
        )}
      >
        {/* accent-ink is tuned to sit on the accent, ink-3 reads on the off-track in both themes */}
        <span
          className={cn(
            "absolute top-[2px] left-[2px] size-4 rounded-full",
            "transition-transform duration-200 ease-[var(--ease-out-apple)]",
            checked ? "translate-x-[14px] bg-accent-ink" : "bg-ink-3",
          )}
        />
      </button>
    </div>
  );
}

// =========================================================
// NumberField — steppers either side, tabular figures in the middle
// =========================================================
export function NumberField({
  value, onChange, min = 0, max = 100000, step = 1, suffix, label, className,
}: {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  label: string;
  className?: string;
}) {
  const clamp = (n: number) => Math.max(min, Math.min(max, n));
  const [draft, setDraft] = React.useState(String(value));
  const [seen, setSeen] = React.useState(value);

  // The parent owns the number; steppers and outside edits have to show through.
  if (seen !== value) {
    setSeen(value);
    setDraft(String(value));
  }

  return (
    <div
      className={cn(
        "flex h-8 items-center rounded-md border border-line bg-transparent",
        "transition-[border-color] duration-150 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent-soft hover:border-line-strong",
        className,
      )}
    >
      <button
        type="button"
        aria-label={`Decrease ${label}`}
        onClick={() => onChange(clamp(value - step))}
        disabled={value <= min}
        className="grid h-full w-8 shrink-0 place-items-center rounded-l-md text-ink-3 hover:bg-hover hover:text-ink cursor-pointer transition-colors disabled:pointer-events-none disabled:opacity-30"
      >
        <Minus className="size-3.5" />
      </button>
      <input
        inputMode="numeric"
        aria-label={label}
        value={draft}
        onChange={(e) => {
          const next = e.target.value.replace(/[^0-9]/g, "");
          setDraft(next);
          if (next !== "") onChange(clamp(Number(next)));
        }}
        onBlur={() => setDraft(String(value))}
        className="min-w-0 flex-1 bg-transparent text-center text-[13.5px] text-ink outline-none tnum"
      />
      {suffix && <span className="pr-1 text-[11.5px] text-ink-3">{suffix}</span>}
      <button
        type="button"
        aria-label={`Increase ${label}`}
        onClick={() => onChange(clamp(value + step))}
        disabled={value >= max}
        className="grid h-full w-8 shrink-0 place-items-center rounded-r-md text-ink-3 hover:bg-hover hover:text-ink cursor-pointer transition-colors disabled:pointer-events-none disabled:opacity-30"
      >
        <Plus className="size-3.5" />
      </button>
    </div>
  );
}

// =========================================================
// DateField — button that opens the shared MiniCalendar
// =========================================================
export function DateField({
  value, onChange, weekStart = 1, label, className,
}: {
  value: string;
  onChange: (iso: string) => void;
  weekStart?: number;
  label: string;
  className?: string;
}) {
  return (
    <Popover
      align="start"
      className="w-[252px] p-2"
      trigger={
        <button
          type="button"
          aria-label={label}
          className={cn(
            "flex h-8 w-full items-center gap-2 rounded-md border border-line px-2.5 text-[13.5px] text-ink",
            "cursor-pointer transition-colors duration-150 hover:border-line-strong hover:bg-hover",
            className,
          )}
        >
          <CalendarDays className="size-3.5 shrink-0 text-ink-3" />
          <span className="truncate tnum">{formatDate(value, { year: false })}</span>
        </button>
      }
    >
      {(close) => (
        <MiniCalendar
          value={value}
          weekStart={weekStart}
          onChange={(iso) => { onChange(iso); close(); }}
        />
      )}
    </Popover>
  );
}

// =========================================================
// RatingStars
// =========================================================
export function RatingStars({
  value, onChange, size = 18, className,
}: {
  value: number | null;
  onChange?: (next: number | null) => void;
  size?: number;
  className?: string;
}) {
  const [hover, setHover] = React.useState<number | null>(null);
  const shown = hover ?? value ?? 0;

  const star = (n: number) => (
    <Star
      className={cn(n <= shown ? "text-warn" : "text-ink-4")}
      style={{ width: size, height: size }}
      fill={n <= shown ? "currentColor" : "none"}
      strokeWidth={n <= shown ? 0 : 1.6}
    />
  );

  // Read-only ratings render as spans — they appear inside the shelf card,
  // which is itself a button, and a button may not nest another.
  if (!onChange) {
    return (
      <span
        className={cn("inline-flex items-center gap-0.5", className)}
        role="img"
        aria-label={`Rated ${value ?? 0} out of 5`}
      >
        {[1, 2, 3, 4, 5].map((n) => (
          <span key={n} className="grid place-items-center p-0.5">{star(n)}</span>
        ))}
      </span>
    );
  }

  return (
    <div className={cn("flex items-center gap-0.5", className)} onMouseLeave={() => setHover(null)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          aria-label={`${n} star${n === 1 ? "" : "s"}`}
          aria-pressed={value === n}
          onMouseEnter={() => setHover(n)}
          onClick={() => onChange(value === n ? null : n)}
          className="grid place-items-center rounded-sm p-0.5 cursor-pointer transition-transform duration-150 ease-[var(--ease-out-apple)] hover:scale-110 active:scale-95"
        >
          {star(n)}
        </button>
      ))}
    </div>
  );
}
