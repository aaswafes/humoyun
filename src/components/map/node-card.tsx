"use client";

import * as React from "react";
import { CalendarDays, ListPlus, MoreHorizontal, Target } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/date";
import type { MapNode, Tint } from "@/lib/types";
import type { Pos, Side, Size } from "./geometry";
import { KIND_META, type MenuPage } from "./node-menu";
import { BodyView, checklistStats, parseBody } from "./markdown";

export interface NodeApi {
  pointerDown: (e: React.PointerEvent<HTMLElement>, id: string) => void;
  contextMenu: (e: React.MouseEvent<HTMLElement>, id: string) => void;
  openMenu: (e: React.MouseEvent<HTMLElement>, id: string, page?: MenuPage) => void;
  startLink: (e: React.PointerEvent<HTMLElement>, id: string, side: Side) => void;
  /** keyboard focus lands on a node — select it so the canvas keys apply */
  focusNode: (id: string) => void;
  edit: (id: string, field: "title" | "body") => void;
  commit: (id: string, field: "title" | "body", value: string) => void;
  cancelEdit: () => void;
  /** flip one checklist line inside the body */
  toggleCheck: (id: string, line: number) => void;
  /** append "- [ ] " and drop straight into the body editor */
  addCheck: (id: string) => void;
  startResize: (e: React.PointerEvent<HTMLElement>, id: string) => void;
  /** the keyboard half of resizing, also bound to Alt+Arrow on the canvas */
  resizeBy: (id: string, dw: number, dh: number) => void;
}

const HANDLES: { side: Side; className: string; label: string }[] = [
  { side: "t", className: "left-1/2 top-0 -translate-x-1/2 -translate-y-1/2", label: "top" },
  { side: "r", className: "right-0 top-1/2 translate-x-1/2 -translate-y-1/2", label: "right" },
  { side: "b", className: "bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2", label: "bottom" },
  { side: "l", className: "left-0 top-1/2 -translate-x-1/2 -translate-y-1/2", label: "left" },
];

function Frame({ shape }: { shape: MapNode["shape"] }) {
  switch (shape) {
    case "sticky":
      return <div className="absolute inset-0 rounded-md bg-[var(--tint-soft)]" />;
    case "pill":
    case "circle":
      return (
        <div
          className="absolute inset-0 rounded-full border-[1.5px] bg-raised shadow-[var(--shadow-sm)]"
          style={{ borderColor: "var(--tint)" }}
        />
      );
    case "diamond":
      return (
        <div
          className="absolute inset-0 rotate-45 scale-[0.7071] rounded-[12px] border-[1.5px] bg-raised shadow-[var(--shadow-sm)]"
          style={{ borderColor: "var(--tint)" }}
        />
      );
    default:
      return (
        <>
          <div className="absolute inset-0 rounded-lg bg-raised shadow-[var(--shadow-sm)]" />
          <div
            className="absolute inset-y-0 left-0 w-[3px] rounded-l-lg"
            style={{ background: "var(--tint)" }}
          />
        </>
      );
  }
}

function EditField({
  value, multiline, onCommit, onCancel, className, placeholder,
}: {
  value: string;
  multiline?: boolean;
  onCommit: (next: string) => void;
  onCancel: () => void;
  className?: string;
  placeholder?: string;
}) {
  const ref = React.useRef<HTMLTextAreaElement>(null);
  const cancelled = React.useRef(false);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  return (
    <textarea
      ref={ref}
      defaultValue={value}
      spellCheck={false}
      placeholder={placeholder}
      aria-label={multiline ? "Node body" : "Node title"}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onBlur={(e) => { if (!cancelled.current) onCommit(e.target.value); }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") { cancelled.current = true; onCancel(); }
        if (e.key === "Enter" && (!multiline || e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          onCommit(e.currentTarget.value);
        }
      }}
      // The node frame carries a 2px accent ring for the whole time this field is
      // mounted, so the focus state is stated on the card rather than doubled here.
      className={cn(
        "w-full resize-none border-0 bg-transparent p-0 outline-none placeholder:text-ink-4",
        className,
      )}
      rows={multiline ? 4 : 1}
    />
  );
}

