"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { SectionLabel } from "@/components/ui/primitives";

/** The one section rhythm the review page uses: label, quiet note, right-hand slot. */
export function Section({
  id, label, note, action, children, className, flush,
}: {
  id?: string;
  label: React.ReactNode;
  note?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** Guided mode already spaces its steps, so the top margin gets dropped. */
  flush?: boolean;
}) {
  return (
    <section id={id} className={cn(flush ? "mt-0" : "mt-11 first:mt-0", "scroll-mt-20", className)}>
      <div className="mb-3 flex min-h-7 items-center gap-2.5">
        <SectionLabel>{label}</SectionLabel>
        {note && <span className="hidden text-[11.5px] text-ink-4 sm:block">{note}</span>}
        {action && <div className="ml-auto flex items-center gap-2">{action}</div>}
      </div>
      {children}
    </section>
  );
}

/** A card inside a section — evidence panels sit in a grid of these. */
export function Panel({
  title, meta, children, className, action,
}: {
  title: React.ReactNode;
  meta?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("surface p-3.5", className)}>
      <div className="mb-2.5 flex min-h-6 items-center gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">{title}</h3>
        {meta && <span className="truncate text-[11.5px] text-ink-4 tnum">{meta}</span>}
        {action && <div className="ml-auto flex items-center gap-1">{action}</div>}
      </div>
      {children}
    </div>
  );
}

/** Label / value row used inside panels. */
export function Line({
  label, value, className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-baseline gap-2 py-1", className)}>
      <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-2">{label}</span>
      <span className="shrink-0 text-[12.5px] font-medium text-ink tnum">{value}</span>
    </div>
  );
}
