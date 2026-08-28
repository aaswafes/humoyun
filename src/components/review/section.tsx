"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { SectionLabel } from "@/components/ui/primitives";

/** The one section rhythm the review page uses: label, quiet note, right-hand slot. */
export function Section({
  label, note, action, children, className,
}: {
  label: React.ReactNode;
  note?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("mt-11 first:mt-0", className)}>
      <div className="mb-3 flex min-h-7 items-center gap-2.5">
        <SectionLabel>{label}</SectionLabel>
        {note && <span className="hidden text-[11.5px] text-ink-4 sm:block">{note}</span>}
        {action && <div className="ml-auto flex items-center gap-2">{action}</div>}
      </div>
      {children}
    </section>
  );
}
