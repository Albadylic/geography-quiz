import { Link, useParams } from 'react-router-dom';
import { useSessionStore } from '@/store/sessionStore';
import { describeConfig } from '@/lib/format';

/**
 * End-of-quiz summary (T1.6). The incorrect-answer review list arrives with
 * T3.3, once stats and persistence exist to back it.
 */
export function ResultsScreen() {
  const { sessionId } = useParams();
  const result = useSessionStore((state) =>
    sessionId ? state.results[sessionId] : undefined,
  );

  if (!result) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-16">
        <h1 className="display-xl text-4xl text-paper">No such result</h1>
        <p className="mt-4 text-paper-dim">
          That quiz isn&rsquo;t in this session &mdash; results aren&rsquo;t saved between
          reloads yet.
        </p>
        <Link to="/" className="label-caps mt-8 inline-block bg-paper px-5 py-3 text-sm text-ink">
          Back to the start
        </Link>
      </div>
    );
  }

  const accuracyPercent = Math.round(result.accuracy * 100);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10">
      <p className="label-caps text-xs text-signal-yellow">
        {describeConfig(result.config)}
      </p>
      <h1 className="display-xl mt-2 text-4xl text-paper sm:text-5xl">
        {headline(accuracyPercent)}
      </h1>

      <dl className="mt-8 grid grid-cols-2 gap-px border-2 border-line bg-line sm:grid-cols-4">
        <Stat label="Score" value={String(result.score)} accent />
        <Stat label="Accuracy" value={`${accuracyPercent}%`} />
        <Stat label="Correct" value={`${result.correctCount}/${result.questionCount}`} />
        <Stat label="Best streak" value={String(result.longestStreak)} />
      </dl>

      <div className="mt-8 flex flex-col gap-px border-2 border-line bg-line sm:flex-row">
        <Link
          to={`/play/${result.config.mode}/setup`}
          className="label-caps flex-1 bg-signal-red px-6 py-4 text-center text-sm text-paper transition-colors hover:bg-paper hover:text-ink"
        >
          Play again
        </Link>
        <Link
          to="/"
          className="label-caps flex-1 bg-ink-raised px-6 py-4 text-center text-sm text-paper transition-colors hover:bg-ink-sunken"
        >
          Choose another mode
        </Link>
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="bg-ink-raised px-4 py-5">
      <dt className="label-caps text-xs text-paper-faint">{label}</dt>
      <dd
        className={`display-xl mt-1 text-3xl ${accent ? 'text-signal-yellow' : 'text-paper'}`}
      >
        {value}
      </dd>
    </div>
  );
}

function headline(accuracyPercent: number): string {
  if (accuracyPercent === 100) return 'Perfect run';
  if (accuracyPercent >= 80) return 'Strong round';
  if (accuracyPercent >= 50) return 'Getting there';
  return 'Room to grow';
}
