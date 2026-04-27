/**
 * Lockedin Service Worker — lockedin-v4
 *
 * Strategy matrix:
 *   /_next/static/*   → cache-first  (content-hashed filenames, safe forever)
 *   /icon*, /manifest → cache-first  (static public assets)
 *   /api/*            → network-only (503 JSON fallback)
 *   page navigations  → network-first → cached page → /offline
 *   everything else   → stale-while-revalidate
 *
 * Bump CACHE_NAME on each deploy to force cache refresh.
 */

const CACHE_NAME  = 'lockedin-v4';
const OFFLINE_URL = '/offline';

// Assets pre-cached on install so /offline is available immediately
const PRECACHE = [
  '/offline',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
];

// ── Message handler (SKIP_WAITING from client) ───────────────────────────────
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// ── Install ───────────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // Promise.allSettled so a missing icon doesn't abort the whole install
      Promise.allSettled(PRECACHE.map((url) => cache.add(url)))
    )
  );
  // Don't auto-skipWaiting — let the client decide via SKIP_WAITING message
});

// ── Activate ──────────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) =>
        Promise.all(
          names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))
        )
      )
      .then(() => self.clients.claim())
  );
});

// ── Fetch ─────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignore cross-origin and non-GET
  if (url.origin !== self.location.origin) return;
  if (request.method !== 'GET') return;

  // ── /api/* → network-only ───────────────────────────────────────────────
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request).catch(() =>
        new Response(JSON.stringify({ error: 'offline' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );
    return;
  }

  // ── Next.js static bundles → cache-first (names are content-hashed) ─────
  if (url.pathname.startsWith('/_next/static/') ||
      url.pathname.startsWith('/_next/image')) {
    event.respondWith(
      caches.match(request).then((hit) => {
        if (hit) return hit;
        return fetch(request).then((res) => {
          if (res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(request, clone));
          }
          return res;
        });
      })
    );
    return;
  }

  // ── Public static files → cache-first ───────────────────────────────────
  if (url.pathname.startsWith('/icon') ||
      url.pathname === '/manifest.json' ||
      url.pathname.startsWith('/fonts/')) {
    event.respondWith(
      caches.match(request).then((hit) => {
        if (hit) return hit;
        return fetch(request).then((res) => {
          if (res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(request, clone));
          }
          return res;
        });
      })
    );
    return;
  }

  // ── Page navigations → network-first, offline fallback ──────────────────
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(request, clone));
          }
          return res;
        })
        .catch(async () => {
          const cached  = await caches.match(request);
          if (cached) return cached;
          const offline = await caches.match(OFFLINE_URL);
          return offline ?? new Response('Offline', { status: 503 });
        })
    );
    return;
  }

  // ── Anything else → stale-while-revalidate ───────────────────────────────
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached      = await cache.match(request);
      const fetchPromise = fetch(request).then((res) => {
        if (res.status === 200) cache.put(request, res.clone());
        return res;
      }).catch(() => cached);
      return cached ?? fetchPromise;
    })
  );
});
