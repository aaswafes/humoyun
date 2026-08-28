"use client";

import * as React from "react";
import { CalendarPlus, Copy, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import type { Template } from "@/lib/types";
import { Badge, Button, IconButton } from "@/components/ui/primitives";
import { ConfirmDialog, MenuItem, MenuLabel, MenuSeparator, Popover, TintPicker } from "@/components/ui/overlays";
import { TemplateIcon } from "./icons";
import { SCOPE_LABELS, itemLead, nextOrder, offsetLabel, plural } from "./util";

const PREVIEW_ROWS = 4;

export function TemplateCard({
  template, onEdit, onApply,
}: {
  template: Template;
  onEdit: (t: Template) => void;
  onApply: (t: Template) => void;
}) {
  const hour12 = useStore((s) => s.hour12);
  const weekStart = useStore((s) => s.profile?.week_start ?? 1);
  const templates = useStore((s) => s.templates);
  const insert = useStore((s) => s.insert);
  const patch = useStore((s) => s.patch);
  const remove = useStore((s) => s.remove);
  const toast = useStore((s) => s.toast);

  const [confirming, setConfirming] = React.useState(false);

  const shown = template.items.slice(0, PREVIEW_ROWS);
  const rest = template.items.length - shown.length;

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
            <p className="truncate text-[14px] font-semibold tracking-[-0.01em] text-ink">
              {template.name || "Untitled template"}
            </p>
            <p className="mt-0.5 line-clamp-2 text-[12.5px] leading-relaxed text-ink-3">
              {template.description || "No description yet."}
            </p>
          </div>
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <Badge tint={template.color} dot>{SCOPE_LABELS[template.scope]}</Badge>
          <span className="text-[11.5px] text-ink-3 tnum">{plural(template.items.length, "item")}</span>
          <span className="text-ink-4">·</span>
          <span className="text-[11.5px] text-ink-3 tnum">
            {template.use_count > 0 ? `used ${template.use_count}×` : "never used"}
          </span>
        </div>

        {template.items.length > 0 && (
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
      </button>

      <div className="flex items-center gap-1 border-t border-line px-2.5 py-2">
        <Button
          size="sm"
          variant="subtle"
          onClick={() => onApply(template)}
          disabled={template.items.length === 0}
          title={template.items.length ? undefined : "Add an item first"}
        >
          <CalendarPlus className="size-3.5" />
          Apply
        </Button>
        <div className="flex-1" />
        <Popover
          align="end"
          className="w-[210px]"
          trigger={<IconButton label={`Options for ${template.name}`} size="sm"><MoreHorizontal /></IconButton>}
        >
          {(close) => (
            <>
              <MenuItem icon={Pencil} onClick={() => { onEdit(template); close(); }}>Edit</MenuItem>
              <MenuItem icon={CalendarPlus} onClick={() => { onApply(template); close(); }}>Apply to a date…</MenuItem>
              <MenuItem icon={Copy} onClick={() => { duplicate(); close(); }}>Duplicate</MenuItem>
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
