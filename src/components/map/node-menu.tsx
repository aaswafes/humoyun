"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft, CalendarDays, CalendarOff, CheckSquare, Circle, Copy, Diamond,
  Flag, FolderKanban, HelpCircle, Lightbulb, Palette, Pill, Shapes,
  Square, StickyNote, Target, Trash2, Type,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import { formatDate, todayISO } from "@/lib/date";
import type { MapNode, Tint } from "@/lib/types";
import { MenuItem, MenuLabel, MenuSeparator, TintPicker, useMounted } from "@/components/ui/overlays";
import { MiniCalendar } from "@/components/ui/mini-calendar";

export type MenuPage = "main" | "date" | "colour" | "shape" | "kind";

export interface NodeMenuState {
  ids: string[];
  x: number;
  y: number;
  page: MenuPage;
}

export const KIND_META: Record<MapNode["kind"], { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  note: { label: "Note", icon: StickyNote },
  idea: { label: "Idea", icon: Lightbulb },
  question: { label: "Question", icon: HelpCircle },
  project: { label: "Project", icon: FolderKanban },
  milestone: { label: "Milestone", icon: Flag },
  goal: { label: "Goal", icon: Target },
};

const SHAPES: { value: MapNode["shape"]; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: "card", label: "Card", icon: Square },
  { value: "sticky", label: "Sticky", icon: StickyNote },
  { value: "pill", label: "Pill", icon: Pill },
  { value: "diamond", label: "Diamond", icon: Diamond },
  { value: "circle", label: "Circle", icon: Circle },
];

const PANEL =
  "fixed z-[80] w-[228px] rounded-xl border border-line bg-raised p-1 shadow-lg anim-pop";

