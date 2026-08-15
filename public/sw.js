/**
 * Service worker — plan T7.5, registered in production since F1.
 *
 * Precaches the app shell and caches flag assets and the dataset chunk as they
 * are used, so a second visit works offline.
 *
 * `VERSION` is stamped at build time from the built asset hashes — see
 * `serviceWorkerVersion` in vite.config.ts. It used to be the literal 'v1',
 * which meant the activate handler below could never match anything to delete
 * and the very first `index.html` a user cached outlived every deploy. Online
 * that is masked by the network-first navigation; offline it serves an old
 * shell asking for chunks that no longer exist.
 */
const VERSION = '__SW_VERSION__';
const SHELL_CACHE = `geo-quiz-shell-${VERSION}`;
const ASSET_CACHE = `geo-quiz-assets-${VERSION}`;

const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('geo-quiz-') && !key.endsWith(VERSION))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Flags and hashed build assets are immutable: serve from cache, fill on miss.
  const isImmutable = url.pathname.startsWith('/flags/') || url.pathname.startsWith('/assets/');
  if (isImmutable) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ??
          fetch(request).then((response) => {
            const copy = response.clone();
            caches.open(ASSET_CACHE).then((cache) => cache.put(request, copy));
            return response;
          }),
      ),
    );
    return;
  }

  // Navigations: network first, falling back to the cached shell offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => {
        // `caches.match` resolves undefined on a miss, and respondWith throws
        // on undefined — which would turn "offline" into a broken worker.
        const shell = await caches.match('/index.html');
        return (
          shell ??
          new Response('<!doctype html><title>Offline</title><p>You are offline.', {
            status: 503,
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
          })
        );
      }),
    );
  }
});
