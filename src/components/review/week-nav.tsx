"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { IconButton } from "@/components/ui/primitives";
import { formatWeekRange } from "./metrics";

export function WeekNav({
  weekStart, canGoForward, onPrev, onNext,
}: {
  weekStart: string;
  canGoForward: boolean;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div className="flex items-center gap-0.5">
      <IconButton label="Previous week" onClick={onPrev}>
        <ChevronLeft />
      </IconButton>
      <span className="min-w-[100px] text-center text-[13px] font-medium text-ink tnum">
        {formatWeekRange(weekStart)}
      </span>
      <IconButton
        label={canGoForward ? "Next week" : "The current week is the last one to review"}
        onClick={onNext}
        disabled={!canGoForward}
      >
        <ChevronRight />
      </IconButton>
    </div>
  );
}
