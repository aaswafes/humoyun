"use client";

import * as React from "react";
import { Bell, BellOff, BellRing, CheckCircle2, Clock, MoonStar } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import { addDays, formatTime, startOfWeek, todayISO } from "@/lib/date";
import { prayerTimesFor } from "@/lib/prayer";
import { PRAYER_LABELS, PRAYER_NAMES } from "@/lib/types";
import { buildLogIndex, habitScheduledOn, isHabitComplete } from "@/lib/habits";
import { useNow } from "@/hooks/use-hotkeys";
import { Badge, Button } from "@/components/ui/primitives";
import { Select } from "@/components/ui/form";
import { Callout, Group, Pane, Row, TimeField, ToggleRow } from "./ui";
import {
  DEFAULT_NOTIFICATION_PREFS,
  inQuietHours,
  permissionServerSnapshot,
  permissionSnapshot,
  readNotificationPrefs,
  requestNotificationPermission,
  sendTestNotification,
  startReminders,
  subscribePermission,
  writeNotificationPrefs,
  type NotificationPrefs,
} from "./reminders";

const LEAD_OPTIONS = (max: number) =>
  [0, 5, 10, 15, 20, 30, 45, 60]
    .filter((m) => m <= max)
    .map((m) => ({ value: String(m), label: m === 0 ? "Don't remind me" : `${m} minutes before` }));

const WEEKLY_REVIEW_MINUTE = 18 * 60;

interface Upcoming {
  at: number;
  title: string;
  detail: string;
  tint: "blue" | "teal" | "violet" | "emerald" | "amber";
}