function DateChip({
  node, api, compact,
}: {
  node: MapNode;
  api: NodeApi;
  compact?: boolean;
}) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); api.openMenu(e, node.id, "date"); }}
      onPointerDown={(e) => e.stopPropagation()}
      aria-label={`Date: ${formatDate(node.date as string, { year: true })}. Change it`}
      className={cn(
        "-m-1 inline-flex shrink-0 items-center gap-1 rounded-[7px] p-1",
        "cursor-pointer transition-transform active:scale-[0.94]",
      )}
    >
      <span
        className={cn(
          "inline-flex h-[18px] items-center gap-1 rounded-[5px] bg-[var(--tint-soft)] px-1.5",
          "text-[10.5px] font-medium leading-none text-[var(--tint-ink)] tnum",
        )}
      >
        {!compact && <CalendarDays className="size-2.5" aria-hidden />}
        {formatDate(node.date as string, { weekday: false })}
      </span>
    </button>
  );
}

export interface NodeCardProps {
  node: MapNode;
  pos: Pos;
  size: Size;
  selected: boolean;
  editing: "title" | "body" | null;
  api: NodeApi;
  register: (id: string, el: HTMLElement | null) => void;
  /** colour-by override — the node's own tint unless the board is grouped */
  tint?: Tint;
  /** search or a legend filter is on and this node is not a match */
  dimmed?: boolean;
  /** timeline mode packs the body away and locks the size */
  compact?: boolean;
  /** the goal this node serves, when the board is grouped by goal */
  goalLabel?: string | null;
}

