"use client";

import * as React from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";
import { Popover, MenuItem } from "./overlays";

export interface FieldControlProps {
  id: string;
  "aria-describedby": string | undefined;
  "aria-invalid": boolean | undefined;
}

/**
 * Wraps any control with a real <label for>, optional description and error,
 * and wires aria-describedby / aria-invalid for you.
 *
 * Four surfaces were each labelling fields their own way (or not at all), so
 * labelling lives here now.
 */
export function Field({
  label, description, error, required, children, className, hint,
}: {
  label: string;
  description?: string;
  error?: string | null;
  required?: boolean;
  hint?: React.ReactNode;
  className?: string;
  /**
   * Either a render function that receives the wiring, or a single element —
   * in which case the wiring is cloned onto it.
   */
  children:
    | ((props: FieldControlProps) => React.ReactNode)
    | React.ReactElement<Partial<FieldControlProps>>;
}) {
  const id = React.useId();
  const descId = description ? `${id}-desc` : undefined;
  const errId = error ? `${id}-err` : undefined;
  const describedBy = [descId, errId].filter(Boolean).join(" ") || undefined;
  const wiring: FieldControlProps = {
    id,
    "aria-describedby": describedBy,
    "aria-invalid": error ? true : undefined,
  };
  const control =
    typeof children === "function"
      ? children(wiring)
      : React.cloneElement(children, wiring);

  return (
    <div className={cn("min-w-0", className)}>
      <div className="mb-1 flex items-baseline gap-1.5">
        <label htmlFor={id} className="text-[12px] font-medium text-ink-2">
          {label}
          {required && <span className="ml-0.5 text-danger" aria-hidden>*</span>}
        </label>
        {hint && <span className="ml-auto text-[11px] text-ink-4">{hint}</span>}
      </div>
      {control}
      {description && !error && (
        <p id={descId} className="mt-1 text-[11.5px] leading-snug text-ink-4">{description}</p>
      )}
      {error && (
        <p id={errId} role="alert" className="mt-1 text-[11.5px] leading-snug text-danger">{error}</p>
      )}
    </div>
  );
}

export interface SelectOption<T extends string> {
  value: T;
  label: React.ReactNode;
  description?: string;
  disabled?: boolean;
}

/**
 * The one dropdown. Keyboard-operable, labelled, and styled like the rest of
 * the kit — unlike the four hand-rolled triggers it replaces.
 */
export function Select<T extends string>({
  value, options, onChange, id, placeholder = "Select…", className, size = "md",
  align = "start", disabled, "aria-describedby": describedBy, "aria-invalid": invalid,
  label,
}: {
  value: T | null;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  id?: string;
  placeholder?: string;
  className?: string;
  size?: "sm" | "md";
  align?: "start" | "end";
  disabled?: boolean;
  label?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const current = options.find((o) => o.value === value);

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      align={align}
      className="max-h-[300px] w-[var(--select-w,240px)] overflow-y-auto"
      trigger={
        <button
          type="button"
          id={id}
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={label}
          aria-describedby={describedBy}
          aria-invalid={invalid}
          className={cn(
            "flex w-full items-center gap-1.5 rounded-md border border-line bg-raised px-2 text-left",
            "transition-[border-color,box-shadow] duration-150 cursor-pointer",
            "hover:border-line-strong focus-visible:border-accent disabled:pointer-events-none disabled:opacity-40",
            invalid && "border-danger",
            size === "sm" ? "h-7 text-[12.5px]" : "h-8 text-[13px]",
            className,
          )}
        >
          <span className={cn("min-w-0 flex-1 truncate", current ? "text-ink" : "text-ink-4")}>
            {current?.label ?? placeholder}
          </span>
          <ChevronDown className="size-3.5 shrink-0 text-ink-4" />
        </button>
      }
    >
      {(close) => (
        <div role="listbox" aria-label={label}>
          {options.map((opt) => (
            <MenuItem
              key={opt.value}
              disabled={opt.disabled}
              checked={opt.value === value}
              onClick={() => { onChange(opt.value); close(); }}
            >
              <span className="block truncate">{opt.label}</span>
              {opt.description && (
                <span className="mt-0.5 block truncate text-[11.5px] text-ink-4">{opt.description}</span>
              )}
            </MenuItem>
          ))}
        </div>
      )}
    </Popover>
  );
}

/** Two-state switch. Reads as on/off without relying on colour alone. */
export function Toggle({
  checked, onChange, label, description, id, className,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description?: string;
  id?: string;
  className?: string;
}) {
  const generated = React.useId();
  const inputId = id ?? generated;
  return (
    <div className={cn("flex items-start gap-3", className)}>
      <div className="min-w-0 flex-1">
        <label htmlFor={inputId} className="block text-[13px] font-medium text-ink cursor-pointer">
          {label}
        </label>
        {description && <p className="mt-0.5 text-[11.5px] leading-snug text-ink-3">{description}</p>}
      </div>
      <button
        id={inputId}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          // p-0 matters: a <button> carries default padding, and without it the
          // knob's static position starts inside that padding, so the translate
          // pushed it past the right edge of the track.
          "relative mt-0.5 h-[22px] w-[38px] shrink-0 rounded-full border-0 p-0 cursor-pointer",
          "transition-colors duration-200 ease-[var(--ease-out-apple)]",
          checked ? "bg-accent" : "bg-line-strong",
        )}
      >
        <span
          className={cn(
            "absolute left-0 top-[2px] size-[18px] rounded-full bg-canvas shadow-sm",
            "transition-transform duration-200 ease-[var(--ease-out-apple)]",
            checked ? "translate-x-[18px]" : "translate-x-[2px]",
          )}
        />
      </button>
    </div>
  );
}

/** Compact empty state for rail cards and panels, where the full one is too tall. */
export function MiniEmpty({
  children, action, className,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("px-1 py-3 text-center", className)}>
      <p className="text-[12px] leading-snug text-ink-4">{children}</p>
      {action && <div className="mt-1.5 flex justify-center">{action}</div>}
    </div>
  );
}

/**
 * A visually-hidden description that a chart, heatmap or other graphic can point
 * at with aria-describedby, so the insight is not locked inside a hover tooltip.
 */
export function VisuallyHidden({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <span
      id={id}
      className="absolute size-px overflow-hidden whitespace-nowrap [clip-path:inset(50%)]"
      style={{ clip: "rect(0 0 0 0)", margin: -1, padding: 0, border: 0 }}
    >
      {children}
    </span>
  );
}

/** Checkmark used by pickers that show a selected swatch. Contrast-safe on any tint. */
export function SwatchCheck({ className }: { className?: string }) {
  return (
    <span
      className={cn("grid size-full place-items-center rounded-full", className)}
      style={{ background: "rgba(0,0,0,0.28)" }}
    >
      <Check className="size-2.5 text-white" strokeWidth={4} />
    </span>
  );
}
