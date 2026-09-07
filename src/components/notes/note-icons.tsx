"use client";

import * as React from "react";
import {
  BookOpen, Bookmark, Brain, Clapperboard, Compass, Feather, FlaskConical,
  Heart, Lightbulb, MessageSquareQuote, Moon, NotebookPen, Quote, Scale,
  Sparkles, Star, Target, X,
} from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * A curated set, same reasoning as the project icons: a note wants a glyph
 * that says what kind of thinking it holds, not a search box over two
 * thousand icons.
 */
export const NOTE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  note: NotebookPen, idea: Lightbulb, quote: Quote, book: BookOpen,
  bookmark: Bookmark, think: Brain, spark: Sparkles, star: Star,
  target: Target, heart: Heart, moon: Moon, scale: Scale,
  compass: Compass, feather: Feather, lab: FlaskConical,
  film: Clapperboard, talk: MessageSquareQuote,
};

export function NoteIcon({
  name, className,
}: {
  name: string | null | undefined;
  className?: string;
}) {
  const Icon = (name && NOTE_ICONS[name]) || null;
  if (!Icon) return null;
  return <Icon className={className} />;
}

export function NoteIconPicker({
  value, onChange,
}: {
  value: string | null;
  onChange: (icon: string | null) => void;
}) {
  return (
    <div className="grid grid-cols-6 gap-0.5 p-1">
      <button
        type="button"
        aria-label="No icon"
        title="No icon"
        onClick={() => onChange(null)}
        className={cn(
          "grid size-8 place-items-center rounded-md text-ink-3 cursor-pointer",
          "transition-colors duration-120 hover:bg-hover hover:text-ink",
          value === null && "bg-active text-ink",
        )}
      >
        <X className="size-4" />
      </button>

      {Object.entries(NOTE_ICONS).map(([key, Icon]) => (
        <button
          key={key}
          type="button"
          aria-label={key}
          title={key}
          onClick={() => onChange(key)}
          className={cn(
            "grid size-8 place-items-center rounded-md text-ink-2 cursor-pointer",
            "transition-colors duration-120 hover:bg-hover hover:text-ink",
            value === key && "bg-active text-ink",
          )}
        >
          <Icon className="size-4" />
        </button>
      ))}
    </div>
  );
}
