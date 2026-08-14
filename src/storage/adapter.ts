/**
 * Storage boundary — plan §2.
 *
 * Everything that persists goes through this interface. Swapping localStorage
 * for IndexedDB in Phase 7 means writing one more implementation and changing
 * one line, not touching any feature code.
 */
export interface StorageAdapter {
  read(key: string): string | null;
  write(key: string, value: string): void;
  remove(key: string): void;
}

/**
 * localStorage, with every call guarded.
 *
 * Access can throw rather than return null: Safari's private mode historically
 * threw on write, and any browser throws on `localStorage` itself when storage
 * is blocked by policy. A quiz app must not white-screen because a preference
 * could not be saved.
 */
export class LocalStorageAdapter implements StorageAdapter {
  private available: boolean;

  constructor() {
    this.available = LocalStorageAdapter.probe();
  }

  private static probe(): boolean {
    try {
      const probeKey = '__geo_quiz_probe__';
      window.localStorage.setItem(probeKey, '1');
      window.localStorage.removeItem(probeKey);
      return true;
    } catch {
      return false;
    }
  }

  read(key: string): string | null {
    if (!this.available) return null;
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  write(key: string, value: string): void {
    if (!this.available) return;
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Quota exceeded or storage disabled mid-session. Losing a write is
      // survivable; throwing here would take the screen down with it.
      this.available = false;
    }
  }

  remove(key: string): void {
    if (!this.available) return;
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* nothing useful to do */
    }
  }
}

/** In-memory adapter for tests and for environments with no storage at all. */
export class MemoryStorageAdapter implements StorageAdapter {
  private readonly store = new Map<string, string>();

  read(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  write(key: string, value: string): void {
    this.store.set(key, value);
  }

  remove(key: string): void {
    this.store.delete(key);
  }
}
