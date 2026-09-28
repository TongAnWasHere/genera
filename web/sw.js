const cache_name = "genera-v6";

const app_shell_assets = [
  "/",
  "/index.html",
  "/favicon.ico",
  "/favicon-32x32.png",
  "/favicon-16x16.png",
  "/apple-touch-icon.png",
  "/android-chrome-192x192.png",
  "/android-chrome-512x512.png",
  "/site.webmanifest",
  "/css/style.css",
  "/js/app.js",
  "/js/cards.js",
  "/js/importer.js",
  "/js/localdb.js",
  "/js/review.js",
  "/js/scheduler.js",
  "/js/session.js",
  "/js/settings.js",
  "/js/sync.js",
  "/js/theme.js",
  "/data/catalog.json",
  "/data/catalog-manifest.json"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(cache_name).then((cache) => {
      return cache.addAll(app_shell_assets);
    }).then(() => {
      return self.skipWaiting();
    })
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== cache_name) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => {
      return self.clients.claim();
    })
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  const url = new URL(event.request.url);

  if (url.pathname.startsWith("/api/")) {
    return;
  }

  if (url.pathname === "/data/catalog-manifest.json") {
    event.respondWith(
      fetch(event.request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(cache_name).then((cache) => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        return caches.match(event.request);
      })
    );
    return;
  }

  if (event.request.mode === "navigate") {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        return cached || caches.match("/index.html") || caches.match("/");
      }).catch(() => {
        return caches.match("/index.html");
      })
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        return cached;
      }
      return fetch(event.request).then((response) => {
        if (response && response.status === 200 && response.type === "basic") {
          const clone = response.clone();
          caches.open(cache_name).then((cache) => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});