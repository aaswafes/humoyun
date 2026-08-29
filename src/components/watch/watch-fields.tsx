"use client";

import * as React from "react";
import { CalendarDays, ChevronRight, Minus, Plus, Star } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/date";
import { MiniCalendar } from "@/components/ui/mini-calendar";
import { Popover } from "@/components/ui/overlays";

// =========================================================
// The small controls this surface builds its forms from.
//
// The books surface has the same set. They are copied rather than shared
// because the kit is off limits to feature folders, and books/** is another
// agent's ground — not because two shapes were wanted.
// =========================================================

// ---------------------------------------------------------
// Sticky open/closed memory, one answer per surface
// ---------------------------------------------------------
const stickyListeners = new Set<() => void>();
// Private mode throws on write. The fold still has to open, so this session's
// answers live here too and are read first.
const stickyMemory = new Map<string, string>();

function subscribeSticky(notify: () => void) {
  stickyListeners.add(notify);
  return () => { stickyListeners.delete(notify); };
}

function readSticky(key: string): string | null {
  const cached = stickyMemory.get(key);
  if (cached !== undefined) return cached;
  try { return window.localStorage.getItem(key); } catch { return null; }
}

/**
 * localStorage is the external store here, so it is read through
 * useSyncExternalStore rather than copied into state by an effect: the server
 * render answers with the default, React swaps in the remembered answer as it
 * hydrates, and two folds sharing a key never drift apart.
 */
export function useSticky(key: string, fallback: boolean): [boolean, (next: boolean) => void] {
  const stored = React.useSyncExternalStore(
    subscribeSticky,
    () => readSticky(key),
    () => null,
  );

  const set = React.useCallback((next: boolean) => {
    const value = next ? "1" : "0";
    stickyMemory.set(key, value);
    try { window.localStorage.setItem(key, value); } catch { /* the fold still opens, it just forgets next visit */ }
    stickyListeners.forEach((notify) => notify());
  }, [key]);

  return [stored === "1" ? true : stored === "0" ? false : fallback, set];
}

/**
 * A folded section: quiet label, a summary that says what is inside, a chevron.
 * Never a dead end — the summary carries the value of the panel, so the user
 * knows whether opening it is worth it.
 */
