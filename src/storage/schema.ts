import type { EntityStat, HighScore, StatsState, StreakKey, StreakRecord } from '@/engine/stats';

/**
 * The persisted schema — plan §2.
 *
 * The stat shapes themselves are domain concepts and live in `engine/stats`;
 * this module adds only what persistence needs on top of them, and keeps every
 * shape the app has ever written so a migration can be written against the
 * real thing rather than against a guess.
 *
 * Bump CURRENT_VERSION and add a step in migrations.ts whenever this changes.
 */

export type { EntityStat, HighScore, ModeStat, StreakRecord } from '@/engine/stats';
export type { StatMode } from '@/engine/types';
export { emptyEntityStat, emptyModeStat } from '@/engine/stats';

export const STORAGE_KEY = 'geography-quiz';
export const CURRENT_VERSION = 2;

export interface Settings {
  /** §3.3 — a filter on `status`, never a data change. */
  unMembersOnly: boolean;
  reducedMotion: boolean;
  sound: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  unMembersOnly: false,
  reducedMotion: false,
  sound: true,
};

/** The current persisted shape. */
export interface PersistedStateV2 extends StatsState {
  version: 2;
  entityStats: Record<string, EntityStat>;
  highScores: Record<string, HighScore>;
  streaks: Partial<Record<StreakKey, StreakRecord>>;
  settings: Settings;
  totals: {
    questionsAnswered: number;
    correctAnswers: number;
  };
}

/**
 * The shape Phase 1 shipped: flags only, so per-entity counts were not split
 * by mode, and a high score was a bare number.
 */
export interface PersistedStateV1 {
  version: 1;
  entityStats: Record<
    string,
    { entityId: string; correct: number; wrong: number; lastSeen: number }
  >;
  highScores: Record<string, number>;
  settings?: Partial<Settings>;
}

export type PersistedState = PersistedStateV2;
export type AnyPersistedState = PersistedStateV1 | PersistedStateV2;

export function emptyState(): PersistedStateV2 {
  return {
    version: CURRENT_VERSION,
    entityStats: {},
    highScores: {},
    streaks: {},
    settings: { ...DEFAULT_SETTINGS },
    totals: { questionsAnswered: 0, correctAnswers: 0 },
  };
}
