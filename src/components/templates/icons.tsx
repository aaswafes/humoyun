"use client";

import * as React from "react";
import {
  LayoutTemplate, Sun, Sunrise, Moon, Brain, BookOpen, Target, Flame, Timer,
  RotateCcw, CalendarDays, ListChecks, Coffee, Dumbbell, Briefcase,
  GraduationCap, PenLine, Sparkles, Zap, Heart, Wallet, Plane, Users, Music,
} from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * `Template.icon` is a free string in the schema, so it is resolved through this
 * registry rather than imported dynamically — unknown names fall back gracefully.
 */
export const TEMPLATE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  "layout-template": LayoutTemplate,
  sun: Sun,
  sunrise: Sunrise,
  moon: Moon,
  brain: Brain,
  "book-open": BookOpen,
  "graduation-cap": GraduationCap,
  target: Target,
  flame: Flame,
  timer: Timer,
  "rotate-ccw": RotateCcw,
  "calendar-days": CalendarDays,
  "list-checks": ListChecks,
  "pen-line": PenLine,
  coffee: Coffee,
  dumbbell: Dumbbell,
  briefcase: Briefcase,
  sparkles: Sparkles,
  zap: Zap,
  heart: Heart,
  wallet: Wallet,
  plane: Plane,
  users: Users,
  music: Music,
};

export const TEMPLATE_ICON_NAMES = Object.keys(TEMPLATE_ICONS);

export function TemplateIcon({ name, className }: { name: string; className?: string }) {
  const Icon = TEMPLATE_ICONS[name] ?? LayoutTemplate;
  return <Icon className={className} />;
}

export function IconPicker({
  value, onChange,
}: {
  value: string;
  onChange: (name: string) => void;
}) {
  return (
    <div className="grid grid-cols-8 gap-0.5 p-1">
      {TEMPLATE_ICON_NAMES.map((name) => (
        <button
          key={name}
          type="button"
          onClick={() => onChange(name)}
          aria-label={name.replace(/-/g, " ")}
          title={name.replace(/-/g, " ")}
          className={cn(
            "grid size-7 place-items-center rounded-md cursor-pointer",
            "transition-[background-color,color,transform] duration-150 ease-[var(--ease-out-apple)] active:scale-[0.9]",
            value === name ? "bg-accent-soft text-accent" : "text-ink-3 hover:bg-hover hover:text-ink",
          )}
        >
          <TemplateIcon name={name} className="size-4" />
        </button>
      ))}
    </div>
  );
}
