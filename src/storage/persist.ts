import { LocalStorageAdapter, type StorageAdapter } from './adapter';
import { migrate } from './migrations';
import {
  CURRENT_VERSION,
  STORAGE_KEY,
  emptyModeStat,
  emptyState,
  type AnyPersistedState,
  type PersistedStateV3,
} from './schema';

/**
 * Loading and saving the persisted state.
 *
 * The rule throughout: nothing stored on disk may crash the app. Corrupt JSON,
 * a payload from a future version, or a value of the wrong shape all resolve
 * to "start fresh", and the unreadable payload is kept aside rather than
 * silently destroyed.
 */

export interface LoadResult {
  state: PersistedStateV3;
  /** What happened, so the caller can decide whether to write back. */
  status: 'empty' | 'loaded' | 'migrated' | 'corrupt' | 'future-version';
}

/** Where an unreadable payload is parked so it is not lost. */
export const QUARANTINE_KEY = `${STORAGE_KEY}.unreadable`;

function isPlausibleState(value: unknown): value is AnyPersistedState {
  if (typeof value !== 'object' || value === null) return false;
  const version = (value as { version?: unknown }).version;
  return typeof version === 'number' && Number.isInteger(version) && version >= 1;
}

/**
 * Adapter calls are guarded here as well as inside `LocalStorageAdapter`.
 * The contract these functions offer is "never throws", and it should hold for
 * any adapter, not only the one that happens to guard itself.
 */
function tryRead(adapter: StorageAdapter, key: string): string | null {
  try {
    return adapter.read(key);
  } catch {
    return null;
  }
}

function tryWrite(adapter: StorageAdapter, key: string, value: string): void {
  try {
    adapter.write(key, value);
  } catch {
    /* a lost write is survivable; a thrown one is not */
  }
}

function tryRemove(adapter: StorageAdapter, key: string): void {
  try {
    adapter.remove(key);
  } catch {
    /* nothing useful to do */
  }
}

export function load(adapter: StorageAdapter = defaultAdapter()): LoadResult {
  const raw = tryRead(adapter, STORAGE_KEY);
  if (raw === null) return { state: emptyState(), status: 'empty' };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    quarantine(adapter, raw);
    return { state: emptyState(), status: 'corrupt' };
  }

  if (!isPlausibleState(parsed)) {
    quarantine(adapter, raw);
    return { state: emptyState(), status: 'corrupt' };
  }

  // Written by a newer build. Do not guess at its shape, and do not overwrite
  // it — the user may go back to that build with their data intact.
  if (parsed.version > CURRENT_VERSION) {
    return { state: emptyState(), status: 'future-version' };
  }

  try {
    const { state, migrated } = migrate(parsed);
    return { state: repair(state), status: migrated ? 'migrated' : 'loaded' };
  } catch {
    quarantine(adapter, raw);
    return { state: emptyState(), status: 'corrupt' };
  }
}

export function save(state: PersistedStateV3, adapter: StorageAdapter = defaultAdapter()): void {
  tryWrite(adapter, STORAGE_KEY, JSON.stringify(state));
}

export function clear(adapter: StorageAdapter = defaultAdapter()): void {
  tryRemove(adapter, STORAGE_KEY);
}

function quarantine(adapter: StorageAdapter, raw: string): void {
  tryWrite(adapter, QUARANTINE_KEY, raw);
  tryRemove(adapter, STORAGE_KEY);
}

/**
 * Fills in anything a hand-edited or partially-written payload is missing.
 * Validation is deliberately forgiving here: dropping a user's whole history
 * because one field is absent is worse than defaulting it.
 */
function repair(state: PersistedStateV3): PersistedStateV3 {
  const base = emptyState();
  const repaired: PersistedStateV3 = {
    version: CURRENT_VERSION,
    entityStats: state.entityStats ?? base.entityStats,
    highScores: state.highScores ?? base.highScores,
    streaks: state.streaks ?? base.streaks,
    settings: { ...base.settings, ...(state.settings ?? {}) },
    totals: { ...base.totals, ...(state.totals ?? {}) },
  };

  for (const [entityId, stat] of Object.entries(repaired.entityStats)) {
    repaired.entityStats[entityId] = {
      entityId: stat?.entityId ?? entityId,
      byMode: {
        flags: { ...emptyModeStat(), ...stat?.byMode?.flags },
        capitals: { ...emptyModeStat(), ...stat?.byMode?.capitals },
      },
      leitnerBox: stat?.leitnerBox ?? 1,
    };
  }

  return repaired;
}

let adapterInstance: StorageAdapter | null = null;
function defaultAdapter(): StorageAdapter {
  adapterInstance ??= new LocalStorageAdapter();
  return adapterInstance;
}

/** Test seam: replaces the process-wide adapter. */
export function setDefaultAdapter(adapter: StorageAdapter | null): void {
  adapterInstance = adapter;
}
