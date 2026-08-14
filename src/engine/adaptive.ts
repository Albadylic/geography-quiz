import type { EntityStat, ModeStat, StatsState } from './stats';
import { emptyModeStat, smoothedErrorRate } from './stats';
import type { StatMode } from './types';

/**
 * Per-entity difficulty weighting — plan §8.
 *
 *     errorRate = (wrong + 1) / (correct + wrong + 2)
 *     recency   = 1 + min(daysSinceSeen / 30, 1) * 0.5
 *     unseen    = seen === 0 ? 0.55 : 1
 *     weight    = errorRate * recency * unseen
 *
 * The Laplace smoothing in `errorRate` is what stops one wrong answer from
 * dominating; `recency` resurfaces stale material; `unseen` lets new material
 * in without letting it flood the session.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Stale items resurface: at 30 days or more the weight is 1.5x. */
export const RECENCY_HORIZON_DAYS = 30;
export const RECENCY_MAX_BOOST = 0.5;

/** Never seen: some new material, not all of it. */
export const UNSEEN_FACTOR = 0.55;

export function recencyFactor(lastSeen: number, now: number): number {
  if (!lastSeen || lastSeen <= 0) return 1;
  const days = Math.max(0, (now - lastSeen) / DAY_MS);
  return 1 + Math.min(days / RECENCY_HORIZON_DAYS, 1) * RECENCY_MAX_BOOST;
}

/** The §8 weight for one mode's record of one entity. */
export function entityWeight(stat: ModeStat, now: number): number {
  const seen = stat.correct + stat.wrong;
  const errorRate = smoothedErrorRate(stat);
  const recency = recencyFactor(stat.lastSeen, now);
  const unseen = seen === 0 ? UNSEEN_FACTOR : 1;
  return errorRate * recency * unseen;
}

/**
 * The weight to use when selecting for a quiz mode.
 *
 * Combo draws on both buckets, since it asks both questions. Every other mode
 * looks only at its own record — being bad at Peru's capital says nothing
 * about recognising its flag.
 */
export function weightForMode(
  stat: EntityStat | undefined,
  mode: StatMode | 'combo',
  now: number,
): number {
  const flags = stat?.byMode.flags ?? emptyModeStat();
  const capitals = stat?.byMode.capitals ?? emptyModeStat();

  if (mode === 'combo') {
    return (entityWeight(flags, now) + entityWeight(capitals, now)) / 2;
  }
  return entityWeight(mode === 'flags' ? flags : capitals, now);
}

/**
 * Weights for every entity in a pool, ready for `pool.source: 'hardest'`.
 * Entities with no record at all still get the unseen weight, so a hardest
 * session is not restricted to what the player has already been asked.
 */
export function buildWeights(
  state: Pick<StatsState, 'entityStats'>,
  entityIds: readonly string[],
  mode: StatMode | 'combo',
  now: number = Date.now(),
): Map<string, number> {
  const weights = new Map<string, number>();
  for (const id of entityIds) {
    weights.set(id, weightForMode(state.entityStats[id], mode, now));
  }
  return weights;
}

/** The stat mode a quiz mode selects against. */
export function statModeForQuiz(mode: 'flags' | 'capitals' | 'combo'): StatMode | 'combo' {
  return mode;
}
