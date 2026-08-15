import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { entities } from '@/data/entities.generated';
import type { Entity } from '@/data/schema';
import { currentQuestion, isFinished } from '@/engine/session';
import { gradeChoice, gradeFreeText } from '@/engine/grading';
import { optionLabel } from '@/engine/questions';
import type { Answer, Question } from '@/engine/types';
import { useSessionStore } from '@/store/sessionStore';
import { FlagImage } from '@/components/FlagImage';
import { OptionGrid } from '@/components/OptionGrid';
import { Autocomplete } from '@/components/Autocomplete';
import { ComboAnswer } from './ComboAnswer';
import { preloadFlags } from '@/lib/prefetch';

const byId = new Map(entities.map((entity) => [entity.id, entity]));

/** How long the answer stays on screen before advancing (§10). */
const REVEAL_MS = 1200;

/**
 * Every flag file a question will put on screen: the prompt flag, plus the
 * option flags when the options *are* flags, plus a combo question's flag
 * half. Returns nothing for a question that shows no flag at all.
 */
function flagsShownBy(question: Question): string[] {
  const files = new Set<string>();

  if (question.prompt.kind === 'flag') files.add(question.prompt.value);

  const flagOptionIds =
    question.halves?.find((half) => half.answerKind === 'flag')?.options ??
    (question.answerKind === 'flag' ? (question.options ?? []) : []);

  for (const id of flagOptionIds) {
    const file = byId.get(id)?.flag.file;
    if (file) files.add(file);
  }

  return [...files];
}

export function PlayScreen() {
  const { mode } = useParams();
  const navigate = useNavigate();
  const session = useSessionStore((state) => state.session);
  const submit = useSessionStore((state) => state.submit);
  const quit = useSessionStore((state) => state.quit);

  /** The graded answer awaiting commit, or null while the question is open. */
  const [revealed, setRevealed] = useState<Answer | null>(null);
  const [typed, setTyped] = useState('');
  const [confirmingQuit, setConfirmingQuit] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * Mirrors `revealed`. State drives the render; the ref is what `advance`
   * reads, so the timeout cannot close over a stale value and a
   * double-invoked updater cannot answer twice.
   */
  const pending = useRef<Answer | null>(null);

  const question = session ? currentQuestion(session) : undefined;

  const clearTimer = () => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };

  /** Commits the revealed answer and moves on. Safe to call twice. */
  const advance = useCallback(() => {
    clearTimer();
    const answer = pending.current;
    if (answer === null) return;
    pending.current = null;
    setRevealed(null);
    setTyped('');
    submit(answer);
  }, [submit]);

  const reveal = useCallback(
    (answer: Answer) => {
      if (pending.current !== null) return;
      pending.current = answer;
      setRevealed(answer);
      clearTimer();
      timer.current = setTimeout(advance, REVEAL_MS);
    },
    [advance],
  );

  const selectOption = useCallback(
    (id: string) => {
      if (!question) return;
      reveal(gradeChoice(question, id));
    },
    [question, reveal],
  );

  const submitText = useCallback(() => {
    if (!question) return;
    const entity = byId.get(question.entityId);
    if (!entity) return;
    reveal(gradeFreeText(question, typed, entity));
  }, [question, typed, reveal]);

  // Leaving mid-question must not fire the pending advance.
  useEffect(() => clearTimer, []);

  /**
   * Fetch the *next* question's flags while this one is on screen (T7.4).
   *
   * Most flags are under a kilobyte, but 26 are over 20KB and Serbia is 177KB,
   * so an eight-option question could otherwise stall visibly the moment it
   * renders. Doing this a question early hides the download entirely.
   */
  useEffect(() => {
    if (!session) return;
    const next = session.questions[session.currentIndex + 1];
    if (!next) return;
    preloadFlags(flagsShownBy(next));
  }, [session]);

  useEffect(() => {
    if (session && isFinished(session)) {
      navigate(`/results/${session.id}`, { replace: true });
    }
  }, [session, navigate]);

  if (!session || !question) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-16">
        <h1 className="display-xl text-4xl text-paper">No quiz running</h1>
        <p className="mt-4 text-paper-dim">Pick a mode and set one up first.</p>
        <Link
          to={mode ? `/play/${mode}/setup` : '/'}
          className="label-caps mt-8 inline-block bg-paper px-5 py-3 text-sm text-ink"
        >
          Set up a quiz
        </Link>
      </div>
    );
  }

  const options = (question.options ?? [])
    .map((id) => byId.get(id))
    .filter((entity): entity is Entity => entity !== undefined);

  const isCombo = question.halves !== undefined;
  const isExpert = !isCombo && question.options === undefined;
  const answerEntity = byId.get(question.entityId);
  const questionNumber = session.currentIndex + 1;
  const total = session.questions.length;

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b-2 border-line px-4 py-3">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-4">
          <button
            type="button"
            onClick={() => setConfirmingQuit(true)}
            className="label-caps text-xs text-paper-faint hover:text-paper"
            aria-label="Quit this quiz"
          >
            Quit
          </button>
          <p className="label-caps ml-auto text-xs text-paper-dim">
            <span className="text-paper">{questionNumber}</span> / {total}
          </p>
          <p className="label-caps text-xs text-paper-dim">
            Score <span className="text-signal-yellow">{session.score}</span>
          </p>
        </div>
        <div
          className="mx-auto mt-3 h-1 w-full max-w-3xl bg-line"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={session.currentIndex}
          aria-label="Quiz progress"
        >
          <div
            className="h-full bg-signal-yellow transition-[width]"
            style={{ width: `${(session.currentIndex / total) * 100}%` }}
          />
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        <h1 className="sr-only">
          Question {questionNumber} of {total}
        </h1>

        {confirmingQuit && (
          <div className="mb-6 border-2 border-signal-yellow bg-ink-raised p-4">
            <p className="text-paper">
              Quit after {session.currentIndex} of {total} questions?
            </p>
            {/* Says exactly what is kept and what is lost, before it happens. */}
            <p className="mt-2 text-sm text-paper-dim">
              {session.currentIndex === 0
                ? 'You haven’t answered anything yet, so there’s nothing to keep.'
                : `Your ${session.currentIndex} answer${session.currentIndex === 1 ? '' : 's'} will be kept towards your per-country stats, but an unfinished quiz doesn’t score, so it won’t count towards a high score.`}
            </p>
            <div className="mt-4 flex flex-col gap-px sm:flex-row">
              <button
                type="button"
                onClick={() => {
                  clearTimer();
                  quit();
                  navigate('/', { replace: true });
                }}
                className="label-caps bg-signal-red px-5 py-3 text-sm text-paper"
              >
                Quit the quiz
              </button>
              <button
                type="button"
                onClick={() => setConfirmingQuit(false)}
                className="label-caps bg-ink px-5 py-3 text-sm text-paper"
              >
                Keep playing
              </button>
            </div>
          </div>
        )}

        <Prompt question={question} />

        <div className="mt-6">
          {isCombo ? (
            <ComboAnswer question={question} revealed={revealed} onSubmit={reveal} />
          ) : isExpert ? (
            <ExpertAnswer
              question={question}
              value={typed}
              onChange={setTyped}
              onSubmit={submitText}
              revealed={revealed}
              answerEntity={answerEntity}
            />
          ) : (
            <OptionGrid
              options={options}
              answerKind={question.answerKind}
              correctIds={question.correctIds}
              chosenId={revealed?.given ?? null}
              revealed={revealed !== null}
              onSelect={selectOption}
            />
          )}
        </div>

        {/*
          §11: the outcome is announced, including the right answer when the
          player got it wrong, so it does not depend on seeing the colour.
        */}
        <p aria-live="assertive" className="sr-only" data-testid="answer-announcement">
          {revealed && answerEntity ? announce(revealed, question, answerEntity) : ''}
        </p>

        {revealed && (
          <button
            type="button"
            onClick={advance}
            className="label-caps mt-6 w-full bg-paper px-6 py-4 text-sm text-ink"
          >
            Continue
          </button>
        )}
      </main>
    </div>
  );
}

