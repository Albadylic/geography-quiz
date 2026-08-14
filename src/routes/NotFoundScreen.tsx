import { Link } from 'react-router-dom';

export function NotFoundScreen() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-16">
      <p className="label-caps text-xs text-signal-yellow">404</p>
      <h1 className="display-xl mt-2 text-5xl text-paper">Off the map</h1>
      <p className="mt-4 max-w-prose text-paper-dim">
        That page doesn&rsquo;t exist. It happens.
      </p>
      <Link
        to="/"
        className="label-caps mt-8 inline-block bg-paper px-5 py-3 text-sm text-ink"
      >
        Back to the start
      </Link>
    </div>
  );
}
