/*
 * Mundus PWA service worker (v0.7.98)
 *
 * Purpose: let the installed home-screen app launch and run fully offline
 * (the writing data itself lives in IndexedDB on the device — this worker
 * only caches the app shell).
 *
 * Strategy:
 *  - Navigations (index.html): network-first, fall back to cache when
 *    offline -> users get updates as soon as the server has them.
 *  - Same-origin static assets (hashed filenames under /assets/ + icons):
 *    cache-first -> instant loads, self-healing when index.html changes.
 *  - Google Fonts: stale-while-revalidate -> offline writing sessions keep
 *    the real fonts instead of falling back to system faces.
 *  - Everything else (Firestore, any cross-origin API): untouched.
 *
 * NOTE: bumped alongside the app version stamp on every release.
 */
const CACHE_NAME = 'mundus-v0.7.98';
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './favicon.ico',
  './favicon.png',
  './favicon-16.png',
  './apple-touch-icon.png',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  // Same origin: app shell + hashed build assets.
  if (url.origin === self.location.origin) {
    if (request.mode === 'navigate') {
      event.respondWith(networkFirst(request));
    } else if (isStaticAsset(request)) {
      event.respondWith(cacheFirst(request));
    }
    return;
  }

  // Google Fonts: serve from cache when offline, refresh in the background.
  if (FONT_HOSTS.includes(url.hostname)) {
    event.respondWith(staleWhileRevalidate(request));
  }
  // All other cross-origin traffic (Firestore, etc.) passes through untouched.
});

function isStaticAsset(request) {
  if (['script', 'style', 'image', 'font', 'manifest'].includes(request.destination)) {
    return true;
  }
  try {
    return /\.(js|css|png|jpe?g|gif|svg|webp|ico|woff2?|ttf|otf|json|map)$/i.test(
      new URL(request.url).pathname
    );
  } catch {
    return false;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  } catch (error) {
    // Not in cache and network unavailable.
    throw error;
  }
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      // Keep a copy of the latest shell under both the request URL and ./index.html
      cache.put(request, response.clone());
      if (request.url !== new URL('./index.html', self.location.href).href) {
        cache.put('./index.html', response.clone());
      }
    }
    return response;
  } catch (error) {
    const cached = (await cache.match(request)) || (await cache.match('./index.html'));
    if (cached) return cached;
    throw error;
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response && response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => undefined);
  return cached || (await network) || Response.error();
}
