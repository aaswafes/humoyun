"use client";

import * as React from "react";
import { weekDates } from "@/lib/date";
import { TimeGrid } from "./time-grid";
import type { DropPreview } from "./calendar-utils";

export function WeekView({
  anchor, weekStart, hour12, preview,
}: {
  anchor: string;
  weekStart: number;
  hour12: boolean;
  preview: DropPreview | null;
}) {
  const dates = React.useMemo(() => weekDates(anchor, weekStart), [anchor, weekStart]);
  return <TimeGrid dates={dates} hour12={hour12} allDay="row" preview={preview} />;
}
