"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";
import { MenuItem, Popover, type PopoverProps } from "@/components/ui/overlays";
import type { SelectOption } from "@/components/ui/form";

/**
 * The kit's `Popover` paints at z-80, but `Sheet` is z-90 and `Modal` is z-100,
 * so a popover opened from inside either one lands underneath it. Overlays are
 * shared kit and off-limits, so this surface raises its own popovers instead:
 * both wrappers take the kit's component and push the panel above the dialog
 * it was opened from. Use these — and only these — inside the editor sheet and
 * the apply, import and starter dialogs.
 */
export const OVERLAY_LAYER = "z-[120]";

export function LayeredPopover({ className, ...props }: PopoverProps) {
  return <Popover {...props} className={cn(OVERLAY_LAYER, className)} />;
}

/**
 * `Select` from the kit, with the same look and keyboard behaviour, but a panel
 * that clears a sheet or a modal. Kept deliberately thin: options in, value out.
 */
export function LayeredSelect<T extends string>({
  value, options, onChange, id, placeholder = "Select…", className, size = "md",
  align = "start", disabled, label, "aria-describedby": describedBy, "aria-invalid": invalid,
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
  /** Shown as a danger border — `aria-invalid` is not a valid attribute on a button. */
  "aria-invalid"?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const current = options.find((o) => o.value === value);

  return (
    <LayeredPopover
      open={open}
      onOpenChange={setOpen}
      align={align}
      className="max-h-[300px] w-[var(--select-w,260px)] overflow-y-auto"
      trigger={
        <button
          type="button"
          id={id}
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={label}
          aria-describedby={describedBy}
          data-invalid={invalid ? "" : undefined}
          className={cn(
            "flex w-full items-center gap-1.5 rounded-md border border-line bg-raised px-2 text-left",
            "transition-[border-color,box-shadow,transform] duration-150 ease-[var(--ease-out-apple)] cursor-pointer",
            "active:scale-[0.975] hover:border-line-strong focus-visible:border-accent",
            "disabled:pointer-events-none disabled:opacity-40",
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
    </LayeredPopover>
  );
}
