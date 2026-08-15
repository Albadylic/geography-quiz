/**
 * Idle prefetching.
 *
 * Two distinct costs this hides:
 *
 *  - Reaching the setup screen meant downloading its chunk *and* the 105KB
 *    dataset, measured at ~850ms on a 1.5Mbps link. Warming both while the
 *    player reads the home screen makes "Start quiz" feel immediate.
 *  - A question's option flags are fetched when they render. Most flags are
 *    under 1KB, but 26 are over 20KB and Serbia is 177KB, so an unlucky
 *    eight-option question could stall for a second or more. Fetching the next
 *    question's flags during the 1.2s answer reveal hides that entirely.
 *
 * Everything here is best-effort: a failed prefetch must never surface to the
 * player, because the real load will simply happen later.
 */

type IdleHandle = number;

/** `requestIdleCallback` where it exists, a short timeout where it does not. */
function onIdle(task: () => void): IdleHandle {
  if (typeof window === 'undefined') return 0;
  const idle = (window as unknown as { requestIdleCallback?: typeof requestIdleCallback })
    .requestIdleCallback;
  if (typeof idle === 'function') return idle(() => task(), { timeout: 2000 });
  return window.setTimeout(task, 200);
}

export function cancelIdle(handle: IdleHandle): void {
  if (typeof window === 'undefined' || !handle) return;
  const cancel = (window as unknown as { cancelIdleCallback?: typeof cancelIdleCallback })
    .cancelIdleCallback;
  if (typeof cancel === 'function') cancel(handle);
  else window.clearTimeout(handle);
}

/**
 * Warms the chunks a player is overwhelmingly likely to need next: the setup
 * screen and the dataset it reads to show the pool size.
 *
 * Vite resolves these to the same modules the route's `React.lazy` imports
 * use, so the later navigation is a module-graph hit rather than a download.
 */
export function prefetchQuizChunks(): IdleHandle {
  return onIdle(() => {
    void import('@/features/setup/SetupScreen').catch(() => {});
    void import('@/data/entities.generated').catch(() => {});
  });
}

/**
 * Fetches flag images into the browser cache. Uses `Image` rather than
 * `<link rel=prefetch>` because it works identically everywhere and lands the
 * file in the same cache the `<img>` will read from.
 */
export function preloadFlags(files: readonly string[]): void {
  if (typeof window === 'undefined') return;
  for (const file of files) {
    const image = new Image();
    // Low priority: the current question's flags matter more than the next
    // one's, and this runs while the player is reading an answer.
    image.fetchPriority = 'low';
    image.decoding = 'async';
    image.src = file;
  }
}
