import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { entities } from '@/data/entities.generated';
import type { Entity } from '@/data/schema';
import { currentQuestion, isFinished } from '@/engine/session';
import { optionLabel } from '@/engine/questions';
import { useSessionStore } from '@/store/sessionStore';
import { FlagImage } from '@/components/FlagImage';
import { OptionGrid } from '@/components/OptionGrid';

const byId = new Map(entities.map((entity) => [entity.id, entity]));

/** How long the answer stays on screen before advancing (§10). */
const REVEAL_MS = 1200;

export function PlayScreen() {
  const { mode } = useParams();
  const navigate = useNavigate();
  const session = useSessionStore((state) => state.session);
  const answer = useSessionStore((state) => state.answer);

  const [chosenId, setChosenId] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * The pending choice is held in a ref as well as in state. State drives the
   * render; the ref is what `advance` reads, so the timeout callback cannot
   * close over a stale value and a double-invoked updater cannot answer twice.
   */
  const pending = useRef<string | null>(null);

  const question = session ? currentQuestion(session) : undefined;
  const revealed = chosenId !== null;

  const clearTimer = () => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };

  /** Commits the revealed answer and moves on. Safe to call twice. */
  const advance = useCallback(() => {
    clearTimer();
    const chosen = pending.current;
    if (chosen === null) return;
    pending.current = null;
    setChosenId(null);
    answer(chosen);
  }, [answer]);

  const select = useCallback(
    (id: string) => {
      if (pending.current !== null) return;
      pending.current = id;
      setChosenId(id);
      clearTimer();
      timer.current = setTimeout(advance, REVEAL_MS);
    },
    [advance],
  );

  // Leaving mid-question must not fire the pending advance.
  useEffect(() => clearTimer, []);

  // The run is over: hand off to the results screen.
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

  const answerEntity = byId.get(question.entityId);
  const questionNumber = session.currentIndex + 1;
  const total = session.questions.length;
  const wasCorrect = chosenId !== null && question.correctIds.includes(chosenId);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b-2 border-line px-4 py-3">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-4">
          <Link
            to="/"
            className="label-caps text-xs text-paper-faint hover:text-paper"
            aria-label="Quit this quiz"
          >
            Quit
          </Link>
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

        <Prompt question={question} />

        <div className="mt-6">
          <OptionGrid
            options={options}
            answerKind={question.answerKind}
            correctIds={question.correctIds}
            chosenId={chosenId}
            revealed={revealed}
            onSelect={select}
          />
        </div>

        {/*
          §11: the outcome is announced, including the right answer when the
          player got it wrong, so it does not depend on seeing the colour.
        */}
        <p aria-live="assertive" className="sr-only" data-testid="answer-announcement">
          {revealed && answerEntity
            ? wasCorrect
              ? 'Correct'
              : `Incorrect, the answer was ${optionLabel(answerEntity, question.answerKind) || answerEntity.name}`
            : ''}
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

/** Renders whichever half of the pair is being asked about (§6.1, §6.2). */
function Prompt({ question }: { question: NonNullable<ReturnType<typeof currentQuestion>> }) {
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

  const label =
    question.prompt.kind === 'capital'
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
