/**
 * Service worker — plan T7.5.
 *
 * Precaches the app shell and caches flag assets and the dataset chunk as they
 * are used, so a second visit works offline. Deliberately conservative: the
 * cache is versioned and old versions are deleted on activate, so a stale
 * worker cannot pin an old build forever.
 *
 * Not registered by default — see src/pwa.ts for the one line that turns it on
 * and why it is off in v1.
 */
const VERSION = 'v1';
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
    event.respondWith(fetch(request).catch(() => caches.match('/index.html')));
  }
});
