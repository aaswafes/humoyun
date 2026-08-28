"use client";

import * as React from "react";
import { ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatTime, parseTime } from "@/lib/date";
import { MenuItem, Popover } from "@/components/ui/overlays";

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

/**
 * A labelled setting. `stacked` drops the control onto its own line for
 * anything wider than a button — pickers, previews, prayer times.
 */
export function Row({
  label, hint, children, stacked, className,
}: {
  label: string;
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

/** Dropdown for lists too long to segment. */
export function SelectField<T extends string>({
  value, options, onChange, label, width = 236,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
  width?: number;
}) {
  const current = options.find((o) => o.value === value);
  return (
    <Popover
      align="end"
      className="max-h-[300px] w-[300px] overflow-y-auto"
      trigger={
        <button
          aria-label={label}
          style={{ width }}
          className={cn(
            "flex h-8 cursor-pointer items-center gap-2 rounded-md border border-line bg-raised px-2.5",
            "text-[13px] text-ink transition-colors duration-150 hover:border-line-strong",
          )}
        >
          <span className="flex-1 truncate text-left">{current?.label ?? "Choose"}</span>
          <ChevronsUpDown className="size-3.5 shrink-0 text-ink-3" />
        </button>
      }
    >
      {(close) => (
        <>
          {options.map((o) => (
            <MenuItem
              key={o.value}
              checked={o.value === value}
              onClick={() => { onChange(o.value); close(); }}
            >
              {o.label}
            </MenuItem>
          ))}
        </>
      )}
    </Popover>
  );
}

/**
 * Time entry that speaks the user's clock format both ways. It seeds its draft
 * once, so give it a `key` that carries `value` when the stored time can also
 * change from elsewhere.
 */
export function TimeField({
  value, onChange, hour12, label, width = 96,
}: {
  value: number;
  onChange: (minutes: number) => void;
  hour12: boolean;
  label: string;
  width?: number;
}) {
  const [draft, setDraft] = React.useState(() => formatTime(value, hour12));

  function commit() {
    const parsed = parseTime(draft);
    if (parsed == null) { setDraft(formatTime(value, hour12)); return; }
    setDraft(formatTime(parsed, hour12));
    if (parsed !== value) onChange(parsed);
  }

  return (
    <input
      aria-label={label}
      value={draft}
      style={{ width }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
      className={cn(
        "h-8 rounded-md border border-line bg-transparent px-2 text-center text-[13px] text-ink tnum",
        "transition-[border-color,box-shadow] duration-150",
        "hover:border-line-strong focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-soft",
      )}
    />
  );
}
