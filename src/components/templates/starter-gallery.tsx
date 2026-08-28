"use client";

import * as React from "react";
import { Braces, Check, Filter, Plus, Sparkles } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import type { Template } from "@/lib/types";
import { Badge, Button, Segmented } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/overlays";
import { TemplateIcon } from "./icons";
import { STARTERS, STARTER_CATEGORIES, type Starter, type StarterCategory } from "./starters";
import { collectVars, hasRule } from "./model";
import { SCOPE_LABELS, itemLead, nextOrder, offsetLabel, plural } from "./util";

type Filter = "all" | StarterCategory;

function StarterCard({
  starter, installed, onInstall,
}: {
  starter: Starter;
  installed: boolean;
  onInstall: (s: Starter) => void;
}) {
  const hour12 = useStore((s) => s.hour12);
  const weekStart = useStore((s) => s.profile?.week_start ?? 1);
  const shown = starter.items.slice(0, 4);
  const rest = starter.items.length - shown.length;

  const vars = React.useMemo(() => collectVars(starter.items).user, [starter.items]);
  const conditional = starter.items.filter((i) => hasRule(i.rule)).length;

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
          <p className="truncate text-[13.5px] font-semibold tracking-[-0.01em] text-ink">{starter.name}</p>
          <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-3">{starter.description}</p>
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <Badge tint={starter.color} dot>{SCOPE_LABELS[starter.scope]}</Badge>
        <span className="text-[11.5px] text-ink-3 tnum">{plural(starter.items.length, "item")}</span>
        {vars.length > 0 && (
          <span
            className="inline-flex items-center gap-1 text-[11.5px] text-ink-3"
            title={`Asks for ${vars.map((v) => `{{${v}}}`).join(", ")} when applied`}
          >
            <Braces className="size-3" aria-hidden />
            {vars.length}
          </span>
        )}
        {conditional > 0 && (
          <span
            className="inline-flex items-center gap-1 text-[11.5px] text-ink-3"
            title={`${conditional} items only appear on the right day`}
          >
            <Filter className="size-3" aria-hidden />
            {conditional}
          </span>
        )}
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

      <div className="mt-3 flex items-center gap-2">
        <Button size="sm" variant={installed ? "ghost" : "secondary"} onClick={() => onInstall(starter)}>
          <Plus className="size-3.5" />
          {installed ? "Add another copy" : "Add to my templates"}
        </Button>
        {installed && (
          <span className="inline-flex items-center gap-1 text-[11.5px] text-success">
            <Check className="size-3" aria-hidden />
            Added
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Starters are plain data until installed — the button writes a real row, so an
 * added starter is indistinguishable from one built by hand.
 */
export function StarterGallery({
  onInstalled, columns = 4, heading = true,
}: {
  onInstalled: (t: Template) => void;
  columns?: 2 | 3 | 4;
  heading?: boolean;
}) {
  const templates = useStore((s) => s.templates);
  const insert = useStore((s) => s.insert);
  const toast = useStore((s) => s.toast);
  const [filter, setFilter] = React.useState<Filter>("all");

  const installedNames = React.useMemo(
    () => new Set(templates.map((t) => t.name.trim().toLowerCase())),
    [templates],
  );

  const visible = filter === "all" ? STARTERS : STARTERS.filter((s) => s.category === filter);

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

  function installVisible() {
    const base = nextOrder(templates);
    const fresh = visible.filter((s) => !installedNames.has(s.name.trim().toLowerCase()));
    const list = fresh.length ? fresh : visible;
    list.forEach((s, i) => install(s, base + i));
    toast({
      title: `${plural(list.length, "template")} added`,
      description: "Edit them freely — they are ordinary rows now.",
      tone: "success",
    });
  }

  return (
    <section>
      <div className="mb-2.5 flex flex-wrap items-center gap-2">
        {heading && (
          <>
            <Sparkles className="size-3.5 text-ink-3" />
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">
              Start with one of these
            </h2>
          </>
        )}
        <Segmented
          size="sm"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all" as Filter, label: "All" },
            ...STARTER_CATEGORIES.filter((c) => STARTERS.some((s) => s.category === c))
              .map((c) => ({ value: c as Filter, label: c })),
          ]}
        />
        <div className="flex-1" />
        <Button size="sm" variant="secondary" onClick={installVisible}>
          {filter === "all" ? `Add all ${STARTERS.length}` : "Add all shown"}
        </Button>
      </div>

      <div
        className={cn(
          "grid gap-3 sm:grid-cols-2",
          columns === 4 && "xl:grid-cols-4",
          columns === 3 && "xl:grid-cols-3",
        )}
      >
        {visible.map((starter) => (
          <StarterCard
            key={starter.name}
            starter={starter}
            installed={installedNames.has(starter.name.trim().toLowerCase())}
            onInstall={installOne}
          />
        ))}
      </div>
    </section>
  );
}

/** The same gallery, reachable from the page header at any time. */
export function StartersModal({
  open, onClose, onInstalled,
}: {
  open: boolean;
  onClose: () => void;
  onInstalled: (t: Template) => void;
}) {
  return (
    <Modal open={open} onClose={onClose} width={980} title="Starter templates">
      <div className="max-h-[74vh] overflow-y-auto p-4">
        <p className="mb-3 max-w-[70ch] text-[12.5px] leading-relaxed text-ink-3">
          {STARTERS.length} plans that already work. Adding one writes an ordinary template you can rip apart —
          several of them show off variables you fill in at apply time and conditions that keep an item
          off the wrong day.
        </p>
        <StarterGallery
          onInstalled={(t) => { onInstalled(t); onClose(); }}
          columns={3}
          heading={false}
        />
      </div>
    </Modal>
  );
}
