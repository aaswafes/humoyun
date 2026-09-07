// =========================================================
// push-reminders — the server half of web push.
//
// Runs on a schedule and pushes a reminder for every timed task that is
// about to start. The browser half is `src/lib/push.ts`; the receiving half
// is the `push` handler in `public/sw.js`.
//
// DEDUPLICATION WITHOUT A LOG TABLE. Each run looks at a window that starts
// LEAD_MINUTES from now and is exactly WINDOW_MINUTES wide. As long as the
// cron interval equals WINDOW_MINUTES, every task passes through exactly one
// window, so nothing is sent twice and nothing is skipped. Change one of
// those numbers and you must change the other.
//
// Deploy:
//   supabase functions deploy push-reminders --no-verify-jwt
//   supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:you@example.com
//   supabase secrets set PUSH_CRON_SECRET=...
//
// Schedule (needs pg_cron and pg_net enabled on the project):
//   select cron.schedule(
//     'push-reminders', '*/5 * * * *',
//     $$select net.http_post(
//         url := 'https://<project>.supabase.co/functions/v1/push-reminders',
//         headers := '{"x-cron-secret":"<PUSH_CRON_SECRET>"}'::jsonb
//     )$$
//   );
// =========================================================

import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const LEAD_MINUTES = 10;   // how far ahead of a task to warn
const WINDOW_MINUTES = 5;  // must equal the cron interval

interface TaskRow {
  id: string;
  user_id: string;
  title: string;
  date: string;
  start_min: number;
}

interface SubRow {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** Local wall-clock date and minute-of-day in an IANA zone. */
function localNow(timeZone: string): { date: string; minutes: number } {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    // "24" shows up at midnight in some engines; fold it back to 0.
    minutes: (Number(get("hour")) % 24) * 60 + Number(get("minute")),
  };
}

function hhmm(minutes: number): string {
  const h = String(Math.floor(minutes / 60)).padStart(2, "0");
  const m = String(minutes % 60).padStart(2, "0");
  return `${h}:${m}`;
}

Deno.serve(async (request: Request) => {
  const secret = Deno.env.get("PUSH_CRON_SECRET");
  // Without a secret this is an open trigger, so it stays shut.
  if (!secret) return new Response("not configured", { status: 503 });
  if (request.headers.get("x-cron-secret") !== secret) {
    return new Response("unauthorized", { status: 401 });
  }

  const publicKey = Deno.env.get("VAPID_PUBLIC_KEY");
  const privateKey = Deno.env.get("VAPID_PRIVATE_KEY");
  const subject = Deno.env.get("VAPID_SUBJECT") ?? "mailto:humoyun@example.com";
  if (!publicKey || !privateKey) return new Response("no vapid keys", { status: 503 });
  webpush.setVapidDetails(subject, publicKey, privateKey);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // Only accounts with a live subscription are worth looking at.
  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("id, user_id, endpoint, p256dh, auth");
  const subscriptions = (subs ?? []) as SubRow[];
  if (!subscriptions.length) return Response.json({ sent: 0, reason: "no subscriptions" });

  const userIds = [...new Set(subscriptions.map((s) => s.user_id))];

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, timezone")
    .in("id", userIds);
  const zoneOf = new Map<string, string>(
    (profiles ?? []).map((p: { id: string; timezone: string | null }) =>
      [p.id, p.timezone || "UTC"]),
  );

  let sent = 0;
  const stale: string[] = [];

  for (const userId of userIds) {
    const { date, minutes } = localNow(zoneOf.get(userId) ?? "UTC");
    const from = minutes + LEAD_MINUTES;
    const to = from + WINDOW_MINUTES;

    const { data: rows } = await supabase
      .from("tasks")
      .select("id, user_id, title, date, start_min")
      .eq("user_id", userId)
      .eq("date", date)
      .is("deleted_at", null)
      .not("start_min", "is", null)
      .gte("start_min", from)
      .lt("start_min", to)
      .neq("status", "done")
      .neq("status", "dropped");

    const tasks = (rows ?? []) as TaskRow[];
    if (!tasks.length) continue;

    const mine = subscriptions.filter((s) => s.user_id === userId);

    for (const task of tasks) {
      const payload = JSON.stringify({
        title: task.title || "Untitled",
        body: `Starts at ${hhmm(task.start_min)}`,
        tag: `task-${task.id}`,
        url: "/",
      });

      for (const sub of mine) {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload,
          );
          sent++;
        } catch (err) {
          // 404/410 mean the browser threw the subscription away. Anything
          // else is transient and the row is left alone.
          const code = (err as { statusCode?: number }).statusCode;
          if (code === 404 || code === 410) stale.push(sub.id);
        }
      }
    }
  }

  if (stale.length) await supabase.from("push_subscriptions").delete().in("id", stale);

  return Response.json({ sent, pruned: stale.length });
});
