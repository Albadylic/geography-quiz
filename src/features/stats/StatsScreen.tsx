import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { entityById } from '@/data/lookup';
import {
  HARDEST_UNLOCK_THRESHOLD,
  masteredCount,
  smoothedErrorRate,
  summariseEntity,
} from '@/engine/stats';
import { useStatsStore } from '@/store/statsStore';
import { describeSignature } from '@/lib/format';

/** Stats screen — plan §9. */
export function StatsScreen() {
  const data = useStatsStore((state) => state.data);

  const highScores = useMemo(
    () => Object.values(data.highScores).sort((a, b) => b.score - a.score),
    [data.highScores],
  );

  /**
   * Weakest 20 (§9). Ordered by the smoothed error rate from §8, so one wrong
   * answer does not outrank a country that has been missed repeatedly. T5.1
   * replaces this with the full adaptive weight, which adds recency.
   */
  const weakest = useMemo(
    () =>
      Object.values(data.entityStats)
        .map(summariseEntity)
        .filter((summary) => summary.seen > 0)
        .sort((a, b) => smoothedErrorRate(b) - smoothedErrorRate(a))
        .slice(0, 20),
    [data.entityStats],
  );

  const answered = data.totals.questionsAnswered;
  const accuracy = answered === 0 ? 0 : data.totals.correctAnswers / answered;
  const unlocked = answered >= HARDEST_UNLOCK_THRESHOLD;

  if (answered === 0) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-16">
        <h1 className="display-xl text-4xl text-paper">No stats yet</h1>
        <p className="mt-4 max-w-prose text-paper-dim">
          Play a round and this fills up: high scores per setup, your longest streak,
          and the countries you keep getting wrong.
        </p>
        <Link
          to="/"
          className="label-caps mt-8 inline-block bg-signal-red px-5 py-3 text-sm text-paper"
        >
          Play a round
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10">
      <h1 className="display-xl text-4xl text-paper sm:text-5xl">Your stats</h1>

      <dl className="mt-8 grid grid-cols-2 gap-px border-2 border-line bg-line sm:grid-cols-4">
        <Stat label="Questions" value={String(answered)} />
        <Stat label="Accuracy" value={`${Math.round(accuracy * 100)}%`} />
        <Stat label="Mastered" value={String(masteredCount(data))} />
        <Stat
          label="Longest streak"
          value={String(data.streaks.global?.longest ?? 0)}
          accent
        />
      </dl>

      <section className="mt-10">
        <h2 className="display-md text-xl text-paper">Longest streak by mode</h2>
        <dl className="mt-4 grid grid-cols-3 gap-px border-2 border-line bg-line">
          <Stat label="Flags" value={String(data.streaks.flags?.longest ?? 0)} />
          <Stat label="Capitals" value={String(data.streaks.capitals?.longest ?? 0)} />
          <Stat label="Combo" value={String(data.streaks.combo?.longest ?? 0)} />
        </dl>
      </section>

      <section className="mt-10">
        <h2 className="display-md text-xl text-paper">High scores</h2>
        {highScores.length === 0 ? (
          <p className="mt-2 text-paper-dim">No finished runs yet.</p>
        ) : (
          <ul className="mt-4 flex flex-col gap-px border-2 border-line bg-line">
            {highScores.map((entry) => (
              <li
                key={entry.signature}
                className="flex items-center justify-between gap-4 bg-ink-raised px-4 py-3"
              >
                {/* §9: the signature is shown as a readable line. */}
                <span className="min-w-0 text-sm text-paper-dim">
                  {describeSignature(entry.signature)}
                </span>
                <span className="display-md shrink-0 text-lg text-signal-yellow">
                  {entry.score}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10">
        <h2 className="display-md text-xl text-paper">Weakest 20</h2>
        {weakest.length === 0 ? (
          <p className="mt-2 text-paper-dim">Nothing to work on yet.</p>
        ) : (
          <>
            <ul className="mt-4 flex flex-col gap-px border-2 border-line bg-line">
              {weakest.map((summary) => {
                const entity = entityById(summary.entityId);
                return (
                  <li
                    key={summary.entityId}
                    className="flex items-center justify-between gap-4 bg-ink-raised px-4 py-3"
                  >
                    <span className="min-w-0 truncate text-sm text-paper">
                      {entity?.name ?? summary.entityId}
                    </span>
                    <span className="label-caps shrink-0 text-xs text-paper-faint">
                      {summary.correct}/{summary.seen} right
                    </span>
                  </li>
                );
              })}
            </ul>

            {unlocked ? (
              <Link
                to="/play/flags/setup?source=hardest"
                className="label-caps mt-4 inline-block bg-signal-red px-5 py-3 text-sm text-paper"
              >
                Practise these
              </Link>
            ) : (
              <p className="mt-4 border-l-4 border-line bg-ink-raised px-4 py-3 text-sm text-paper-dim">
                Play a few rounds first &mdash; this mode uses your own results.{' '}
                {answered}/{HARDEST_UNLOCK_THRESHOLD} questions answered.
              </p>
            )}
          </>
        )}
      </section>

      <p className="mt-10 text-sm text-paper-faint">
        Want to start over?{' '}
        <Link to="/settings" className="text-paper underline">
          Reset your data in Settings
        </Link>
        .
      </p>
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
