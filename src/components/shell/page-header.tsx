"use client";

import * as React from "react";
import { PanelLeft, Plus } from "lucide-react";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/cn";
import { IconButton, Button } from "@/components/ui/primitives";
import { openQuickAdd } from "./quick-add";

/**
 * Every page wears the same 52px chrome: sidebar toggle, title, actions.
 * Content scrolls underneath a translucent bar.
 */
export function PageHeader({
  title, subtitle, actions, children, sticky = true, className,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  sticky?: boolean;
  className?: string;
}) {
  const sidebarOpen = useStore((s) => s.sidebarOpen);
  const toggleSidebar = useStore((s) => s.toggleSidebar);

  return (
    <header
      className={cn(
        "z-30 flex h-[var(--topbar-h)] shrink-0 items-center gap-2 px-3 material hairline-b",
        sticky && "sticky top-0",
        className,
      )}
    >
      {!sidebarOpen && (
        <IconButton label="Show sidebar" onClick={toggleSidebar}>
          <PanelLeft />
        </IconButton>
      )}

      <div className="flex min-w-0 items-baseline gap-2.5">
        <h1 className="truncate text-[15px] font-semibold tracking-[-0.01em] text-ink">{title}</h1>
        {subtitle && <p className="truncate text-[12.5px] text-ink-3">{subtitle}</p>}
      </div>

      <div className="flex-1" />
      {children}
      {actions ?? (
        <Button variant="primary" size="sm" onClick={openQuickAdd}>
          <Plus className="size-3.5" />
          New
        </Button>
      )}
    </header>
  );
}

/** Standard page scroll container — keeps max width and rhythm consistent. */
export function PageBody({
  children, className, wide,
}: {
  children: React.ReactNode;
  className?: string;
  wide?: boolean;
}) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className={cn("mx-auto w-full px-5 py-6 md:px-8", wide ? "max-w-[1400px]" : "max-w-[880px]", className)}>
        {children}
      </div>
    </div>
  );
}
