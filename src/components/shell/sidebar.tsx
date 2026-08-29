"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays, Sun, Inbox, Network, BookOpen, Flame, Moon, Target,
  Timer, BarChart3, ClipboardCheck, LayoutTemplate, Settings, Search,
  Plus, ChevronDown, ChevronRight, LogOut, Monitor, SunMedium, MoonStar, Check,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore, completionOn, inboxTasks, overdueTasks } from "@/lib/store";
import { todayISO, monthName, dayNumber } from "@/lib/date";
import { ACCENTS, type Accent } from "@/lib/types";
import { Popover, MenuItem, MenuSeparator, MenuLabel } from "@/components/ui/overlays";
import { Kbd, Ring } from "@/components/ui/primitives";
import { MiniCalendar } from "@/components/ui/mini-calendar";
import { supabase } from "@/lib/supabase/client";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
}

const CAL_KEY = "humoyun.sidebar.calendar";

export function Sidebar() {
  const pathname = usePathname();
  // Read in an effect, not a useState initialiser — localStorage does not exist
  // during SSR and reading it inline produces a hydration mismatch.
  const [calendarOpen, setCalendarOpen] = React.useState(false);
  React.useEffect(() => {
    try { setCalendarOpen(localStorage.getItem(CAL_KEY) === "1"); } catch { /* private mode */ }
  }, []);
  const {
    profile, email, tasks, sidebarOpen, selectedDate, setSelectedDate,
    setCommandOpen, setTheme, setAccent,
  } = useStore();

  const today = todayISO();
  const inboxCount = inboxTasks(tasks).length;
  const overdueCount = overdueTasks(tasks, today).length;
  const progress = completionOn(tasks, today);

  const taskMarkers = React.useMemo(() => {
    const map = new Map<string, number>();
    tasks.forEach((t) => {
      if (!t.date || t.parent_id || t.status === "done") return;
      map.set(t.date, (map.get(t.date) ?? 0) + 1);
    });
    return map;
  }, [tasks]);

  const groups: { label: string; items: NavItem[] }[] = [
    {
      label: "Plan",
      items: [
        { href: "/", label: "Today", icon: Sun },
        { href: "/calendar", label: "Calendar", icon: CalendarDays },
        { href: "/inbox", label: "Inbox", icon: Inbox, badge: inboxCount },
        { href: "/map", label: "Mind Map", icon: Network },
      ],
    },
    {
      label: "Track",
      items: [
        { href: "/habits", label: "Habits", icon: Flame },
        { href: "/salah", label: "Salah", icon: Moon },
        { href: "/books", label: "Books", icon: BookOpen },
        { href: "/focus", label: "Focus", icon: Timer },
      ],
    },
    {
      label: "Reflect",
      items: [
        { href: "/goals", label: "Goals", icon: Target },
        { href: "/stats", label: "Stats", icon: BarChart3 },
        { href: "/review", label: "Weekly Review", icon: ClipboardCheck },
      ],
    },
  ];

  if (!sidebarOpen) return null;

  return (
    <aside
      className="flex h-dvh w-[var(--sidebar-w)] shrink-0 flex-col bg-sunken hairline-r"
      aria-label="Primary"
    >
      {/* ---- account ---- */}
      <div className="px-2.5 pt-2.5">
        <Popover
          align="start"
          className="w-[248px]"
          trigger={
            <button className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1.5 text-left hover:bg-hover cursor-pointer transition-colors">
              <div className="grid size-6 shrink-0 place-items-center rounded-[7px] bg-ink text-canvas">
                <span className="display-serif text-[13px] leading-none">
                  {(profile?.display_name ?? "H").charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-semibold leading-tight text-ink">
                  {profile?.display_name ?? "Humoyun"}
                </p>
              </div>
              <ChevronDown className="size-3.5 shrink-0 text-ink-4" />
            </button>
          }
        >
          {(close) => (
            <>
              <div className="px-2 pb-1.5 pt-1">
                <p className="truncate text-[12px] text-ink-3">{email}</p>
              </div>
              <MenuSeparator />
              <MenuLabel>Appearance</MenuLabel>
              <div className="flex gap-1 px-1 pb-1">
                {([
                  { v: "light", icon: SunMedium, label: "Light" },
                  { v: "dark", icon: MoonStar, label: "Dark" },
                  { v: "system", icon: Monitor, label: "Auto" },
                ] as const).map(({ v, icon: Icon, label }) => (
                  <button
                    key={v}
                    onClick={() => setTheme(v)}
                    className={cn(
                      "flex flex-1 flex-col items-center gap-1 rounded-md py-2 text-[11px] cursor-pointer transition-colors",
                      profile?.theme === v ? "bg-accent-soft text-accent" : "text-ink-3 hover:bg-hover hover:text-ink",
                    )}
                  >
                    <Icon className="size-4" />
                    {label}
                  </button>
                ))}
              </div>
              <MenuLabel>Accent</MenuLabel>
              <div className="flex gap-1.5 px-2 pb-2">
                {ACCENTS.map((a) => (
                  <button
                    key={a}
                    onClick={() => setAccent(a as Accent)}
                    aria-label={a}
                    title={a}
                    className={cn(
                      "grid size-5 place-items-center rounded-full cursor-pointer transition-transform hover:scale-110",
                      profile?.accent === a && "ring-2 ring-offset-2 ring-offset-[var(--raised)] ring-ink-4",
                    )}
                    style={{ background: ACCENT_SWATCH[a] }}
                  >
                    {profile?.accent === a && <Check className="size-2.5 text-white" strokeWidth={4} />}
                  </button>
                ))}
              </div>
              <MenuSeparator />
              <Link href="/settings" onClick={close}>
                <MenuItem icon={Settings}>Settings</MenuItem>
              </Link>
              <MenuItem
                icon={LogOut}
                danger
                onClick={async () => { await supabase.auth.signOut(); window.location.href = "/login"; }}
              >
                Sign out
              </MenuItem>
            </>
          )}
        </Popover>
      </div>

      {/* ---- search + new ---- */}
      <div className="flex gap-1.5 px-2.5 py-2">
        <button
          onClick={() => setCommandOpen(true)}
          className="flex h-7 flex-1 items-center gap-1.5 rounded-md border border-line bg-raised px-2 text-left text-[12.5px] text-ink-3 hover:border-line-strong cursor-pointer transition-colors"
        >
          <Search className="size-3.5" />
          <span className="flex-1">Search</span>
          <Kbd>⌘K</Kbd>
        </button>
      </div>

      {/* ---- nav ---- */}
      <nav className="min-h-0 flex-1 overflow-y-auto px-2.5 pb-2">
        {groups.map((group, gi) => (
          <div key={group.label} className={cn(gi > 0 && "mt-4")}>
            <p className="px-2 pb-1 text-[10.5px] font-semibold uppercase tracking-[0.07em] text-ink-4">
              {group.label}
            </p>
            <ul className="space-y-px">
              {group.items.map((item) => {
                const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        "group flex h-[30px] items-center gap-2 rounded-md px-2 text-[13.5px] transition-colors duration-120",
                        active
                          ? "bg-active font-medium text-ink"
                          : "text-ink-2 hover:bg-hover hover:text-ink",
                      )}
                    >
                      <Icon className={cn("size-4 shrink-0", active ? "text-ink" : "text-ink-3")} />
                      <span className="flex-1 truncate">{item.label}</span>
                      {item.href === "/" && overdueCount > 0 && (
                        <span className="rounded-full bg-danger-soft px-1.5 text-[10.5px] font-semibold text-danger tnum">
                          {overdueCount}
                        </span>
                      )}
                      {!!item.badge && (
                        <span className="text-[11px] text-ink-4 tnum">{item.badge}</span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}

        <div className="mt-4">
          <p className="px-2 pb-1 text-[10.5px] font-semibold uppercase tracking-[0.07em] text-ink-4">
            Build
          </p>
          <ul className="space-y-px">
            {[
              { href: "/templates", label: "Templates", icon: LayoutTemplate },
              { href: "/settings", label: "Settings", icon: Settings },
            ].map((item) => {
              const active = pathname.startsWith(item.href);
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      "flex h-[30px] items-center gap-2 rounded-md px-2 text-[13.5px] transition-colors duration-120",
                      active ? "bg-active font-medium text-ink" : "text-ink-2 hover:bg-hover hover:text-ink",
                    )}
                  >
                    <Icon className={cn("size-4 shrink-0", active ? "text-ink" : "text-ink-3")} />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </nav>

      {/* ---- mini calendar ---- */}
      {/* Folded by default: at 1080p an always-open month pushed the last two nav
          groups off the bottom, which read as the app hiding half its navigation. */}
      <div className="shrink-0 border-t border-line">
        <button
          type="button"
          aria-expanded={calendarOpen}
          onClick={() => {
            const next = !calendarOpen;
            setCalendarOpen(next);
            try { localStorage.setItem(CAL_KEY, next ? "1" : "0"); } catch { /* private mode */ }
          }}
          className="flex w-full items-center gap-1.5 px-3 py-2 text-left hover:bg-hover cursor-pointer transition-colors"
        >
          <ChevronRight
            className={cn("size-3.5 shrink-0 text-ink-4 transition-transform duration-200", calendarOpen && "rotate-90")}
          />
          <span className="flex-1 text-[12px] font-medium text-ink-2">Calendar</span>
          <span className="text-[11px] text-ink-4">
            {monthName(selectedDate, true)} {dayNumber(selectedDate)}
          </span>
        </button>
        {calendarOpen && (
          <div className="px-3 pb-2.5">
            <MiniCalendar
              value={selectedDate}
              onChange={setSelectedDate}
              weekStart={profile?.week_start ?? 1}
              markers={taskMarkers}
            />
          </div>
        )}
      </div>

      {/* ---- today's progress ---- */}
      {/* The ring is the gauge, the text is the count — the same fact twice was the
          percentage that used to sit inside the ring. */}
      <div className="flex shrink-0 items-center gap-2.5 border-t border-line px-3 py-2.5">
        <Ring value={progress.done} max={Math.max(1, progress.total)} size={26} stroke={2.5} />
        <p className="min-w-0 flex-1 truncate text-[12px] text-ink-3">
          <span className="font-medium text-ink tnum">{progress.done}</span>
          <span className="tnum"> of {progress.total}</span> done today
        </p>
      </div>
    </aside>
  );
}

const ACCENT_SWATCH: Record<string, string> = {
  blue: "#0071e3",
  violet: "#6b4dff",
  emerald: "#00875a",
  amber: "#d99400",
  rose: "#c2255c",
  graphite: "#57575a",
};

/** Floating compose button — always one keystroke or click from a new task. */
export function ComposeButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label="New task"
      className={cn(
        "fixed bottom-5 right-5 z-40 grid size-11 place-items-center rounded-full",
        "bg-accent text-accent-ink shadow-lg cursor-pointer",
        "transition-transform duration-200 ease-[var(--ease-out-apple)] hover:scale-105 active:scale-95",
      )}
    >
      <Plus className="size-5" />
    </button>
  );
}
