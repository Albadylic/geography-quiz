import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryStorageAdapter } from './adapter';
import { migrate, migrateV1ToV2 } from './migrations';
import { QUARANTINE_KEY, clear, load, save } from './persist';
import {
  CURRENT_VERSION,
  STORAGE_KEY,
  emptyEntityStat,
  emptyState,
  type PersistedStateV1,
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

  it('keeps settings the user had chosen, defaulting the rest', () => {
    const migrated = migrateV1ToV2(v1Fixture());
    expect(migrated.settings.unMembersOnly).toBe(true);
    expect(migrated.settings.sound).toBe(true);
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
        version: 2,
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
