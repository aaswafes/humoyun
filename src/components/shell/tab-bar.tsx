"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, Inbox, Menu, Plus, Sun } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore, inboxTasks } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { openQuickAdd } from "./quick-add";
import { useMobileNav } from "./mobile-nav";

// =========================================================
// The phone's way around: four places and a pen, under the thumb.
//
// Today, Calendar and Inbox are where a day is planned, so they are one tap
// away; New is in the middle because capture is the most common act of all;
// More opens the drawer, which is the whole sidebar. A section that is not a
// tab lights More, so the bar always says where you are.
//
// It sits in the flow at the bottom of the shell, not position:fixed — the
// page above it simply ends where it begins, so nothing ever scrolls
// underneath it and no page has to pad itself for it.
// =========================================================

const TABS = ["/", "/calendar", "/inbox"] as const;

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function TabBar() {
  const pathname = usePathname();
  const { t } = useT();
  const tasks = useStore((s) => s.tasks);
  const inboxCount = React.useMemo(() => inboxTasks(tasks).length, [tasks]);
  const navOpen = useMobileNav((s) => s.open);
  const setNavOpen = useMobileNav((s) => s.setOpen);
  const elsewhere = !TABS.some((href) => isActive(pathname, href));

  return (
    // No text selection and no iOS link-preview callout on a long press: this
    // is app chrome, and a held thumb on a tab should do nothing at all.
    <nav
      aria-label={t("nav.menu")}
      className="shrink-0 select-none material hairline-t pb-[var(--safe-bottom)] [-webkit-touch-callout:none] md:hidden"
    >
      <ul className="grid h-[var(--tabbar-h)] grid-cols-5">
        <Tab href="/" label={t("nav.today")} icon={Sun} active={isActive(pathname, "/")} />
        <Tab href="/calendar" label={t("nav.calendar")} icon={CalendarDays} active={isActive(pathname, "/calendar")} />
        <li className="grid place-items-center">
          <button
            type="button"
            onClick={openQuickAdd}
            aria-label={t("nav.newTask")}
            className={cn(
              "grid size-11 place-items-center rounded-full bg-accent text-accent-ink shadow-md cursor-pointer",
              "transition-transform duration-150 ease-[var(--ease-out-apple)] active:scale-[0.94]",
            )}
          >
            <Plus className="size-5 stroke-[2.4]" />
          </button>
        </li>
        <Tab
          href="/inbox"
          label={t("nav.inbox")}
          icon={Inbox}
          active={isActive(pathname, "/inbox")}
          badge={inboxCount}
        />
        <li>
          <button
            type="button"
            onClick={() => setNavOpen(true)}
            aria-expanded={navOpen}
            aria-haspopup="dialog"
            className={cn(
              "flex h-full w-full flex-col items-center justify-center gap-0.5 cursor-pointer",
              "transition-colors duration-150 active:bg-hover",
              elsewhere || navOpen ? "text-ink" : "text-ink-3",
            )}
          >
            <Menu className={cn("size-[22px]", elsewhere ? "stroke-[2.3]" : "stroke-[1.8]")} />
            <span className={cn("text-[10.5px] leading-none", elsewhere && "font-semibold")}>{t("nav.more")}</span>
          </button>
        </li>
      </ul>
    </nav>
  );
}

function Tab({
  href, label, icon: Icon, active, badge,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
  badge?: number;
}) {
  // Weight is a class, not lucide's strokeWidth prop: globals.css re-weights
  // every icon through CSS, which beats the attribute that prop writes.
  return (
    <li>
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "relative flex h-full w-full flex-col items-center justify-center gap-0.5",
          "transition-colors duration-150 active:bg-hover",
          active ? "text-ink" : "text-ink-3",
        )}
      >
        <span className="relative">
          <Icon className={cn("size-[22px]", active ? "stroke-[2.3]" : "stroke-[1.8]")} />
          {!!badge && (
            // Quiet on purpose: a full inbox is information, not an alarm.
            <span className="absolute -right-2.5 -top-1.5 min-w-[17px] rounded-full bg-active px-1 text-center text-[10.5px] font-semibold leading-[17px] text-ink-2 tnum">
              {badge > 99 ? "99+" : badge}
            </span>
          )}
        </span>
        <span className={cn("text-[10.5px] leading-none", active && "font-semibold")}>{label}</span>
      </Link>
    </li>
  );
}
