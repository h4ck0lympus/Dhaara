// CACHE and PRECACHE are prepended at build time by scripts/sw-precache.mjs. Private API data never enters this cache.
/* global CACHE, PRECACHE */
const STALE_PREFIXES = ['dhara-shell-', 'noema-shell-'];   // rename-shim: pre-rename caches are purged for one release
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE && STALE_PREFIXES.some((prefix) => key.startsWith(prefix))).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (request.mode === 'navigate') event.respondWith(navigate(request));
  else if (url.pathname.startsWith('/assets/')) event.respondWith(asset(request));
});

async function asset(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    try {
      await cache.put(request, response.clone());
    } catch {
      // Quota or storage failure: the network response is still good.
    }
  }
  return response;
}

async function navigate(request) {
  let response = null;
  try {
    response = await fetch(request);
    if (response.status < 500) return response;
  } catch {
    // Server unreachable: fall through to the cached shell.
  }
  const shell = await caches.match('/', { cacheName: CACHE });
  return shell ?? response ?? Response.error();
}
