const CACHE_NAME = 'pguk-timesheet-v1';
const SCOPE = self.registration.scope;

// App shell files change often during updates — always try the network first
// so a redeploy is picked up immediately, and only fall back to the cache
// when the device is offline.
const APP_SHELL = ['', 'index.html', 'css/styles.css', 'js/app.js', 'manifest.json']
  .map(p => new URL(p, SCOPE).toString());

// Vendored libraries and icons rarely change — safe to serve from cache first
// for speed, refreshing the cache in the background.
const STATIC_ASSETS = [
  'js/jspdf.umd.min.js',
  'js/jspdf.plugin.autotable.min.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
].map(p => new URL(p, SCOPE).toString());

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll([...APP_SHELL, ...STATIC_ASSETS]))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = event.request.url;

  if (APP_SHELL.includes(url)) {
    // Network-first: always get the latest version when online.
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Cache-first for static/vendored assets.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      });
    })
  );
});
