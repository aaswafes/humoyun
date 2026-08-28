"use client";

import * as React from "react";
import { Trash2 } from "lucide-react";
import { useStore } from "@/lib/store";
import type { MapEdge, Tint } from "@/lib/types";
import { IconButton, Segmented } from "@/components/ui/primitives";
import { TintPicker } from "@/components/ui/overlays";

/** Floating controls for the selected link. Sits at the curve's midpoint. */
export function EdgeInspector({
  edge, x, y, placement = "above", onClose,
}: {
  edge: MapEdge;
  x: number;
  y: number;
  placement?: "above" | "below";
  onClose: () => void;
}) {
  const patch = useStore((s) => s.patch);
  const remove = useStore((s) => s.remove);
  // remounted per edge (keyed by the caller), so the draft starts fresh
  const [label, setLabel] = React.useState(edge.label ?? "");

  const commit = () => {
    const next = label.trim();
    if (next !== (edge.label ?? "")) patch("edges", edge.id, { label: next || null });
  };

  return (
    <div
      role="dialog"
      aria-label="Link options"
      className="absolute z-20 w-[252px] rounded-xl border border-line bg-raised p-2 shadow-[var(--shadow-lg)] anim-pop"
      style={{
        left: x,
        top: y,
        transform: placement === "above"
          ? "translate(-50%, calc(-100% - 14px))"
          : "translate(-50%, 14px)",
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") { commit(); onClose(); }
          if (e.key === "Escape") { setLabel(edge.label ?? ""); onClose(); }
        }}
        placeholder="Label this link"
        aria-label="Link label"
        className="h-7 w-full rounded-md bg-hover px-2 text-[13px] text-ink outline-none placeholder:text-ink-4 focus:ring-2 focus:ring-accent-soft"
      />

      <div className="mt-1.5 flex items-center gap-1.5">
        <Segmented
          size="sm"
          value={edge.style}
          onChange={(style) => patch("edges", edge.id, { style })}
          options={[
            { value: "solid" as const, label: "Solid" },
            { value: "dashed" as const, label: "Dashed" },
            { value: "dotted" as const, label: "Dotted" },
          ]}
        />
        <div className="flex-1" />
        <IconButton
          label="Delete link"
          size="sm"
          tone="danger"
          onClick={() => { remove("edges", edge.id); onClose(); }}
        >
          <Trash2 />
        </IconButton>
      </div>

      <div className="mt-1 border-t border-line pt-1">
        <TintPicker value={edge.color} onChange={(t) => patch("edges", edge.id, { color: (t ?? "slate") as Tint })} />
      </div>
    </div>
  );
}
