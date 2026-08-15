import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryStorageAdapter } from './adapter';
import { migrate, migrateV1ToV2, migrateV2ToV3 } from './migrations';
import { QUARANTINE_KEY, clear, load, save } from './persist';
import {
  CURRENT_VERSION,
  STORAGE_KEY,
  emptyEntityStat,
  emptyState,
  type LegacySettings,
  type PersistedStateV1,
  type PersistedStateV2,
} from './schema';

let adapter: MemoryStorageAdapter;

beforeEach(() => {
  adapter = new MemoryStorageAdapter();
});

/** A realistic v1 payload: the flags-only release. */
function v1Fixture(): PersistedStateV1 {
  return {
    version: 1,
    entityStats: {
      france: { entityId: 'france', correct: 7, wrong: 2, lastSeen: 1_700_000_000_000 },
      chad: { entityId: 'chad', correct: 0, wrong: 5, lastSeen: 1_700_000_100_000 },
    },
    highScores: {
      'flags|a-to-b|easy|20|all|all': 180,
      'flags|a-to-b|hard|50|Europe|all': 640,
    },
    settings: { unMembersOnly: true },
  };
}

describe('load with nothing stored', () => {
  it('starts empty rather than failing', () => {
    const result = load(adapter);
    expect(result.status).toBe('empty');
    expect(result.state).toEqual(emptyState());
  });
});

describe('round trip', () => {
  it('saves and loads state unchanged', () => {
    const state = emptyState();
    state.entityStats.france = emptyEntityStat('france');
    state.entityStats.france.byMode.flags = { correct: 3, wrong: 1, lastSeen: 123 };
    state.totals = { questionsAnswered: 4, correctAnswers: 3 };

    save(state, adapter);
    const result = load(adapter);

    expect(result.status).toBe('loaded');
    expect(result.state).toEqual(state);
  });

  it('clears everything on request', () => {
    save(emptyState(), adapter);
    clear(adapter);
    expect(load(adapter).status).toBe('empty');
  });
});

/** The T3.1 acceptance criterion. */
describe('migration v1 -> v2', () => {
  it('preserves per-entity stats, mapped to the mode they came from', () => {
    const migrated = migrateV1ToV2(v1Fixture());

    expect(migrated.version).toBe(2);
    expect(migrated.entityStats.france!.byMode.flags).toEqual({
      correct: 7,
      wrong: 2,
      lastSeen: 1_700_000_000_000,
    });
    expect(migrated.entityStats.chad!.byMode.flags).toEqual({
      correct: 0,
      wrong: 5,
      lastSeen: 1_700_000_100_000,
    });
  });

  it('leaves capitals empty, since v1 never asked a capitals question', () => {
    const migrated = migrateV1ToV2(v1Fixture());
    expect(migrated.entityStats.france!.byMode.capitals).toEqual({
      correct: 0,
      wrong: 0,
      lastSeen: 0,
    });
  });

  it('gives every entity a Leitner box so revision can schedule it', () => {
    const migrated = migrateV1ToV2(v1Fixture());
    for (const stat of Object.values(migrated.entityStats)) {
      expect(stat.leitnerBox).toBe(1);
    }
  });

  it('turns bare high-score numbers into records, keyed by the same signature', () => {
    const migrated = migrateV1ToV2(v1Fixture());
    expect(migrated.highScores['flags|a-to-b|easy|20|all|all']).toMatchObject({
      signature: 'flags|a-to-b|easy|20|all|all',
      score: 180,
    });
    expect(migrated.highScores['flags|a-to-b|hard|50|Europe|all']!.score).toBe(640);
  });

  it('does not invent the fields v1 never recorded', () => {
    const migrated = migrateV1ToV2(v1Fixture());
    const score = migrated.highScores['flags|a-to-b|easy|20|all|all']!;
    expect(score.accuracy).toBe(0);
    expect(score.longestStreak).toBe(0);
    expect(score.timestamp).toBe(0);
  });

  it('derives totals from the stats it migrated', () => {
    const migrated = migrateV1ToV2(v1Fixture());
    // france 7+2, chad 0+5 = 14 answered, 7 correct.
    expect(migrated.totals).toEqual({ questionsAnswered: 14, correctAnswers: 7 });
  });

  it('carries over the settings v1 actually stored', () => {
    // Only what was stored: v2's settings are partial, and the defaults for
    // everything else are filled in by the v3 step below, not invented here.
    const migrated = migrateV1ToV2(v1Fixture());
    expect(migrated.settings).toEqual({ unMembersOnly: true });
  });

  it('migrates on load and reports that it did', () => {
    adapter.write(STORAGE_KEY, JSON.stringify(v1Fixture()));
    const result = load(adapter);

    expect(result.status).toBe('migrated');
    expect(result.state.version).toBe(CURRENT_VERSION);
    expect(result.state.entityStats.france!.byMode.flags.correct).toBe(7);
  });

  it('is a no-op for state already at the current version', () => {
    const state = emptyState();
    expect(migrate(state)).toEqual({ state, migrated: false });
  });

  it('handles a v1 payload with no stats at all', () => {
    const migrated = migrateV1ToV2({ version: 1, entityStats: {}, highScores: {} });
    expect(migrated.entityStats).toEqual({});
    expect(migrated.totals).toEqual({ questionsAnswered: 0, correctAnswers: 0 });
  });
});

