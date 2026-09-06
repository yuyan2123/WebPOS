const CACHE_VERSION = "gin-jia-pos-4a12af078039";
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
  "/wasm/pos_domain_bg.wasm",
  "/vendor/air-datepicker.js",
  "/vendor/air-datepicker.css",
  "/vendor/fontawesome/css/all.min.css",
  "/vendor/fontawesome/webfonts/fa-solid-900.woff2",
  "/vendor/fontawesome/webfonts/fa-regular-400.woff2",
  "/vendor/fontawesome/webfonts/fa-brands-400.woff2",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL.map(path => new Request(path, { cache: 'reload' })))));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith('gin-jia-pos-') && key !== CACHE_VERSION).map((key) => caches.delete(key))))
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
    // A controlled page uses one complete release until its waiting update is accepted.
    event.respondWith(caches.open(CACHE_VERSION).then(cache => cache.match('/index.html')).then(cached => cached || fetch(request)));
    return;
  }
  if (!APP_SHELL.includes(url.pathname)) return;
  event.respondWith(
    caches.open(CACHE_VERSION).then(cache => cache.match(url.pathname)).then(cached => cached || fetch(request)),
  );
});
