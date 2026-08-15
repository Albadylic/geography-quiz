/**
 * PWA registration — plan T7.5, switched on in the follow-up round.
 *
 * The worker makes a *second* visit near-instant and offline-capable: the
 * shell, the 105KB dataset chunk and every flag already seen come from cache
 * rather than the network. A first visit is unaffected.
 *
 * Safe by construction:
 *  - build assets carry content hashes, so a new build cannot be served an old
 *    chunk from an old cache;
 *  - navigations are network-first, so the newest `index.html` always wins;
 *  - the cache name is versioned and old versions are deleted on activate.
 *
 * Called from `main.tsx` in production only — in dev the worker would sit in
 * front of Vite's module graph.
 */
export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js');
  });
}

/**
 * Removes any worker previously registered by this origin. Not called by the
 * app; kept as the documented escape hatch if a bad worker ever ships, since a
 * user cannot easily do this themselves.
 */
export async function unregisterServiceWorkers(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.map((registration) => registration.unregister()));
}
