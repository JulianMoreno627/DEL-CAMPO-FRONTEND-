/**
 * "Del Campo" Service Worker.
 *
 * Cache strategies per resource type:
 *  - App shell (HTML, CSS, JS, workers): precache on install + network-first with a timeout
 *      → with signal the latest version is always shown; without signal it opens from the cache.
 *  - Public list of listings (API): network-first with a 4 s timeout and a cache fallback
 *      → fresh data with good signal; if the network is slow or down, the last copy.
 *  - Photos: cache-first with an entry limit (they are not downloaded again).
 *  - Writes and per-user data (cart, orders, my listings): never cached.
 *
 * Also: Web Push handlers ready for the next delivery.
 */
const VERSION = 'v5';
const SHELL_CACHE = `shell-${VERSION}`;
const API_CACHE = `api-${VERSION}`;
const IMAGE_CACHE = `img-${VERSION}`;
const MAX_IMAGES = 60;
const NETWORK_TIMEOUT_MS = 4000;

const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icons/icon.svg',
  '/css/app.css',
  '/js/main.js',
  '/js/config.js',
  '/js/core/Store.js',
  '/js/core/ApiClient.js',
  '/js/core/Component.js',
  '/js/core/Router.js',
  '/js/metrics/PerformanceMonitor.js',
  '/js/workers/WorkerClient.js',
  '/js/workers/geo.worker.js',
  '/js/workers/image.worker.js',
  '/js/utils/format.js',
  '/js/utils/geo.js',
  '/js/utils/icons.js',
  '/js/components/product.js',
  '/js/views/LoginView.js',
  '/js/views/MyProductsView.js',
  '/js/views/ProductsView.js',
  '/js/views/CartView.js',
  '/js/views/OrdersView.js',
  '/js/views/PerformanceView.js',
];

// API routes that can be cached (they do not depend on the user asking)
const API_NETWORK_FIRST = [/\/api\/listings$/];

self.addEventListener('install', (event) => {
  // cache: 'reload' → the precache fetches the files from the server, never an old copy from the HTTP cache
  event.waitUntil(caches.open(SHELL_CACHE)
    .then((cache) => cache.addAll(APP_SHELL.map((url) => new Request(url, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  const current = [SHELL_CACHE, API_CACHE, IMAGE_CACHE];
  event.waitUntil((async () => {
    let hadOldVersion = false;
    for (const name of await caches.keys()) {
      if (!current.includes(name)) {
        await caches.delete(name);
        hadOldVersion = true;
      }
    }
    await self.clients.claim();
    // Open tabs keep showing the old version: they are reloaded so they see the new one
    if (hadOldVersion) {
      for (const client of await self.clients.matchAll({ type: 'window' })) client.navigate(client.url).catch(() => {});
    }
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return; // writes always go to the network
  const url = new URL(request.url);

  if (url.pathname.startsWith('/api/')) {
    if (API_NETWORK_FIRST.some((r) => r.test(url.pathname))) return event.respondWith(networkFirst(request, API_CACHE));
    return; // the rest of the API (cart, orders, metrics…): always to the network
  }
  if (url.pathname.startsWith('/uploads/')) return event.respondWith(cacheFirst(request, IMAGE_CACHE));
  if (url.origin !== self.location.origin) return;

  // SPA navigation: always the app shell (the routes live in the #hash)
  // cache: 'no-cache' → revalidated with the server even if the browser has a copy in its HTTP cache
  if (request.mode === 'navigate') return event.respondWith(networkFirst(new Request('/index.html', { cache: 'no-cache' }), SHELL_CACHE));
  event.respondWith(networkFirst(new Request(request, { cache: 'no-cache' }), SHELL_CACHE));
});

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await withTimeout(fetch(request), NETWORK_TIMEOUT_MS);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request);
    return cached ?? new Response(JSON.stringify({ error: 'Sin conexión con el servidor' }), {
      status: 503, headers: { 'Content-Type': 'application/json' },
    });
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      await cache.put(request, response.clone());
      limitEntries(cache, MAX_IMAGES);
    }
    return response;
  } catch {
    return new Response('', { status: 503 });
  }
}

async function limitEntries(cache, max) {
  const keys = await cache.keys();
  for (const key of keys.slice(0, Math.max(0, keys.length - max))) await cache.delete(key);
}

function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))]);
}

// ---- Web Push (next delivery): "The producer confirmed your order"
self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? { title: 'Del Campo', body: 'Tiene novedades en sus pedidos' };
  event.waitUntil(self.registration.showNotification(data.title, {
    body: data.body, icon: '/icons/icon.svg', data: { url: data.url ?? '/#/pedidos' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow(event.notification.data?.url ?? '/'));
});
