"use client";

import * as React from "react";
import {
  ArrowDown, ArrowUp, Braces, CalendarPlus, Copy, Download, Filter,
  Layers, MoreHorizontal, Pencil, Trash2,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import { friendlyDate } from "@/lib/date";
import type { Template } from "@/lib/types";
import { Badge, Button, IconButton, Progress } from "@/components/ui/primitives";
import { ConfirmDialog, MenuItem, MenuLabel, MenuSeparator, Popover, TintPicker } from "@/components/ui/overlays";
import { TemplateIcon } from "./icons";
import { EMPTY_INSIGHT, percent, verdict, type Insight } from "./insights";
import { collectVars, hasRule, itemsOf } from "./model";
import { downloadJson, fileNameFor, serialize } from "./transfer";
import { SCOPE_LABELS, itemLead, nextOrder, offsetLabel, plural, totalMinutes } from "./util";
import { formatDuration } from "@/lib/date";

const PREVIEW_ROWS = 4;

export function TemplateCard({
  template, insight = EMPTY_INSIGHT, onEdit, onApply, onMove, canMoveUp, canMoveDown,
}: {
  template: Template;
  insight?: Insight;
  onEdit: (t: Template) => void;
  onApply: (t: Template) => void;
  /** Manual ordering, kept on the keyboard because the grid has no drag. */
  onMove?: (t: Template, direction: -1 | 1) => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
}) {
  const hour12 = useStore((s) => s.hour12);
  const weekStart = useStore((s) => s.profile?.week_start ?? 1);
  const templates = useStore((s) => s.templates);
  const insert = useStore((s) => s.insert);
  const patch = useStore((s) => s.patch);
  const remove = useStore((s) => s.remove);
  const toast = useStore((s) => s.toast);

  const [confirming, setConfirming] = React.useState(false);

  const items = itemsOf(template);
  const shown = items.slice(0, PREVIEW_ROWS);
  const rest = items.length - shown.length;

  const vars = collectVars(items).user;
  const conditional = items.filter((i) => hasRule(i.rule)).length;
  const nested = items.filter((i) => i.ref_template_id).length;
  const minutes = totalMinutes(items);
  const read = verdict(insight);

  function duplicate() {
    const copy = insert("templates", {
      name: `${template.name} copy`,
      description: template.description,
      icon: template.icon,
      color: template.color,
      scope: template.scope,
      items: template.items,
      order_index: nextOrder(templates),
    });
    toast({ title: "Template duplicated", description: copy.name });
    onEdit(copy);
  }

  function exportOne() {
    const name = fileNameFor([template]);
    downloadJson(name, serialize([template], templates));
    toast({ title: "Template exported", description: name });
  }

  return (
    <div
      className={cn(
        `tint-${template.color}`,
        "group/card flex flex-col surface overflow-hidden",
        "transition-[box-shadow,transform] duration-200 ease-[var(--ease-out-apple)]",
        "hover:shadow-md",
      )}
    >
      <button
        onClick={() => onEdit(template)}
        className="flex-1 cursor-pointer px-3.5 pb-3 pt-3.5 text-left"
      >
        <div className="flex items-start gap-2.5">
          <span className="grid size-8 shrink-0 place-items-center rounded-[9px] bg-[var(--tint-soft)] text-[var(--tint-ink)]">
            <TemplateIcon name={template.icon} className="size-[18px]" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13.5px] font-semibold tracking-[-0.01em] text-ink">
              {template.name || "Untitled template"}
            </p>
            <p className="mt-0.5 line-clamp-2 text-[12.5px] leading-relaxed text-ink-3">
              {template.description || "No description yet."}
            </p>
          </div>
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <Badge tint={template.color} dot>{SCOPE_LABELS[template.scope]}</Badge>
          <span className="text-[11.5px] text-ink-3 tnum">{plural(items.length, "item")}</span>
          {minutes > 0 && (
            <>
              <span className="text-ink-4">·</span>
              <span className="text-[11.5px] text-ink-3 tnum">{formatDuration(minutes)}</span>
            </>
          )}
          {vars.length > 0 && (
            <span className="inline-flex items-center gap-0.5 text-[11.5px] text-ink-3 tnum">
              <Braces className="size-3" aria-hidden />
              {vars.length}
            </span>
          )}
          {conditional > 0 && (
            <span className="inline-flex items-center gap-0.5 text-[11.5px] text-ink-3 tnum">
              <Filter className="size-3" aria-hidden />
              {conditional}
            </span>
          )}
          {nested > 0 && (
            <span className="inline-flex items-center gap-0.5 text-[11.5px] text-ink-3 tnum">
              <Layers className="size-3" aria-hidden />
              {nested}
            </span>
          )}
        </div>

        {items.length > 0 && (
          <div className="mt-3 space-y-[3px] border-t border-line pt-2.5">
            {shown.map((item, i) => (
              <div key={`${item.title}-${i}`} className="flex items-baseline gap-2">
                {template.scope === "week" && (
                  <span className="w-[26px] shrink-0 text-[11px] font-medium text-ink-4">
                    {offsetLabel(item.day_offset ?? 0, weekStart)}
                  </span>
                )}
                <span className="w-[58px] shrink-0 text-[11.5px] text-ink-4 tnum">
                  {itemLead(item, hour12)}
                </span>
                <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-2">{item.title}</span>
              </div>
            ))}
            {rest > 0 && (
              <p className="pt-0.5 text-[11.5px] text-ink-4 tnum">+{rest} more</p>
            )}
          </div>
        )}

        {/* Usage insight: the part that tells you whether the plan is honest. */}
        <div className="mt-3 border-t border-line pt-2.5">
          {insight.created > 0 ? (
            <>
              <div className="flex items-baseline gap-2">
                <span className="text-[11.5px] font-medium text-ink tnum">{percent(insight.rate)} done</span>
                <span className="text-[11.5px] text-ink-4 tnum">
                  {insight.done}/{insight.created}
                </span>
                <div className="flex-1" />
                <span
                  className={cn(
                    "text-[11px]",
                    read.tone === "success" ? "text-success"
                      : read.tone === "warn" ? "text-warn"
                        : read.tone === "danger" ? "text-danger"
                          : "text-ink-4",
                  )}
                >
                  {read.text}
                </span>
              </div>
              <Progress
                value={insight.done}
                max={Math.max(1, insight.created)}
                className="mt-1.5"
                height={3}
              />
              <p className="mt-1.5 text-[11px] text-ink-4 tnum">
                Applied {insight.applied}×
                {insight.lastApplied && ` · last ${friendlyDate(insight.lastApplied).toLowerCase()}`}
              </p>
            </>
          ) : (
            <p className="text-[11.5px] text-ink-4">
              {template.use_count > 0
                ? `Applied ${template.use_count}× — its tasks are gone, so there is nothing left to measure.`
                : "Never applied. Drop it on a date and this becomes a completion score."}
            </p>
          )}
        </div>
      </button>

      <div className="flex items-center gap-1 border-t border-line px-2.5 py-2">
        <Button
          size="sm"
          variant="subtle"
          onClick={() => onApply(template)}
          disabled={items.length === 0}
          title={items.length ? undefined : "Add an item first"}
        >
          <CalendarPlus className="size-3.5" />
          Apply
        </Button>
        <div className="flex-1" />
        <Popover
          align="end"
          className="w-[218px]"
          trigger={<IconButton label={`Options for ${template.name}`} size="md"><MoreHorizontal /></IconButton>}
        >
          {(close) => (
            <>
              <MenuItem icon={Pencil} onClick={() => { onEdit(template); close(); }}>Edit</MenuItem>
              <MenuItem icon={CalendarPlus} onClick={() => { onApply(template); close(); }}>Apply to a date…</MenuItem>
              <MenuItem icon={Copy} onClick={() => { duplicate(); close(); }}>Duplicate</MenuItem>
              <MenuItem icon={Download} onClick={() => { exportOne(); close(); }}>Export as JSON</MenuItem>
              {onMove && (
                <>
                  <MenuSeparator />
                  <MenuItem
                    icon={ArrowUp}
                    disabled={!canMoveUp}
                    onClick={() => { onMove(template, -1); close(); }}
                  >
                    Move earlier
                  </MenuItem>
                  <MenuItem
                    icon={ArrowDown}
                    disabled={!canMoveDown}
                    onClick={() => { onMove(template, 1); close(); }}
                  >
                    Move later
                  </MenuItem>
                </>
              )}
              <MenuSeparator />
              <MenuLabel>Colour</MenuLabel>
              <TintPicker value={template.color} onChange={(t) => t && patch("templates", template.id, { color: t })} />
              <MenuSeparator />
              <MenuItem icon={Trash2} danger onClick={() => { setConfirming(true); close(); }}>Delete</MenuItem>
            </>
          )}
        </Popover>
      </div>

      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={() => {
          remove("templates", template.id);
          toast({ title: "Template deleted", description: `“${template.name}” is gone. Tasks it created stay put.` });
        }}
        title={`Delete “${template.name}”?`}
        description="Tasks you already created from it are not touched."
      />
    </div>
  );
}
