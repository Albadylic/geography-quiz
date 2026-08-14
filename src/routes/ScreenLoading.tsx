/**
 * Shown while a lazily-loaded screen arrives (T7.3).
 *
 * Deliberately plain: the chunks are small and local, so a spinner would flash
 * and disappear. The live region is what matters — a screen-reader user is
 * told something is happening rather than meeting silence.
 */
export function ScreenLoading() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-16" role="status" aria-live="polite">
      <p className="label-caps text-xs text-paper-faint">Loading&hellip;</p>
      <div aria-hidden="true" className="mt-4 h-1 w-24 bg-line" />
    </div>
  );
}
