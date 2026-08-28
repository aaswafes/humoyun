"use client";

import * as React from "react";
import { Check, Loader2, Minus } from "lucide-react";
import { cn } from "@/lib/cn";
import type { Tint } from "@/lib/types";

// =========================================================
// Button
// =========================================================
type ButtonVariant = "primary" | "secondary" | "ghost" | "subtle" | "danger";
type ButtonSize = "xs" | "sm" | "md" | "lg";

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium " +
  "transition-[background-color,color,box-shadow,transform,opacity] duration-150 ease-[var(--ease-out-apple)] " +
  "cursor-pointer select-none active:scale-[0.975] disabled:pointer-events-none disabled:opacity-40";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-ink hover:bg-accent-hover shadow-[0_1px_2px_rgba(0,0,0,0.08)]",
  secondary: "bg-raised text-ink border border-line hover:bg-hover",
  ghost: "text-ink-2 hover:text-ink hover:bg-hover",
  subtle: "bg-hover text-ink hover:bg-active",
  danger: "bg-danger-soft text-danger hover:brightness-95 dark:hover:brightness-110",
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  xs: "h-6 px-2 text-[12px] rounded-sm gap-1",
  sm: "h-7 px-2.5 text-[13px]",
  md: "h-8 px-3 text-[13.5px]",
  lg: "h-10 px-4 text-[15px] rounded-lg",
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "secondary", size = "md", loading, children, disabled, ...props }, ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(BUTTON_BASE, BUTTON_VARIANTS[variant], BUTTON_SIZES[size], className)}
      {...props}
    >
      {loading && <Loader2 className="size-3.5 anim-spin" aria-hidden />}
      {children}
    </button>
  );
});

// =========================================================
// IconButton — square, ≥28px hit area, tooltip-friendly
// =========================================================
export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  size?: "sm" | "md" | "lg";
  active?: boolean;
  tone?: "default" | "danger";
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { className, label, size = "md", active, tone = "default", children, ...props }, ref,
) {
  return (
    <button
      ref={ref}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex items-center justify-center rounded-md cursor-pointer",
        "transition-[background-color,color,transform] duration-150 ease-[var(--ease-out-apple)]",
        "active:scale-[0.94] disabled:pointer-events-none disabled:opacity-40",
        size === "sm" && "size-6 [&_svg]:size-3.5",
        size === "md" && "size-7 [&_svg]:size-4",
        size === "lg" && "size-9 [&_svg]:size-[18px]",
        active ? "bg-accent-soft text-accent" : "text-ink-3 hover:text-ink hover:bg-hover",
        tone === "danger" && "hover:text-danger hover:bg-danger-soft",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
});

// =========================================================
// Checkbox — the Notion tick, with an Apple spring
// =========================================================
export interface CheckboxProps {
  checked: boolean;
  indeterminate?: boolean;
  onChange: (next: boolean) => void;
  size?: "sm" | "md";
  tint?: Tint | null;
  label?: string;
  className?: string;
  disabled?: boolean;
}

export function Checkbox({
  checked, indeterminate, onChange, size = "md", tint, label, className, disabled,
}: CheckboxProps) {
  const [burst, setBurst] = React.useState(false);

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? "mixed" : checked}
      aria-label={label ?? (checked ? "Mark as not done" : "Mark as done")}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        if (!checked) { setBurst(true); setTimeout(() => setBurst(false), 280); }
        onChange(!checked);
      }}
      className={cn(
        "relative shrink-0 grid place-items-center rounded-[5px] border cursor-pointer",
        "transition-[background-color,border-color,transform] duration-150 ease-[var(--ease-out-apple)]",
        "active:scale-90 disabled:opacity-40 disabled:pointer-events-none",
        size === "sm" ? "size-[15px]" : "size-[17px]",
        checked || indeterminate
          ? "border-transparent text-white"
          : "border-line-strong hover:border-ink-3 hover:bg-hover",
        burst && "anim-check",
        tint && "tint-holder",
        className,
      )}
      style={
        checked || indeterminate
          ? { background: tint ? "var(--tint)" : "var(--accent)" }
          : undefined
      }
    >
      {indeterminate ? (
        <Minus className={cn(size === "sm" ? "size-2.5" : "size-3", "stroke-[3.5]")} />
      ) : checked ? (
        <Check className={cn(size === "sm" ? "size-2.5" : "size-3", "stroke-[3.5]")} />
      ) : null}
    </button>
  );
}

