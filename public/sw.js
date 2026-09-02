const CACHE_VERSION = "gin-jia-pos-shell-v1";
const APP_SHELL = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/css/tailwind.generated.css",
  "/css/app.css",
  "/js/runtime-config.js",
  "/js/rpc-bridge.js",
  "/js/app.js",
  "/js/pwa.js",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Authentication, Functions and business records are intentionally never
  // cached by this worker. Only immutable same-origin application assets are.
  if (url.pathname.startsWith("/__/auth/") || url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/index.html")));
    return;
  }
  if (!APP_SHELL.includes(url.pathname)) return;
  event.respondWith(
    fetch(request).then((response) => {
      if (response.ok) caches.open(CACHE_VERSION).then((cache) => cache.put(request, response.clone()));
      return response;
    }).catch(() => caches.match(request)),
  );
});
