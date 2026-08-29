"use client";

import * as React from "react";
import {
  Target, Flag, Rocket, Mountain, Sprout, Trophy, Heart, Brain, BookOpen,
  Dumbbell, Wallet, Users, Compass, Sparkles, Moon, Code, Briefcase, Palette, X,
} from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * A small curated set. A goal wants a glyph that says what kind of thing it is,
 * not a search box over two thousand icons.
 */
export const GOAL_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  target: Target, flag: Flag, rocket: Rocket, mountain: Mountain, sprout: Sprout,
  trophy: Trophy, heart: Heart, brain: Brain, book: BookOpen, dumbbell: Dumbbell,
  wallet: Wallet, users: Users, compass: Compass, sparkles: Sparkles, moon: Moon,
  code: Code, briefcase: Briefcase, palette: Palette,
};

export function GoalIcon({
  name, className,
}: {
  name: string | null | undefined;
  className?: string;
}) {
  const Icon = (name && GOAL_ICONS[name]) || null;
  if (!Icon) return null;
  return <Icon className={className} />;
}

export function GoalIconPicker({
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
      {Object.entries(GOAL_ICONS).map(([name, Icon]) => (
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