// =========================================================
// Inputs
// =========================================================
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          "w-full h-8 px-2.5 rounded-md bg-transparent border border-line text-[13.5px] text-ink",
          "transition-[border-color,box-shadow] duration-150",
          "hover:border-line-strong focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft",
          className,
        )}
        {...props}
      />
    );
  },
);

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return (
      <textarea
        ref={ref}
        className={cn(
          "w-full px-2.5 py-2 rounded-md bg-transparent border border-line text-[13.5px] text-ink resize-none",
          "transition-[border-color,box-shadow] duration-150 leading-relaxed",
          "hover:border-line-strong focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft",
          className,
        )}
        {...props}
      />
    );
  },
);

/** Borderless field that only reveals its chrome on hover — Notion's inline editing. */
export const InlineInput = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function InlineInput({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          "w-full bg-transparent border-0 outline-none rounded-sm px-1 -mx-1 py-0.5",
          "hover:bg-hover focus:bg-hover transition-colors duration-150",
          className,
        )}
        {...props}
      />
    );
  },
);

/** Textarea that grows with its content. */
export function AutoTextarea({
  value, onChange, className, minRows = 1, ...props
}: {
  value: string;
  onChange: (v: string) => void;
  minRows?: number;
} & Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange">) {
  const ref = React.useRef<HTMLTextAreaElement>(null);

  const resize = React.useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  React.useEffect(resize, [value, resize]);

  return (
    <textarea
      ref={ref}
      rows={minRows}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "w-full bg-transparent border-0 outline-none resize-none overflow-hidden leading-relaxed",
        className,
      )}
      {...props}
    />
  );
}