function NodeCardImpl({
  node, pos, size, selected, editing, api, register, tint, dimmed, compact, goalLabel,
}: NodeCardProps) {
  const round = node.shape === "circle" || node.shape === "diamond";
  const pill = node.shape === "pill";
  const Kind = KIND_META[node.kind].icon;
  const colour = tint ?? node.color;

  const blocks = React.useMemo(() => parseBody(node.body), [node.body]);
  const checks = React.useMemo(() => checklistStats(blocks), [blocks]);
  const showBody = !round && !pill && !compact;

  const label = [
    KIND_META[node.kind].label,
    ": ",
    node.title || "Untitled",
    node.date ? `, ${formatDate(node.date, { year: true })}` : "",
    checks.total ? `, ${checks.done} of ${checks.total} done` : "",
    selected ? ", selected" : "",
  ].join("");

  return (
    // A node holds a date chip, a checklist, an options button and four link
    // handles. That makes it a container of controls, not a control — so it is a
    // focusable group and every real action inside it is its own button.
    <div
      ref={(el) => { register(node.id, el); }}
      data-node-id={node.id}
      role="group"
      tabIndex={0}
      aria-label={label}
      onPointerDown={(e) => api.pointerDown(e, node.id)}
      onFocus={() => api.focusNode(node.id)}
      onContextMenu={(e) => api.contextMenu(e, node.id)}
      onDoubleClick={(e) => { e.stopPropagation(); api.edit(node.id, "title"); }}
      className={cn(
        "group/node absolute left-0 top-0 touch-none select-none",
        `tint-${colour}`,
        editing ? "cursor-text" : "cursor-grab active:cursor-grabbing",
        "transition-opacity duration-200 ease-[var(--ease-out-apple)]",
        dimmed && !selected && "opacity-[0.22]",
      )}
      style={{ transform: `translate(${pos.x}px, ${pos.y}px)`, width: size.w, height: size.h }}
    >
      <Frame shape={node.shape} />

      {/* selection + link-target rings live above the frame so shapes stay crisp */}
      <div
        className={cn(
          "pointer-events-none absolute inset-0 ring-accent transition-opacity duration-150",
          round || pill ? "rounded-full" : node.shape === "card" ? "rounded-lg" : "rounded-md",
          node.shape === "diamond" && "rotate-45 scale-[0.7071] rounded-[12px]",
          selected || editing ? "opacity-100 ring-2" : "opacity-0",
          // set imperatively while a link is being dragged onto this node
          "group-data-[link-target]/node:opacity-100 group-data-[link-target]/node:ring-2",
        )}
      />

      <div
        className={cn(
          "absolute inset-0 flex flex-col overflow-hidden",
          node.shape === "card" && "gap-1 py-2.5 pl-3.5 pr-2.5",
          node.shape === "sticky" && "gap-1 p-3",
          pill && "flex-row items-center justify-center gap-1.5 px-4",
          round && "items-center justify-center gap-1 px-[18%] text-center",
          node.shape === "diamond" && "px-[22%]",
        )}
      >
        {/* the header row only earns its space when it has something to say */}
        {!pill && !round && (node.kind !== "note" || !!node.date || !!goalLabel) && (
          <div className="flex items-center gap-1.5">
            {node.kind !== "note" && (
              <>
                <Kind className="size-3 shrink-0 text-[var(--tint)]" aria-hidden />
                <span className="truncate text-[10.5px] font-semibold uppercase tracking-[0.06em] text-ink-3">
                  {KIND_META[node.kind].label}
                </span>
              </>
            )}
            {goalLabel && node.kind === "note" && (
              <>
                <Target className="size-3 shrink-0 text-[var(--tint)]" aria-hidden />
                <span className="truncate text-[10.5px] font-semibold uppercase tracking-[0.06em] text-ink-3">
                  {goalLabel}
                </span>
              </>
            )}
            <div className="flex-1" />
            {node.date && <DateChip node={node} api={api} />}
          </div>
        )}

        {pill && node.kind !== "note" && <Kind className="size-3.5 shrink-0 text-[var(--tint)]" aria-hidden />}

        {editing === "title" ? (
          <EditField
            value={node.title}
            placeholder="Name this node"
            className={cn("text-[13.5px] font-medium leading-[1.3] text-ink", (round || pill) && "text-center")}
            onCommit={(v) => api.commit(node.id, "title", v)}
            onCancel={api.cancelEdit}
          />
        ) : (
          <div
            className={cn(
              "text-[13.5px] font-medium leading-[1.3] text-ink",
              round || pill ? "text-center" : "",
              pill || compact ? "truncate" : "line-clamp-3",
            )}
          >
            {node.title || <span className="text-ink-4">Untitled</span>}
          </div>
        )}

        {editing === "body" ? (
          <EditField
            value={node.body ?? ""}
            multiline
            placeholder={"Notes, links, or - [ ] checklist items"}
            className="min-h-0 flex-1 text-[12px] leading-[1.5] text-ink-2"
            onCommit={(v) => api.commit(node.id, "body", v)}
            onCancel={api.cancelEdit}
          />
        ) : showBody && blocks.length ? (
          <div
            onDoubleClick={(e) => { e.stopPropagation(); api.edit(node.id, "body"); }}
            className="min-h-0 flex-1 overflow-hidden"
          >
            <BodyView
              blocks={blocks}
              max={node.shape === "sticky" ? 5 : 6}
              onToggle={(line) => api.toggleCheck(node.id, line)}
            />
          </div>
        ) : null}

        {/* a compact node still admits it has a checklist */}
        {(!showBody || editing === "body") && checks.total > 0 && (
          <span className="shrink-0 text-[10.5px] font-medium text-ink-3 tnum">
            {checks.done}/{checks.total}
          </span>
        )}

        {showBody && selected && editing === null && (
          <div className="flex shrink-0 items-center gap-2">
            {!blocks.length && (
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); api.edit(node.id, "body"); }}
                className="-m-1 w-fit cursor-pointer p-1 text-left text-[12px] text-ink-4 transition-colors hover:text-ink-3"
              >
                Add a note
              </button>
            )}
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); api.addCheck(node.id); }}
              aria-label="Add a checklist item"
              className="-m-1 inline-flex cursor-pointer items-center gap-1 p-1 text-[12px] text-ink-4 transition-colors hover:text-ink-3"
            >
              <ListPlus className="size-3" aria-hidden />
              {checks.total ? "Item" : "Checklist"}
            </button>
            {checks.total > 0 && (
              <span className="ml-auto text-[10.5px] font-medium text-ink-3 tnum">
                {checks.done}/{checks.total}
              </span>
            )}
          </div>
        )}

        {(pill || round) && node.date && <DateChip node={node} api={api} compact />}
      </div>

      {/* options — floats just outside the corner so every shape keeps it.
          Only the selected node puts it in the tab order; on a hundred-node
          board the rest would be a hundred stops that lead nowhere useful. */}
      <button
        aria-label={`Options for ${node.title || "Untitled"}`}
        aria-haspopup="dialog"
        tabIndex={selected ? 0 : -1}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); api.openMenu(e, node.id); }}
        className={cn(
          "absolute -right-2 -top-2 grid size-7 place-items-center rounded-md border border-line bg-raised text-ink-3",
          "opacity-0 shadow-[var(--shadow-sm)] transition-[opacity,transform] duration-150 ease-[var(--ease-out-apple)]",
          "cursor-pointer hover:text-ink focus-visible:opacity-100 group-hover/node:opacity-100 active:scale-[0.92]",
          selected && "opacity-100",
        )}
      >
        <MoreHorizontal className="size-3.5" aria-hidden />
      </button>

      {/* Resize. Pointer-drags the corner; arrow keys do the same job for the
          keyboard, which is why it is a real focus stop and not decoration. */}
      {selected && !compact && (
        <button
          aria-label={`Resize ${node.title || "Untitled"}. Arrow keys resize, Shift for finer steps`}
          onPointerDown={(e) => { e.stopPropagation(); api.startResize(e, node.id); }}
          onKeyDown={(e) => {
            if (!e.key.startsWith("Arrow")) return;
            e.preventDefault();
            e.stopPropagation();
            const step = e.shiftKey ? 4 : 16;
            api.resizeBy(
              node.id,
              e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0,
              e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0,
            );
          }}
          className={cn(
            "absolute -bottom-1.5 -right-1.5 grid size-6 cursor-nwse-resize place-items-center rounded-full",
            "transition-transform duration-150 ease-[var(--ease-out-apple)] hover:scale-110",
          )}
        >
          <span
            className="size-[10px] rounded-[3px] border-[1.5px] border-accent bg-canvas"
            aria-hidden
          />
        </button>
      )}

      {/* Link handles. Pointer-only by nature — the keyboard route to the same
          result is selecting two nodes and pressing L, so they stay out of the
          tab order instead of becoming focus stops that do nothing. */}
      {HANDLES.map((h) => (
        <button
          key={h.side}
          tabIndex={-1}
          aria-hidden
          title={`Drag from here to link (${h.label})`}
          onPointerDown={(e) => api.startLink(e, node.id, h.side)}
          className={cn(
            "group/handle absolute grid size-7 place-items-center rounded-full",
            "cursor-crosshair opacity-0 transition-opacity duration-150 group-hover/node:opacity-100",
            h.className,
          )}
        >
          <span
            className="size-[9px] rounded-full bg-accent transition-transform duration-150 ease-[var(--ease-out-apple)] group-hover/handle:scale-[1.4]"
            style={{ boxShadow: "0 0 0 2px var(--canvas)" }}
          />
        </button>
      ))}
    </div>
  );
}

export const NodeCard = React.memo(NodeCardImpl, (a, b) =>
  a.node === b.node &&
  a.selected === b.selected &&
  a.editing === b.editing &&
  a.pos.x === b.pos.x &&
  a.pos.y === b.pos.y &&
  a.size.w === b.size.w &&
  a.size.h === b.size.h &&
  a.tint === b.tint &&
  a.dimmed === b.dimmed &&
  a.compact === b.compact &&
  a.goalLabel === b.goalLabel,
);
