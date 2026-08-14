/**
 * PWA registration — plan T7.5.
 *
 * The manifest, icon and service worker all ship, but the worker is **not
 * registered in v1**: the plan says PWA groundwork, "not shipped as installable
 * in v1", and an active service worker is a support burden that should arrive
 * with a deliberate release rather than as a side effect of a polish ticket.
 *
 * Turning it on is this one call, from `main.tsx`.
 */
export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js');
  });
}
