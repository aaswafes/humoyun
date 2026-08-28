"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * The rail's shared shell: hairline-separated header, tight body, optional
 * footer for the one line of context a card wants to leave behind.
 * Cards never nest another card inside themselves — rows only.
 */
export function RailCard({
  icon: Icon, title, accessory, href, hrefLabel, children, footer, className,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  accessory?: React.ReactNode;
  href?: string;
  hrefLabel?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("surface", className)}>
      <div className="flex h-9 items-center gap-2 px-3 hairline-b">
        <Icon className="size-3.5 shrink-0 text-ink-3" />
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">{title}</h2>
        <div className="ml-auto flex items-center gap-2">
          {accessory}
          {href && (
            <Link
              href={href}
              aria-label={hrefLabel ?? `Open ${title}`}
              title={hrefLabel ?? `Open ${title}`}
              className={cn(
                "-mr-1 grid size-6 place-items-center rounded-md text-ink-4 cursor-pointer",
                "transition-[color,background-color,transform] duration-150 ease-[var(--ease-out-apple)]",
                "hover:bg-hover hover:text-ink-2 active:scale-[0.94]",
              )}
            >
              <ArrowUpRight className="size-3.5" />
            </Link>
          )}
        </div>
      </div>
      <div className="p-1.5">{children}</div>
      {footer && <div className="px-3 py-2 hairline-t">{footer}</div>}
    </section>
  );
}

/** Compact empty state — the page-level EmptyState is far too tall for a rail card. */
export function RailEmpty({
  children, action,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="px-2 pb-1.5 pt-1">
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
  onClick, ariaLabel, ariaPressed, children, className,
}: {
  onClick: () => void;
  ariaLabel: string;
  ariaPressed?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
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

/** The small print a card leaves in its footer: label on the left, number on the right. */
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
      {value != null && <span className="shrink-0 font-medium text-ink-2">{value}</span>}
    </p>
  );
}
