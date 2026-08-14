import { Link, useParams } from 'react-router-dom';
import { entities } from '@/data/entities.generated';
import type { Entity } from '@/data/schema';
import { optionLabel } from '@/engine/questions';
import type { Answer, Question } from '@/engine/types';
import { describeConfig } from '@/lib/format';
import { useSessionStore } from '@/store/sessionStore';
import { useStatsStore } from '@/store/statsStore';
import { FlagImage } from '@/components/FlagImage';

const byId = new Map(entities.map((entity) => [entity.id, entity]));

/**
 * End-of-quiz summary (T3.3): the numbers, then a review of everything the
 * player got wrong, with the correct answer, their answer, and the flag shown
 * with its real name — the one place alt text is *supposed* to name it (§11).
 */
export function ResultsScreen() {
  const { sessionId } = useParams();
  const result = useSessionStore((state) =>
    sessionId ? state.results[sessionId] : undefined,
  );
  const session = useSessionStore((state) => state.session);
  const highScore = useStatsStore((state) =>
    result ? state.data.highScores[result.signature] : undefined,
  );

  if (!result) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-16">
        <h1 className="display-xl text-4xl text-paper">No such result</h1>
        <p className="mt-4 text-paper-dim">
          That quiz isn&rsquo;t in this session &mdash; results aren&rsquo;t kept between
          reloads.
        </p>
        <Link to="/" className="label-caps mt-8 inline-block bg-paper px-5 py-3 text-sm text-ink">
          Back to the start
        </Link>
      </div>
    );
  }

  const accuracyPercent = Math.round(result.accuracy * 100);
  const questions = session?.id === result.sessionId ? session.questions : [];
  const questionsById = new Map(questions.map((question) => [question.id, question]));
  const wrong = result.answers.filter((answer) => !answer.correct);
  const isNewBest = highScore !== undefined && highScore.score === result.score;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10">
      <p className="label-caps text-xs text-signal-yellow">{describeConfig(result.config)}</p>
      <h1 className="display-xl mt-2 text-4xl text-paper sm:text-5xl">
        {headline(accuracyPercent)}
      </h1>

      {isNewBest && (
        <p className="label-caps mt-4 inline-block bg-signal-yellow px-3 py-2 text-xs text-ink">
          New best for this setup
        </p>
      )}

      <dl className="mt-8 grid grid-cols-2 gap-px border-2 border-line bg-line sm:grid-cols-4">
        <Stat label="Score" value={String(result.score)} accent />
        <Stat label="Accuracy" value={`${accuracyPercent}%`} />
        <Stat label="Correct" value={`${result.correctCount}/${result.questionCount}`} />
        <Stat label="Best streak" value={String(result.longestStreak)} />
      </dl>

      <section className="mt-10">
        <h2 className="display-md text-xl text-paper">
          {wrong.length === 0
            ? 'Nothing to review'
            : `Review — ${wrong.length} to look at`}
        </h2>

        {wrong.length === 0 ? (
          <p className="mt-2 text-paper-dim">
            You got every question right. Try a harder setup or a bigger pool.
          </p>
        ) : questions.length === 0 ? (
          <p className="mt-2 text-paper-dim">
            The question details for this quiz are no longer in memory, so there&rsquo;s
            nothing to show here.
          </p>
        ) : (
          <ul className="mt-4 flex flex-col gap-px border-2 border-line bg-line">
            {wrong.map((answer) => {
              const question = questionsById.get(answer.questionId);
              if (!question) return null;
              return (
                <ReviewRow key={answer.questionId} question={question} answer={answer} />
              );
            })}
          </ul>
        )}
      </section>

      <div className="mt-10 flex flex-col gap-px border-2 border-line bg-line sm:flex-row">
        <Link
          to={`/play/${result.config.mode}/setup`}
          className="label-caps flex-1 bg-signal-red px-6 py-4 text-center text-sm text-paper transition-colors hover:bg-paper hover:text-ink"
        >
          Play again
        </Link>
        <Link
          to="/stats"
          className="label-caps flex-1 bg-ink-raised px-6 py-4 text-center text-sm text-paper transition-colors hover:bg-ink-sunken"
        >
          See your stats
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

/** One incorrect answer, with everything needed to learn from it. */
function ReviewRow({ question, answer }: { question: Question; answer: Answer }) {
  const entity = byId.get(question.entityId);
  if (!entity) return null;

  const correctLabel = optionLabel(entity, question.answerKind) || entity.name;
  const givenLabel = describeGiven(answer, question);
  const capitals = question.answerKind === 'capital' ? entity.capitals : [];

  return (
    <li className="flex items-start gap-4 bg-ink-raised p-4">
      {/* Review is after grading, so the flag names itself here (§11). */}
      <FlagImage entity={entity} revealName className="w-20 shrink-0 sm:w-28" />

      <div className="min-w-0 flex-1">
        <p className="display-md text-base text-paper">{entity.name}</p>

        {/*
          For a flag → country question the answer *is* the country name, and
          repeating it under the heading reads as a mistake. The answer line
          only appears when it says something the heading does not.
        */}
        {correctLabel !== entity.name && (
          <p className="mt-1 text-sm">
            <span className="text-paper-faint">Answer: </span>
            <span className="text-correct">{correctLabel}</span>
          </p>
        )}

        <p className="mt-1 text-sm">
          <span className="text-paper-faint">You said: </span>
          <span className="text-wrong">{givenLabel}</span>
        </p>

        {capitals.length > 1 && (
          <p className="mt-1 text-xs text-paper-faint">
            Also accepted:{' '}
            {capitals
              .filter((capital) => !capital.isPrimary)
              .map((capital) => `${capital.name}${capital.note ? ` (${capital.note})` : ''}`)
              .join(', ')}
          </p>
        )}
      </div>
    </li>
  );
}

/**
 * What the player actually answered. Multiple choice stores an entity id and
 * needs turning back into the label they saw; expert mode stores their typed
 * text verbatim; a skip stores nothing.
 */
function describeGiven(answer: Answer, question: Question): string {
  if (answer.given === null) return 'Skipped';
  const chosen: Entity | undefined = byId.get(answer.given);
  if (chosen) return optionLabel(chosen, question.answerKind) || chosen.name;
  return answer.given;
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
