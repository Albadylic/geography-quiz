import { entities as allEntities } from '@/data/entities.generated';
import type { Continent, Entity, Status } from '@/data/schema';
import type { CountrySet, QuizConfig, QuizLength, QuizMode } from './types';

/**
 * Pool building — plan §5.2 step 1.
 *
 * Exclusion is always by *data*: an entity drops out of a capitals pool
 * because its `capitals` array is empty, never because its id appears on a
 * hard-coded list (locked decision 4).
 */

export interface PoolOptions {
  /** Overrides the dataset, for tests. */
  source?: readonly Entity[];
}

/**
 * Which statuses each country set admits.
 *
 * The sets nest: every set is a superset of the one above it, so widening the
 * choice only ever adds countries. A test asserts that property rather than
 * trusting the table below to stay consistent.
 *
 * `un` includes the two permanent observers, Palestine and Vatican City —
 * "UN countries" as most people mean it, rather than the strict member list.
 */
const STATUSES_IN_SET: Record<CountrySet, readonly Status[]> = {
  un: ['un-member', 'un-observer'],
  'un-plus-disputed': ['un-member', 'un-observer', 'partially-recognised'],
  all: [
    'un-member',
    'un-observer',
    'partially-recognised',
    'dependency',
    'special-administrative-region',
  ],
};

export function isInCountrySet(entity: Entity, set: CountrySet): boolean {
  return STATUSES_IN_SET[set].includes(entity.status);
}

/** Every entity in a set, ignoring mode and continent — for counts and copy. */
export function countrySetSize(
  set: CountrySet,
  source: readonly Entity[] = allEntities,
): number {
  return source.filter((entity) => isInCountrySet(entity, set)).length;
}

/** An entity belongs to a continent through its primary or its alt continents. */
export function isInContinent(entity: Entity, continent: Continent): boolean {
  return (
    entity.continent === continent || (entity.altContinents ?? []).includes(continent)
  );
}

/** Modes that ask for a capital need an entity that has one. */
export function isViableFor(entity: Entity, mode: QuizMode): boolean {
  if (mode === 'capitals' || mode === 'combo') return entity.capitals.length > 0;
  return true;
}

export function buildPool(
  config: Pick<QuizConfig, 'mode' | 'pool'>,
  options: PoolOptions = {},
): Entity[] {
  const source = options.source ?? allEntities;
  const continents = config.pool.continents;

  return source.filter((entity) => {
    if (!isViableFor(entity, config.mode)) return false;
    if (!isInCountrySet(entity, config.pool.countrySet)) return false;
    if (continents === 'all') return true;
    return continents.some((continent) => isInContinent(entity, continent));
  });
}

/**
 * How many questions a config will actually produce, given its pool.
 *
 * The setup screen shows this *before the user starts* (§5.2 step 2), so
 * picking 100 questions in Oceania says so up front rather than silently
 * running short.
 */
export interface PoolSummary {
  poolSize: number;
  /** What the user asked for; `'all'` means the whole pool. */
  requested: QuizLength;
  /** What they will get. */
  questionCount: number;
  /** True when the pool is smaller than the requested length. */
  capped: boolean;
}

export function summarisePool(pool: readonly Entity[], length: QuizLength): PoolSummary {
  const poolSize = pool.length;
  const requestedCount = length === 'all' ? poolSize : length;
  const questionCount = Math.min(requestedCount, poolSize);
  return {
    poolSize,
    requested: length,
    questionCount,
    capped: length !== 'all' && requestedCount > poolSize,
  };
}
