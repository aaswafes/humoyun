"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  BookOpen, Boxes, Clapperboard, CheckSquare,
  Pin, PinOff, Target,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import { useRecents, togglePin, type Ref, type RecentKind } from "@/lib/recents";

// =========================================================
// Pinned and Recent, at the top of the sidebar.
//
// Labels are never stored — they are resolved from the store here, so a
// renamed book is renamed in this list too, and anything deleted simply
// drops out instead of lingering as a dead entry.
//
// Pinning happens from this list and nowhere else. That keeps the feature to
// one place a person has to learn, rather than a star hidden on nine
// different sheets.
// =========================================================

const ICON: Record<RecentKind, React.ComponentType<{ className?: string }>> = {
  task: CheckSquare,
  book: BookOpen,
  media: Clapperboard,
  project: Boxes,
  goal: Target,
};

interface Resolved extends Ref {
  label: string;
  /** where it lives, or null when it opens an overlay instead */
  href: string | null;
}

function useResolver() {
  const tasks = useStore((s) => s.tasks);
  const books = useStore((s) => s.books);
  const media = useStore((s) => s.media);
  const projects = useStore((s) => s.projects);
  const goals = useStore((s) => s.goals);

  return React.useCallback((ref: Ref): Resolved | null => {
    switch (ref.kind) {
      case "task": {
        const t = tasks.find((x) => x.id === ref.id);
        return t ? { ...ref, label: t.title || "Untitled task", href: null } : null;
      }
      case "book": {
        const b = books.find((x) => x.id === ref.id);
        return b ? { ...ref, label: b.title, href: "/consumption/books" } : null;
      }
      case "media": {
        const m = media.find((x) => x.id === ref.id);
        if (!m) return null;
        const yt = m.kind === "youtube" || m.kind === "playlist";
        return { ...ref, label: m.title, href: yt ? "/consumption/youtube" : "/consumption/films" };
      }
      case "project": {
        const p = projects.find((x) => x.id === ref.id);
        return p ? { ...ref, label: p.name || "Untitled project", href: "/projects" } : null;
      }
      case "goal": {
        const g = goals.find((x) => x.id === ref.id);
        return g ? { ...ref, label: g.title || "Untitled goal", href: "/goals" } : null;
      }
      default:
        return null;
    }
  }, [tasks, books, media, projects, goals]);
}

function RefRow({ item, pinned }: { item: Resolved; pinned: boolean }) {
  const router = useRouter();
  const openInspector = useStore((s) => s.openInspector);
  const Icon = ICON[item.kind];

  function open() {
    if (item.href) router.push(item.href);
    else openInspector(item.id);   // a task has no page; it opens in place
  }

  return (
    <li className="group/r relative">
      <button
        type="button"
        onClick={open}
        className={cn(
          "flex h-[30px] w-full items-center gap-2 rounded-md pl-2 pr-7 text-left",
          "text-[13.5px] text-ink-2 cursor-pointer transition-colors duration-120",
          "hover:bg-hover hover:text-ink",
        )}
      >
        <Icon className="size-4 shrink-0 text-ink-3" />
        <span className="min-w-0 flex-1 truncate">{item.label}</span>
      </button>

      <button
        type="button"
        aria-label={pinned ? `Unpin ${item.label}` : `Pin ${item.label}`}
        title={pinned ? "Unpin" : "Pin to the sidebar"}
        onClick={() => togglePin(item.kind, item.id)}
        className={cn(
          "absolute right-1 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded",
          "text-ink-4 cursor-pointer transition-[opacity,color] duration-120",
          "hover:bg-active hover:text-ink focus-visible:opacity-100",
          pinned ? "opacity-100" : "opacity-0 group-hover/r:opacity-100",
        )}
      >
        {pinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
      </button>
    </li>
  );
}

function Group({ label, items, pinned }: { label: string; items: Resolved[]; pinned: boolean }) {
  if (!items.length) return null;
  return (
    <div className="mb-4">
      <div className="px-2 pb-1 pt-0.5">
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.07em] text-ink-4">
          {label}
        </span>
      </div>
      <ul className="space-y-px">
        {items.map((item) => (
          <RefRow key={`${item.kind}:${item.id}`} item={item} pinned={pinned} />
        ))}
      </ul>
    </div>
  );
}

export function SidebarRecents({ max = 5 }: { max?: number }) {
  const { recent, pinned } = useRecents();
  const resolve = useResolver();

  const pinnedRows = React.useMemo(
    () => pinned.map(resolve).filter((x): x is Resolved => x !== null),
    [pinned, resolve],
  );

  const recentRows = React.useMemo(() => {
    const isPinned = new Set(pinned.map((r) => `${r.kind}:${r.id}`));
    return recent
      // Something already pinned is one click away above; repeating it here
      // would spend two rows on one thing.
      .filter((r) => !isPinned.has(`${r.kind}:${r.id}`))
      .map(resolve)
      .filter((x): x is Resolved => x !== null)
      .slice(0, max);
  }, [recent, pinned, resolve, max]);

  if (!pinnedRows.length && !recentRows.length) return null;

  return (
    <>
      <Group label="Pinned" items={pinnedRows} pinned />
      <Group label="Recent" items={recentRows} pinned={false} />
    </>
  );
}
