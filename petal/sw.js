// Offline helper for Petal Planner.
//
// Keeps a copy of the app page so it still opens with no signal. The page always
// comes from the network first when there is a connection, so updates show up
// straight away; the saved copy is only used when the network can't be reached.
// Planner data is never cached here: it lives in the page's own storage and on
// the server, and /api requests always go to the network.

const CACHE = "petal-shell-v1";
const SHELL = ["/", "/manifest.webmanifest", "/icon.svg", "/icon-180.png", "/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).catch(() => {}).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname === "/login" || url.pathname === "/logout") return;

  const isPage = request.mode === "navigate";
  if (!isPage && !SHELL.includes(url.pathname)) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        // only keep real copies of the app, never the sign-in page a signed-out device is sent to
        if (response.ok && !response.redirected) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(isPage ? "/" : request, copy));
        }
        return response;
      })
      .catch(() => caches.match(isPage ? "/" : request).then((hit) => hit || Response.error()))
  );
});
