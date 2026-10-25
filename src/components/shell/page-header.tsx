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
 *
 * Below md the bar has two rows. The title and the actions keep the first;
 * `children` — view switchers, filters, date steppers — drop to a second row
 * that scrolls sideways, because on a 390px screen they never fit beside a
 * title and squeezing them is how controls end up unreadable or off-screen.
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
        "max-md:h-auto max-md:min-h-[var(--topbar-h)] max-md:flex-wrap max-md:gap-x-2 max-md:gap-y-0 max-md:px-4",
        sticky && "sticky top-0",
        className,
      )}
    >
      {/* The phone has no sidebar column to show — the tab bar's More is it. */}
      {!sidebarOpen && (
        <IconButton label="Show sidebar" onClick={toggleSidebar} className="max-md:hidden">
          <PanelLeft />
        </IconButton>
      )}

      <div className="flex min-w-0 items-baseline gap-2.5 max-md:h-[var(--topbar-h)] max-md:flex-1 max-md:items-center">
        <h1 className="truncate text-[15px] font-semibold tracking-[-0.01em] text-ink max-md:text-[17px] max-md:shrink-0 max-md:max-w-full">
          {title}
        </h1>
        {subtitle && <p className="truncate text-[12.5px] text-ink-3">{subtitle}</p>}
      </div>

      <div className="flex-1 max-md:hidden" />
      {children && (
        <div
          className={cn(
            "flex items-center gap-2",
            "max-md:order-last max-md:-mx-4 max-md:w-[calc(100%+2rem)] max-md:overflow-x-auto max-md:px-4 max-md:pb-2.5 max-md:pt-0.5 no-scrollbar",
          )}
        >
          {children}
        </div>
      )}
      {actions ?? (
        // The tab bar's + is the phone's New; a second one here would be the
        // same button twice on one screen.
        <Button variant="primary" size="sm" onClick={openQuickAdd} className="max-md:hidden">
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
    // overscroll-contain: the page's own scroll ends at the page. Without it a
    // fling past the bottom on iOS rubber-bands the whole shell, tab bar and all.
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
      <div className={cn("mx-auto w-full px-4 py-5 sm:px-5 sm:py-6 md:px-8", wide ? "max-w-[1400px]" : "max-w-[880px]", className)}>
        {children}
      </div>
    </div>
  );
}
