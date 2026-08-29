"use client";

import * as React from "react";
import { Ellipsis, Eye, EyeOff, Pencil, Plus, RotateCcw } from "lucide-react";
import { cn } from "@/lib/cn";
import type { Horizon, Tint } from "@/lib/types";
import { IconButton } from "@/components/ui/primitives";
import { MenuItem, MenuLabel, MenuSeparator, Popover, TintPicker } from "@/components/ui/overlays";
import { HORIZON_LABEL, HORIZONS } from "./goal-model";
import { columnLabel, isHidden, setColumnPref, type ColumnPrefs } from "./column-prefs";

/**
 * A column heading you can actually edit: rename it in place, give it a colour,
 * or take it off the board. The horizon underneath never changes — this is what
 * the user calls it, not what it is.
 */
export function ColumnHeader({
  horizon, count, prefs, onCreate,
}: {
  horizon: Horizon;
  count: number;
  prefs: ColumnPrefs;
  onCreate: () => void;
}) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);

  const label = columnLabel(horizon, prefs);
  const tint = prefs[horizon]?.color;

  React.useEffect(() => {
    if (editing) { inputRef.current?.focus(); inputRef.current?.select(); }
  }, [editing]);

  function startEdit() {
    setDraft(label);
    setEditing(true);
  }

  function commit() {
    setEditing(false);
    const next = draft.trim();
    if (next && next !== label) setColumnPref(horizon, { label: next });
  }

  return (
    <div className={cn("mb-3 flex items-center gap-1.5 px-0.5", tint && `tint-${tint}`)}>
      {tint && <span className="size-2 shrink-0 rounded-full" style={{ background: "var(--tint)" }} />}

      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          aria-label={`Rename ${label} column`}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); commit(); }
            if (e.key === "Escape") { setDraft(label); setEditing(false); }
          }}
          className="min-w-0 flex-1 rounded-sm bg-hover px-1 -mx-1 text-[12.5px] font-medium text-ink outline-none"
        />
      ) : (
        <button
          type="button"
          onDoubleClick={startEdit}
          onClick={startEdit}
          title="Rename this column"
          className={cn(
            "rounded-sm px-1 -mx-1 text-[12.5px] font-medium cursor-text transition-colors hover:bg-hover",
            tint ? "text-[var(--tint-ink)]" : "text-ink-2",
          )}
        >
          {label}
        </button>
      )}

      {!editing && <span className="text-[11px] text-ink-4 tnum">{count}</span>}
      <div className="flex-1" />

      <IconButton
        label={`New ${label.toLowerCase()} goal`}
        size="sm"
        className="opacity-0 transition-opacity duration-150 focus-visible:opacity-100 group-hover/col:opacity-100"
        onClick={onCreate}
      >
        <Plus />
      </IconButton>

      <Popover
        align="end"
        className="w-[212px]"
        trigger={
          <IconButton
            label={`${label} column options`}
            size="sm"
            className="opacity-0 transition-opacity duration-150 focus-visible:opacity-100 group-hover/col:opacity-100"
          >
            <Ellipsis />
          </IconButton>
        }
      >
        {(close) => (
          <>
            <MenuItem icon={Pencil} onClick={() => { close(); startEdit(); }}>Rename</MenuItem>
            <MenuSeparator />
            <MenuLabel>Colour</MenuLabel>
            <TintPicker
              value={tint ?? null}
              allowNone
              onChange={(t) => setColumnPref(horizon, { color: (t ?? undefined) as Tint | undefined })}
            />
            <MenuSeparator />
            <MenuItem icon={EyeOff} onClick={() => { setColumnPref(horizon, { hidden: true }); close(); }}>
              Hide this column
            </MenuItem>
            {(prefs[horizon]?.label || tint) && (
              <MenuItem
                icon={RotateCcw}
                onClick={() => { setColumnPref(horizon, { label: undefined, color: undefined }); close(); }}
              >
                Reset to “{HORIZON_LABEL[horizon]}”
              </MenuItem>
            )}
          </>
        )}
      </Popover>
    </div>
  );
}

/** Brings hidden columns back. Only shown when something is actually hidden. */
export function HiddenColumns({ prefs }: { prefs: ColumnPrefs }) {
  const hidden = HORIZONS.filter((h) => isHidden(h, prefs));
  if (!hidden.length) return null;

  return (
    <Popover
      align="end"
      className="w-[196px]"
      trigger={
        <button
          type="button"
          className="flex h-7 items-center gap-1.5 rounded-md px-2 text-[12.5px] text-ink-3 hover:bg-hover hover:text-ink cursor-pointer transition-colors"
        >
          <EyeOff className="size-3.5" />
          {hidden.length} hidden
        </button>
      }
    >
      {(close) => (
        <>
          <MenuLabel>Hidden columns</MenuLabel>
          {hidden.map((h) => (
            <MenuItem
              key={h}
              icon={Eye}
              onClick={() => { setColumnPref(h, { hidden: false }); if (hidden.length === 1) close(); }}
            >
              {columnLabel(h, prefs)}
            </MenuItem>
          ))}
        </>
      )}
    </Popover>
  );
}