describe('migration v2 -> v3 (country sets)', () => {
  /** A v2 payload with real history, so the stats have something to lose. */
  function v2Fixture(settings: Partial<LegacySettings>): PersistedStateV2 {
    const france = emptyEntityStat('france');
    france.byMode.flags = { correct: 9, wrong: 3, lastSeen: 1_700_000_000_000 };
    france.leitnerBox = 4;

    return {
      version: 2,
      entityStats: { france },
      highScores: {
        'flags|a-to-b|hard|20|all|all': {
          signature: 'flags|a-to-b|hard|20|all|all',
          score: 420,
          accuracy: 0.85,
          longestStreak: 11,
          timestamp: 1_700_000_500_000,
        },
      },
      streaks: { flags: { current: 3, longest: 11 }, global: { current: 3, longest: 14 } },
      settings,
      totals: { questionsAnswered: 12, correctAnswers: 9 },
    };
  }

  it('maps an explicit "UN members only" to the UN set', () => {
    const migrated = migrateV2ToV3(v2Fixture({ unMembersOnly: true }));
    expect(migrated.version).toBe(3);
    expect(migrated.settings.countrySet).toBe('un');
  });

  /**
   * Deliberately *not* `all`. The old default was every entity, so a `false`
   * here is far more likely to be "never touched the toggle" than "chose 250
   * countries" — and the whole point of this change is that nobody chose that.
   */
  it('does not pin an untouched toggle to everything', () => {
    expect(migrateV2ToV3(v2Fixture({ unMembersOnly: false })).settings.countrySet).toBe('un');
    expect(migrateV2ToV3(v2Fixture({})).settings.countrySet).toBe('un');
  });

  it('drops the old boolean rather than leaving it alongside the new field', () => {
    const migrated = migrateV2ToV3(v2Fixture({ unMembersOnly: true }));
    expect(migrated.settings).not.toHaveProperty('unMembersOnly');
  });

  it('keeps the other settings the user had chosen', () => {
    const migrated = migrateV2ToV3(
      v2Fixture({ unMembersOnly: true, reducedMotion: true, sound: false }),
    );
    expect(migrated.settings.reducedMotion).toBe(true);
    expect(migrated.settings.sound).toBe(false);
  });

  it('fills in settings v2 never stored', () => {
    const migrated = migrateV2ToV3(v2Fixture({}));
    expect(migrated.settings.reducedMotion).toBe(false);
    expect(migrated.settings.sound).toBe(true);
  });

  it('leaves every stat, score and streak intact', () => {
    const before = v2Fixture({ unMembersOnly: true });
    const migrated = migrateV2ToV3(before);

    expect(migrated.entityStats).toEqual(before.entityStats);
    expect(migrated.highScores).toEqual(before.highScores);
    expect(migrated.streaks).toEqual(before.streaks);
    expect(migrated.totals).toEqual({ questionsAnswered: 12, correctAnswers: 9 });
  });

  it('migrates on load, from v2 and all the way from v1', () => {
    adapter.write(STORAGE_KEY, JSON.stringify(v2Fixture({ unMembersOnly: true })));
    const fromV2 = load(adapter);
    expect(fromV2.status).toBe('migrated');
    expect(fromV2.state.version).toBe(CURRENT_VERSION);
    expect(fromV2.state.settings.countrySet).toBe('un');
    expect(fromV2.state.entityStats.france!.byMode.flags.correct).toBe(9);

    // v1 has no v3 step of its own; it gets there by being run through both.
    adapter.write(STORAGE_KEY, JSON.stringify(v1Fixture()));
    const fromV1 = load(adapter);
    expect(fromV1.state.version).toBe(CURRENT_VERSION);
    expect(fromV1.state.settings).toEqual({
      countrySet: 'un',
      reducedMotion: false,
      sound: true,
    });
  });
});