/**
 * What the live region says once an answer is graded (§11). Combo reports each
 * half, because "incorrect" alone would not say which one was wrong.
 */
function announce(answer: Answer, question: Question, entity: Entity): string {
  if (question.halves) {
    const parts = question.halves.map((half) => {
      const right = answer.halfResults?.[half.statMode] === true;
      const label = half.statMode === 'flags' ? 'flag' : 'capital';
      return `${label} ${right ? 'correct' : 'incorrect'}`;
    });
    return `${entity.name}: ${parts.join(', ')}`;
  }

  if (answer.correct) return 'Correct';
  return `Incorrect, the answer was ${optionLabel(entity, question.answerKind) || entity.name}`;
}

/** Free-text answering — expert difficulty (T2.4). */
function ExpertAnswer({
  question,
  value,
  onChange,
  onSubmit,
  revealed,
  answerEntity,
}: {
  question: Question;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
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
          onClick={onSubmit}
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

/** Renders whichever half of the pair is being asked about (§6.1, §6.2). */
function Prompt({ question }: { question: Question }) {
  const entity = byId.get(question.entityId);

  if (question.prompt.kind === 'flag' && entity) {
    return (
      <figure className="m-0">
        <figcaption className="label-caps mb-3 text-xs text-paper-faint">
          Which country flies this flag?
        </figcaption>
        {/* revealName is false: the alt text must not give the answer (§11). */}
        <FlagImage
          entity={entity}
          revealName={false}
          hiddenLabel="The flag in question"
          className="w-full max-w-md"
          loading="eager"
          fetchPriority="high"
        />
      </figure>
    );
  }

  const label = question.halves
    ? 'Pick the flag and the capital for'
    : question.prompt.kind === 'capital'
      ? 'Which country has this capital?'
      : question.answerKind === 'capital'
        ? 'What is the capital of'
        : 'Which flag belongs to';

  return (
    <div>
      <p className="label-caps mb-2 text-xs text-paper-faint">{label}</p>
      <p className="display-xl text-4xl text-paper sm:text-6xl">{question.prompt.value}</p>
    </div>
  );
}
