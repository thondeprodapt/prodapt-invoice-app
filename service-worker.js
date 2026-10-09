const cacheName = "prodapt-invoice-studio-v24";
const files = [
  "./",
  "./index.html",
  "./items-csv.html",
  "./styles.css?v=20261009-toner-catalog",
  "./app.js?v=20261009-toner-catalog",
  "./sync-core.js?v=20261009-toner-catalog",
  "./sync.js?v=20261009-toner-catalog",
  "./customers-import.js?v=20261009-toner-catalog",
  "./wave-items.js?v=20261009-toner-catalog",
  "./toner-catalog.js?v=20261009-toner-catalog",
  "./wave-products-import.csv",
  "./prodapt-logo.png",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png",
  "./manifest.json"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(cacheName)
      .then((cache) => cache.addAll(files))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== cacheName).map((key) => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  if (new URL(event.request.url).origin !== self.location.origin) return;

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() => caches.match("./index.html"))
    );
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(cacheName).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
