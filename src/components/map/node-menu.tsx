"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft, CalendarDays, CalendarOff, CheckSquare, ChevronLeft, ChevronRight, Circle,
  Copy, Diamond, Flag, FolderKanban, HelpCircle, Lightbulb, ListPlus, Maximize,
  Palette, Pill, Rows3, Shapes, Square, StickyNote, Target, Trash2, Type, Unlink,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { uid, useStore } from "@/lib/store";
import { addDays, formatDate, todayISO } from "@/lib/date";
import type { ChecklistItem, Horizon, MapNode, Tint } from "@/lib/types";
import { MenuItem, MenuLabel, MenuSeparator, TintPicker, useMounted } from "@/components/ui/overlays";
import { MiniCalendar } from "@/components/ui/mini-calendar";
import { appendChecklistItem, parseBody } from "./markdown";
import { SIZE_BOUNDS, resizeTo } from "./geometry";
import { getMapPrefs, setNodeLane } from "./prefs";
import { useFocusTrap } from "./focus-trap";

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

/** Horizon a converted goal inherits from what the node claimed to be. */
const HORIZON_FOR: Partial<Record<MapNode["kind"], Horizon>> = {
  milestone: "month",
  project: "quarter",
  goal: "year",
};

const SIZE_STEPS: { label: string; t: number }[] = [
  { label: "S", t: 0 },
  { label: "M", t: 0.4 },
  { label: "L", t: 1 },
];

const PANEL =
  "fixed z-[80] w-[236px] rounded-xl border border-line bg-raised p-1 shadow-lg anim-pop";

