"use client";

import { createElement, type ComponentType } from "react";
import {
  Check, Dumbbell, BookOpen, NotebookPen, GlassWater, Salad, Moon, Sunrise,
  Brain, Footprints, Bike, Waves, Mountain, Leaf, Coffee, Music, Code,
  Languages, Heart, Timer, Sparkles, Wallet, Bed, Smile,
} from "lucide-react";

type IconComponent = ComponentType<{ className?: string }>;

/** A small curated set — enough to make a habit recognisable at a glance,
 *  small enough to scan in one grid. `key` is what lands in `habits.icon`. */
export const HABIT_ICONS: { key: string; label: string; Icon: IconComponent }[] = [
  { key: "check", label: "Check", Icon: Check },
  { key: "dumbbell", label: "Workout", Icon: Dumbbell },
  { key: "footprints", label: "Walk", Icon: Footprints },
  { key: "bike", label: "Ride", Icon: Bike },
  { key: "waves", label: "Swim", Icon: Waves },
  { key: "mountain", label: "Climb", Icon: Mountain },
  { key: "book-open", label: "Read", Icon: BookOpen },
  { key: "notebook-pen", label: "Write", Icon: NotebookPen },
  { key: "languages", label: "Language", Icon: Languages },
  { key: "code", label: "Code", Icon: Code },
  { key: "brain", label: "Study", Icon: Brain },
  { key: "music", label: "Music", Icon: Music },
  { key: "glass-water", label: "Water", Icon: GlassWater },
  { key: "salad", label: "Eat well", Icon: Salad },
  { key: "coffee", label: "Coffee", Icon: Coffee },
  { key: "bed", label: "Sleep", Icon: Bed },
  { key: "sunrise", label: "Early rise", Icon: Sunrise },
  { key: "moon", label: "Night", Icon: Moon },
  { key: "heart", label: "Health", Icon: Heart },
  { key: "smile", label: "Mood", Icon: Smile },
  { key: "leaf", label: "Calm", Icon: Leaf },
  { key: "sparkles", label: "Tidy", Icon: Sparkles },
  { key: "timer", label: "Deep work", Icon: Timer },
  { key: "wallet", label: "Money", Icon: Wallet },
];

const BY_KEY = new Map(HABIT_ICONS.map((i) => [i.key, i.Icon]));

export function HabitIcon({ name, className }: { name: string; className?: string }) {
  // createElement, not JSX: the icon is looked up by key, and a capitalised
  // local in JSX reads to the compiler as a component defined during render.
  return createElement(BY_KEY.get(name) ?? Check, { className });
}
