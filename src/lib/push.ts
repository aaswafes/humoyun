"use client";

import { supabase } from "./supabase/client";

// =========================================================
// Web push, browser side.
//
// `reminders.ts` can only fire while a tab is open — it says so in its own
// comment, and a Fajr reminder that needs an open tab is not a reminder.
// This is the other half: the browser holds a subscription, the server holds
// the private half of the VAPID pair, and a notification arrives whether or
// not Humoyun is on screen.
//
// The subscription row is written under RLS as the signed-in user, exactly
// like every other table. The endpoint is unique, so the same browser
// re-subscribing replaces its own row rather than collecting duplicates.
// =========================================================

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

export type PushState =
  | "unsupported"     // no service worker or no Push API
  | "unconfigured"    // no VAPID public key was built in
  | "denied"          // the browser has been told no, permanently
  | "off"
  | "on";

export function pushSupported(): boolean {
  return typeof window !== "undefined"
    && "serviceWorker" in navigator
    && "PushManager" in window
    && "Notification" in window;
}

/** base64url → the Uint8Array PushManager wants for applicationServerKey. */
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!pushSupported()) return null;
  try {
    // `ready` resolves only once a worker is actually controlling the page.
    return await navigator.serviceWorker.ready;
  } catch {
    return null;
  }
}

export async function pushState(): Promise<PushState> {
  if (!pushSupported()) return "unsupported";
  if (!VAPID_PUBLIC_KEY) return "unconfigured";
  if (Notification.permission === "denied") return "denied";
  const reg = await registration();
  if (!reg) return "off";
  const sub = await reg.pushManager.getSubscription();
  return sub ? "on" : "off";
}

/** Ask, subscribe, and store. Returns the state the UI should now show. */
export async function enablePush(userId: string): Promise<PushState> {
  if (!pushSupported()) return "unsupported";
  if (!VAPID_PUBLIC_KEY) return "unconfigured";

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "denied" : "off";

  const reg = await registration();
  if (!reg) return "off";

  const existing = await reg.pushManager.getSubscription();
  const sub = existing ?? await reg.pushManager.subscribe({
    // Required by every current browser: a push without a payload key is
    // refused outright.
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
  });

  const json = sub.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return "off";

  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: userId,
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
      user_agent: navigator.userAgent.slice(0, 300),
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "endpoint" },
  );
  if (error) return "off";

  return "on";
}

/** Unsubscribe this browser and forget its row. Other devices are untouched. */
export async function disablePush(): Promise<PushState> {
  const reg = await registration();
  if (!reg) return "off";
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return "off";

  const endpoint = sub.endpoint;
  await sub.unsubscribe().catch(() => {});
  // Delete after unsubscribing: a row without a live subscription is just a
  // send that will bounce.
  await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  return "off";
}
