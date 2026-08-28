"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Database, LogOut, MoonStar, Palette, User } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import { supabase } from "@/lib/supabase/client";
import { Button } from "@/components/ui/primitives";
import { PageBody, PageHeader } from "@/components/shell/page-header";
import { ProfileSection } from "@/components/settings/profile-section";
import { AppearanceSection } from "@/components/settings/appearance-section";
import { CalendarSection } from "@/components/settings/calendar-section";
import { SalahSection } from "@/components/settings/salah-section";
import { DataSection } from "@/components/settings/data-section";
import { ShortcutsCard } from "@/components/settings/shortcuts-card";

const TABS = [
  { id: "profile", label: "Profile", icon: User },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "calendar", label: "Calendar", icon: CalendarDays },
  { id: "salah", label: "Salah", icon: MoonStar },
  { id: "data", label: "Data", icon: Database },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function SettingsPage() {
  const router = useRouter();
  const email = useStore((s) => s.email);
  const [tab, setTab] = React.useState<TabId>("profile");

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
          <nav aria-label="Settings sections" className="md:sticky md:top-6 md:self-start">
            <ul className="no-scrollbar -mx-1 flex gap-1 overflow-x-auto px-1 pb-1 md:mx-0 md:block md:space-y-px md:overflow-visible md:px-0 md:pb-0">
              {TABS.map(({ id, label, icon: Icon }) => {
                const active = tab === id;
                return (
                  <li key={id} className="shrink-0">
                    <button
                      onClick={() => setTab(id)}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex h-[30px] cursor-pointer items-center gap-2 whitespace-nowrap rounded-md px-2 text-[13.5px] md:w-full",
                        "transition-colors duration-150",
                        active
                          ? "bg-active font-medium text-ink"
                          : "text-ink-2 hover:bg-hover hover:text-ink",
                      )}
                    >
                      <Icon className={cn("size-4 shrink-0", active ? "text-ink" : "text-ink-3")} />
                      {label}
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="min-w-0">
            {tab === "profile" && <ProfileSection />}
            {tab === "appearance" && <AppearanceSection />}
            {tab === "calendar" && <CalendarSection />}
            {tab === "salah" && <SalahSection />}
            {tab === "data" && <DataSection />}
          </div>
        </div>

        <ShortcutsCard />
      </PageBody>
    </>
  );
}