export function NodeMenu({
  state, onClose, onPage,
}: {
  state: NodeMenuState;
  onClose: () => void;
  onPage: (page: MenuPage) => void;
}) {
  const mounted = useMounted();
  const nodes = useStore((s) => s.nodes);
  const goals = useStore((s) => s.goals);
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
    document.addEventListener("mousedown", onDown, true);
    return () => document.removeEventListener("mousedown", onDown, true);
  }, [onClose]);

  // Escape, initial focus, containment and restore — the panel is portaled to
  // the end of <body>, so without this the tab order stops following the eye.
  useFocusTrap(panelRef, { active: mounted && !!primary && !!pos, onClose });

  if (!mounted || !primary) return null;

  const applyAll = (changes: Partial<MapNode>) => selected.forEach((n) => patch("nodes", n.id, changes));

  function setDate(iso: string | null) {
    applyAll({ date: iso });
    onClose();
  }

  function shiftDates(days: number) {
    selected.forEach((n) => {
      if (n.date) patch("nodes", n.id, { date: addDays(n.date, days) });
    });
  }

  function createTasks() {
    let last = "";
    selected.forEach((n) => {
      const blocks = parseBody(n.body);
      const checklist: ChecklistItem[] = blocks
        .filter((b) => b.kind === "check")
        .map((b) => ({ id: uid(), text: b.text, done: b.kind === "check" && b.done }));
      const notes = blocks.filter((b) => b.kind !== "check").map((b) => b.text).join("\n");
      const task = addTask({
        title: n.title || "Untitled",
        notes: notes || null,
        checklist,
        date: n.date,
        node_id: n.id,
        goal_id: n.goal_id,
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

  function createGoals() {
    let name = "";
    selected.forEach((n) => {
      const blocks = parseBody(n.body);
      const goal = insert("goals", {
        title: n.title || "Untitled",
        description: blocks.map((b) => b.text).join("\n") || null,
        horizon: HORIZON_FOR[n.kind] ?? "quarter",
        end_date: n.date,
        color: n.color,
      });
      // the node keeps its place on the board and now points at the goal, which
      // is also what makes "colour by goal" light it up
      patch("nodes", n.id, { goal_id: goal.id, kind: "goal" });
      name = goal.title;
    });
    onClose();
    toast({
      title: many ? `${selected.length} goals created` : `“${name}” is a goal now`,
      description: "Colour the board by goal to see what serves it.",
      tone: "success",
    });
  }

  function addChecklistItem() {
    selected.forEach((n) => patch("nodes", n.id, { body: appendChecklistItem(n.body) }));
    onClose();
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

  function setSize(t: number) {
    selected.forEach((n) => {
      const b = SIZE_BOUNDS[n.shape] ?? SIZE_BOUNDS.card;
      patch("nodes", n.id, resizeTo(
        n.shape,
        b.min.w + (b.max.w - b.min.w) * t * 0.55,
        b.min.h + (b.max.h - b.min.h) * t * 0.45,
      ));
    });
  }

  const Icon = KIND_META[primary.kind].icon;
  const goal = primary.goal_id ? goals.find((g) => g.id === primary.goal_id) : undefined;
  const parked = selected.some((n) => getMapPrefs().lane[n.id] !== undefined);

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label={many ? `${selected.length} nodes` : `Options for ${primary.title || "Untitled"}`}
      className={cn(PANEL, `tint-${primary.color}`)}
      style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, visibility: pos ? "visible" : "hidden" }}
    >
      {state.page === "main" && (
        <>
          <div className="flex items-center gap-2 px-2 pb-1.5 pt-1">
            <Icon className="size-3.5 shrink-0 text-[var(--tint)]" aria-hidden />
            <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-ink-2">
              {many ? `${selected.length} nodes selected` : primary.title || "Untitled"}
            </span>
          </div>
          <MenuSeparator />

          <MenuItem icon={CalendarDays} onClick={() => onPage("date")}>
            {primary.date && !many ? formatDate(primary.date, { year: true }) : "Anchor to a date"}
          </MenuItem>
          {selected.some((n) => n.date) && (
            <div className="flex items-center gap-1 px-1 pb-1">
              <button
                onClick={() => shiftDates(-7)}
                className="flex h-7 flex-1 cursor-pointer items-center justify-center gap-1 rounded-md bg-hover text-[12px] font-medium text-ink-2 transition-colors hover:bg-active"
              >
                <ChevronLeft className="size-3" aria-hidden />
                Week
              </button>
              <button
                onClick={() => shiftDates(-1)}
                aria-label="Move one day earlier"
                className="h-7 w-8 cursor-pointer rounded-md bg-hover text-[12px] font-medium text-ink-2 transition-colors hover:bg-active"
              >
                −1d
              </button>
              <button
                onClick={() => shiftDates(1)}
                aria-label="Move one day later"
                className="h-7 w-8 cursor-pointer rounded-md bg-hover text-[12px] font-medium text-ink-2 transition-colors hover:bg-active"
              >
                +1d
              </button>
              <button
                onClick={() => shiftDates(7)}
                className="flex h-7 flex-1 cursor-pointer items-center justify-center gap-1 rounded-md bg-hover text-[12px] font-medium text-ink-2 transition-colors hover:bg-active"
              >
                Week
                <ChevronRight className="size-3" aria-hidden />
              </button>
            </div>
          )}
          {selected.some((n) => n.date) && (
            <MenuItem icon={CalendarOff} onClick={() => setDate(null)}>Clear date</MenuItem>
          )}
          {parked && (
            <MenuItem
              icon={Rows3}
              onClick={() => { selected.forEach((n) => setNodeLane(n.id, null)); onClose(); }}
            >
              Reset timeline row
            </MenuItem>
          )}

          <MenuSeparator />
          <MenuItem icon={Palette} onClick={() => onPage("colour")}>Colour</MenuItem>
          <MenuItem icon={Shapes} onClick={() => onPage("shape")}>Shape &amp; size</MenuItem>
          <MenuItem icon={Type} onClick={() => onPage("kind")}>Type</MenuItem>

          <MenuSeparator />
          <MenuItem icon={ListPlus} onClick={addChecklistItem}>Add checklist item</MenuItem>
          <MenuItem icon={CheckSquare} onClick={createTasks}>
            {many ? "Convert to tasks" : "Convert to task"}
          </MenuItem>
          <MenuItem icon={Target} onClick={createGoals}>
            {many ? "Convert to goals" : "Convert to goal"}
          </MenuItem>
          {goal && !many && (
            <MenuItem
              icon={Unlink}
              onClick={() => { patch("nodes", primary.id, { goal_id: null }); onClose(); }}
            >
              Unlink “{goal.title}”
            </MenuItem>
          )}
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
          className="mb-0.5 flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-[6px] text-[13px] text-ink transition-colors hover:bg-hover"
        >
          <ArrowLeft className="size-4 text-ink-3" aria-hidden />
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
              className="h-7 flex-1 cursor-pointer rounded-md bg-hover text-[12.5px] font-medium text-ink transition-colors hover:bg-active"
            >
              Today
            </button>
            <button
              onClick={() => setDate(addDays(todayISO(), 7))}
              className="h-7 flex-1 cursor-pointer rounded-md bg-hover text-[12.5px] font-medium text-ink-2 transition-colors hover:bg-active"
            >
              Next week
            </button>
            <button
              onClick={() => setDate(null)}
              className="h-7 flex-1 cursor-pointer rounded-md bg-hover text-[12.5px] font-medium text-ink-2 transition-colors hover:bg-active"
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
              onClick={() => applyAll({ shape: s.value })}
            >
              {s.label}
            </MenuItem>
          ))}
          <MenuSeparator />
          <MenuLabel>Size</MenuLabel>
          <div className="flex items-center gap-1 px-1 pb-1">
            <Maximize className="ml-1 size-3.5 shrink-0 text-ink-3" aria-hidden />
            {SIZE_STEPS.map((s) => (
              <button
                key={s.label}
                onClick={() => setSize(s.t)}
                className="h-7 flex-1 cursor-pointer rounded-md bg-hover text-[12.5px] font-medium text-ink-2 transition-colors hover:bg-active"
              >
                {s.label}
              </button>
            ))}
          </div>
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
