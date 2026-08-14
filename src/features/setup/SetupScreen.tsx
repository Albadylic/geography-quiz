import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { CONTINENTS, type Continent } from '@/data/constants';
import { buildPool, summarisePool } from '@/engine/pool';
import { supportsBothDirections } from '@/engine/questions';
import { randomSeed } from '@/engine/rng';
import type {
  Difficulty,
  Direction,
  PoolSource,
  QuizConfig,
  QuizLength,
  QuizMode,
} from '@/engine/types';
import { HARDEST_UNLOCK_THRESHOLD } from '@/engine/stats';
import { useSessionStore } from '@/store/sessionStore';
import { useStatsStore } from '@/store/statsStore';
import { ChoiceGroup, type Choice } from '@/components/ChoiceGroup';
import { ScreenStub } from '@/components/ScreenStub';

const MODE_NAMES: Record<QuizMode, string> = {
  flags: 'Flags',
  capitals: 'Capitals',
  combo: 'Combo',
};

const DIRECTION_CHOICES: Record<QuizMode, ReadonlyArray<Choice<Direction>>> = {
  flags: [
    { value: 'a-to-b', label: 'Flag → Country' },
    { value: 'b-to-a', label: 'Country → Flag' },
    { value: 'mixed', label: 'Mixed' },
  ],
  capitals: [
    { value: 'a-to-b', label: 'Country → Capital' },
    { value: 'b-to-a', label: 'Capital → Country' },
    { value: 'mixed', label: 'Mixed' },
  ],
  combo: [{ value: 'a-to-b', label: 'Country → flag and capital' }],
};

const DIFFICULTY_CHOICES: ReadonlyArray<Choice<Difficulty>> = [
  { value: 'easy', label: 'Easy', hint: '4 options' },
  { value: 'medium', label: 'Medium', hint: '6 options' },
  { value: 'hard', label: 'Hard', hint: '8 options' },
  { value: 'expert', label: 'Expert', hint: 'Type the answer' },
];

const LENGTH_CHOICES: ReadonlyArray<Choice<`${QuizLength}`>> = [
  { value: '20', label: '20' },
  { value: '50', label: '50' },
  { value: '100', label: '100' },
  { value: 'all', label: 'All' },
];

function parseLength(value: string): QuizLength {
  return value === 'all' ? 'all' : (Number(value) as QuizLength);
}

function isQuizMode(value: string | undefined): value is QuizMode {
  return value === 'flags' || value === 'capitals' || value === 'combo';
}