export function NodeMenu({
  state, onClose, onPage,
}: {
  state: NodeMenuState;
  onClose: () => void;
  onPage: (page: MenuPage) => void;
}) {
  const mounted = useMounted();
  const nodes = useStore((s) => s.nodes);
  const patch = useStore((s) => s.patch);
  const insert = useStore((s) => s.insert);
  const remove = useStore((s) => s.remove);
  const removeWhere = useStore((s) => s.removeWhere);
  const addTask = useStore((s) => s.addTask);
  const openInspector = useStore((s) => s.openInspector);
  const toast = useStore((s) => s.toast);
  const weekStart = useStore((s) => s.profile?.week_start ?? 1);

  const panelRef = React.useRef<HTMLDivElement>(null);
  const [pos, setPos] = React.useState<{ top: number; left: number } | null>(null);

  const selected = React.useMemo(
    () => state.ids.map((id) => nodes.find((n) => n.id === id)).filter(Boolean) as MapNode[],
    [state.ids, nodes],
  );
  const primary = selected[0];
  const many = selected.length > 1;

  React.useLayoutEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const left = Math.max(8, Math.min(state.x, window.innerWidth - r.width - 8));
    const top = Math.max(8, Math.min(state.y, window.innerHeight - r.height - 8));
    setPos({ top, left });
  }, [state.x, state.y, state.page, selected.length]);

  React.useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (panelRef.current?.contains(e.target as Node)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onClose();
    };
    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDown, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [onClose]);

  if (!mounted || !primary) return null;

  const applyAll = (changes: Partial<MapNode>) => selected.forEach((n) => patch("nodes", n.id, changes));

  function setDate(iso: string | null) {
    applyAll({ date: iso });
    onClose();
  }

  function createTasks() {
    let last = "";
    selected.forEach((n) => {
      const task = addTask({
        title: n.title || "Untitled",
        notes: n.body,
        date: n.date,
        node_id: n.id,
        color: n.color,
        kind: n.kind === "milestone" ? "milestone" : "task",
      });
      last = task.id;
    });
    onClose();
    toast({
      title: many ? `${selected.length} tasks created` : "Task created",
      description: primary.date ? formatDate(primary.date) : "In your inbox",
      tone: "success",
      action: many ? undefined : { label: "Open", run: () => openInspector(last) },
    });
  }

  function duplicate() {
    selected.forEach((n) => {
      const { id: _id, created_at: _c, updated_at: _u, ...rest } = n;
      void _id; void _c; void _u;
      insert("nodes", { ...rest, x: n.x + 36, y: n.y + 36 });
    });
    onClose();
  }

  function destroy() {
    const ids = new Set(selected.map((n) => n.id));
    removeWhere("edges", (e) => ids.has(e.source_id) || ids.has(e.target_id));
    selected.forEach((n) => remove("nodes", n.id));
    onClose();
    toast({ title: many ? `${selected.length} nodes deleted` : "Node deleted" });
  }

  const Icon = KIND_META[primary.kind].icon;

  return createPortal(
    <div
      ref={panelRef}
      role="menu"
      className={cn(PANEL, `tint-${primary.color}`)}
      style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, visibility: pos ? "visible" : "hidden" }}
    >
      {state.page === "main" && (
        <>
          <div className="flex items-center gap-2 px-2 pb-1.5 pt-1">
            <Icon className="size-3.5 shrink-0 text-[var(--tint)]" />
            <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-ink-2">
              {many ? `${selected.length} nodes selected` : primary.title || "Untitled"}
            </span>
          </div>
          <MenuSeparator />
          <MenuItem icon={CalendarDays} onClick={() => onPage("date")}>
            {primary.date && !many ? formatDate(primary.date, { year: true }) : "Anchor to a date"}
          </MenuItem>
          {selected.some((n) => n.date) && (
            <MenuItem icon={CalendarOff} onClick={() => setDate(null)}>Clear date</MenuItem>
          )}
          <MenuItem icon={Palette} onClick={() => onPage("colour")}>Colour</MenuItem>
          <MenuItem icon={Shapes} onClick={() => onPage("shape")}>Shape</MenuItem>
          <MenuItem icon={Type} onClick={() => onPage("kind")}>Type</MenuItem>
          <MenuSeparator />
          <MenuItem icon={CheckSquare} onClick={createTasks}>
            {many ? "Create tasks from nodes" : "Create task from node"}
          </MenuItem>
          <MenuItem icon={Copy} onClick={duplicate}>Duplicate</MenuItem>
          <MenuSeparator />
          <MenuItem icon={Trash2} danger onClick={destroy}>
            {many ? `Delete ${selected.length} nodes` : "Delete node"}
          </MenuItem>
        </>
      )}

      {state.page !== "main" && (
        <button
          onClick={() => onPage("main")}
          className="mb-0.5 flex w-full items-center gap-2 rounded-md px-2 py-[6px] text-[13px] text-ink cursor-pointer hover:bg-hover transition-colors"
        >
          <ArrowLeft className="size-4 text-ink-3" />
          Back
        </button>
      )}

      {state.page === "date" && (
        <div className="px-1 pb-1">
          <MiniCalendar
            value={primary.date ?? todayISO()}
            weekStart={weekStart}
            onChange={(iso) => setDate(iso)}
          />
          <div className="mt-1.5 flex gap-1">
            <button
              onClick={() => setDate(todayISO())}
              className="h-7 flex-1 rounded-md bg-hover text-[12.5px] font-medium text-ink cursor-pointer hover:bg-active transition-colors"
            >
              Today
            </button>
            <button
              onClick={() => setDate(null)}
              className="h-7 flex-1 rounded-md bg-hover text-[12.5px] font-medium text-ink-2 cursor-pointer hover:bg-active transition-colors"
            >
              No date
            </button>
          </div>
        </div>
      )}

      {state.page === "colour" && (
        <>
          <MenuLabel>Colour</MenuLabel>
          <TintPicker value={primary.color} onChange={(t) => applyAll({ color: (t ?? "slate") as Tint })} />
        </>
      )}

      {state.page === "shape" && (
        <>
          <MenuLabel>Shape</MenuLabel>
          {SHAPES.map((s) => (
            <MenuItem
              key={s.value}
              icon={s.icon}
              checked={selected.every((n) => n.shape === s.value)}
              onClick={() => { applyAll({ shape: s.value }); onClose(); }}
            >
              {s.label}
            </MenuItem>
          ))}
        </>
      )}

      {state.page === "kind" && (
        <>
          <MenuLabel>Type</MenuLabel>
          {(Object.keys(KIND_META) as MapNode["kind"][]).map((k) => (
            <MenuItem
              key={k}
              icon={KIND_META[k].icon}
              checked={selected.every((n) => n.kind === k)}
              onClick={() => { applyAll({ kind: k }); onClose(); }}
            >
              {KIND_META[k].label}
            </MenuItem>
          ))}
        </>
      )}
    </div>,
    document.body,
  );
}
