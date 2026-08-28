"use client";

import * as React from "react";
import { Plus, Sparkles } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import type { Template } from "@/lib/types";
import { Badge, Button } from "@/components/ui/primitives";
import { TemplateIcon } from "./icons";
import { STARTERS, type Starter } from "./starters";
import { SCOPE_LABELS, itemLead, nextOrder, offsetLabel, plural } from "./util";

function StarterCard({
  starter, onInstall,
}: {
  starter: Starter;
  onInstall: (s: Starter) => void;
}) {
  const hour12 = useStore((s) => s.hour12);
  const weekStart = useStore((s) => s.profile?.week_start ?? 1);
  const shown = starter.items.slice(0, 4);
  const rest = starter.items.length - shown.length;

  return (
    <div
      className={cn(
        `tint-${starter.color}`,
        "flex flex-col rounded-lg border border-dashed border-line-strong bg-canvas px-3.5 pb-3 pt-3.5",
        "transition-[border-color,box-shadow] duration-200 ease-[var(--ease-out-apple)] hover:border-line hover:shadow-sm",
      )}
    >
      <div className="flex items-start gap-2.5">
        <span className="grid size-8 shrink-0 place-items-center rounded-[9px] bg-[var(--tint-soft)] text-[var(--tint-ink)]">
          <TemplateIcon name={starter.icon} className="size-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-semibold tracking-[-0.01em] text-ink">{starter.name}</p>
          <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-3">{starter.description}</p>
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <Badge tint={starter.color} dot>{SCOPE_LABELS[starter.scope]}</Badge>
        <span className="text-[11.5px] text-ink-3 tnum">{plural(starter.items.length, "item")}</span>
      </div>

      <div className="mt-3 flex-1 space-y-[3px] border-t border-line pt-2.5">
        {shown.map((item, i) => (
          <div key={`${item.title}-${i}`} className="flex items-baseline gap-2">
            {starter.scope === "week" && (
              <span className="w-[26px] shrink-0 text-[11px] font-medium text-ink-4">
                {offsetLabel(item.day_offset ?? 0, weekStart)}
              </span>
            )}
            <span className="w-[58px] shrink-0 text-[11.5px] text-ink-4 tnum">{itemLead(item, hour12)}</span>
            <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-2">{item.title}</span>
          </div>
        ))}
        {rest > 0 && <p className="pt-0.5 text-[11.5px] text-ink-4 tnum">+{rest} more</p>}
      </div>

      <div className="mt-3 flex">
        <Button size="sm" variant="secondary" onClick={() => onInstall(starter)}>
          <Plus className="size-3.5" />
          Add to my templates
        </Button>
      </div>
    </div>
  );
}

/**
 * Starters are plain data until installed — the button writes a real row, so an
 * added starter is indistinguishable from one built by hand.
 */
export function StarterGallery({ onInstalled }: { onInstalled: (t: Template) => void }) {
  const templates = useStore((s) => s.templates);
  const insert = useStore((s) => s.insert);
  const toast = useStore((s) => s.toast);

  function install(starter: Starter, order: number): Template {
    return insert("templates", {
      name: starter.name,
      description: starter.description,
      icon: starter.icon,
      color: starter.color,
      scope: starter.scope,
      items: starter.items,
      order_index: order,
    });
  }

  function installOne(starter: Starter) {
    const created = install(starter, nextOrder(templates));
    toast({
      title: `${starter.name} added`,
      description: "The times are a starting point — make them yours.",
      tone: "success",
    });
    onInstalled(created);
  }

  function installAll() {
    const base = nextOrder(templates);
    STARTERS.forEach((s, i) => install(s, base + i));
    toast({
      title: "Four templates added",
      description: "Edit them freely — they are ordinary rows now.",
      tone: "success",
    });
  }

  return (
    <section>
      <div className="mb-2.5 flex flex-wrap items-center gap-2">
        <Sparkles className="size-3.5 text-ink-3" />
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">Start with one of these</h2>
        <div className="flex-1" />
        <Button size="sm" variant="secondary" onClick={installAll}>Add all four</Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {STARTERS.map((starter) => (
          <StarterCard key={starter.name} starter={starter} onInstall={installOne} />
        ))}
      </div>
    </section>
  );
}