// =========================================================
// Segmented control — the iOS pill switcher
// =========================================================
export function Segmented<T extends string>({
  value, options, onChange, size = "md", className,
}: {
  value: T;
  options: { value: T; label: React.ReactNode; title?: string }[];
  onChange: (v: T) => void;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={cn(
        "relative inline-flex items-center gap-0.5 rounded-lg bg-hover p-0.5",
        className,
      )}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            role="tab"
            aria-selected={active}
            title={opt.title}
            onClick={() => onChange(opt.value)}
            className={cn(
              "relative rounded-[7px] font-medium cursor-pointer whitespace-nowrap",
              "transition-[color,background-color,box-shadow] duration-200 ease-[var(--ease-out-apple)]",
              size === "sm" ? "h-6 px-2 text-[12px]" : "h-7 px-2.5 text-[13px]",
              active
                ? "bg-raised text-ink shadow-[0_1px_3px_rgba(0,0,0,0.10),0_0_0_0.5px_rgba(0,0,0,0.06)]"
                : "text-ink-3 hover:text-ink-2",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

// =========================================================
// Badge / Chip
// =========================================================
export function Badge({
  children, tint, className, dot, onClick,
}: {
  children: React.ReactNode;
  tint?: Tint | null;
  className?: string;
  dot?: boolean;
  onClick?: (e: React.MouseEvent) => void;
}) {
  const Tag = onClick ? "button" : "span";
  return (
    <Tag
      onClick={onClick}
      className={cn(
        tint ? `tint-${tint}` : "tint-slate",
        "inline-flex items-center gap-1 h-[19px] px-1.5 rounded-[5px] text-[11.5px] font-medium leading-none",
        "bg-[var(--tint-soft)] text-[var(--tint-ink)] max-w-[160px] truncate",
        onClick && "cursor-pointer hover:brightness-95 dark:hover:brightness-110 transition-[filter]",
        className,
      )}
    >
      {dot && <span className="size-1.5 rounded-full bg-[var(--tint)]" />}
      <span className="truncate">{children}</span>
    </Tag>
  );
}

// =========================================================
// Progress
// =========================================================
export function Progress({
  value, max = 100, tint, className, height = 4,
}: {
  value: number;
  max?: number;
  tint?: Tint | null;
  className?: string;
  height?: number;
}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn(tint ? `tint-${tint}` : "", "w-full rounded-full bg-hover overflow-hidden", className)}
      style={{ height }}
    >
      <div
        className="h-full rounded-full transition-[width] duration-500 ease-[var(--ease-out-apple)]"
        style={{ width: `${pct}%`, background: tint ? "var(--tint)" : "var(--accent)" }}
      />
    </div>
  );
}

/** Circular progress used by the pomodoro dial and habit rings. */
export function Ring({
  value, max = 100, size = 40, stroke = 3, tint, children, className,
}: {
  value: number;
  max?: number;
  size?: number;
  stroke?: number;
  tint?: Tint | null;
  children?: React.ReactNode;
  className?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return (
    <div className={cn(tint ? `tint-${tint}` : "", "relative grid place-items-center", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={tint ? "var(--tint)" : "var(--accent)"}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          className="transition-[stroke-dashoffset] duration-500 ease-[var(--ease-out-apple)]"
        />
      </svg>
      {children && <div className="absolute inset-0 grid place-items-center">{children}</div>}
    </div>
  );
}

// =========================================================
// Misc
// =========================================================
export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        "inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[4px] px-1",
        "bg-hover text-ink-3 text-[10.5px] font-medium font-sans leading-none border border-line",
        className,
      )}
    >
      {children}
    </kbd>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("size-4 anim-spin text-ink-3", className)} />;
}

export function Divider({ className, vertical }: { className?: string; vertical?: boolean }) {
  return (
    <div
      role="separator"
      className={cn(vertical ? "w-px h-full" : "h-px w-full", "bg-line shrink-0", className)}
    />
  );
}

export function SectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3", className)}>
      {children}
    </div>
  );
}

export function EmptyState({
  icon: Icon, title, description, action, className,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center text-center py-14 px-6", className)}>
      {Icon && (
        <div className="mb-3 grid size-11 place-items-center rounded-xl bg-hover text-ink-3">
          <Icon className="size-5" />
        </div>
      )}
      <p className="text-[14px] font-medium text-ink">{title}</p>
      {description && <p className="mt-1 max-w-[34ch] text-[13px] leading-relaxed text-ink-3">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton", className)} />;
}

/** Lightweight hover tooltip. No portal, no dependency. */
export function Tooltip({
  content, children, side = "top", className,
}: {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  className?: string;
}) {
  return (
    <span className={cn("relative inline-flex group/tt", className)}>
      {children}
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none absolute z-50 whitespace-nowrap rounded-md px-2 py-1 text-[11.5px] font-medium",
          "bg-ink text-canvas opacity-0 scale-95 transition-[opacity,transform] duration-150 ease-[var(--ease-out-apple)]",
          "group-hover/tt:opacity-100 group-hover/tt:scale-100 shadow-md",
          side === "top" && "bottom-[calc(100%+6px)] left-1/2 -translate-x-1/2",
          side === "bottom" && "top-[calc(100%+6px)] left-1/2 -translate-x-1/2",
          side === "left" && "right-[calc(100%+6px)] top-1/2 -translate-y-1/2",
          side === "right" && "left-[calc(100%+6px)] top-1/2 -translate-y-1/2",
        )}
      >
        {content}
      </span>
    </span>
  );
}
