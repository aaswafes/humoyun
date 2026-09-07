"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { SOLO, SOLO_USER_ID } from "@/lib/local-db";
import { useStore } from "@/lib/store";
import { applyAppearance, cacheForBoot, readAppearance } from "@/lib/customize";
import { useHotkeys } from "@/hooks/use-hotkeys";
import { addDays, todayISO } from "@/lib/date";
import { Sidebar } from "./sidebar";
import { CommandPalette } from "./command-palette";
import { QuickAdd, openQuickAdd } from "./quick-add";
import { TimerBar } from "./timer-bar";
import { OfflineBar } from "./offline-bar";
import { TaskInspector } from "@/components/tasks/task-inspector";
import { Spinner } from "@/components/ui/primitives";

// Module scope on purpose: React 19 StrictMode mounts the shell twice in dev and
// a state-based guard is re-created on the second mount, which double-seeded.
let soloBooted = false;

function isTextField(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const ready = useStore((s) => s.ready);
  const hydrate = useStore((s) => s.hydrate);
  const reset = useStore((s) => s.reset);
  const setCommandOpen = useStore((s) => s.setCommandOpen);
  const toggleSidebar = useStore((s) => s.toggleSidebar);
  const setSelectedDate = useStore((s) => s.setSelectedDate);
  const selectedDate = useStore((s) => s.selectedDate);
  const profile = useStore((s) => s.profile);

  // ---- session ----
  React.useEffect(() => {
    let cancelled = false;

    if (SOLO) {
      if (soloBooted) return;
      soloBooted = true;
      hydrate(SOLO_USER_ID, "you@local").then(async () => {
        // First boot of a local preview: fill it with a believable week so the
        // app does not open as thirteen empty states. A workspace seeded by an
        // older build gets only the pieces the sample has grown since.
        const seeder = await import("@/components/settings/sample-data");
        if (useStore.getState().soloNeedsSeed) {
          seeder.loadSampleData();
          useStore.setState({ soloNeedsSeed: false });
        } else {
          seeder.topUpSampleData();
        }
      });
      return;
    }

    supabase.auth.getUser().then(({ data }) => {
      if (cancelled) return;
      if (!data.user) { router.replace("/login"); return; }
      hydrate(data.user.id, data.user.email);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") { reset(); router.replace("/login"); }
      if (event === "SIGNED_IN" && session?.user && !useStore.getState().ready) {
        hydrate(session.user.id, session.user.email);
      }
    });

    return () => { cancelled = true; sub.subscription.unsubscribe(); };
  }, [hydrate, reset, router]);

  // ---- accent + theme follow the profile once it loads ----
  React.useEffect(() => {
    if (!profile) return;
    const appearance = readAppearance(profile.prefs, {
      theme: profile.theme, accent: profile.accent,
    });
    applyAppearance(appearance);
    // Mirrored for the pre-paint script in layout.tsx, which cannot read
    // Supabase — this is what stops the app flashing the wrong theme, font
    // or size on the next load.
    cacheForBoot(appearance);

    // "System" has to keep meaning system. Without this the app would only
    // notice the OS flipping to dark on the next reload.
    if (appearance.theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => applyAppearance(appearance);
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, [profile]);

  // ---- global keys ----
  useHotkeys(
    {
      "mod+k": () => setCommandOpen(true),

      // ⌘Z belongs to the field while you are typing in one — a text box has
      // its own undo and stealing it would lose the sentence you are writing.
      // useHotkeys drops "shift" from a single-character combo, so mod+shift+z
      // arrives here as mod+z — the shift is read off the event instead.
      "mod+z": (e) => {
        if (isTextField(e.target)) return;
        e.preventDefault();
        if (e.shiftKey) useStore.getState().redo();
        else useStore.getState().undo();
      },
      "mod+y": (e) => {
        if (isTextField(e.target)) return;
        e.preventDefault();
        useStore.getState().redo();
      },
      "mod+/": () => setCommandOpen(true),
      "mod+\\": () => toggleSidebar(),
      n: () => openQuickAdd(),
      c: () => openQuickAdd(),
      t: () => setSelectedDate(todayISO()),
      "shift+arrowleft": () => setSelectedDate(addDays(selectedDate, -1)),
      "shift+arrowright": () => setSelectedDate(addDays(selectedDate, 1)),
      "g then t": () => router.push("/"),
      "g then c": () => router.push("/calendar"),
      "g then i": () => router.push("/inbox"),
      "g then p": () => router.push("/projects"),
      "g then b": () => router.push("/books"),
      "g then w": () => router.push("/watch"),
      "g then y": () => router.push("/youtube"),
      "g then n": () => router.push("/notes"),
      "g then h": () => router.push("/habits"),
      "g then s": () => router.push("/salah"),
      "g then f": () => router.push("/focus"),
      "g then g": () => router.push("/goals"),
      "g then r": () => router.push("/review"),
      "g then a": () => router.push("/stats"),
    },
    { allowInInput: false },
  );

  if (!ready) {
    return (
      <div className="grid h-dvh-app place-items-center bg-canvas">
        <div className="flex flex-col items-center gap-3">
          <div className="grid size-10 place-items-center rounded-xl bg-ink text-canvas">
            <span className="display-serif text-[22px] leading-none">H</span>
          </div>
          <Spinner />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-dvh-app overflow-hidden bg-canvas">
      <Sidebar />
      {/* data-app-main is what a maximised Sheet measures itself against, so
          it stops at the sidebar instead of covering it. */}
      <main data-app-main className="flex min-w-0 flex-1 flex-col">
        <OfflineBar />
        {children}
      </main>
      <CommandPalette />
      <QuickAdd />
      <TaskInspector />
      <TimerBar />
    </div>
  );
}