export function Disclosure({
  storageKey, label, summary, defaultOpen = false, action, children, className, bodyClassName,
}: {
  /** localStorage key, namespaced to this surface */
  storageKey: string;
  label: string;
  /** one line stating what the panel holds — shown open or closed */
  summary?: React.ReactNode;
  defaultOpen?: boolean;
  /** sits outside the toggle, so a control here never nests in a button */
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  const [open, setOpen] = useSticky(storageKey, defaultOpen);

  return (
    <section className={className}>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className={cn(
            "-mx-1 flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md px-1 py-2 text-left",
            "transition-colors duration-150 hover:bg-hover",
          )}
        >
          <ChevronRight
            aria-hidden
            className={cn(
              "size-3 shrink-0 text-ink-4 transition-transform duration-200 ease-[var(--ease-out-apple)]",
              open && "rotate-90",
            )}
          />
          <span className="shrink-0 text-[12.5px] font-medium text-ink-2">{label}</span>
          {summary != null && (
            <span className="min-w-0 flex-1 truncate text-[12px] text-ink-3 tnum">{summary}</span>
          )}
        </button>
        {action}
      </div>

      {open && (
        <div
          className={cn("pb-1", bodyClassName)}
          style={{ animation: "hm-slide-up 200ms var(--ease-out-apple) both" }}
        >
          {children}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------
// Field — caption above control, the shape every form row uses here
// ---------------------------------------------------------
export function Field({
  label, hint, children, className, htmlFor, plain,
}: {
  label: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** id of the control this labels — turns the caption into a real <label> */
  htmlFor?: string;
  /**
   * The child is not a single labelable control — a swatch grid, a segmented
   * switch. A <label for> pointing at those is a label pointing at nothing, so
   * the caption stays a span and the control carries its own accessible name.
   */
  plain?: boolean;
}) {
  // A div, not a <label> — several of these wrap buttons that open popovers,
  // and an implicit label would fire the trigger twice. Controls that can take
  // an id get a proper <label for>; the rest carry their own aria-label.
  const caption = "text-[11.5px] font-medium text-ink-3";
  const generated = React.useId();

  const single = !plain && React.isValidElement(children) ? children : null;
  const controlId = plain ? undefined : htmlFor ?? (single ? generated : undefined);
  const control = single && !htmlFor
    ? React.cloneElement(single as React.ReactElement<{ id?: string }>, { id: generated })
    : children;

  return (
    <div className={cn("block", className)}>
      <div className="mb-1 flex items-baseline gap-2">
        {controlId
          ? <label htmlFor={controlId} className={cn(caption, "cursor-pointer")}>{label}</label>
          : <span className={caption}>{label}</span>}
        {hint && <span className="text-[11px] text-ink-4">{hint}</span>}
      </div>
      {control}
    </div>
  );
}

// ---------------------------------------------------------
// NumberField — steppers either side, tabular figures in the middle
// ---------------------------------------------------------
export function NumberField({
  value, onChange, min = 0, max = 100000, step = 1, suffix, label, className, id,
}: {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  label: string;
  className?: string;
  id?: string;
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
        id={id}
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

// ---------------------------------------------------------
// DateField — button that opens the shared MiniCalendar
// ---------------------------------------------------------
export function DateField({
  value, onChange, weekStart = 1, label, className, id,
}: {
  value: string;
  onChange: (iso: string) => void;
  weekStart?: number;
  label: string;
  className?: string;
  id?: string;
}) {
  return (
    <Popover
      align="start"
      className="w-[252px] p-2"
      trigger={
        <button
          type="button"
          id={id}
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

// ---------------------------------------------------------
// RatingStars
// ---------------------------------------------------------
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

  // Read-only ratings render as spans — they appear inside shelf cards, which
  // are themselves buttons, and a button may not nest another.
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

// ---------------------------------------------------------
// SuggestInput — a text field that remembers what you typed elsewhere.
// Genre, topic, series and creator all live or die on consistent spelling.
// ---------------------------------------------------------
export function SuggestInput({
  value, onChange, onCommit, suggestions, label, placeholder, id, className,
}: {
  value: string;
  onChange: (next: string) => void;
  onCommit: (next: string) => void;
  suggestions: string[];
  label: string;
  placeholder?: string;
  id?: string;
  className?: string;
}) {
  const listId = React.useId();
  return (
    <>
      <input
        id={id}
        list={suggestions.length ? listId : undefined}
        aria-label={label}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => onCommit(value)}
        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
        className={cn(
          "w-full h-8 px-2.5 rounded-md bg-transparent border border-line text-[13.5px] text-ink",
          "transition-[border-color,box-shadow] duration-150 placeholder:text-ink-4",
          "hover:border-line-strong focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft",
          className,
        )}
      />
      {suggestions.length > 0 && (
        <datalist id={listId}>
          {suggestions.map((s) => <option key={s} value={s} />)}
        </datalist>
      )}
    </>
  );
}

// ---------------------------------------------------------
// InlineFacet — the editable fact that sits under the title in the sheet.
// Burying these behind a disclosure was the exact complaint about books:
// an editable field the user cannot see reads as an uneditable one.
// ---------------------------------------------------------
export function InlineFacet({
  label, value, onChange, onCommit, suggestions, numeric, placeholder = "—",
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  onCommit: () => void;
  suggestions?: string[];
  numeric?: boolean;
  placeholder?: string;
}) {
  const listId = React.useId();
  const hasList = !!suggestions?.length;

  return (
    <label className="min-w-0">
      <span className="mb-0.5 block text-[10.5px] font-semibold uppercase tracking-[0.06em] text-ink-4">
        {label}
      </span>
      <input
        aria-label={label}
        list={hasList ? listId : undefined}
        type={numeric ? "number" : "text"}
        min={numeric ? 1 : undefined}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onCommit}
        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
        className={cn(
          "w-full rounded-sm bg-transparent px-1 -mx-1 py-0.5 text-[12.5px] text-ink-2 outline-none",
          "transition-colors hover:bg-hover focus:bg-hover placeholder:text-ink-4",
          numeric && "tnum",
        )}
      />
      {hasList && (
        <datalist id={listId}>
          {suggestions?.map((s) => <option key={s} value={s} />)}
        </datalist>
      )}
    </label>
  );
}
