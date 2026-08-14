import { Link, useRouteError } from 'react-router-dom';

/**
 * Route-level error boundary (T7.3).
 *
 * A quiz app losing a screen should not lose the player's stats with it, so
 * this offers a way back rather than a blank page. The underlying message is
 * shown because it is far more useful than "something went wrong" when the
 * person reading it is the one who has to report the bug.
 */
export function ScreenError() {
  const error = useRouteError();
  const detail =
    error instanceof Error ? error.message : typeof error === 'string' ? error : null;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-16">
      <p className="label-caps text-xs text-signal-yellow">Something broke</p>
      <h1 className="display-xl mt-2 text-4xl text-paper">This screen didn&rsquo;t load</h1>
      <p className="mt-4 max-w-prose text-paper-dim">
        Your scores and settings are stored on this device and are unaffected.
      </p>
      {detail && (
        <pre className="mt-4 overflow-x-auto border-2 border-line bg-ink-raised p-4 text-xs text-paper-dim">
          {detail}
        </pre>
      )}
      <Link
        to="/"
        className="label-caps mt-8 inline-block bg-paper px-5 py-3 text-sm text-ink"
      >
        Back to the start
      </Link>
    </div>
  );
}
