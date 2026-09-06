/**
 * CaribClear Service Worker — offline-first PWA brain.
 * - Precaches the app shell + offline page.
 * - GET /api/*  → network-first, falls back to last cached response (read-only offline).
 * - Navigations → network-first, fallback to cache, then /offline.
 * - Static assets (_next/static, icons) → stale-while-revalidate.
 * - Push → notification with deep-link; click focuses/opens the exact URL.
 * - message 'FLUSH_OUTBOX' → retries queued offline mutations.
 */
const VERSION = 'cc-v3';
const SHELL_CACHE = `${VERSION}-shell`;
const RUNTIME_CACHE = `${VERSION}-runtime`;
const API_CACHE = `${VERSION}-api`;

const SHELL_ASSETS = [
  '/',
  '/login',
  '/offline',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-192.png',
  '/icons/icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS.map(u => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter(k => !k.startsWith(VERSION)).map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

function isStaticAsset(url) {
  return (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/logo.svg' ||
    /\.(png|jpg|jpeg|svg|webp|woff2?|ttf)$/.test(url.pathname)
  );
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return; // mutations go through the outbox
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // 1) API reads: network-first with cache fallback (fresh when online, last-known offline)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(API_CACHE).then((c) => c.put(req, clone));
          }
          return res;
        })
        .catch(() =>
          caches.match(req).then((hit) =>
            hit || new Response(JSON.stringify({ success: false, offline: true, error: { code: 'OFFLINE', message: 'Offline — showing last known data. Changes will sync when you reconnect.' } }), { status: 200, headers: { 'Content-Type': 'application/json', 'X-CaribClear-Offline': '1' } })
          )
        )
    );
    return;
  }

  // 2) Navigations: network-first → cache → offline page
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const clone = res.clone();
          caches.open(RUNTIME_CACHE).then((c) => c.put(req, clone));
          return res;
        })
        .catch(() =>
          caches.match(req, { ignoreSearch: true })
            .then((hit) => hit || caches.match('/offline'))
        )
    );
    return;
  }

  // 3) Static: stale-while-revalidate
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(req).then((hit) => {
        const fetchPromise = fetch(req).then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(RUNTIME_CACHE).then((c) => c.put(req, clone));
          }
          return res;
        }).catch(() => hit);
        return hit || fetchPromise;
      })
    );
  }
});

// ── Push notifications (deep-link) ──
self.addEventListener('push', (event) => {
  let payload = { title: 'CaribClear', body: 'New update in your shipments.', url: '/dashboard' };
  try { if (event.data) payload = { ...payload, ...event.data.json() }; } catch { /* keep defaults */ }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-maskable-192.png',
      tag: payload.tag || 'caribclear',
      data: { url: payload.url || '/dashboard' },
      vibrate: payload.critical ? [200, 100, 200] : [80],
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/dashboard';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        const cUrl = new URL(client.url);
        if (cUrl.pathname === new URL(url, self.location.origin).pathname) {
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});

// ── Outbox flush on demand + periodic background sync ──
async function flushOutbox() {
  const clientsList = await self.clients.matchAll({ includeUncontrolled: true });
  for (const client of clientsList) client.postMessage({ type: 'FLUSH_OUTBOX' });
}
self.addEventListener('message', (event) => {
  if (event.data?.type === 'FLUSH_OUTBOX') event.waitUntil(flushOutbox());
});
self.addEventListener('sync', (event) => {
  if (event.tag === 'cc-outbox-sync') event.waitUntil(flushOutbox());
});
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'cc-refresh') event.waitUntil(flushOutbox());
});
