"use client";

import * as React from "react";
import {
  ArrowDown, ArrowUp, CalendarPlus, Copy, Download, MoreHorizontal, Pencil, Trash2,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import { friendlyDate, formatDuration } from "@/lib/date";
import type { Template } from "@/lib/types";
import { Badge, Button, IconButton } from "@/components/ui/primitives";
import { ConfirmDialog, MenuItem, MenuLabel, MenuSeparator, Popover, TintPicker } from "@/components/ui/overlays";
import { TemplateIcon } from "./icons";
import { EMPTY_INSIGHT, percent, verdict, type Insight } from "./insights";
import { collectVars, hasRule, itemsOf } from "./model";
import { downloadJson, fileNameFor, serialize } from "./transfer";
import { SCOPE_LABELS, itemLead, nextOrder, offsetLabel, plural, totalMinutes } from "./util";

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
  const vars = collectVars(items).user;
  const conditional = items.filter((i) => hasRule(i.rule)).length;
  const nested = items.filter((i) => i.ref_template_id).length;
  const minutes = totalMinutes(items);

  /** The usage read in one phrase — the card no longer spends a bar on it. */
  const usage = insight.created > 0
    ? `${percent(insight.rate)} finished`
    : template.use_count > 0
      ? `applied ${template.use_count}×`
      : "never applied";

  // Everything the card used to print at rest, now one quiet line on hover.
  const facts = [
    minutes > 0 ? formatDuration(minutes) : null,
    vars.length > 0 ? plural(vars.length, "variable") : null,
    conditional > 0 ? plural(conditional, "condition") : null,
    nested > 0 ? `${nested} linked` : null,
    usage,
  ].filter(Boolean).join(" · ");

  // The item preview, as the tooltip of the card that opens it.
  const tip = [
    `${SCOPE_LABELS[template.scope]} · ${plural(items.length, "item")}${minutes > 0 ? ` · ${formatDuration(minutes)}` : ""}`,
    ...items.slice(0, PREVIEW_ROWS).map((item) => {
      const day = template.scope === "week" ? `${offsetLabel(item.day_offset ?? 0, weekStart)} ` : "";
      return `${day}${itemLead(item, hour12)}  ${item.title || "Untitled item"}`;
    }),
    items.length > PREVIEW_ROWS ? `+${items.length - PREVIEW_ROWS} more` : null,
    insight.created > 0
      ? `${insight.done} of ${insight.created} tasks done — ${verdict(insight).text.toLowerCase()}`
      : null,
    insight.lastApplied ? `Last applied ${friendlyDate(insight.lastApplied).toLowerCase()}` : null,
  ].filter(Boolean).join("\n");

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
        "transition-[box-shadow] duration-200 ease-[var(--ease-out-apple)] hover:shadow-md",
      )}
    >
      <button
        onClick={() => onEdit(template)}
        title={tip}
        className="flex-1 cursor-pointer px-4 pb-2 pt-4 text-left"
      >
        <div className="flex items-start gap-2.5">
          <span className="grid size-8 shrink-0 place-items-center rounded-[9px] bg-[var(--tint-soft)] text-[var(--tint-ink)]">
            <TemplateIcon name={template.icon} className="size-[18px]" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13.5px] font-semibold tracking-[-0.01em] text-ink">
              {template.name || "Untitled template"}
            </p>
            <p className="mt-0.5 line-clamp-1 text-[12.5px] leading-relaxed text-ink-3">
              {template.description || "No description yet."}
            </p>
          </div>
        </div>

        {/* One line, two readings: what it is at rest, what it costs on hover.
            The hover layer repeats what the editor shows, so nothing lives only here. */}
        <div className="relative mt-3 h-[19px]">
          <span
            className={cn(
              "absolute inset-0 flex items-center gap-1.5 transition-opacity duration-200 ease-[var(--ease-out-apple)]",
              "group-hover/card:opacity-0 group-focus-within/card:opacity-0",
            )}
          >
            <Badge tint={template.color} dot>{SCOPE_LABELS[template.scope]}</Badge>
            <span className="text-[11.5px] text-ink-3 tnum">{plural(items.length, "item")}</span>
          </span>
          <span
            aria-hidden
            className={cn(
              "absolute inset-0 flex items-center truncate text-[11.5px] text-ink-3 tnum opacity-0",
              "transition-opacity duration-200 ease-[var(--ease-out-apple)]",
              "group-hover/card:opacity-100 group-focus-within/card:opacity-100",
            )}
          >
            {facts}
          </span>
        </div>
      </button>

      <div className="flex items-center gap-1 px-3 pb-2.5">
        <Button
          size="sm"
          variant="ghost"
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
