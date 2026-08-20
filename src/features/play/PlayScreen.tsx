import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { entityById } from '@/data/lookup';
import type { Entity } from '@/data/schema';
import { currentQuestion, isFinished } from '@/engine/session';
import { buildPool } from '@/engine/pool';
import { gradeChoice, gradeFreeText } from '@/engine/grading';
import type { Answer, Question } from '@/engine/types';
import { useSessionStore } from '@/store/sessionStore';
import { announce } from '@/lib/format';
import { OptionGrid } from '@/components/OptionGrid';
import { ComboAnswer } from './ComboAnswer';
import { ExpertAnswer } from './ExpertAnswer';
import { Prompt } from './Prompt';
import { QuitConfirmation } from './QuitConfirmation';
import { preloadFlags } from '@/lib/prefetch';

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
    const file = entityById(id)?.flag.file;
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
    const entity = entityById(question.entityId);
    if (!entity) return;
    reveal(gradeFreeText(question, typed, entity));
  }, [question, typed, reveal]);

  /**
   * Skipping is an answer of nothing, not a submission of whatever happens to
   * be in the box. Sharing `submitText` meant Skip graded half-typed text —
   * two buttons doing the same thing under different names.
   */
  const skipQuestion = useCallback(() => {
    if (!question) return;
    const entity = entityById(question.entityId);
    if (!entity) return;
    reveal(gradeFreeText(question, null, entity));
  }, [question, reveal]);

  const isCombo = question?.halves !== undefined;
  const isExpert = question !== undefined && !isCombo && question.options === undefined;

  /*
    Memoised for identity, not for speed.

    Both are cheap — `buildPool` measures at 0.016ms — but both were rebuilt on
    every render, including every keystroke in expert mode, and a fresh array
    identity each time defeated the very memos that consume them: the
    `useMemo` inside `Autocomplete` lists `pool` as a dependency, and the
    keydown `useEffect` in `OptionGrid` lists `options`. Neither was doing
    anything. Profiling (P0) found no main-thread blocking on this path even at
    6x CPU, so this is a correctness-of-contract fix and nothing more.

    They sit above the early return because hooks may not be conditional.
  */
  const optionIds = question?.options;
  const options = useMemo(
    () =>
      (optionIds ?? [])
        .map((id) => entityById(id))
        .filter((entity): entity is Entity => entity !== undefined),
    [optionIds],
  );

  // Only expert mode reads this, and only to bound its suggestions.
  const config = session?.config;
  const pool = useMemo(
    () => (isExpert && config ? buildPool(config) : undefined),
    [isExpert, config],
  );

  // Leaving mid-question must not fire the pending advance.
  useEffect(() => clearTimer, []);

  /**
   * Fetch the *next* question's flags while this one is on screen (T7.4).
   *
   * Most flags are under a kilobyte, but 26 are over 20KB and Serbia is 177KB,
   * so an eight-option question could otherwise stall visibly the moment it
   * renders. Doing this a question early hides the download entirely.
   */
  const nextQuestion = session?.questions[session.currentIndex + 1];
  useEffect(() => {
    if (!nextQuestion) return;
    preloadFlags(flagsShownBy(nextQuestion));
    // Keyed on the next question rather than on the whole session, which also
    // changes when the score does — the effect said more than it meant.
  }, [nextQuestion]);

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

  const answerEntity = entityById(question.entityId);
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
          className="mx-auto mt-2 h-1 w-full max-w-3xl bg-line sm:mt-3"
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

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-4 sm:py-6">
        <h1 className="sr-only">
          Question {questionNumber} of {total}
        </h1>

        {confirmingQuit && (
          <QuitConfirmation
            answered={session.currentIndex}
            total={total}
            onQuit={() => {
              clearTimer();
              quit();
              navigate('/', { replace: true });
            }}
            onKeepPlaying={() => setConfirmingQuit(false)}
          />
        )}

        <Prompt question={question} />

        <div className="mt-4 sm:mt-6">
          {isCombo ? (
            <ComboAnswer question={question} revealed={revealed} onSubmit={reveal} />
          ) : isExpert ? (
            <ExpertAnswer
              question={question}
              value={typed}
              onChange={setTyped}
              onSubmit={submitText}
              onSkip={skipQuestion}
              pool={pool}
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
