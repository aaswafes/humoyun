"use client";

import * as React from "react";
import { Info, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatTime, parseTime } from "@/lib/date";
import { Input, SectionLabel } from "@/components/ui/primitives";
import { Select, Toggle } from "@/components/ui/form";

/**
 * The solid destructive treatment, lifted out of the one place that used to
 * hand-patch it. `ConfirmDialog` paints its confirm button exactly like this,
 * so the two red buttons in this product now move together.
 */
export const DANGER_SOLID = "bg-danger text-white hover:brightness-110";

/** One settings pane: what it is, then hairline-separated rows. */
export function Pane({
  title, description, children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="anim-fade">
      <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">{title}</h2>
      <p className="mt-1 max-w-[54ch] text-[13px] leading-relaxed text-ink-3">{description}</p>
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** A titled band of rows inside a pane, for panes with more than one subject. */
export function Group({
  title, description, children, className,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mt-8 first:mt-0", className)}>
      <SectionLabel>{title}</SectionLabel>
      {description && (
        <p className="mt-1.5 max-w-[54ch] text-[12.5px] leading-relaxed text-ink-3">{description}</p>
      )}
      <div className="mt-2">{children}</div>
    </div>
  );
}

/**
 * A labelled setting. `stacked` drops the control onto its own line for
 * anything wider than a button — pickers, previews, prayer times.
 */
export function Row({
  label, hint, children, stacked, className,
}: {
  label: React.ReactNode;
  hint?: React.ReactNode;
  children?: React.ReactNode;
  stacked?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("border-b border-line py-4 last:border-b-0", className)}>
      <div className={cn(!stacked && "flex items-start gap-8")}>
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-medium leading-tight text-ink">{label}</p>
          {hint && (
            <p className="mt-1 max-w-[48ch] text-[12.5px] leading-relaxed text-ink-3">{hint}</p>
          )}
        </div>
        {children && <div className={cn(stacked ? "mt-3.5" : "shrink-0")}>{children}</div>}
      </div>
    </div>
  );
}

/**
 * A switch on its own row. `Toggle` already renders the label and description,
 * so it takes the place of `Row`'s left-hand column rather than sitting inside it.
 */
export function ToggleRow({
  checked, onChange, label, description, className,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description?: string;
  className?: string;
}) {
  return (
    <div className={cn("border-b border-line py-4 last:border-b-0", className)}>
      <Toggle checked={checked} onChange={onChange} label={label} description={description} />
    </div>
  );
}

/** A short standing note — an explanation, a warning, a state the user should know. */
export function Callout({
  tone = "info", title, children, action, className,
}: {
  tone?: "info" | "warn" | "danger";
  title?: React.ReactNode;
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  const Icon = tone === "info" ? Info : TriangleAlert;
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-lg p-3.5",
        tone === "info" && "border border-line bg-sunken",
        tone === "warn" && "bg-warn-soft",
        tone === "danger" && "bg-danger-soft",
        className,
      )}
    >
      <Icon
        className={cn(
          "mt-px size-4 shrink-0",
          tone === "info" && "text-ink-3",
          tone === "warn" && "text-warn",
          tone === "danger" && "text-danger",
        )}
      />
      <div className="min-w-0 flex-1">
        {title && <p className="text-[13px] font-medium text-ink">{title}</p>}
        <div className={cn("max-w-[54ch] text-[12.5px] leading-relaxed text-ink-2", title && "mt-1")}>
          {children}
        </div>
        {action && <div className="mt-2.5">{action}</div>}
      </div>
    </div>
  );
}

/**
 * Dropdown for lists too long to segment. A thin wrapper over the kit's
 * `Select` so this surface cannot drift away from every other dropdown.
 */
export function SelectField<T extends string>({
  value, options, onChange, label, width = 236, id, describedBy,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
  width?: number;
  id?: string;
  describedBy?: string;
}) {
  // `width` sizes the trigger only — the menu is portaled to the body and keeps
  // the kit's own width, which is what every other Select in the app does.
  return (
    <div style={{ width }}>
      <Select
        id={id}
        label={label}
        value={value}
        options={options}
        onChange={onChange}
        align="end"
        aria-describedby={describedBy}
      />
    </div>
  );
}

const NUDGE = 15;

/**
 * Time entry that speaks the user's clock format both ways, on top of the
 * `Input` primitive rather than a copy of it. Arrow keys nudge by a quarter of
 * an hour (an hour with Shift), so the field is usable without retyping it.
 *
 * It seeds its draft once, so give it a `key` that carries `value` when the
 * stored time can also change from elsewhere.
 */
export function TimeField({
  value, onChange, hour12, label, width = 96, disabled, id,
}: {
  value: number;
  onChange: (minutes: number) => void;
  hour12: boolean;
  label: string;
  width?: number;
  disabled?: boolean;
  id?: string;
}) {
  const [draft, setDraft] = React.useState(() => formatTime(value, hour12));

  function commit() {
    const parsed = parseTime(draft);
    if (parsed == null) { setDraft(formatTime(value, hour12)); return; }
    setDraft(formatTime(parsed, hour12));
    if (parsed !== value) onChange(parsed);
  }

  function nudge(delta: number) {
    const from = parseTime(draft) ?? value;
    const next = Math.max(0, Math.min(1439, from + delta));
    setDraft(formatTime(next, hour12));
    if (next !== value) onChange(next);
  }

  return (
    <Input
      id={id}
      aria-label={label}
      value={draft}
      disabled={disabled}
      inputMode="numeric"
      autoComplete="off"
      style={{ width }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") { e.currentTarget.blur(); return; }
        if (e.key === "ArrowUp" || e.key === "ArrowDown") {
          e.preventDefault();
          const step = e.shiftKey ? 60 : NUDGE;
          nudge(e.key === "ArrowUp" ? step : -step);
        }
      }}
      className="px-1 text-center tnum"
    />
  );
}

/** A read-only field that looks like an Input but is explicitly not one. */
export function StaticField({
  icon: Icon, children, width = 236, className,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  width?: number;
  className?: string;
}) {
  return (
    <div
      style={{ width }}
      className={cn(
        "flex h-8 items-center gap-2 rounded-md border border-line bg-hover px-2.5 text-[13px] text-ink-2",
        className,
      )}
    >
      {Icon && <Icon className="size-3.5 shrink-0 text-ink-4" />}
      <span className="truncate">{children}</span>
    </div>
  );
}
