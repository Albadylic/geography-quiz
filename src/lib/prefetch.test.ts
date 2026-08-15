import { afterEach, describe, expect, it, vi } from 'vitest';
import { preloadFlags } from './prefetch';

/**
 * `preloadFlags` works by constructing `Image` objects, so the test replaces
 * the constructor and records what got a `src`.
 */
function captureImageSources(): { sources: string[]; restore: () => void } {
  const sources: string[] = [];
  const original = globalThis.Image;

  class FakeImage {
    fetchPriority = '';
    decoding = '';
    set src(value: string) {
      sources.push(value);
    }
  }

  globalThis.Image = FakeImage as unknown as typeof Image;
  return { sources, restore: () => (globalThis.Image = original) };
}

let restoreImage: (() => void) | null = null;

afterEach(() => {
  restoreImage?.();
  restoreImage = null;
  vi.restoreAllMocks();
});

describe('preloadFlags', () => {
  it('requests each file exactly once', () => {
    const { sources, restore } = captureImageSources();
    restoreImage = restore;

    preloadFlags(['/flags/fr.svg', '/flags/de.svg']);

    expect(sources).toEqual(['/flags/fr.svg', '/flags/de.svg']);
  });

  it('does nothing for an empty list', () => {
    const { sources, restore } = captureImageSources();
    restoreImage = restore;

    preloadFlags([]);

    expect(sources).toEqual([]);
  });

  it('asks for low priority, so it never competes with the live question', () => {
    const priorities: string[] = [];
    const original = globalThis.Image;
    class FakeImage {
      fetchPriority = '';
      decoding = '';
      set src(_value: string) {
        priorities.push(this.fetchPriority);
      }
    }
    globalThis.Image = FakeImage as unknown as typeof Image;
    restoreImage = () => (globalThis.Image = original);

    preloadFlags(['/flags/fr.svg']);

    expect(priorities).toEqual(['low']);
  });
});
