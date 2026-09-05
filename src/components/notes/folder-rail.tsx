"use client";

import * as React from "react";
import {
  ChevronRight, FolderClosed, FolderOpen, Inbox, Layers, Pencil, Plus, Trash2,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import type { Note, NoteFolder, Tint } from "@/lib/types";
import { Button, IconButton } from "@/components/ui/primitives";
import { MenuItem, MenuSeparator, Popover, TintPicker } from "@/components/ui/overlays";

// =========================================================
// Folders.
//
// A folder is a note's one home, which is the whole difference from a
// category: you can have five categories and no home, but you are in one
// folder or none. That is what makes a folder something you drag a note
// *into*, and out of wherever it was.
//
// Every row here is a drop target. The board hit-tests these elements by
// `data-folder-id` when a drag ends, so a card dropped on a folder is filed
// rather than repositioned — one gesture, two meanings, decided by where you
// let go.
// =========================================================

/** The two rows that are not folders but behave like them. */
export const ALL_FOLDERS = "__all";
export const UNFILED_FOLDER = "__unfiled";

export type FolderFilter = string; // a folder id, or ALL / UNFILED

export interface FolderCount {
  id: FolderFilter;
  label: string;
  color: Tint;
  count: number;
  folder: NoteFolder | null;
}

export function folderCounts(notes: Note[], folders: NoteFolder[]): FolderCount[] {
  const byId = new Map<string, number>();
  let unfiled = 0;
  for (const note of notes) {
    if (!note.folder_id) { unfiled += 1; continue; }
    byId.set(note.folder_id, (byId.get(note.folder_id) ?? 0) + 1);
  }

  const ordered = [...folders].sort(
    (a, b) => a.order_index - b.order_index || a.name.localeCompare(b.name),
  );

  return [
    { id: ALL_FOLDERS, label: "All notes", color: "slate", count: notes.length, folder: null },
    ...ordered.map((f) => ({
      id: f.id, label: f.name, color: f.color, count: byId.get(f.id) ?? 0, folder: f,
    })),
    { id: UNFILED_FOLDER, label: "Unfiled", color: "slate", count: unfiled, folder: null },
  ];
}

export function matchesFolder(note: Note, filter: FolderFilter): boolean {
  if (filter === ALL_FOLDERS) return true;
  if (filter === UNFILED_FOLDER) return !note.folder_id;
  return note.folder_id === filter;
}

// ---------------------------------------------------------

export function FolderRail({
  notes, folders, active, onActive, dropTarget, className,
}: {
  notes: Note[];
  folders: NoteFolder[];
  active: FolderFilter;
  onActive: (next: FolderFilter) => void;
  /** the row the pointer is currently over mid-drag, so it can light up */
  dropTarget: string | null;
  className?: string;
}) {
  const insert = useStore((s) => s.insert);
  const patch = useStore((s) => s.patch);
  const remove = useStore((s) => s.remove);
  const toast = useStore((s) => s.toast);
  const batchUndo = useStore((s) => s.batchUndo);

  const [renaming, setRenaming] = React.useState<string | null>(null);
  const rows = React.useMemo(() => folderCounts(notes, folders), [notes, folders]);

  const create = () => {
    const folder = insert("noteFolders", {
      name: `Folder ${folders.length + 1}`,
      order_index: folders.length,
    });
    setRenaming(folder.id);
    onActive(folder.id);
  };

  /**
   * Deleting a folder must never delete the writing. The notes inside come out
   * to Unfiled, and the whole thing is one undo step so putting it back puts
   * them back too.
   */
  const drop = (folder: NoteFolder) => {
    const inside = notes.filter((n) => n.folder_id === folder.id);
    batchUndo(`Delete ${folder.name}`, () => {
      for (const n of inside) patch("notes", n.id, { folder_id: null });
      remove("noteFolders", folder.id);
    });
    onActive(ALL_FOLDERS);
    toast({
      title: `${folder.name} deleted`,
      description: inside.length
        ? `${inside.length} ${inside.length === 1 ? "note" : "notes"} moved to Unfiled.`
        : undefined,
      action: {
        label: "Undo",
        run: () => batchUndo("Restore the folder", () => {
          insert("noteFolders", folder);
          for (const n of inside) patch("notes", n.id, { folder_id: folder.id });
        }),
      },
    });
  };

  return (
    <aside className={cn("w-[186px] shrink-0", className)}>
      <div className="mb-2 flex items-center gap-1">
        <h2 className="flex-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">
          Folders
        </h2>
        <IconButton label="New folder" size="sm" onClick={create}>
          <Plus />
        </IconButton>
      </div>

      <ul className="space-y-0.5">
        {rows.map((row) => {
          const on = active === row.id;
          const over = dropTarget === row.id;
          // Hoisted so TypeScript keeps the narrowing inside the render props
          // below, where row.folder alone goes back to being nullable.
          const folder = row.folder;
          const Glyph = row.id === UNFILED_FOLDER ? Inbox
            : row.id === ALL_FOLDERS ? Layers
              : on ? FolderOpen : FolderClosed;

          return (
            <li key={row.id} className="group/folder flex items-center gap-0.5">
              {renaming === row.id && folder ? (
                <RenameBox
                  folder={folder}
                  onDone={(name) => {
                    if (name.trim()) patch("noteFolders", folder.id, { name: name.trim() });
                    setRenaming(null);
                  }}
                />
              ) : (
                <>
                  <button
                    type="button"
                    data-folder-id={row.id}
                    aria-current={on || undefined}
                    onClick={() => onActive(row.id)}
                    className={cn(
                      `tint-${row.color}`,
                      "flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md px-1.5 py-[5px] text-left",
                      "transition-colors duration-150",
                      on ? "bg-selected text-ink" : "text-ink-2 hover:bg-hover hover:text-ink",
                      // The ring is the answer to "will this catch what I am
                      // holding", so it has to be unmistakable mid-drag.
                      over && "ring-2 ring-accent ring-offset-1 ring-offset-canvas",
                    )}
                  >
                    <Glyph
                      className="size-3.5 shrink-0"
                      style={folder ? { color: "var(--tint)" } : undefined}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 truncate text-[12.5px]">{row.label}</span>
                    <span className="shrink-0 text-[11px] text-ink-4 tnum">{row.count}</span>
                  </button>

                  {folder && (
                    <Popover
                      align="end"
                      className="w-[188px]"
                      trigger={
                        <IconButton
                          label={`Options for ${row.label}`}
                          size="sm"
                          className="opacity-0 transition-opacity group-hover/folder:opacity-100 focus-visible:opacity-100"
                        >
                          <ChevronRight />
                        </IconButton>
                      }
                    >
                      {(close) => (
                        <>
                          <MenuItem
                            icon={Pencil}
                            onClick={() => { setRenaming(folder.id); close(); }}
                          >
                            Rename
                          </MenuItem>
                          <MenuSeparator />
                          <TintPicker
                            value={folder.color}
                            onChange={(color) => {
                              if (color) patch("noteFolders", folder.id, { color });
                            }}
                          />
                          <MenuSeparator />
                          <MenuItem
                            icon={Trash2}
                            danger
                            onClick={() => { drop(folder); close(); }}
                          >
                            Delete folder
                          </MenuItem>
                        </>
                      )}
                    </Popover>
                  )}
                </>
              )}
            </li>
          );
        })}
      </ul>

      {folders.length === 0 && (
        <p className="mt-2 px-1.5 text-[11.5px] leading-snug text-ink-4">
          Make one, then drag notes onto it.
        </p>
      )}

      {folders.length > 0 && (
        <Button size="xs" variant="ghost" className="mt-2 w-full justify-start" onClick={create}>
          <Plus className="size-3" />
          New folder
        </Button>
      )}
    </aside>
  );
}

function RenameBox({
  folder, onDone,
}: {
  folder: NoteFolder;
  onDone: (name: string) => void;
}) {
  const [value, setValue] = React.useState(folder.name);
  return (
    <input
      autoFocus
      aria-label={`Rename ${folder.name}`}
      // Selected, not just focused. A new folder arrives called "Folder 2",
      // and typing over that name is the entire point of the box being open.
      onFocus={(e) => e.currentTarget.select()}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => onDone(value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onDone(value);
        if (e.key === "Escape") onDone("");
      }}
      className={cn(
        "h-7 w-full rounded-md border border-accent bg-raised px-1.5 text-[12.5px] text-ink",
        "outline-none ring-2 ring-accent-soft",
      )}
    />
  );
}

/**
 * Which folder row the pointer is over, if any.
 *
 * Hit-testing the real DOM rather than tracking rectangles means the rail can
 * scroll, wrap or re-order without the board knowing anything about it.
 */
export function folderUnderPointer(x: number, y: number): string | null {
  const el = document.elementFromPoint(x, y);
  const row = el?.closest?.("[data-folder-id]");
  return row?.getAttribute("data-folder-id") ?? null;
}