export function SetupScreen() {
  const { mode } = useParams();
  const navigate = useNavigate();
  const startSession = useSessionStore((state) => state.start);
  // §3.3: the toggle is a filter on `status`, applied to the pool — the
  // dataset itself never changes.
  const unMembersOnly = useStatsStore((state) => state.data.settings.unMembersOnly);
  const answered = useStatsStore((state) => state.data.totals.questionsAnswered);

  const [direction, setDirection] = useState<Direction>('a-to-b');
  const [difficulty, setDifficulty] = useState<Difficulty>('easy');
  const [length, setLength] = useState<QuizLength>(20);
  const [continents, setContinents] = useState<Continent[] | 'all'>('all');
  const [searchParams] = useSearchParams();

  // §8: Hardest needs the player's own history, so it stays locked until there
  // is enough of it to select on.
  const hardestUnlocked = answered >= HARDEST_UNLOCK_THRESHOLD;
  const requestedHardest = searchParams.get('source') === 'hardest';
  const [source, setSource] = useState<PoolSource>(
    requestedHardest && answered >= HARDEST_UNLOCK_THRESHOLD ? 'hardest' : 'all',
  );
  const effectiveSource: PoolSource = hardestUnlocked ? source : 'all';

  const config = useMemo<QuizConfig | null>(() => {
    if (!isQuizMode(mode)) return null;
    return {
      mode,
      direction: mode === 'combo' ? 'a-to-b' : direction,
      // §6.3 fixes combo's difficulty. Medium keeps the distractor ladder
      // sensible (§6.2 rules out cross-continent capitals); the group size is
      // fixed at four by generation, not by this.
      difficulty: mode === 'combo' ? 'medium' : difficulty,
      length,
      pool: { continents, source: effectiveSource },
      seed: 0, // replaced with a fresh seed on start
    };
  }, [mode, direction, difficulty, length, continents, effectiveSource]);

  const bothDirections = !isQuizMode(mode) || supportsBothDirections(mode, difficulty);

  const summary = useMemo(() => {
    if (!config) return null;
    return summarisePool(buildPool(config, { unMembersOnly }), config.length);
  }, [config, unMembersOnly]);

  if (mode === 'colour') {
    return <ScreenStub title="Colour the flag" ticket="T6.1" />;
  }
  if (!isQuizMode(mode) || !config || !summary) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-16">
        <h1 className="display-xl text-4xl text-paper">Unknown mode</h1>
        <p className="mt-4 text-paper-dim">
          There&rsquo;s no quiz called &ldquo;{mode}&rdquo;.
        </p>
        <Link to="/" className="label-caps mt-8 inline-block bg-paper px-5 py-3 text-sm text-ink">
          Pick a mode
        </Link>
      </div>
    );
  }

  const toggleContinent = (continent: Continent) => {
    setContinents((current) => {
      // "Everywhere" is its own choice rather than "all seven ticked", so
      // clicking a continent from that state means "just this one" — which is
      // what someone reaching for Oceania is asking for.
      if (current === 'all') return [continent];

      const next = current.includes(continent)
        ? current.filter((candidate) => candidate !== continent)
        : [...current, continent];
      // Unticking the last one, or ticking every one, is Everywhere.
      if (next.length === 0 || next.length === CONTINENTS.length) return 'all';
      return next;
    });
  };

  const start = () => {
    startSession({ ...config, seed: randomSeed() }, { unMembersOnly });
    navigate(`/play/${mode}`);
  };

  const canStart = summary.questionCount > 0;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10">
      <p className="label-caps text-xs text-signal-yellow">Set up</p>
      <h1 className="display-xl mt-2 text-4xl text-paper sm:text-5xl">
        {MODE_NAMES[mode]}
      </h1>

      <div className="mt-8 flex flex-col gap-6">
        {mode !== 'combo' && bothDirections && (
          <ChoiceGroup
            legend="Direction"
            choices={DIRECTION_CHOICES[mode]}
            value={direction}
            onChange={setDirection}
            columns={3}
          />
        )}

        {mode !== 'combo' && !bothDirections && (
          <p className="border-l-4 border-line bg-ink-raised px-4 py-3 text-sm text-paper-dim">
            Expert flags questions show you a flag and ask you to type the country
            &mdash; there&rsquo;s no way to type a flag.
          </p>
        )}

        {mode !== 'combo' && (
          <ChoiceGroup
            legend="Difficulty"
            choices={DIFFICULTY_CHOICES}
            value={difficulty}
            onChange={setDifficulty}
            columns={4}
          />
        )}

        <ChoiceGroup
          legend="Questions"
          choices={LENGTH_CHOICES}
          value={String(length) as `${QuizLength}`}
          onChange={(value) => setLength(parseLength(value))}
          columns={4}
        />

        <fieldset>
          <legend className="label-caps mb-2 text-xs text-paper-faint">Which countries</legend>
          <div className="grid grid-cols-1 gap-px border-2 border-line bg-line sm:grid-cols-2">
            {(['all', 'hardest'] as const).map((option) => {
              const selected = effectiveSource === option;
              const locked = option === 'hardest' && !hardestUnlocked;
              return (
                <label
                  key={option}
                  className={[
                    'flex min-h-11 cursor-pointer flex-col justify-center px-4 py-3 transition-colors',
                    'has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-signal-yellow has-[:focus-visible]:-outline-offset-3',
                    locked
                      ? 'cursor-not-allowed bg-ink-raised text-paper-faint'
                      : selected
                        ? 'bg-paper text-ink'
                        : 'bg-ink-raised text-paper hover:bg-ink-sunken',
                  ].join(' ')}
                >
                  <input
                    type="radio"
                    name="pool-source"
                    checked={selected}
                    disabled={locked}
                    onChange={() => setSource(option)}
                    className="sr-only"
                  />
                  <span className="display-md text-sm">
                    {option === 'all' ? 'Everything' : 'My hardest'}
                  </span>
                  <span
                    className={`text-xs ${selected && !locked ? 'text-ink/70' : 'text-paper-faint'}`}
                  >
                    {option === 'all'
                      ? 'Draw from the whole pool'
                      : locked
                        ? `Play a few rounds first — this mode uses your own results. ${answered}/${HARDEST_UNLOCK_THRESHOLD} answered.`
                        : 'The countries you keep getting wrong'}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <fieldset>
          <legend className="label-caps mb-2 text-xs text-paper-faint">Continents</legend>
          <div className="grid grid-cols-2 gap-px border-2 border-line bg-line sm:grid-cols-4">
            <label
              className={[
                'flex min-h-11 cursor-pointer items-center px-4 py-3 transition-colors',
                'has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-signal-yellow has-[:focus-visible]:-outline-offset-3',
                continents === 'all'
                  ? 'bg-paper text-ink'
                  : 'bg-ink-raised text-paper hover:bg-ink-sunken',
              ].join(' ')}
            >
              <input
                type="checkbox"
                checked={continents === 'all'}
                onChange={() => setContinents('all')}
                className="sr-only"
              />
              <span className="display-md text-sm">Everywhere</span>
            </label>

            {CONTINENTS.map((continent) => {
              const selected = continents !== 'all' && continents.includes(continent);
              return (
                <label
                  key={continent}
                  className={[
                    'flex min-h-11 cursor-pointer items-center px-4 py-3 transition-colors',
                    'has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-signal-yellow has-[:focus-visible]:-outline-offset-3',
                    selected
                      ? 'bg-paper text-ink'
                      : 'bg-ink-raised text-paper hover:bg-ink-sunken',
                  ].join(' ')}
                >
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => toggleContinent(continent)}
                    className="sr-only"
                  />
                  <span className="text-sm">{continent}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
      </div>

      {/*
        §5.2 step 2: the cap is shown before the user starts, not discovered
        when the quiz runs short.
      */}
      <p
        className="mt-8 border-l-4 border-signal-yellow bg-ink-raised px-4 py-3 text-sm text-paper"
        data-testid="pool-summary"
        role="status"
      >
        {summary.capped ? (
          <>
            <strong className="text-signal-yellow">
              {describeSelection(continents)} has {summary.poolSize}{' '}
              {summary.poolSize === 1 ? 'country' : 'countries'}
            </strong>{' '}
            — this quiz will be {summary.questionCount}{' '}
            {summary.questionCount === 1 ? 'question' : 'questions'}.
          </>
        ) : (
          <>
            {summary.questionCount} {summary.questionCount === 1 ? 'question' : 'questions'}{' '}
            from {summary.poolSize} countries.
          </>
        )}
      </p>

      <button
        type="button"
        onClick={start}
        disabled={!canStart}
        className="label-caps mt-6 w-full bg-signal-red px-6 py-4 text-base text-paper transition-colors hover:bg-paper hover:text-ink disabled:cursor-not-allowed disabled:bg-ink-raised disabled:text-paper-faint sm:w-auto"
      >
        Start quiz
      </button>
    </div>
  );
}

function describeSelection(continents: Continent[] | 'all'): string {
  if (continents === 'all') return 'The world';
  if (continents.length === 1) return continents[0]!;
  return 'Your selection';
}
