const CACHE_NAME = "desktop-control-v0.1.23";
const ASSETS = [
  "/",
  "/index.html",
  "/admin.html",
  "/sender.html",
  "/styles.css",
  "/app.js",
  "/admin.js",
  "/sender.js",
  "/manifest.webmanifest",
  "/icon.svg",
  "/art/cyan.svg",
  "/art/mint.svg",
  "/art/pink.svg",
  "/art/sun.svg",
  "/art/future.jpeg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET") return;
  if (url.pathname.startsWith("/api/")) return;

  event.respondWith(
    fetch(event.request).then((response) => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
      }
      return response;
    }).catch(() => {
      return caches.match(event.request);
    })
  );
});
