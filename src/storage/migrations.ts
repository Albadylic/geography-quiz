import {
  CURRENT_VERSION,
  DEFAULT_SETTINGS,
  emptyEntityStat,
  emptyState,
  type AnyPersistedState,
  type PersistedStateV1,
  type PersistedStateV2,
} from './schema';

/**
 * Schema migrations — plan §2.
 *
 * Each step takes the previous version to the next. They are applied in order,
 * so a v1 payload reaches the current version however many versions behind it
 * is, and no step ever has to know about more than its own neighbours.
 */

/**
 * v1 → v2.
 *
 * v1 was the flags-only release: per-entity counts were a flat correct/wrong
 * pair, so they can only have come from flags questions. They move to
 * `byMode.flags` intact and capitals starts empty. High scores were bare
 * numbers and become records; the fields v1 never stored are left at zero
 * rather than invented.
 */
export function migrateV1ToV2(state: PersistedStateV1): PersistedStateV2 {
  const next = emptyState();

  let questionsAnswered = 0;
  let correctAnswers = 0;

  for (const [entityId, stat] of Object.entries(state.entityStats ?? {})) {
    const migrated = emptyEntityStat(entityId);
    migrated.byMode.flags = {
      correct: stat.correct ?? 0,
      wrong: stat.wrong ?? 0,
      lastSeen: stat.lastSeen ?? 0,
    };
    next.entityStats[entityId] = migrated;

    questionsAnswered += migrated.byMode.flags.correct + migrated.byMode.flags.wrong;
    correctAnswers += migrated.byMode.flags.correct;
  }

  for (const [signature, score] of Object.entries(state.highScores ?? {})) {
    next.highScores[signature] = {
      signature,
      score,
      accuracy: 0,
      longestStreak: 0,
      timestamp: 0,
    };
  }

  next.settings = { ...DEFAULT_SETTINGS, ...(state.settings ?? {}) };
  next.totals = { questionsAnswered, correctAnswers };

  return next;
}

/** Ordered migration steps, keyed by the version they upgrade *from*. */
const STEPS: Record<number, (state: never) => AnyPersistedState> = {
  1: migrateV1ToV2 as (state: never) => AnyPersistedState,
};

export interface MigrationResult {
  state: PersistedStateV2;
  /** True when the payload was upgraded and should be written back. */
  migrated: boolean;
}

/**
 * Brings any known payload up to the current version.
 *
 * A payload from a *newer* version than this build understands is not
 * downgraded or guessed at — the caller is told, and chooses to preserve it
 * rather than overwrite (see `load`).
 */
export function migrate(input: AnyPersistedState): MigrationResult {
  let state: AnyPersistedState = input;
  let migrated = false;

  while (state.version < CURRENT_VERSION) {
    const step = STEPS[state.version];
    if (!step) {
      throw new Error(`No migration from schema version ${state.version}`);
    }
    state = step(state as never);
    migrated = true;
  }

  return { state: state as PersistedStateV2, migrated };
}
