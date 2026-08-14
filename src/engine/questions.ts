import type { Entity } from '@/data/schema';
import { aresKey, mulberry32, sample, shuffle, type Rng } from './rng';
import { buildPool, summarisePool, type PoolOptions } from './pool';
import {
  optionCountFor,
  type AnswerKind,
  type Direction,
  type PromptKind,
  type Question,
  type QuizConfig,
} from './types';

/**
 * Question and distractor generation — plan §5.2.
 *
 * The distractor ladder is the part that separates a quiz that teaches from
 * one that doesn't: a Chad question that offers Romania is a real test, one
 * that offers Japan is free.
 */

/** The primary capital, which is what a capitals question asks for (§3.3). */
export function primaryCapital(entity: Entity): string | undefined {
  return entity.capitals.find((capital) => capital.isPrimary)?.name;
}

/**
 * What an option shows for this answer kind. Used both to render and to
 * enforce "no duplicate labels" in an option set.
 */
export function optionLabel(entity: Entity, answerKind: AnswerKind): string {
  switch (answerKind) {
    case 'name':
      return entity.name;
    case 'capital':
      return primaryCapital(entity) ?? '';
    case 'flag':
      return entity.flag.file;
  }
}

/** Whether the option set for this answer kind is made of flags. */
function optionsAreFlags(answerKind: AnswerKind): boolean {
  return answerKind === 'flag';
}

/** Whether the prompt itself shows a flag. */
function promptIsFlag(promptKind: PromptKind): boolean {
  return promptKind === 'flag';
}

function directionFor(
  direction: Direction,
  mode: QuizConfig['mode'],
  difficulty: QuizConfig['difficulty'],
  rng: Rng,
): 'a-to-b' | 'b-to-a' {
  // Expert is free text, and a flag cannot be typed. "Country name → flag" has
  // no free-text form, so expert flags questions are always flag → name.
  if (difficulty === 'expert' && mode === 'flags') return 'a-to-b';
  if (direction === 'mixed') return rng() < 0.5 ? 'a-to-b' : 'b-to-a';
  return direction;
}

/** Whether this config can ask its question both ways round. */
export function supportsBothDirections(
  mode: QuizConfig['mode'],
  difficulty: QuizConfig['difficulty'],
): boolean {
  return !(difficulty === 'expert' && mode === 'flags');
}

interface PromptSpec {
  prompt: { kind: PromptKind; value: string };
  answerKind: AnswerKind;
}

/**
 * flags:    a-to-b = flag → name,     b-to-a = name → flag
 * capitals: a-to-b = country → capital, b-to-a = capital → country
 */
function promptFor(
  entity: Entity,
  mode: QuizConfig['mode'],
  direction: 'a-to-b' | 'b-to-a',
): PromptSpec | null {
  if (mode === 'flags') {
    return direction === 'a-to-b'
      ? { prompt: { kind: 'flag', value: entity.flag.file }, answerKind: 'name' }
      : { prompt: { kind: 'name', value: entity.name }, answerKind: 'flag' };
  }

  const capital = primaryCapital(entity);
  if (!capital) return null; // filtered out by the pool, belt and braces

  return direction === 'a-to-b'
    ? { prompt: { kind: 'name', value: entity.name }, answerKind: 'capital' }
    : { prompt: { kind: 'capital', value: capital }, answerKind: 'name' };
}

// ---------------------------------------------------------------------------
// The ladder
// ---------------------------------------------------------------------------

/**
 * Candidate tiers in priority order (§5.2 step 4).
 *
 * Normal difficulties climb *towards* the answer — the most confusable
 * candidates first — so a hard question is genuinely hard. Easy inverts it and
 * reaches for a different continent first, so the answer is more separable.
 *
 * `useConfusable` is false for questions that involve no flag. `confusableWith`
 * records *visual* flag similarity: Chad and Romania fly near-identical flags,
 * but N'Djamena and Bucharest are not remotely confusable, so using that
 * ladder rung on a capitals question would drag in a distractor from the wrong
 * continent for no benefit — the exact thing §6.2 warns about.
 *
 * The last tier is always the rest of the pool, so a thin continent can still
 * fill its option slots rather than producing a short option set.
 */
