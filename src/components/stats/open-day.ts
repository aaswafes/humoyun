"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";

/**
 * "Show me that day." Every dated point on this page can be activated, and they
 * all land in the same place — the calendar, opened on the day itself.
 */
export function useOpenDay(): (iso: string) => void {
  const router = useRouter();
  const setSelectedDate = useStore((s) => s.setSelectedDate);
  const setCalendarView = useStore((s) => s.setCalendarView);

  return React.useCallback(
    (iso: string) => {
      setSelectedDate(iso);
      setCalendarView("day");
      router.push("/calendar");
    },
    [router, setSelectedDate, setCalendarView],
  );
}
