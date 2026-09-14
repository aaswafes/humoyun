"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { Fold, useFold } from "./fold";

/**
 * The rail is a list of foldable sections, not a stack of cards: one quiet
 * header row each, the summary standing in for the content while it is folded,
 * and rows that sit on spacing. Nothing here draws a border — the rail's own
 * hairlines do the separating.
 */
export function RailCard({
  icon, title, summary, foldKey, defaultOpen = false,
  accessory, href, hrefLabel, children, footer, className,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  /** What the section says while folded. Always states its own value. */
  summary?: React.ReactNode;
  /** localStorage key, namespaced under `humoyun.today.` */
  foldKey: string;
  defaultOpen?: boolean;
  accessory?: React.ReactNode;
  href?: string;
  hrefLabel?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  const { open, toggle } = useFold(foldKey, defaultOpen);

  return (
    <Fold
      icon={icon}
      title={title}
      summary={summary}
      open={open}
      onToggle={toggle}
      className={cn("py-1.5", className)}
      accessory={
        open ? (
          <>
            {accessory}
            {href && (
              <Link
                href={href}
                aria-label={hrefLabel ?? `Open ${title}`}
                title={hrefLabel ?? `Open ${title}`}
                className={cn(
                  "grid size-7 place-items-center rounded-md text-ink-4 cursor-pointer",
                  "transition-[color,background-color,transform] duration-150 ease-[var(--ease-out-apple)]",
                  "hover:bg-hover hover:text-ink-2 active:scale-[0.94]",
                )}
              >
                <ArrowUpRight className="size-3.5" />
              </Link>
            )}
          </>
        ) : undefined
      }
    >
      <div className="pb-1 pt-1">{children}</div>
      {footer && <div className="px-2 pb-1.5">{footer}</div>}
    </Fold>
  );
}

/** Compact empty state — the page-level EmptyState is far too tall for a rail section. */
export function RailEmpty({
  children, action,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="px-2 pb-1 pt-0.5">
      <p className="text-[12.5px] leading-relaxed text-ink-3">{children}</p>
      {action && <div className="mt-2.5">{action}</div>}
    </div>
  );
}

/** The action a rail's empty state offers. */
export function RailLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-md bg-hover px-2.5 text-[12.5px] font-medium text-ink",
        "cursor-pointer transition-[background-color,transform] duration-150 ease-[var(--ease-out-apple)]",
        "hover:bg-active active:scale-[0.97]",
      )}
    >
      {children}
      <ArrowRight className="size-3" />
    </Link>
  );
}

/** Row button used by every rail entry whose whole surface is one action. */
export function RailRow({
  onClick, ariaLabel, ariaPressed, title, children, className,
}: {
  onClick: () => void;
  ariaLabel: string;
  ariaPressed?: boolean;
  /** Hover text. The row stays readable without it — never hide state here alone. */
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={ariaLabel}
      aria-pressed={ariaPressed}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left cursor-pointer",
        "transition-[background-color,transform] duration-150 ease-[var(--ease-out-apple)]",
        "hover:bg-hover active:scale-[0.985]",
        className,
      )}
    >
      {children}
    </button>
  );
}

/**
 * Row that holds more than one control. Interactive elements never nest, so a
 * row with a checkbox *and* a button cannot itself be a button.
 */
export function RailItem({
  children, className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "group/item flex w-full items-center gap-2.5 rounded-md px-2 py-1.5",
        "transition-colors duration-150 hover:bg-hover",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** The small print a section leaves behind: label on the left, number on the right. */
export function RailMeta({
  children, value, className,
}: {
  children: React.ReactNode;
  value?: React.ReactNode;
  className?: string;
}) {
  return (
    <p className={cn("flex items-baseline justify-between gap-2 text-[11.5px] text-ink-3 tnum", className)}>
      <span className="min-w-0 truncate">{children}</span>
      {value != null && <span className="shrink-0 font-medium text-ink-3">{value}</span>}
    </p>
  );
}
