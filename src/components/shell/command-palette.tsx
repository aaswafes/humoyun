"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Search, CalendarDays, Sun, Inbox, Network, BookOpen, Flame, Moon,
  Target, Timer, BarChart3, ClipboardCheck, LayoutTemplate, Settings,
  Plus, CornerDownLeft, CheckSquare, Circle, ArrowRight, Play, SunMedium, MoonStar, Clapperboard,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import { friendlyDate, todayISO } from "@/lib/date";
import { Modal } from "@/components/ui/overlays";
import { Kbd } from "@/components/ui/primitives";

interface Command {
  id: string;
  label: string;
  hint?: string;
  group: string;
  icon: React.ComponentType<{ className?: string }>;
  run: () => void;
  keywords?: string;
}

export function CommandPalette() {
  const router = useRouter();
  const commandOpen = useStore((s) => s.commandOpen);
  const setCommandOpen = useStore((s) => s.setCommandOpen);
  const tasks = useStore((s) => s.tasks);
  const books = useStore((s) => s.books);
  const habits = useStore((s) => s.habits);
  const goals = useStore((s) => s.goals);
  const nodes = useStore((s) => s.nodes);
  const templates = useStore((s) => s.templates);
  const toggleTask = useStore((s) => s.toggleTask);
  const openInspector = useStore((s) => s.openInspector);
  const setSelectedDate = useStore((s) => s.setSelectedDate);
  const setTheme = useStore((s) => s.setTheme);
  const startTimer = useStore((s) => s.startTimer);
  const applyTemplate = useStore((s) => s.applyTemplate);
  const toast = useStore((s) => s.toast);

  const [query, setQuery] = React.useState("");
  const [cursor, setCursor] = React.useState(0);
  const listRef = React.useRef<HTMLDivElement>(null);

  const close = React.useCallback(() => {
    setCommandOpen(false);
    setQuery("");
    setCursor(0);
  }, [setCommandOpen]);

  const go = React.useCallback((href: string) => { router.push(href); close(); }, [router, close]);

  const commands = React.useMemo<Command[]>(() => {
    const nav: Command[] = [
      { id: "n-today", label: "Today", group: "Go to", icon: Sun, run: () => go("/") },
      { id: "n-cal", label: "Calendar", group: "Go to", icon: CalendarDays, run: () => go("/calendar") },
      { id: "n-inbox", label: "Inbox", group: "Go to", icon: Inbox, run: () => go("/inbox") },
      { id: "n-map", label: "Mind Map", group: "Go to", icon: Network, run: () => go("/map") },
      { id: "n-books", label: "Books", group: "Go to", icon: BookOpen, run: () => go("/books") },
      { id: "n-watch", label: "Films & Anime", group: "Go to", icon: Clapperboard, run: () => go("/watch") },
      { id: "n-habits", label: "Habits", group: "Go to", icon: Flame, run: () => go("/habits") },
      { id: "n-salah", label: "Salah", group: "Go to", icon: Moon, run: () => go("/salah") },
      { id: "n-goals", label: "Goals", group: "Go to", icon: Target, run: () => go("/goals") },
      { id: "n-focus", label: "Focus", group: "Go to", icon: Timer, run: () => go("/focus") },
      { id: "n-stats", label: "Stats", group: "Go to", icon: BarChart3, run: () => go("/stats") },
      { id: "n-review", label: "Weekly Review", group: "Go to", icon: ClipboardCheck, run: () => go("/review") },
      { id: "n-templates", label: "Templates", group: "Go to", icon: LayoutTemplate, run: () => go("/templates") },
      { id: "n-settings", label: "Settings", group: "Go to", icon: Settings, run: () => go("/settings") },
    ];

    const actions: Command[] = [
      {
        id: "a-new", label: "New task", hint: "N", group: "Actions", icon: Plus,
        run: () => { close(); window.dispatchEvent(new CustomEvent("humoyun:quick-add")); },
      },
      {
        id: "a-today", label: "Jump to today", group: "Actions", icon: Sun,
        run: () => { setSelectedDate(todayISO()); go("/calendar"); },
      },
      {
        id: "a-focus", label: "Start a focus session", group: "Actions", icon: Play,
        run: () => { startTimer({ label: "Focus", mode: "pomodoro" }); close(); },
      },
      {
        id: "a-light", label: "Switch to light theme", group: "Actions", icon: SunMedium,
        run: () => { setTheme("light"); close(); },
      },
      {
        id: "a-dark", label: "Switch to dark theme", group: "Actions", icon: MoonStar,
        run: () => { setTheme("dark"); close(); },
      },
    ];

    const taskResults: Command[] = tasks
      .filter((t) => t.status !== "dropped")
      .slice(0, 400)
      .map((t) => ({
        id: `t-${t.id}`,
        label: t.title || "Untitled",
        hint: t.date ? friendlyDate(t.date) : "Inbox",
        group: "Tasks",
        icon: t.status === "done" ? CheckSquare : Circle,
        keywords: t.tags.join(" "),
        run: () => { if (t.date) setSelectedDate(t.date); openInspector(t.id); close(); },
      }));

    const bookResults: Command[] = books.map((b) => ({
      id: `b-${b.id}`, label: b.title, hint: b.author ?? "Book", group: "Books",
      icon: BookOpen, run: () => go("/books"),
    }));

    const habitResults: Command[] = habits.filter((h) => !h.archived).map((h) => ({
      id: `h-${h.id}`, label: h.name, hint: "Habit", group: "Habits",
      icon: Flame, run: () => go("/habits"),
    }));

    const goalResults: Command[] = goals.map((g) => ({
      id: `g-${g.id}`, label: g.title, hint: g.horizon, group: "Goals",
      icon: Target, run: () => go("/goals"),
    }));

    const nodeResults: Command[] = nodes.map((n) => ({
      id: `nd-${n.id}`, label: n.title, hint: n.date ?? "Note", group: "Mind Map",
      icon: Network, run: () => go("/map"),
    }));

    const templateResults: Command[] = templates.map((t) => ({
      id: `tp-${t.id}`,
      label: `Apply “${t.name}” to today`,
      hint: `${t.items.length} items`,
      group: "Templates",
      icon: LayoutTemplate,
      run: () => {
        const n = applyTemplate(t.id, todayISO());
        toast({ title: `Applied ${t.name}`, description: `${n} items added to today.`, tone: "success" });
        close();
      },
    }));

    return [...actions, ...nav, ...taskResults, ...bookResults, ...habitResults, ...goalResults, ...nodeResults, ...templateResults];
  }, [tasks, books, habits, goals, nodes, templates, go, close, openInspector, setSelectedDate, setTheme, startTimer, applyTemplate, toast]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return commands.filter((c) => c.group === "Actions" || c.group === "Go to").slice(0, 14);
    }
    const scored = commands
      .map((c) => {
        const label = c.label.toLowerCase();
        const kw = (c.keywords ?? "").toLowerCase();
        let score = -1;
        if (label.startsWith(q)) score = 100;
        else if (label.includes(q)) score = 60;
        else if (kw.includes(q)) score = 40;
        else if (q.split(" ").every((w) => label.includes(w))) score = 25;
        return { c, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 40);
    return scored.map((x) => x.c);
  }, [commands, query]);

  React.useEffect(() => { setCursor(0); }, [query]);

  React.useEffect(() => {
    if (!commandOpen) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${cursor}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [cursor, commandOpen]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(c + 1, filtered.length - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
    if (e.key === "Enter") { e.preventDefault(); filtered[cursor]?.run(); }
  }

  // group headers as we render
  let lastGroup = "";

  return (
    <Modal open={commandOpen} onClose={close} width={560} className="!rounded-2xl">
      <div className="flex items-center gap-2.5 border-b border-line px-4">
        <Search className="size-4 shrink-0 text-ink-3" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Search tasks, books, habits — or run a command"
          className="h-12 flex-1 bg-transparent text-[14.5px] text-ink outline-none placeholder:text-ink-4"
        />
        <Kbd>esc</Kbd>
      </div>

      <div ref={listRef} className="max-h-[52vh] overflow-y-auto p-1.5">
        {filtered.length === 0 && (
          <p className="px-3 py-8 text-center text-[13px] text-ink-3">No matches for “{query}”.</p>
        )}
        {filtered.map((c, i) => {
          const showGroup = c.group !== lastGroup;
          lastGroup = c.group;
          const Icon = c.icon;
          const active = i === cursor;
          return (
            <React.Fragment key={c.id}>
              {showGroup && (
                <p className="px-2.5 pb-1 pt-2 text-[10.5px] font-semibold uppercase tracking-wide text-ink-4">
                  {c.group}
                </p>
              )}
              <button
                data-index={i}
                onMouseMove={() => setCursor(i)}
                onClick={() => c.run()}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-left cursor-pointer transition-colors",
                  active ? "bg-accent-soft" : "hover:bg-hover",
                )}
              >
                <Icon className={cn("size-4 shrink-0", active ? "text-accent" : "text-ink-3")} />
                <span className={cn("flex-1 truncate text-[13.5px]", active ? "text-ink" : "text-ink-2")}>
                  {c.label}
                </span>
                {c.hint && <span className="shrink-0 text-[11.5px] text-ink-4">{c.hint}</span>}
                {active && <CornerDownLeft className="size-3.5 shrink-0 text-ink-4" />}
              </button>
            </React.Fragment>
          );
        })}
      </div>

      <div className="flex items-center gap-3 border-t border-line px-3.5 py-2 text-[11px] text-ink-4">
        <span className="flex items-center gap-1"><Kbd>↑</Kbd><Kbd>↓</Kbd> navigate</span>
        <span className="flex items-center gap-1"><Kbd>↵</Kbd> open</span>
        <span className="ml-auto flex items-center gap-1">
          <ArrowRight className="size-3" /> {filtered.length} results
        </span>
      </div>
    </Modal>
  );
}
