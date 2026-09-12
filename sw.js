const CACHE_NAME = 'dsp-interface-pot-v40-gatt-disconnect-20260906';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
  './pwa-icon.svg',
  './pwa-icon-192.png',
  './pwa-icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const reqUrl = new URL(event.request.url);
  const isAppAsset =
    reqUrl.origin === self.location.origin &&
    (reqUrl.pathname.endsWith('/') ||
      reqUrl.pathname.endsWith('/index.html') ||
      reqUrl.pathname.endsWith('/styles.css') ||
      reqUrl.pathname.endsWith('/app.js') ||
      reqUrl.pathname.endsWith('/manifest.webmanifest') ||
      reqUrl.pathname.endsWith('/pwa-icon.svg') ||
      reqUrl.pathname.endsWith('/pwa-icon-192.png') ||
      reqUrl.pathname.endsWith('/pwa-icon-512.png'));

  if (isAppAsset) {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
        .then((response) => {
          const cloned = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cloned));
          return response;
        })
        .catch(() => caches.match(event.request).then((cached) => cached || caches.match('./index.html')))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          const cloned = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cloned));
          return response;
        })
        .catch(() => caches.match('./index.html'));
    })
  );
});
