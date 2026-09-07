// =========================================================
// Humoyun's service worker.
//
// Two jobs, and deliberately no third:
//
//  1. Make the app open without a network. Next's build output under
//     /_next/static is content-hashed and therefore immutable, so it is
//     cached on first sight and served from cache forever. Page navigations
//     go to the network first and fall back to the last copy that worked.
//
//  2. Receive push messages and open the right page when one is tapped.
//
// What it deliberately does NOT do is cache anything from Supabase or from
// /api. Those carry account data and auth tokens, a stale copy of either is
// worse than no copy, and writes must never appear to succeed offline when
// nothing was saved. Every one of those requests goes straight to the
// network and is allowed to fail honestly.
// =========================================================

const VERSION = "v1";
const STATIC = `humoyun-static-${VERSION}`;
const PAGES = `humoyun-pages-${VERSION}`;

// The shell is enough to boot the app; everything else arrives as it is used.
const PRECACHE = ["/", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(PAGES)
      // One bad URL must not sink the whole install, so they are added
      // individually and failures are shrugged off.
      .then((cache) => Promise.allSettled(PRECACHE.map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== STATIC && k !== PAGES).map((k) => caches.delete(k)),
      ))
      .then(() => self.clients.claim()),
  );
});

function isImmutableAsset(url) {
  return url.origin === self.location.origin && url.pathname.startsWith("/_next/static/");
}

function isPrivate(url) {
  // Anything that is not this origin is someone else's business — Supabase
  // included. /api carries writes, and auth must never be answered stale.
  return url.origin !== self.location.origin
    || url.pathname.startsWith("/api/")
    || url.pathname.startsWith("/auth/");
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (isPrivate(url)) return;               // straight to the network

  if (isImmutableAsset(url)) {
    event.respondWith(
      caches.match(request).then((hit) => hit || fetch(request).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(STATIC).then((c) => c.put(request, copy));
        }
        return res;
      })),
    );
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(PAGES).then((c) => c.put(request, copy));
          }
          return res;
        })
        // Offline: this page if it has been seen, otherwise the shell, which
        // can at least render the app around whatever it has locally.
        .catch(() => caches.match(request).then((hit) => hit || caches.match("/"))),
    );
  }
});

// ---------------------------------------------------------
// Push
// ---------------------------------------------------------

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: "Humoyun", body: event.data ? event.data.text() : "" };
  }

  const title = payload.title || "Humoyun";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || "",
      // `tag` collapses repeats: a second Asr reminder replaces the first
      // rather than stacking a second copy of the same fact.
      tag: payload.tag || "humoyun",
      data: { url: payload.url || "/" },
      icon: "/icon.svg",
      badge: "/icon.svg",
      silent: !!payload.silent,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/", self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      // Focus a tab that is already open rather than opening a second one.
      for (const client of clients) {
        if (client.url === target && "focus" in client) return client.focus();
      }
      const open = clients.find((c) => "focus" in c);
      if (open) return open.focus().then((c) => (c.navigate ? c.navigate(target) : c));
      return self.clients.openWindow(target);
    }),
  );
});