export function distractorTiers(
  answer: Entity,
  pool: readonly Entity[],
  difficulty: QuizConfig['difficulty'],
  useConfusable: boolean,
): Entity[][] {
  const candidates = pool.filter((entity) => entity.id !== answer.id);

  if (difficulty === 'easy') {
    const differentContinent = candidates.filter(
      (entity) => entity.continent !== answer.continent,
    );
    const rest = candidates.filter((entity) => entity.continent === answer.continent);
    return [differentContinent, rest];
  }

  const confusableIds = new Set(useConfusable ? (answer.confusableWith ?? []) : []);
  const remaining = candidates.filter((entity) => !confusableIds.has(entity.id));
  const hasSubregion = answer.subregion !== undefined;

  return [
    candidates.filter((entity) => confusableIds.has(entity.id)),
    remaining.filter((entity) => hasSubregion && entity.subregion === answer.subregion),
    remaining.filter(
      (entity) =>
        entity.subregion !== answer.subregion && entity.continent === answer.continent,
    ),
    remaining.filter(
      (entity) =>
        entity.subregion !== answer.subregion && entity.continent !== answer.continent,
    ),
  ];
}

/**
 * Builds one option set: the answer plus distractors, shuffled.
 *
 * Guards, all of which have bitten real quiz apps:
 *  - exactly one correct option
 *  - no duplicate labels
 *  - no two options showing identical flag artwork, and none identical to a
 *    flag shown in the prompt — nine entities fly the French tricolour, so
 *    "which of these is France" could otherwise offer Réunion too (§3.3)
 */
export function buildOptions(
  rng: Rng,
  answer: Entity,
  pool: readonly Entity[],
  config: Pick<QuizConfig, 'difficulty' | 'mode'>,
  answerKind: AnswerKind,
  promptKind: PromptKind,
  /** Overrides the difficulty's option count — combo fixes its groups at 4. */
  countOverride?: number,
): string[] {
  const count = countOverride ?? optionCountFor(config.difficulty);
  if (count === null) return [];

  const flagsMatter = optionsAreFlags(answerKind) || promptIsFlag(promptKind);
  const chosen: Entity[] = [answer];
  const usedLabels = new Set([optionLabel(answer, answerKind)]);
  /**
   * Ids whose flag is indistinguishable from one already on screen. Seeded
   * with the answer's own shared-flag partners.
   */
  const flagBlocked = new Set<string>(flagsMatter ? (answer.flag.sharedWith ?? []) : []);

  const isConfusablePartner = (entity: Entity) =>
    (answer.confusableWith ?? []).includes(entity.id);

  const accept = (candidate: Entity): boolean => {
    if (chosen.some((entity) => entity.id === candidate.id)) return false;

    const label = optionLabel(candidate, answerKind);
    if (!label || usedLabels.has(label)) return false;

    if (flagsMatter) {
      // A flag identical to one already shown makes the question
      // unanswerable — unless it is a curated confusable pair, which is a
      // deliberate test rather than an accident (§5.2).
      if (flagBlocked.has(candidate.id) && !isConfusablePartner(candidate)) return false;
    }

    chosen.push(candidate);
    usedLabels.add(label);
    if (flagsMatter) {
      for (const shared of candidate.flag.sharedWith ?? []) flagBlocked.add(shared);
    }
    return true;
  };

  for (const tier of distractorTiers(answer, pool, config.difficulty, flagsMatter)) {
    if (chosen.length >= count) break;
    for (const candidate of shuffle(rng, tier)) {
      if (chosen.length >= count) break;
      accept(candidate);
    }
  }

  return shuffle(rng, chosen).map((entity) => entity.id);
}

// ---------------------------------------------------------------------------
// Session-level generation
// ---------------------------------------------------------------------------

export interface GenerateOptions extends PoolOptions {
  /**
   * Weight per entity id for `pool.source: 'hardest'` (§8). Supplied by the
   * caller so the engine stays free of storage concerns.
   */
  weights?: ReadonlyMap<string, number>;
}

export interface GeneratedQuiz {
  questions: Question[];
  /** The pool the questions were drawn from, for the setup screen's message. */
  poolSize: number;
}

/**
 * Generates a whole session's questions.
 *
 * Deterministic in the config's seed: same seed, same questions, same options,
 * same order (§12).
 */
