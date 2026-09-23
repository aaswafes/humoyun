"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  BookOpen, Clock, Flame, Hand, MoreHorizontal, Moon, Pencil, Timer, Trash2, type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import { formatTime } from "@/lib/date";
import { UMR_META, type UmrEntry, type UmrSource } from "@/lib/umr";
import { IconButton } from "@/components/ui/primitives";
import { ConfirmDialog, MenuItem, MenuSeparator, Popover } from "@/components/ui/overlays";
import { MiniEmpty } from "@/components/ui/form";
import { deleteSession } from "@/components/focus/session-actions";
import { fmtMin } from "./derive";

// =========================================================
// Everything that made up a day, in order, with where each minute came from.
//
// The icon is not decoration: it says whether a figure was measured by a timer
// or declared by hand, which is the difference between a fact and a claim.
//
// Every row can be acted on, and that is the point of the menu. A timer left
// running writes hours nobody spent, and the place you notice it is here — so
// this is where it has to be fixable, on any day, not only today. A prayer or
// a habit still opens the page that owns it rather than pretending this list
// does.
// =========================================================

const SOURCE_ICON: Record<UmrSource, LucideIcon> = {
  session: Timer,
  task: Clock,
  prayer: BookOpen,
  habit: Flame,
  sleep: Moon,
  manual: Hand,
};

const SOURCE_WORD: Record<UmrSource, string> = {
  session: "timed",
  task: "recorded on a task",
  prayer: "declared for a prayer",
  habit: "from a habit",
  sleep: "from the day log",
  manual: "logged by hand",
};

export function UmrEntryList({
  entries, hour12, className, emptyLabel = "Nothing recorded yet.", onEditSession,
}: {
  entries: UmrEntry[];
  hour12: boolean;
  className?: string;
  emptyLabel?: string;
  /** Opens the focus session editor, where a runaway timer gets its length back. */
  onEditSession?: (sessionId: string) => void;
}) {
  const remove = useStore((s) => s.remove);
  const openInspector = useStore((s) => s.openInspector);
  const toast = useStore((s) => s.toast);
  const router = useRouter();
  const [confirm, setConfirm] = React.useState<UmrEntry | null>(null);

  const sorted = React.useMemo(
    () => [...entries].sort((a, b) => {
      // Entries with a clock time lead, in order; the rest follow by size.
      if (a.startMin != null && b.startMin != null) return a.startMin - b.startMin;
      if (a.startMin != null) return -1;
      if (b.startMin != null) return 1;
      return b.minutes - a.minutes;
    }),
    [entries],
  );

  if (!sorted.length) return <MiniEmpty className={className}>{emptyLabel}</MiniEmpty>;

  return (
    <>
      <ul className={cn("divide-y divide-line", className)}>
        {sorted.map((e) => {
          const Icon = SOURCE_ICON[e.source];
          const meta = e.category ? UMR_META[e.category] : null;
          return (
            <li key={e.id} className="group/entry flex items-center gap-2.5 py-1.5">
              <span
                className={cn(meta && `tint-${meta.tint}`, "grid size-5 shrink-0 place-items-center")}
                title={SOURCE_WORD[e.source]}
              >
                <Icon
                  className="size-3.5"
                  style={{ color: meta ? "var(--tint)" : "var(--ink-4)" }}
                  aria-hidden
                />
              </span>

              <span className="w-[52px] shrink-0 text-[11.5px] text-ink-4 tnum">
                {e.startMin != null ? formatTime(e.startMin, hour12) : "—"}
              </span>

              <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{e.label}</span>

              <span className={cn("shrink-0 text-[11px]", meta ? "text-ink-3" : "text-ink-4")}>
                {meta ? meta.label : "unset"}
              </span>

              <span className="w-[56px] shrink-0 text-right text-[12.5px] text-ink-2 tnum">
                {fmtMin(e.minutes)}
              </span>

              <span className="w-6 shrink-0">
                <Popover
                  align="end"
                  className="w-[220px]"
                  trigger={
                    <IconButton
                      size="sm"
                      label={`Options for ${e.label}`}
                      className="opacity-0 transition-opacity focus-visible:opacity-100 group-hover/entry:opacity-100"
                    >
                      <MoreHorizontal />
                    </IconButton>
                  }
                >
                  {(close) => (
                    <>
                      {e.source === "session" && e.sourceId && (
                        <>
                          <MenuItem
                            icon={Pencil}
                            onClick={() => {
                              close();
                              if (onEditSession) onEditSession(e.sourceId as string);
                              else router.push("/focus");
                            }}
                          >
                            Fix the length…
                          </MenuItem>
                          <MenuSeparator />
                          <MenuItem icon={Trash2} danger onClick={() => { close(); setConfirm(e); }}>
                            Delete this sitting
                          </MenuItem>
                        </>
                      )}

                      {e.source === "manual" && e.sourceId && (
                        <MenuItem icon={Trash2} danger onClick={() => { close(); setConfirm(e); }}>
                          Delete this entry
                        </MenuItem>
                      )}

                      {e.source === "task" && e.sourceId && (
                        <MenuItem
                          icon={Pencil}
                          onClick={() => { close(); openInspector(e.sourceId as string); }}
                        >
                          Open the task
                        </MenuItem>
                      )}

                      {e.source === "prayer" && (
                        <MenuItem icon={Pencil} onClick={() => { close(); router.push("/salah"); }}>
                          Open Salah
                        </MenuItem>
                      )}

                      {e.source === "habit" && (
                        <MenuItem icon={Pencil} onClick={() => { close(); router.push("/habits"); }}>
                          Open Habits
                        </MenuItem>
                      )}

                      {e.source === "sleep" && (
                        <MenuItem icon={Pencil} onClick={() => { close(); router.push("/"); }}>
                          Edit on Today
                        </MenuItem>
                      )}
                    </>
                  )}
                </Popover>
              </span>
            </li>
          );
        })}
      </ul>

      <ConfirmDialog
        open={confirm != null}
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          const e = confirm;
          if (!e?.sourceId) return;
          // A sitting goes through `deleteSession` so the minutes come back off
          // the task it was credited to; a hand-logged row belongs to nothing else.
          if (e.source === "session") deleteSession(e.sourceId);
          else remove("umrLogs", e.sourceId);
          toast({
            title: "Removed",
            description: `${fmtMin(e.minutes)} of ${e.label} is off the record.`,
          });
          setConfirm(null);
        }}
        title={confirm?.source === "session" ? "Delete this sitting?" : "Delete this entry?"}
        description={
          confirm
            ? `${fmtMin(confirm.minutes)} of ${confirm.label} comes off the record.${
              confirm.source === "session"
                ? " If the timer simply ran long, fixing the length keeps the part that was real."
                : ""
            }`
            : undefined
        }
      />
    </>
  );
}