export function NotificationsSection() {
  const profile = useStore((s) => s.profile);
  const hour12 = useStore((s) => s.hour12);
  const tasks = useStore((s) => s.tasks);
  const habits = useStore((s) => s.habits);
  const habitLogs = useStore((s) => s.habitLogs);
  const reviews = useStore((s) => s.reviews);
  const toast = useStore((s) => s.toast);

  const now = useNow(20_000);
  // The browser owns this value and can change it from its own settings while
  // the tab is open, so it is read as an external store, not copied into state.
  const permission = React.useSyncExternalStore(
    subscribePermission, permissionSnapshot, permissionServerSnapshot,
  );

  const prefs = React.useMemo<NotificationPrefs>(
    () => readNotificationPrefs(profile?.prefs as Record<string, unknown> | undefined),
    [profile?.prefs],
  );

  const nowDate = new Date(now);
  const minutesNow = nowDate.getHours() * 60 + nowDate.getMinutes();
  const today = todayISO();
  const quietRightNow = inQuietHours(minutesNow, prefs.quietFrom, prefs.quietTo);

  function set(changes: Partial<NotificationPrefs>) {
    writeNotificationPrefs(changes);
    startReminders();
  }

  async function enable() {
    const next = await requestNotificationPermission();
    if (next === "granted") {
      set({ enabled: true });
      toast({ title: "Reminders on", description: "They arrive while Humoyun is open in a tab.", tone: "success" });
    } else if (next === "denied") {
      toast({
        title: "The browser said no",
        description: "Allow notifications for this site in your browser settings, then try again.",
        tone: "danger",
      });
    }
  }

  // ---- what would actually fire, from here to midnight ----
  const upcoming = React.useMemo<Upcoming[]>(() => {
    if (!profile || !prefs.enabled) return [];
    const out: Upcoming[] = [];

    if (prefs.taskLead > 0) {
      for (const t of tasks) {
        if (t.date !== today || t.start_min == null) continue;
        if (t.status === "done" || t.status === "dropped") continue;
        const at = t.start_min - prefs.taskLead;
        if (at < minutesNow) continue;
        out.push({
          at,
          title: t.title,
          detail: `${prefs.taskLead} min before ${formatTime(t.start_min, hour12)}`,
          tint: "blue",
        });
      }
    }

    if (prefs.prayerLead > 0) {
      const times = prayerTimesFor(today, {
        latitude: profile.latitude,
        longitude: profile.longitude,
        method: profile.calc_method,
        madhab: profile.madhab,
      });
      for (const name of PRAYER_NAMES) {
        const at = times[name] - prefs.prayerLead;
        if (at < minutesNow) continue;
        out.push({
          at,
          title: PRAYER_LABELS[name],
          detail: `${prefs.prayerLead} min before ${formatTime(times[name], hour12)}`,
          tint: "teal",
        });
      }
    }

    if (prefs.dailyPlan != null && prefs.dailyPlan >= minutesNow) {
      const open = tasks.filter((t) => t.date === today && !t.parent_id && t.status === "todo").length;
      out.push({ at: prefs.dailyPlan, title: "Today's plan", detail: `${open} open right now`, tint: "violet" });
    }

    if (prefs.habitNudge != null && prefs.habitNudge >= minutesNow) {
      const index = buildLogIndex(habitLogs);
      const weekStart = profile.week_start ?? 1;
      const open = habits.filter((h) => {
        const counts = index.get(h.id) ?? new Map<string, number>();
        return habitScheduledOn(h, today, counts, weekStart) && !isHabitComplete(h, counts.get(today));
      }).length;
      if (open > 0) {
        out.push({
          at: prefs.habitNudge,
          title: open === 1 ? "One habit left" : `${open} habits left`,
          detail: "Only sent if any are still open",
          tint: "emerald",
        });
      }
    }

    if (prefs.weeklyReview && WEEKLY_REVIEW_MINUTE >= minutesNow) {
      const weekStart = startOfWeek(today, profile.week_start ?? 1);
      if (today === addDays(weekStart, 6)) {
        const review = reviews.find((r) => r.week_start === weekStart);
        const written = review && (review.went_well || review.went_bad || review.learned || review.next_week);
        if (!written) {
          out.push({ at: WEEKLY_REVIEW_MINUTE, title: "Weekly review", detail: "The week closes tonight", tint: "amber" });
        }
      }
    }

    return out
      .filter((u) => !inQuietHours(u.at, prefs.quietFrom, prefs.quietTo))
      .sort((a, b) => a.at - b.at)
      .slice(0, 6);
  }, [profile, prefs, tasks, habits, habitLogs, reviews, today, minutesNow, hour12]);

  const granted = permission === "granted";
  const live = granted && prefs.enabled;

  return (
    <Pane
      title="Notifications"
      description="Reminders come from your browser and are worked out on this device — no server, no push service, nothing sent anywhere. They run in the tab you are in, so nothing arrives while Humoyun is closed."
    >
      {/* ---- permission ---- */}
      <div
        className={cn(
          "mb-5 flex items-start gap-3.5 rounded-lg border p-4",
          live ? "border-accent-line bg-accent-soft" : "border-line bg-sunken",
        )}
      >
        <div
          className={cn(
            "mt-px grid size-8 shrink-0 place-items-center rounded-lg",
            live ? "bg-accent text-accent-ink" : "bg-hover text-ink-3",
          )}
        >
          {live ? <BellRing className="size-4" /> : <BellOff className="size-4" />}
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-medium text-ink">
            {permission === "unsupported"
              ? "This browser cannot show notifications"
              : permission === "denied"
                ? "Notifications are blocked for this site"
                : live
                  ? "Reminders are on"
                  : granted
                    ? "Permission granted — reminders are switched off"
                    : "Reminders are off"}
          </p>
          <p className="mt-1 max-w-[52ch] text-[12.5px] leading-relaxed text-ink-3">
            {permission === "unsupported"
              ? "Everything else on this page still works — you just will not get anything popping up outside the tab."
              : permission === "denied"
                ? "Open your browser's site settings for this page, set notifications back to Ask or Allow, then reload."
                : live
                  ? quietRightNow
                    ? "Quiet hours are running right now, so nothing will fire until they end."
                    : "They fire from this tab, background or not, and keep firing as you move around the app."
                  : "Turn them on to be told before a timed task, before each prayer, and when the day still has habits open."}
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {!granted && permission !== "denied" && permission !== "unsupported" && (
              <Button variant="primary" size="sm" onClick={enable}>
                <Bell className="size-3.5" />
                Turn reminders on
              </Button>
            )}
            {granted && (
              <Button
                size="sm"
                onClick={() => {
                  if (sendTestNotification()) toast({ title: "Sent", description: "Check the corner of your screen.", tone: "success" });
                  else toast({ title: "Nothing came through", description: "Your browser refused to show it.", tone: "danger" });
                }}
              >
                <BellRing className="size-3.5" />
                Send a test
              </Button>
            )}
            {live && (
              <span className="inline-flex items-center gap-1.5 text-[12px] text-success">
                <CheckCircle2 className="size-3.5" />
                Running in this tab
              </span>
            )}
          </div>
        </div>
      </div>

      {granted && (
        <>
          <ToggleRow
            checked={prefs.enabled}
            onChange={(v) => set({ enabled: v })}
            label="Reminders"
            description="The master switch. Everything below is ignored while this is off."
          />

          {prefs.enabled && (
            <>
              <Group title="What to remind me about">
                <Row
                  label="Before a timed task"
                  hint="Only tasks with a start time on today's calendar, and only ones that are not done yet."
                >
                  <div className="w-[212px]">
                    <Select
                      label="Task reminder lead time"
                      value={String(prefs.taskLead)}
                      options={LEAD_OPTIONS(60)}
                      onChange={(v) => set({ taskLead: Number(v) })}
                      align="end"
                    />
                  </div>
                </Row>

                <Row
                  label="Before each prayer"
                  hint="Worked out from your coordinates on the Salah page. Change the city there and these move with it."
                >
                  <div className="w-[212px]">
                    <Select
                      label="Prayer reminder lead time"
                      value={String(prefs.prayerLead)}
                      options={LEAD_OPTIONS(30)}
                      onChange={(v) => set({ prayerLead: Number(v) })}
                      align="end"
                    />
                  </div>
                </Row>

                <Row
                  label="The morning plan"
                  hint="One summary of what the day holds, so it is not a surprise at eleven."
                >
                  <div className="flex items-center gap-2">
                    {prefs.dailyPlan != null && (
                      <TimeField
                        key={`plan-${prefs.dailyPlan}-${hour12}`}
                        value={prefs.dailyPlan}
                        onChange={(v) => set({ dailyPlan: v })}
                        hour12={hour12}
                        label="Morning plan time"
                      />
                    )}
                    <Button
                      size="sm"
                      onClick={() => set({ dailyPlan: prefs.dailyPlan == null ? DEFAULT_NOTIFICATION_PREFS.dailyPlan : null })}
                    >
                      {prefs.dailyPlan == null ? "Turn on" : "Turn off"}
                    </Button>
                  </div>
                </Row>

                <Row
                  label="Habits still open"
                  hint="An evening nudge, and only when something is genuinely still open."
                >
                  <div className="flex items-center gap-2">
                    {prefs.habitNudge != null && (
                      <TimeField
                        key={`habit-${prefs.habitNudge}-${hour12}`}
                        value={prefs.habitNudge}
                        onChange={(v) => set({ habitNudge: v })}
                        hour12={hour12}
                        label="Habit nudge time"
                      />
                    )}
                    <Button
                      size="sm"
                      onClick={() => set({ habitNudge: prefs.habitNudge == null ? DEFAULT_NOTIFICATION_PREFS.habitNudge : null })}
                    >
                      {prefs.habitNudge == null ? "Turn on" : "Turn off"}
                    </Button>
                  </div>
                </Row>

                <ToggleRow
                  checked={prefs.weeklyReview}
                  onChange={(v) => set({ weeklyReview: v })}
                  label="Weekly review"
                  description={`At ${formatTime(WEEKLY_REVIEW_MINUTE, hour12)} on the last day of your week, if the review is still blank.`}
                />
              </Group>

              <Group
                title="Quiet hours"
                description="Nothing fires between these two times. The window may run past midnight."
              >
                <Row
                  label="Silence from"
                  hint={
                    quietRightNow
                      ? "Quiet hours are running right now."
                      : `Currently ${formatTime(minutesNow, hour12)} — outside the quiet window.`
                  }
                >
                  <div className="flex items-center gap-2">
                    <TimeField
                      key={`qf-${prefs.quietFrom}-${hour12}`}
                      value={prefs.quietFrom}
                      onChange={(v) => set({ quietFrom: v })}
                      hour12={hour12}
                      label="Quiet hours start"
                    />
                    <span className="text-[13px] text-ink-4">to</span>
                    <TimeField
                      key={`qt-${prefs.quietTo}-${hour12}`}
                      value={prefs.quietTo}
                      onChange={(v) => set({ quietTo: v })}
                      hour12={hour12}
                      label="Quiet hours end"
                    />
                  </div>
                </Row>

                <ToggleRow
                  checked={!prefs.silent}
                  onChange={(v) => set({ silent: !v })}
                  label="Play a sound"
                  description="Some systems ignore this and always use their own notification sound."
                />
              </Group>

              <Group
                title="Coming up today"
                description="Exactly what these settings would send between now and midnight."
              >
                {upcoming.length ? (
                  <ul className="mt-1 space-y-px">
                    {upcoming.map((u, i) => (
                      <li
                        key={`${u.at}-${u.title}-${i}`}
                        className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-hover"
                      >
                        <span className="w-[68px] shrink-0 text-[12.5px] text-ink-2 tnum">
                          {formatTime(u.at, hour12)}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{u.title}</span>
                        <Badge tint={u.tint}>{u.detail}</Badge>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <Callout tone="info" className="mt-1">
                    Nothing left today. Either everything has already fired, the rest falls inside quiet
                    hours, or there is nothing on the calendar with a time on it.
                  </Callout>
                )}
              </Group>
            </>
          )}
        </>
      )}

      {!granted && permission !== "unsupported" && (
        <Callout
          tone="info"
          title="Why the browser has to ask"
          className="mt-1"
        >
          A page cannot show a notification until you say yes once. Nothing is configured, stored or sent
          before that — the settings below appear as soon as permission is granted.
        </Callout>
      )}

      <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line pt-4 text-[12px] text-ink-3">
        <span className="inline-flex items-center gap-1.5">
          <Clock className="size-3.5" />
          Checked every 30 seconds
        </span>
        <span className="inline-flex items-center gap-1.5">
          <MoonStar className="size-3.5" />
          Prayer times calculated on this device
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Bell className="size-3.5" />
          Each reminder is sent once a day at most
        </span>
      </div>

      <p className="mt-2 max-w-[62ch] text-[11.5px] leading-relaxed text-ink-4">
        The reminder loop lives in the browser tab. Moving between pages keeps it running; reloading the
        page stops it until you open this pane again. There is no background service and no push server,
        which is also why none of this needs an account.
      </p>
    </Pane>
  );
}
