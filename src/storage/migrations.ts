import {
  CURRENT_VERSION,
  DEFAULT_SETTINGS,
  emptyEntityStat,
  type AnyPersistedState,
  type PersistedStateV1,
  type PersistedStateV2,
  type PersistedStateV3,
  type PersistedStateV4,
} from './schema';

/**
 * Schema migrations — plan §2.
 *
 * Each step takes the previous version to the next. They are applied in order,
 * so a v1 payload reaches the current version however many versions behind it
 * is, and no step ever has to know about more than its own neighbours.
 */

/**
 * v2 → v3.
 *
 * `unMembersOnly` could only say "the 193 UN members" or "all 250 entities",
 * with nothing in between, and defaulted to the latter — which is how a quiz
 * ended up mostly territories. It becomes a three-way `countrySet`.
 *
 * An explicit `true` maps to `un`, which is the closest set (it adds only
 * Palestine and Vatican City). Everything else — an explicit `false`, or the
 * field never having been touched — takes the new default rather than being
 * pinned to `all`, because a player who never opened Settings did not choose
 * 250 countries, they just got them.
 */
export function migrateV2ToV3(state: PersistedStateV2): PersistedStateV3 {
  const { unMembersOnly, ...rest } = state.settings ?? {};

  return {
    ...state,
    version: 3,
    settings: {
      ...DEFAULT_SETTINGS,
      ...rest,
      countrySet: unMembersOnly === true ? 'un' : DEFAULT_SETTINGS.countrySet,
    },
  };
}

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
  // Built as a v2 value, not by borrowing the current empty state: a step must
  // produce the shape of *its own* target version, or adding v4 later would
  // silently change what v1 migrates into.
  const next: PersistedStateV2 = {
    version: 2,
    entityStats: {},
    highScores: {},
    streaks: {},
    settings: {},
    totals: { questionsAnswered: 0, correctAnswers: 0 },
  };

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

  next.settings = { ...(state.settings ?? {}) };
  next.totals = { questionsAnswered, correctAnswers };

  return next;
}

/**
 * v3 → v4.
 *
 * The country set now forms part of the high-score signature, because a
 * 195-country run and a 250-country run are not the same achievement and the
 * narrower set is measurably easier.
 *
 * **Stored high scores are dropped.** They were keyed without any record of
 * which pool they were played on, so there is no honest way to place them:
 * mapping them all to one set would invent a fact, and leaving them under their
 * old keys would strand them as scores nobody can ever match. Everything else —
 * per-entity stats, streaks, totals and settings — is untouched, so the only
 * thing a player loses is the leaderboard, not their history.
 */
export function migrateV3ToV4(state: PersistedStateV3): PersistedStateV4 {
  return { ...state, version: 4, highScores: {} };
}

/** Ordered migration steps, keyed by the version they upgrade *from*. */
const STEPS: Record<number, (state: never) => AnyPersistedState> = {
  1: migrateV1ToV2 as (state: never) => AnyPersistedState,
  2: migrateV2ToV3 as (state: never) => AnyPersistedState,
  3: migrateV3ToV4 as (state: never) => AnyPersistedState,
};

export interface MigrationResult {
  state: PersistedStateV4;
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

  return { state: state as PersistedStateV4, migrated };
}
