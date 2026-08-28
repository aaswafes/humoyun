"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Bell, CalendarDays, Database, LogOut, MoonStar, Palette, User } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import { supabase } from "@/lib/supabase/client";
import { Button } from "@/components/ui/primitives";
import { PageBody, PageHeader } from "@/components/shell/page-header";
import { ProfileSection } from "@/components/settings/profile-section";
import { AppearanceSection } from "@/components/settings/appearance-section";
import { CalendarSection } from "@/components/settings/calendar-section";
import { SalahSection } from "@/components/settings/salah-section";
import { NotificationsSection } from "@/components/settings/notifications-section";
import { DataSection } from "@/components/settings/data-section";
import { ShortcutsCard } from "@/components/settings/shortcuts-card";
import { startReminders } from "@/components/settings/reminders";

const TABS = [
  { id: "profile", label: "Account", icon: User },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "calendar", label: "Calendar", icon: CalendarDays },
  { id: "salah", label: "Salah", icon: MoonStar },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "data", label: "Data", icon: Database },
] as const;

type TabId = (typeof TABS)[number]["id"];

const TAB_KEY = "humoyun.settings.tab";
const isTabId = (v: string): v is TabId => TABS.some((t) => t.id === v);

// ---------------------------------------------------------
// Which pane you were last reading lives in localStorage, which is an external
// store: reading it during render would not survive hydration, and writing it
// into state from an effect costs a second render. useSyncExternalStore is the
// shape React provides for exactly this.
// ---------------------------------------------------------
const tabListeners = new Set<() => void>();
let cachedTab: TabId | null = null;

function subscribeTab(fn: () => void) {
  tabListeners.add(fn);
  return () => { tabListeners.delete(fn); };
}

function tabSnapshot(): TabId {
  if (cachedTab) return cachedTab;
  try {
    const saved = localStorage.getItem(TAB_KEY);
    cachedTab = saved && isTabId(saved) ? saved : "profile";
  } catch {
    cachedTab = "profile";
  }
  return cachedTab;
}

const tabServerSnapshot = (): TabId => "profile";

function writeTab(next: TabId) {
  cachedTab = next;
  try { localStorage.setItem(TAB_KEY, next); } catch { /* private mode */ }
  tabListeners.forEach((fn) => fn());
}

export default function SettingsPage() {
  const router = useRouter();
  const email = useStore((s) => s.email);
  const tab = React.useSyncExternalStore(subscribeTab, tabSnapshot, tabServerSnapshot);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const tabRefs = React.useRef<(HTMLButtonElement | null)[]>([]);

  // Reminders keep running for the session once they are switched on, so the
  // engine is woken here rather than inside the panel that configures it.
  React.useEffect(() => { startReminders(); }, []);

  function selectTab(next: TabId, focusPanel = false) {
    writeTab(next);
    if (focusPanel) requestAnimationFrame(() => panelRef.current?.focus());
  }

  function onTabKeyDown(e: React.KeyboardEvent, index: number) {
    const last = TABS.length - 1;
    let next = index;
    if (e.key === "ArrowDown" || e.key === "ArrowRight") next = index === last ? 0 : index + 1;
    else if (e.key === "ArrowUp" || e.key === "ArrowLeft") next = index === 0 ? last : index - 1;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = last;
    else return;
    e.preventDefault();
    selectTab(TABS[next].id);
    tabRefs.current[next]?.focus();
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <>
      <PageHeader
        title="Settings"
        subtitle={email ?? undefined}
        actions={
          <Button variant="ghost" size="sm" onClick={signOut}>
            <LogOut className="size-3.5" />
            Sign out
          </Button>
        }
      />

      <PageBody>
        <div className="grid gap-8 md:grid-cols-[164px_minmax(0,1fr)] md:gap-12">
          <div
            role="tablist"
            aria-label="Settings sections"
            className="no-scrollbar -mx-1 flex gap-1 overflow-x-auto px-1 pb-1 md:sticky md:top-6 md:mx-0 md:block md:space-y-px md:self-start md:overflow-visible md:px-0 md:pb-0"
          >
            {TABS.map(({ id, label, icon: Icon }, i) => {
              const active = tab === id;
              return (
                <button
                  key={id}
                  ref={(el) => { tabRefs.current[i] = el; }}
                  role="tab"
                  id={`settings-tab-${id}`}
                  aria-selected={active}
                  aria-controls="settings-panel"
                  tabIndex={active ? 0 : -1}
                  onClick={(e) => selectTab(id, e.detail > 0)}
                  onKeyDown={(e) => onTabKeyDown(e, i)}
                  className={cn(
                    "flex h-[30px] shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap rounded-md px-2 text-[13.5px] md:w-full",
                    "transition-colors duration-150",
                    active
                      ? "bg-active font-medium text-ink"
                      : "text-ink-2 hover:bg-hover hover:text-ink",
                  )}
                >
                  <Icon className={cn("size-4 shrink-0", active ? "text-ink" : "text-ink-3")} />
                  {label}
                </button>
              );
            })}
          </div>

          <div
            ref={panelRef}
            id="settings-panel"
            role="tabpanel"
            aria-labelledby={`settings-tab-${tab}`}
            tabIndex={-1}
            className="min-w-0 outline-none"
          >
            {tab === "profile" && <ProfileSection />}
            {tab === "appearance" && <AppearanceSection />}
            {tab === "calendar" && <CalendarSection />}
            {tab === "salah" && <SalahSection />}
            {tab === "notifications" && <NotificationsSection />}
            {tab === "data" && <DataSection />}
          </div>
        </div>

        <ShortcutsCard />
      </PageBody>
    </>
  );
}
