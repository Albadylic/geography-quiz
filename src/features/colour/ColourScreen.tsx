import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ColourToken } from '@/data/schema';
import { entities } from '@/data/entities.generated';
import {
  buildColourQuestion,
  colourablePool,
  COLOUR_HEX,
  COLOUR_NAMES,
  gradeColouring,
  type ColourDifficulty,
  type ColourQuestion,
} from '@/engine/colour';
import { mulberry32, randomSeed, shuffle } from '@/engine/rng';
import { FlagImage } from '@/components/FlagImage';
import { useStatsStore } from '@/store/statsStore';

const byId = new Map(entities.map((entity) => [entity.id, entity]));

const ROUND_LENGTH = 10;

/** Colour the Flag — plan §7. */
export function ColourScreen() {
  const [difficulty, setDifficulty] = useState<ColourDifficulty | null>(null);
  const [seed] = useState(() => randomSeed());

  if (!difficulty) return <ColourSetup onStart={setDifficulty} />;
  return <ColourRound difficulty={difficulty} seed={seed} onExit={() => setDifficulty(null)} />;
}

function ColourSetup({ onStart }: { onStart: (difficulty: ColourDifficulty) => void }) {
  const countrySet = useStatsStore((state) => state.data.settings.countrySet);
  const available = colourablePool(countrySet).length;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10">
      <p className="label-caps text-xs text-signal-yellow">Set up</p>
      <h1 className="display-xl mt-2 text-4xl text-paper sm:text-5xl">Colour the flag</h1>
      <p className="mt-4 max-w-prose text-paper-dim">
        Fill in a blank flag from memory. Pick a colour, then tap a region.{' '}
        {available} flags are available.
      </p>

      <fieldset className="mt-8">
        <legend className="label-caps mb-2 text-xs text-paper-faint">Palette</legend>
        <div className="grid grid-cols-1 gap-px border-2 border-line bg-line sm:grid-cols-3">
          {(
            [
              ['easy', 'Easy', 'Only the right colours, shuffled'],
              ['medium', 'Medium', 'The right colours plus 3 extras'],
              ['hard', 'Hard', 'The right colours plus 6 extras'],
            ] as const
          ).map(([value, label, hint]) => (
            <button
              key={value}
              type="button"
              onClick={() => onStart(value)}
              className="bg-ink-raised px-4 py-4 text-left transition-colors hover:bg-ink-sunken"
            >
              <span className="display-md block text-base text-paper">{label}</span>
              <span className="mt-1 block text-sm text-paper-dim">{hint}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <p className="mt-8 text-sm text-paper-faint">
        <Link to="/" className="text-paper underline">
          Back to the modes
        </Link>
      </p>
    </div>
  );
}

interface HistoryState {
  /** Every fill so far; the last entry is what is on screen. */
  past: Array<Partial<Record<string, ColourToken>>>;
  future: Array<Partial<Record<string, ColourToken>>>;
}

function ColourRound({
  difficulty,
  seed,
  onExit,
}: {
  difficulty: ColourDifficulty;
  seed: number;
  onExit: () => void;
}) {
  const countrySet = useStatsStore((state) => state.data.settings.countrySet);
  const questions = useMemo(() => {
    const rng = mulberry32(seed);
    return shuffle(rng, colourablePool(countrySet))
      .slice(0, ROUND_LENGTH)
      .map((entity, index) => buildColourQuestion(rng, entity, difficulty, index))
      .filter((question): question is ColourQuestion => question !== null);
  }, [seed, difficulty, countrySet]);

  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<ColourToken | 'eraser' | null>(null);
  const [history, setHistory] = useState<HistoryState>({ past: [{}], future: [] });
  const [graded, setGraded] = useState(false);
  const [score, setScore] = useState({ regions: 0, correct: 0 });

  const question = questions[index];
  const filled = history.past[history.past.length - 1] ?? {};

  if (!question) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-16">
        <h1 className="display-xl text-4xl text-paper">Round finished</h1>
        <p className="mt-4 text-paper-dim">
          {score.correct} of {score.regions} regions correct.
        </p>
        <button
          type="button"
          onClick={onExit}
          className="label-caps mt-8 bg-signal-red px-5 py-3 text-sm text-paper"
        >
          Play again
        </button>
      </div>
    );
  }

  const entity = byId.get(question.entityId)!;
  const grade = graded ? gradeColouring(question, filled) : null;

  /** Pushes a new fill state onto the history stack. */
  const commit = (next: Partial<Record<string, ColourToken>>) => {
    setHistory((current) => ({ past: [...current.past, next], future: [] }));
  };

  const paintRegion = (regionId: string) => {
    if (graded || selected === null) return;
    const next = { ...filled };
    if (selected === 'eraser') delete next[regionId];
    else next[regionId] = selected;
    commit(next);
  };

  const undo = () => {
    setHistory((current) => {
      if (current.past.length <= 1) return current;
      const past = current.past.slice(0, -1);
      return { past, future: [current.past[current.past.length - 1]!, ...current.future] };
    });
  };

  const redo = () => {
    setHistory((current) => {
      const [next, ...rest] = current.future;
      if (!next) return current;
      return { past: [...current.past, next], future: rest };
    });
  };

  const clearAll = () => commit({});

  const allFilled = question.template.regions.every((region) => filled[region.id]);

  const check = () => {
    const result = gradeColouring(question, filled);
    setScore((current) => ({
      regions: current.regions + result.regionCount,
      correct: current.correct + result.correctCount,
    }));
    setGraded(true);
  };

  const next = () => {
    setIndex((current) => current + 1);
    setHistory({ past: [{}], future: [] });
    setSelected(null);
    setGraded(false);
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={onExit}
          className="label-caps text-xs text-paper-faint hover:text-paper"
        >
          Quit
        </button>
        <p className="label-caps ml-auto text-xs text-paper-dim">
          <span className="text-paper">{index + 1}</span> / {questions.length}
        </p>
      </div>

      <h1 className="display-xl mt-4 text-3xl text-paper sm:text-5xl">{entity.name}</h1>

      <svg
        viewBox={question.template.viewBox}
        className="mt-6 w-full border-2 border-line"
        role="img"
        aria-label={`Blank flag of ${entity.name}, ${question.template.name}`}
      >
        {question.template.regions.map((region) => {
          const token = filled[region.id];
          return (
            <path
              key={region.id}
              data-region={region.id}
              d={region.d}
              fill={token ? COLOUR_HEX[token] : '#15151d'}
              stroke="#2b2b38"
              strokeWidth={2}
              role="button"
              tabIndex={graded ? -1 : 0}
              aria-label={`${region.label}${token ? `, ${COLOUR_NAMES[token]}` : ', not filled'}`}
              className={graded ? '' : 'cursor-pointer'}
              onClick={() => paintRegion(region.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  paintRegion(region.id);
                }
              }}
            />
          );
        })}
      </svg>

      {!graded && (
        <>
          <fieldset className="mt-6">
            <legend className="label-caps mb-2 text-xs text-paper-faint">Colours</legend>
            <div className="flex flex-wrap gap-px border-2 border-line bg-line">
              {question.palette.map((token) => (
                <button
                  key={token}
                  type="button"
                  aria-pressed={selected === token}
                  onClick={() => setSelected(token)}
                  className={[
                    'flex min-h-11 flex-1 items-center gap-2 px-3 py-2 text-left transition-colors',
                    selected === token ? 'bg-paper text-ink' : 'bg-ink-raised text-paper',
                  ].join(' ')}
                >
                  <span
                    aria-hidden="true"
                    className="block h-6 w-6 shrink-0 border border-line"
                    style={{ backgroundColor: COLOUR_HEX[token] }}
                  />
                  {/* §7: every swatch carries a visible name, not just a chip. */}
                  <span className="text-sm">{COLOUR_NAMES[token]}</span>
                </button>
              ))}
              <button
                type="button"
                aria-pressed={selected === 'eraser'}
                onClick={() => setSelected('eraser')}
                className={[
                  'flex min-h-11 items-center px-3 py-2 text-sm transition-colors',
                  selected === 'eraser' ? 'bg-paper text-ink' : 'bg-ink-raised text-paper',
                ].join(' ')}
              >
                Eraser
              </button>
            </div>
          </fieldset>

          <div className="mt-4 flex flex-wrap gap-px">
            <button
              type="button"
              onClick={undo}
              disabled={history.past.length <= 1}
              className="label-caps bg-ink-raised px-4 py-3 text-xs text-paper disabled:text-paper-faint"
            >
              Undo
            </button>
            <button
              type="button"
              onClick={redo}
              disabled={history.future.length === 0}
              className="label-caps bg-ink-raised px-4 py-3 text-xs text-paper disabled:text-paper-faint"
            >
              Redo
            </button>
            <button
              type="button"
              onClick={clearAll}
              className="label-caps bg-ink-raised px-4 py-3 text-xs text-paper"
            >
              Clear all
            </button>
          </div>

          <button
            type="button"
            onClick={check}
            disabled={!allFilled}
            className="label-caps mt-4 w-full bg-signal-red px-6 py-4 text-sm text-paper disabled:cursor-not-allowed disabled:bg-ink-raised disabled:text-paper-faint"
          >
            {allFilled ? 'Check my flag' : 'Fill every region first'}
          </button>
        </>
      )}

      {grade && (
        <div className="mt-6">
          <h2 className="display-md text-xl text-paper">
            {grade.allCorrect
              ? 'Exactly right'
              : `${grade.correctCount} of ${grade.regionCount} regions right`}
          </h2>

          <div className="mt-4 flex flex-col gap-4 sm:flex-row">
            <div className="flex-1">
              <p className="label-caps mb-2 text-xs text-paper-faint">The real flag</p>
              {/* §7: the correct flag is shown alongside the results. */}
              <FlagImage entity={entity} revealName className="w-full" />
            </div>

            <ul className="flex-1 self-start border-2 border-line">
              {grade.results.map((result) => (
                <li
                  key={result.regionId}
                  className={`flex items-center gap-2 px-3 py-2 text-sm ${
                    result.correct ? 'bg-correct/20 text-paper' : 'bg-wrong/20 text-paper'
                  }`}
                >
                  <span aria-hidden="true">{result.correct ? '✓' : '✗'}</span>
                  <span className="min-w-0 flex-1">
                    {result.label}: {COLOUR_NAMES[result.expected]}
                    {!result.correct && result.given
                      ? ` (you said ${COLOUR_NAMES[result.given]})`
                      : ''}
                    {!result.correct && !result.given ? ' (left blank)' : ''}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <button
            type="button"
            onClick={next}
            className="label-caps mt-6 w-full bg-paper px-6 py-4 text-sm text-ink"
          >
            {index + 1 >= questions.length ? 'Finish' : 'Next flag'}
          </button>
        </div>
      )}
    </div>
  );
}
