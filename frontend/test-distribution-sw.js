const CACHE_NAME = "hkm-test-distribution-v3";
const CORE_ASSETS = [
  "/testdistribution",
  "/test-distribution.html",
  "/styles.css",
  "/config.js",
  "/api.js",
  "/test-distribution.js",
  "/test-distribution.webmanifest"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)).catch(() => null));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  event.respondWith(
    fetch(request).then((response) => {
      if (!response || response.status !== 200 || response.type !== "basic") {
        return response;
      }
      const copy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => null);
      return response;
    }).catch(() => caches.match(request))
  );
});
