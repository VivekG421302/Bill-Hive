// ===================== BILL-HIVE SERVICE WORKER v4.04.7 =====================
// Strategy: network-first for all app files so updates always reach the user.
// Cache is used only as fallback when offline.

const CACHE_NAME = 'billhive-v4.6.0';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/brands.html',
  '/suppliers.html',
  '/fulfillment.html',
  '/catalogue.html',
  '/script.js',
  '/styles.css',
  '/manifest.json',
  '/favicon.svg'
];

// Install: pre-cache everything fresh from network, then activate immediately
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache =>
        Promise.allSettled(
          STATIC_ASSETS.map(url =>
            fetch(new Request(url, { cache: 'no-store' }))
              .then(res => { if (res.ok) cache.put(url, res); })
              .catch(() => {})
          )
        )
      )
      .then(() => self.skipWaiting())   // activate new SW immediately, don't wait for tabs to close
  );
});

// Activate: delete every old cache, then take control of all open tabs now
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(names =>
        Promise.all(names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n)))
      )
      .then(() => self.clients.claim())  // take control without reload
  );
});

// Fetch: NETWORK-FIRST for same-origin assets
// → always tries to pull fresh copy from server
// → falls back to cache only when offline
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // External resources (fonts) — cache-first is fine, they never change
  if (
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com')
  ) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(res => {
          if (res && res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(c => c.put(request, clone));
          }
          return res;
        });
      })
    );
    return;
  }

  // Same-origin assets: NETWORK-FIRST
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(request, { cache: 'no-store' })           // always fetch fresh
        .then(res => {
          if (res && res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(c => c.put(request, clone)); // update cache
          }
          return res;
        })
        .catch(() =>
          // Offline: serve from cache
          caches.match(request).then(cached =>
            cached || (request.mode === 'navigate' ? caches.match('/index.html') : null)
          )
        )
    );
    return;
  }
});