describe('corrupt storage never crashes the app (T3.1)', () => {
  it('survives JSON that does not parse', () => {
    adapter.write(STORAGE_KEY, '{ this is not json');
    const result = load(adapter);
    expect(result.status).toBe('corrupt');
    expect(result.state).toEqual(emptyState());
  });

  it('survives valid JSON of the wrong shape', () => {
    for (const payload of ['null', '"a string"', '42', '[]', '{}', '{"version":"two"}']) {
      adapter.write(STORAGE_KEY, payload);
      const result = load(adapter);
      expect(result.status, payload).toBe('corrupt');
      expect(result.state, payload).toEqual(emptyState());
    }
  });

  it('survives a version with no migration path', () => {
    adapter.write(STORAGE_KEY, JSON.stringify({ version: 0, entityStats: {} }));
    expect(load(adapter).status).toBe('corrupt');
  });

  it('keeps the unreadable payload instead of destroying it', () => {
    adapter.write(STORAGE_KEY, '{ broken');
    load(adapter);
    expect(adapter.read(QUARANTINE_KEY)).toBe('{ broken');
    expect(adapter.read(STORAGE_KEY)).toBeNull();
  });

  it('refuses to guess at a payload from a newer build, and leaves it alone', () => {
    const future = JSON.stringify({ version: CURRENT_VERSION + 1, somethingNew: true });
    adapter.write(STORAGE_KEY, future);

    const result = load(adapter);
    expect(result.status).toBe('future-version');
    expect(result.state).toEqual(emptyState());
    // Still there, so going back to that build does not lose the user's data.
    expect(adapter.read(STORAGE_KEY)).toBe(future);
  });

  it('fills in fields a partially-written payload is missing', () => {
    adapter.write(
      STORAGE_KEY,
      JSON.stringify({
        version: CURRENT_VERSION,
        entityStats: { france: { entityId: 'france', byMode: { flags: { correct: 2 } } } },
      }),
    );

    const result = load(adapter);
    expect(result.status).toBe('loaded');
    expect(result.state.entityStats.france!.byMode.flags).toEqual({
      correct: 2,
      wrong: 0,
      lastSeen: 0,
    });
    expect(result.state.entityStats.france!.byMode.capitals).toEqual({
      correct: 0,
      wrong: 0,
      lastSeen: 0,
    });
    expect(result.state.entityStats.france!.leitnerBox).toBe(1);
    expect(result.state.settings).toEqual(emptyState().settings);
  });
});

describe('a storage adapter that refuses to work', () => {
  it('loads defaults and does not throw when reads and writes fail', () => {
    const hostile = {
      read: () => {
        throw new Error('storage disabled');
      },
      write: () => {
        throw new Error('storage disabled');
      },
      remove: () => {
        throw new Error('storage disabled');
      },
    };

    // The contract callers rely on: these never throw, whatever the adapter
    // does. Guarding only inside LocalStorageAdapter was not enough.
    expect(() => load(hostile)).not.toThrow();
    expect(() => save(emptyState(), hostile)).not.toThrow();
    expect(() => clear(hostile)).not.toThrow();
    expect(load(hostile).state).toEqual(emptyState());
  });
});
