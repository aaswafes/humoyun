"use client";

import * as React from "react";
import { Check, ChevronDown, Pencil, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import type { Board, Tint } from "@/lib/types";
import { Button, Input } from "@/components/ui/primitives";
import {
  ConfirmDialog, MenuItem, MenuLabel, MenuSeparator, Modal, Popover, TintPicker,
} from "@/components/ui/overlays";

export function BoardSwitcher({
  boards, active, onSelect,
}: {
  boards: Board[];
  active: Board | null;
  onSelect: (id: string) => void;
}) {
  const insert = useStore((s) => s.insert);
  const patch = useStore((s) => s.patch);
  const remove = useStore((s) => s.remove);
  const removeWhere = useStore((s) => s.removeWhere);
  const nodes = useStore((s) => s.nodes);
  const toast = useStore((s) => s.toast);

  const [dialog, setDialog] = React.useState<"new" | "rename" | null>(null);
  const [confirming, setConfirming] = React.useState(false);
  const [name, setName] = React.useState("");
  const [color, setColor] = React.useState<Tint>("blue");

  function openNew() {
    setName("");
    setColor("blue");
    setDialog("new");
  }

  function openRename() {
    if (!active) return;
    setName(active.name);
    setColor(active.color);
    setDialog("rename");
  }

  function save() {
    const trimmed = name.trim() || "Untitled board";
    if (dialog === "new") {
      const board = insert("boards", {
        name: trimmed,
        color,
        order_index: boards.length ? Math.max(...boards.map((b) => b.order_index)) + 1 : 0,
      });
      onSelect(board.id);
    } else if (active) {
      patch("boards", active.id, { name: trimmed, color });
    }
    setDialog(null);
  }

  function destroy() {
    if (!active) return;
    const doomed = new Set(nodes.filter((n) => n.board_id === active.id).map((n) => n.id));
    removeWhere("edges", (e) => e.board_id === active.id || doomed.has(e.source_id) || doomed.has(e.target_id));
    removeWhere("nodes", (n) => n.board_id === active.id);
    remove("boards", active.id);
    const next = boards.find((b) => b.id !== active.id);
    if (next) onSelect(next.id);
    toast({ title: `“${active.name}” deleted`, description: `${doomed.size} nodes removed with it.` });
  }

  return (
    <>
      <Popover
        align="start"
        className="w-[236px]"
        trigger={
          <button
            className={cn(
              "flex h-7 max-w-[220px] items-center gap-1.5 rounded-md px-2 text-[13px] font-medium text-ink",
              "cursor-pointer transition-colors duration-150 hover:bg-hover active:scale-[0.98]",
            )}
          >
            <span
              className={cn("size-2 shrink-0 rounded-full", active ? `tint-${active.color}` : "tint-slate")}
              style={{ background: "var(--tint)" }}
            />
            <span className="truncate">{active?.name ?? "No board"}</span>
            <ChevronDown className="size-3.5 shrink-0 text-ink-3" />
          </button>
        }
      >
        {(close) => (
          <>
            <MenuLabel>Boards</MenuLabel>
            <div className="max-h-[260px] overflow-y-auto">
              {boards.map((b) => (
                <button
                  key={b.id}
                  onClick={() => { onSelect(b.id); close(); }}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-[6px] text-left text-[13px] text-ink",
                    "cursor-pointer transition-colors duration-100 hover:bg-hover",
                    `tint-${b.color}`,
                  )}
                >
                  <span className="size-2 shrink-0 rounded-full" style={{ background: "var(--tint)" }} />
                  <span className="min-w-0 flex-1 truncate">{b.name}</span>
                  <span className="text-[11px] text-ink-4 tnum">
                    {nodes.filter((n) => n.board_id === b.id).length}
                  </span>
                  {b.id === active?.id && <Check className="size-3.5 shrink-0 text-accent" />}
                </button>
              ))}
            </div>
            <MenuSeparator />
            <MenuItem icon={Plus} onClick={() => { openNew(); close(); }}>New board</MenuItem>
            <MenuItem icon={Pencil} disabled={!active} onClick={() => { openRename(); close(); }}>
              Rename board
            </MenuItem>
            <MenuItem icon={Trash2} danger disabled={!active} onClick={() => { setConfirming(true); close(); }}>
              Delete board
            </MenuItem>
          </>
        )}
      </Popover>

      <Modal
        open={dialog !== null}
        onClose={() => setDialog(null)}
        title={dialog === "new" ? "New board" : "Rename board"}
        width={380}
      >
        <div className="p-4">
          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">
            Name
          </label>
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") save(); }}
            placeholder="Product strategy"
          />
          <label className="mb-1 mt-4 block text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">
            Colour
          </label>
          <TintPicker value={color} onChange={(t) => setColor((t ?? "blue") as Tint)} />
          <div className="mt-5 flex justify-end gap-2">
            <Button size="sm" onClick={() => setDialog(null)}>Cancel</Button>
            <Button size="sm" variant="primary" onClick={save}>
              {dialog === "new" ? "Create board" : "Save"}
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={destroy}
        title={`Delete “${active?.name ?? ""}”?`}
        description="Every node and link on this board goes with it. This cannot be undone."
        confirmLabel="Delete board"
      />
    </>
  );
}