export function generateQuestions(
  config: QuizConfig,
  options: GenerateOptions = {},
): GeneratedQuiz {
  const pool = buildPool(config, options);
  const { questionCount } = summarisePool(pool, config.length);
  const rng = mulberry32(config.seed);

  const selected =
    config.pool.source === 'hardest' && options.weights
      ? selectHardest(rng, pool, options.weights, questionCount)
      : sample(rng, pool, questionCount);

  const questions: Question[] = [];
  for (const [index, entity] of selected.entries()) {
    if (config.mode === 'combo') {
      questions.push(buildComboQuestion(rng, entity, pool, config, index));
      continue;
    }

    const direction = directionFor(config.direction, config.mode, config.difficulty, rng);
    const spec = promptFor(entity, config.mode, direction);
    if (!spec) continue;

    const optionIds = buildOptions(
      rng,
      entity,
      pool,
      config,
      spec.answerKind,
      spec.prompt.kind,
    );

    const question: Question = {
      id: `q${index + 1}-${entity.id}`,
      entityId: entity.id,
      prompt: spec.prompt,
      answerKind: spec.answerKind,
      correctIds: [entity.id],
    };
    if (optionIds.length > 0) question.options = optionIds;

    questions.push(question);
  }

  return { questions, poolSize: pool.length };
}

/** Combo shows two fixed groups of four (§6.3). */
export const COMBO_OPTION_COUNT = 4;

/**
 * A combo question — §6.3. One country prompt, two independent option groups:
 * its flag and its capital.
 *
 * The two halves each carry their own options and their own `statMode`, which
 * is what lets grading score them separately and record two distinct
 * per-entity outcomes (locked decision 3).
 */
function buildComboQuestion(
  rng: Rng,
  entity: Entity,
  pool: readonly Entity[],
  config: QuizConfig,
  index: number,
): Question {
  const flagOptions = buildOptions(
    rng,
    entity,
    pool,
    config,
    'flag',
    'name',
    COMBO_OPTION_COUNT,
  );
  const capitalOptions = buildOptions(
    rng,
    entity,
    pool,
    config,
    'capital',
    'name',
    COMBO_OPTION_COUNT,
  );

  return {
    id: `q${index + 1}-${entity.id}`,
    entityId: entity.id,
    prompt: { kind: 'name', value: entity.name },
    // Nominal: the halves are what actually get answered.
    answerKind: 'flag',
    correctIds: [entity.id],
    halves: [
      {
        statMode: 'flags',
        answerKind: 'flag',
        options: flagOptions,
        correctIds: [entity.id],
      },
      {
        statMode: 'capitals',
        answerKind: 'capital',
        options: capitalOptions,
        correctIds: [entity.id],
      },
    ],
  };
}

/**
 * Hardest-countries selection (§8): take the top 2N by weight, then sample N
 * from that with weighted randomness so consecutive sessions differ.
 *
 * Lives here rather than in adaptive.ts because it is a selection strategy;
 * adaptive.ts owns the weighting itself and lands in T5.1.
 */
function selectHardest(
  rng: Rng,
  pool: readonly Entity[],
  weights: ReadonlyMap<string, number>,
  count: number,
): Entity[] {
  const weightOf = (id: string) => {
    const stored = weights.get(id);
    return stored !== undefined && stored > 0 ? stored : DEFAULT_WEIGHT;
  };

  const ranked = [...pool].sort((a, b) => {
    const difference = weightOf(b.id) - weightOf(a.id);
    // Ties break on id so the ranking is stable rather than sort-dependent.
    // The weighted draw below is what stops equal weights producing the same
    // session every time.
    return difference !== 0 ? difference : a.id.localeCompare(b.id);
  });

  const shortlist = ranked.slice(0, Math.min(count * 2, ranked.length));
  return weightedSampleEntities(rng, shortlist, weights, count);
}

/**
 * Weight to use when an entity has no recorded weight at all. Not a tiny
 * epsilon: a near-zero weight makes the A-Res key so extreme that the draw
 * stops being random (see `aresKey`). This is the §8 unseen weight, which is
 * what an entity with no history is worth anyway.
 */
const DEFAULT_WEIGHT = 0.5 * 0.55;

function weightedSampleEntities(
  rng: Rng,
  items: readonly Entity[],
  weights: ReadonlyMap<string, number>,
  count: number,
): Entity[] {
  const wanted = Math.min(count, items.length);
  const keyed = items.map((entity) => {
    const stored = weights.get(entity.id);
    const weight = stored !== undefined && stored > 0 ? stored : DEFAULT_WEIGHT;
    return { entity, key: aresKey(rng(), weight) };
  });
  keyed.sort((a, b) => b.key - a.key);
  return keyed.slice(0, wanted).map((entry) => entry.entity);
}
