import type { Entity } from '@/data/schema';
import { optionLabel } from '@/engine/questions';
import type { Answer, Question } from '@/engine/types';
import { Autocomplete } from '@/components/Autocomplete';

/** Free-text answering — expert difficulty (T2.4). */
export function ExpertAnswer({
  question,
  value,
  onChange,
  onSubmit,
  onSkip,
  pool,
  revealed,
  answerEntity,
}: {
  question: Question;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  /** Gives up on the question outright, whatever is in the box. */
  onSkip: () => void;
  /** The countries this quiz can actually ask about. */
  pool: readonly Entity[] | undefined;
  revealed: Answer | null;
  answerEntity: Entity | undefined;
}) {
  if (revealed) {
    return (
      <ExpertFeedback question={question} answer={revealed} entity={answerEntity} />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Autocomplete
        label={question.answerKind === 'capital' ? 'Capital city' : 'Country'}
        value={value}
        onChange={onChange}
        onSubmit={onSubmit}
        answerKind={question.answerKind}
        {...(pool ? { pool } : {})}
        placeholder="Type your answer"
      />
      <div className="flex gap-px">
        <button
          type="button"
          onClick={onSubmit}
          className="label-caps flex-1 bg-signal-red px-6 py-4 text-sm text-paper transition-colors hover:bg-paper hover:text-ink"
        >
          Answer
        </button>
        <button
          type="button"
          onClick={onSkip}
          // Says what it costs: a skip is graded as a miss, same as a wrong
          // answer. Nothing here pretends it is free.
          title="Give up on this one — it counts as incorrect"
          className="label-caps bg-ink-raised px-6 py-4 text-sm text-paper-dim transition-colors hover:bg-ink-sunken"
        >
          Skip
        </button>
      </div>
    </div>
  );
}

function ExpertFeedback({
  question,
  answer,
  entity,
}: {
  question: Question;
  answer: Answer;
  entity: Entity | undefined;
}) {
  if (!entity) return null;

  /**
   * Multi-capital entities show every accepted answer, with its note, so the
   * player learns why there was more than one (§3.3).
   */
  const alternatives =
    question.answerKind === 'capital'
      ? entity.capitals
      : [];

  return (
    <div
      className={`border-l-4 p-4 ${answer.correct ? 'border-correct bg-correct/15' : 'border-wrong bg-wrong/15'}`}
    >
      <p className="flex items-center gap-2">
        <span role="img" aria-label={answer.correct ? 'Correct' : 'Incorrect'}>
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" aria-hidden="true">
            {answer.correct ? (
              <path d="M4 13l5 5L20 6" stroke="currentColor" strokeWidth="3.5" strokeLinecap="square" />
            ) : (
              <path d="M5 5l14 14M19 5L5 19" stroke="currentColor" strokeWidth="3.5" strokeLinecap="square" />
            )}
          </svg>
        </span>
        <span className="display-md text-lg text-paper">
          {answer.correct ? 'Correct' : 'Not quite'}
        </span>
      </p>

      {answer.given && !answer.correct && (
        <p className="mt-2 text-sm text-paper-dim">
          You answered <span className="text-paper">{answer.given}</span>.
        </p>
      )}

      <p className="mt-2 text-paper">
        The answer is{' '}
        <span className="display-md text-lg">
          {optionLabel(entity, question.answerKind) || entity.name}
        </span>
        .
      </p>

      {alternatives.length > 1 && (
        <ul className="mt-3 flex flex-col gap-1 text-sm text-paper-dim">
          {alternatives.map((capital) => (
            <li key={capital.name}>
              <span className="text-paper">{capital.name}</span>
              {capital.note ? ` — ${capital.note}` : ''}
              {capital.isPrimary ? '' : ' (also accepted)'}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
