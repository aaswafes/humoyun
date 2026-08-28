"use client";

import * as React from "react";
import { ArrowRight, Repeat2, Spline, Target, Trash2, X } from "lucide-react";
import { useStore } from "@/lib/store";
import type { MapEdge, Tint } from "@/lib/types";
import { Button, IconButton, Segmented } from "@/components/ui/primitives";
import { TintPicker } from "@/components/ui/overlays";
import { DEFAULT_CURVE, MAX_CURVE } from "./geometry";

function curveWord(value: number): string {
  if (value < 0.15) return "Straight";
  if (value < 0.75) return "Gentle";
  if (value < 1.35) return "Default";
  return "Loose";
}

/**
 * Everything about one link, at the point of the curve you clicked. Direction,
 * wording, weight, colour and how far it bows — an arrow is a claim about how
 * two ideas relate, so it gets more than a delete button.
 */
export function EdgeInspector({
  edge, x, y, placement = "above", sourceTitle, targetTitle,
  curve, onCurve, onSwap, onSelectEnds, onClose,
}: {
  edge: MapEdge;
  x: number;
  y: number;
  placement?: "above" | "below";
  sourceTitle: string;
  targetTitle: string;
  curve: number;
  onCurve: (value: number | null) => void;
  onSwap: () => void;
  onSelectEnds: () => void;
  onClose: () => void;
}) {
  const patch = useStore((s) => s.patch);
  const remove = useStore((s) => s.remove);
  // remounted per edge (keyed by the caller), so the draft starts fresh
  const [label, setLabel] = React.useState(edge.label ?? "");
  const curveId = React.useId();

  const commit = () => {
    const next = label.trim();
    if (next !== (edge.label ?? "")) patch("edges", edge.id, { label: next || null });
  };

  return (
    <div
      role="group"
      aria-label={`Link from ${sourceTitle} to ${targetTitle}`}
      className="absolute z-20 w-[268px] rounded-xl border border-line bg-raised p-2 shadow-[var(--shadow-lg)] anim-pop"
      style={{
        left: x,
        top: y,
        transform: placement === "above"
          ? "translate(-50%, calc(-100% - 14px))"
          : "translate(-50%, 14px)",
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } }}
    >
      <div className="mb-1.5 flex items-center gap-1 px-0.5">
        <span className="min-w-0 flex-1 truncate text-[11.5px] text-ink-3" title={sourceTitle}>
          {sourceTitle}
        </span>
        <ArrowRight className="size-3 shrink-0 text-ink-4" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-[11.5px] text-ink-3" title={targetTitle}>
          {targetTitle}
        </span>
        <IconButton label="Close link options" size="sm" onClick={onClose}>
          <X />
        </IconButton>
      </div>

      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") { commit(); onClose(); }
          if (e.key === "Escape") { setLabel(edge.label ?? ""); onClose(); }
        }}
        placeholder="Label this link — leads to, blocks, answers…"
        aria-label="Link label"
        className="h-7 w-full rounded-md bg-hover px-2 text-[13px] text-ink outline-none placeholder:text-ink-4 focus-visible:ring-2 focus-visible:ring-accent-soft"
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
        <IconButton label="Reverse the arrow" size="sm" onClick={onSwap}>
          <Repeat2 />
        </IconButton>
        <IconButton label="Delete link" size="sm" tone="danger" onClick={() => { remove("edges", edge.id); onClose(); }}>
          <Trash2 />
        </IconButton>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <label htmlFor={curveId} className="flex shrink-0 items-center gap-1 text-[11.5px] text-ink-3">
          <Spline className="size-3.5 text-ink-4" aria-hidden />
          Curve
        </label>
        <input
          id={curveId}
          type="range"
          min={0}
          max={MAX_CURVE}
          step={0.05}
          value={curve}
          aria-valuetext={curveWord(curve)}
          onKeyDown={(e) => e.stopPropagation()}
          onChange={(e) => onCurve(Number(e.target.value))}
          style={{ accentColor: "var(--accent)" }}
          className="h-1 min-w-0 flex-1 cursor-pointer"
        />
        <span className="w-[52px] shrink-0 text-right text-[11px] text-ink-4">{curveWord(curve)}</span>
        <button
          onClick={() => onCurve(null)}
          disabled={curve === DEFAULT_CURVE}
          className="-m-1 shrink-0 cursor-pointer p-1 text-[11px] font-medium text-accent transition-opacity hover:opacity-80 disabled:pointer-events-none disabled:opacity-30"
        >
          Reset
        </button>
      </div>

      <div className="mt-1.5 border-t border-line pt-1.5">
        <TintPicker value={edge.color} onChange={(t) => patch("edges", edge.id, { color: (t ?? "slate") as Tint })} />
      </div>

      <Button size="sm" className="mt-1.5 w-full justify-center" onClick={onSelectEnds}>
        <Target className="size-3.5" aria-hidden />
        Select both ends
      </Button>
    </div>
  );
}
