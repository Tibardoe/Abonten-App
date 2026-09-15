// Abonten Hub web push service worker (registered by useWebPush.ts only when
// someone turns on browser notifications in Settings › Notifications).
// It does nothing but show pushes and open them: no caching, no fetch
// handler, so it can never serve a stale page.
//
// Payload (sent by @abonten/services/notifications/webPushCore):
//   { title, body?, link?, notificationId? }
// A click opens /notifications/open, which marks the notice read for the
// signed-in owner and redirects to `link` (a path on this site).

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: event.data ? event.data.text() : "" };
  }

  const title =
    typeof data.title === "string" && data.title ? data.title : "Abonten Hub";
  const link =
    typeof data.link === "string" &&
    data.link.startsWith("/") &&
    !data.link.startsWith("//")
      ? data.link
      : "/";
  const id = typeof data.notificationId === "string" ? data.notificationId : "";
  const url = id
    ? `/notifications/open?id=${encodeURIComponent(id)}&to=${encodeURIComponent(link)}`
    : link;

  event.waitUntil(
    self.registration.showNotification(title, {
      body: typeof data.body === "string" ? data.body : undefined,
      icon: "/assets/images/abonten-logo.svg",
      tag: id || undefined,
      data: { url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(
    event.notification.data?.url || "/",
    self.location.origin,
  );
  if (target.origin !== self.location.origin) return;

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      // A new tab, so nothing half-done in an open tab is navigated away.
      for (const client of windows) {
        if (client.url === target.href && "focus" in client) {
          return client.focus();
        }
      }
      return self.clients.openWindow(target.href);
    })(),
  );
});
