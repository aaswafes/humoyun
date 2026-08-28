"use client";

import * as React from "react";
import { CalendarDays, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/date";
import type { MapNode } from "@/lib/types";
import type { Pos, Side, Size } from "./geometry";
import { KIND_META, type MenuPage } from "./node-menu";

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
      return (
        <div
          className="absolute inset-0 rounded-full border-[1.5px] bg-raised shadow-[var(--shadow-sm)]"
          style={{ borderColor: "var(--tint)" }}
        />
      );
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
  value, multiline, onCommit, onCancel, className,
}: {
  value: string;
  multiline?: boolean;
  onCommit: (next: string) => void;
  onCancel: () => void;
  className?: string;
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
      className={cn(
        "w-full resize-none border-0 bg-transparent p-0 outline-none",
        className,
      )}
      rows={multiline ? 3 : 1}
    />
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
}

function NodeCardImpl({ node, pos, size, selected, editing, api, register }: NodeCardProps) {
  const round = node.shape === "circle" || node.shape === "diamond";
  const pill = node.shape === "pill";
  const Kind = KIND_META[node.kind].icon;

  const title = (
    <div
      className={cn(
        "text-[13.5px] font-medium leading-[1.3] text-ink",
        round || pill ? "text-center" : "",
        pill ? "truncate" : "line-clamp-3",
      )}
    >
      {node.title || <span className="text-ink-4">Untitled</span>}
    </div>
  );

  return (
    <div
      ref={(el) => { register(node.id, el); }}
      data-node-id={node.id}
      role="button"
      tabIndex={0}
      aria-label={`${KIND_META[node.kind].label}: ${node.title || "Untitled"}${node.date ? `, ${formatDate(node.date, { year: true })}` : ""}`}
      aria-pressed={selected}
      onPointerDown={(e) => api.pointerDown(e, node.id)}
      onFocus={() => api.focusNode(node.id)}
      onContextMenu={(e) => api.contextMenu(e, node.id)}
      onDoubleClick={(e) => { e.stopPropagation(); api.edit(node.id, "title"); }}
      className={cn(
        "group/node absolute left-0 top-0 touch-none select-none",
        `tint-${node.color}`,
        editing ? "cursor-text" : "cursor-grab active:cursor-grabbing",
      )}
      style={{ transform: `translate(${pos.x}px, ${pos.y}px)`, width: size.w, height: size.h }}
    >
      <Frame shape={node.shape} />

      {/* selection + link-target rings live above the frame so shapes stay crisp */}
      <div
        className={cn(
          "pointer-events-none absolute inset-0 ring-accent transition-opacity duration-150",
          node.shape === "circle" || pill ? "rounded-full" : node.shape === "card" ? "rounded-lg" : "rounded-md",
          node.shape === "diamond" && "rotate-45 scale-[0.7071] rounded-[12px]",
          selected ? "opacity-100 ring-2" : "opacity-0",
          // set imperatively while a link is being dragged onto this node
          "group-data-[link-target]/node:opacity-100 group-data-[link-target]/node:ring-2",
        )}
      />

      <div
        className={cn(
          "absolute inset-0 flex flex-col overflow-hidden",
          node.shape === "card" && "gap-1 py-2.5 pl-3.5 pr-2.5",
          node.shape === "sticky" && "gap-1 p-3",
          pill && "items-center justify-center gap-1.5 px-4 flex-row",
          round && "items-center justify-center gap-1 px-[18%] text-center",
          node.shape === "diamond" && "px-[22%]",
        )}
      >
        {/* the header row only earns its space when it has something to say */}
        {!pill && !round && (node.kind !== "note" || !!node.date) && (
          <div className="flex items-center gap-1.5">
            {node.kind !== "note" && (
              <>
                <Kind className="size-3 shrink-0 text-[var(--tint)]" />
                <span className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-ink-3">
                  {KIND_META[node.kind].label}
                </span>
              </>
            )}
            <div className="flex-1" />
            {node.date && (
              <button
                onClick={(e) => { e.stopPropagation(); api.openMenu(e, node.id, "date"); }}
                onPointerDown={(e) => e.stopPropagation()}
                className="inline-flex h-[18px] shrink-0 items-center gap-1 rounded-[5px] bg-[var(--tint-soft)] px-1.5 text-[10.5px] font-medium leading-none text-[var(--tint-ink)] tnum cursor-pointer transition-transform active:scale-[0.94]"
              >
                <CalendarDays className="size-2.5" />
                {formatDate(node.date, { weekday: false })}
              </button>
            )}
          </div>
        )}

        {pill && node.kind !== "note" && <Kind className="size-3.5 shrink-0 text-[var(--tint)]" />}

        {editing === "title" ? (
          <EditField
            value={node.title}
            className={cn("text-[13.5px] font-medium leading-[1.3] text-ink", (round || pill) && "text-center")}
            onCommit={(v) => api.commit(node.id, "title", v)}
            onCancel={api.cancelEdit}
          />
        ) : (
          title
        )}

        {editing === "body" ? (
          <EditField
            value={node.body ?? ""}
            multiline
            className="flex-1 text-[12px] leading-[1.5] text-ink-2"
            onCommit={(v) => api.commit(node.id, "body", v)}
            onCancel={api.cancelEdit}
          />
        ) : node.body ? (
          <div
            onDoubleClick={(e) => { e.stopPropagation(); api.edit(node.id, "body"); }}
            className={cn(
              "text-[12px] leading-[1.5] text-ink-2",
              round || pill ? "hidden" : "line-clamp-4",
            )}
          >
            {node.body}
          </div>
        ) : selected && !round && !pill ? (
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); api.edit(node.id, "body"); }}
            className="w-fit text-left text-[12px] text-ink-4 cursor-pointer hover:text-ink-3 transition-colors"
          >
            Add a note
          </button>
        ) : null}

        {(pill || round) && node.date && (
          <button
            onClick={(e) => { e.stopPropagation(); api.openMenu(e, node.id, "date"); }}
            onPointerDown={(e) => e.stopPropagation()}
            className="inline-flex h-[17px] shrink-0 items-center gap-1 rounded-[5px] bg-[var(--tint-soft)] px-1.5 text-[10.5px] font-medium leading-none text-[var(--tint-ink)] tnum cursor-pointer transition-transform active:scale-[0.94]"
          >
            {formatDate(node.date, { weekday: false })}
          </button>
        )}
      </div>

      {/* options — floats just outside the corner so every shape keeps it */}
      <button
        aria-label="Node options"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); api.openMenu(e, node.id); }}
        className={cn(
          "absolute -right-2 -top-2 grid size-7 place-items-center rounded-md border border-line bg-raised text-ink-3",
          "opacity-0 shadow-[var(--shadow-sm)] transition-[opacity,transform] duration-150 ease-[var(--ease-out-apple)]",
          "cursor-pointer hover:text-ink focus-visible:opacity-100 group-hover/node:opacity-100 active:scale-[0.92]",
        )}
      >
        <MoreHorizontal className="size-3.5" />
      </button>

      {/* Link handles. Pointer-only by nature — the keyboard route to the same
          result is selecting two nodes and pressing ⌘L, so they stay out of the
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
            "opacity-0 transition-opacity duration-150 cursor-crosshair group-hover/node:opacity-100",
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
  a.size.h === b.size.h,
);
