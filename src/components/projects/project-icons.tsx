"use client";

import * as React from "react";
import {
  Boxes, Rocket, Hammer, Code, PenTool, Camera, Megaphone, Wallet, Home,
  GraduationCap, Plane, Sprout, Heart, BookOpen, Users, Bot, Store, X,
} from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * A small curated set. A project wants a glyph that says what kind of work it
 * is, not a search box over two thousand icons.
 */
export const PROJECT_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  boxes: Boxes, rocket: Rocket, hammer: Hammer, code: Code, design: PenTool,
  camera: Camera, launch: Megaphone, money: Wallet, home: Home,
  study: GraduationCap, travel: Plane, sprout: Sprout, heart: Heart,
  book: BookOpen, people: Users, bot: Bot, shop: Store,
};

export function ProjectIcon({
  name, className,
}: {
  name: string | null | undefined;
  className?: string;
}) {
  const Icon = (name && PROJECT_ICONS[name]) || null;
  if (!Icon) return null;
  return <Icon className={className} />;
}

export function ProjectIconPicker({
  value, onChange,
}: {
  value: string | null;
  onChange: (icon: string | null) => void;
}) {
  return (
    <div className="grid grid-cols-6 gap-0.5 p-1">
      <button
        type="button"
        onClick={() => onChange(null)}
        aria-label="No icon"
        title="No icon"
        className={cn(
          "grid size-7 place-items-center rounded-md cursor-pointer transition-colors",
          value == null ? "bg-accent-soft text-accent" : "text-ink-4 hover:bg-hover hover:text-ink-2",
        )}
      >
        <X className="size-3.5" />
      </button>
      {Object.entries(PROJECT_ICONS).map(([name, Icon]) => (
        <button
          key={name}
          type="button"
          onClick={() => onChange(name)}
          aria-label={name}
          title={name}
          className={cn(
            "grid size-7 place-items-center rounded-md cursor-pointer transition-colors",
            value === name ? "bg-accent-soft text-accent" : "text-ink-3 hover:bg-hover hover:text-ink",
          )}
        >
          <Icon className="size-4" />
        </button>
      ))}
    </div>
  );
}
