import { create } from 'zustand';
import { recordSession } from '@/engine/stats';
import type { SessionResult } from '@/engine/session';
import type { Question } from '@/engine/types';
import { clear, load, save } from '@/storage/persist';
import {
  DEFAULT_SETTINGS,
  emptyState,
  type PersistedStateV3,
  type Settings,
} from '@/storage/schema';

/**
 * The persisted half of the app's state: per-entity stats, high scores,
 * streaks and settings.
 *
 * Every mutation goes through an engine function and is written straight back
 * to storage, so a reload never disagrees with what is on screen.
 */
interface StatsState {
  data: PersistedStateV3;
  /** How the last load went, for the Settings screen to report honestly. */
  loadStatus: 'empty' | 'loaded' | 'migrated' | 'corrupt' | 'future-version';

  recordFinishedSession: (result: SessionResult, questions: readonly Question[]) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  resetAll: () => void;
  reload: () => void;
}

const initial = load();

export const useStatsStore = create<StatsState>((set, get) => ({
  data: initial.state,
  loadStatus: initial.status,

  recordFinishedSession: (result, questions) => {
    const data = recordSession(get().data, result, questions);
    save(data);
    set({ data });
  },

  updateSettings: (patch) => {
    const data = { ...get().data, settings: { ...get().data.settings, ...patch } };
    save(data);
    set({ data });
  },

  resetAll: () => {
    clear();
    const data = emptyState();
    save(data);
    set({ data, loadStatus: 'empty' });
  },

  reload: () => {
    const result = load();
    set({ data: result.state, loadStatus: result.status });
  },
}));

/** Convenience selector — settings are read far more often than written. */
export function useSettings(): Settings {
  return useStatsStore((state) => state.data.settings ?? DEFAULT_SETTINGS);
}
