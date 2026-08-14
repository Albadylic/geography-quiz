import { describe, expect, it } from 'vitest';
import {
  mulberry32,
  pick,
  randomInt,
  randomSeed,
  sample,
  shuffle,
  weightedSample,
} from './rng';

const range = (n: number) => Array.from({ length: n }, (_, i) => i);

describe('mulberry32', () => {
  it('produces the same sequence for the same seed, across independent runs', () => {
    const a = mulberry32(12345);
    const b = mulberry32(12345);
    const first = range(50).map(() => a());
    const second = range(50).map(() => b());
    expect(first).toEqual(second);
  });

  it('produces different sequences for different seeds', () => {
    const a = range(20).map(mulberry32(1));
    const b = range(20).map(mulberry32(2));
    expect(a).not.toEqual(b);
  });

  it('stays within [0, 1)', () => {
    const rng = mulberry32(99);
    for (let i = 0; i < 10_000; i++) {
      const value = rng();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('is roughly uniform across ten buckets over 100k draws', () => {
    const rng = mulberry32(7);
    const buckets = new Array<number>(10).fill(0);
    const draws = 100_000;
    for (let i = 0; i < draws; i++) buckets[Math.floor(rng() * 10)]!++;
    for (const count of buckets) {
      expect(count).toBeGreaterThan(draws / 10 - draws / 100);
      expect(count).toBeLessThan(draws / 10 + draws / 100);
    }
  });

  it('handles a zero seed without collapsing', () => {
    const rng = mulberry32(0);
    const values = range(20).map(rng);
    expect(new Set(values).size).toBe(20);
  });
});

describe('randomSeed', () => {
  it('returns a non-negative 32-bit integer', () => {
    for (let i = 0; i < 200; i++) {
      const seed = randomSeed();
      expect(Number.isInteger(seed)).toBe(true);
      expect(seed).toBeGreaterThanOrEqual(0);
      expect(seed).toBeLessThanOrEqual(0xffffffff);
    }
  });
});

describe('randomInt', () => {
  it('stays inside the bound', () => {
    const rng = mulberry32(3);
    for (let i = 0; i < 5_000; i++) {
      const value = randomInt(rng, 8);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(8);
      expect(Number.isInteger(value)).toBe(true);
    }
  });

  it('rejects a non-positive bound rather than returning nonsense', () => {
    expect(() => randomInt(mulberry32(1), 0)).toThrow(/positive bound/);
  });
});

describe('shuffle', () => {
  it('does not mutate its input', () => {
    const input = range(10);
    const copy = [...input];
    shuffle(mulberry32(1), input);
    expect(input).toEqual(copy);
  });

  it('preserves every element exactly once', () => {
    const input = range(50);
    const out = shuffle(mulberry32(42), input);
    expect([...out].sort((a, b) => a - b)).toEqual(input);
  });

  it('is reproducible for a given seed', () => {
    const input = range(30);
    expect(shuffle(mulberry32(5), input)).toEqual(shuffle(mulberry32(5), input));
  });

  it('handles empty and single-element lists', () => {
    expect(shuffle(mulberry32(1), [])).toEqual([]);
    expect(shuffle(mulberry32(1), ['only'])).toEqual(['only']);
  });

  /**
   * Uniformity: over 10k shuffles of five items, every element should land in
   * every position about 2000 times. A biased shuffle (the common
   * `randomInt(rng, length)` mistake) skews this measurably.
   */
  it('is uniform over 10k trials, within tolerance', () => {
    const rng = mulberry32(2024);
    const size = 5;
    const trials = 10_000;
    const counts = range(size).map(() => new Array<number>(size).fill(0));

    for (let t = 0; t < trials; t++) {
      const out = shuffle(rng, range(size));
      out.forEach((value, position) => counts[value]![position]!++);
    }

    const expected = trials / size;
    const tolerance = expected * 0.1;
    for (const row of counts) {
      for (const count of row) {
        expect(Math.abs(count - expected)).toBeLessThan(tolerance);
      }
    }
  });
});

describe('sample', () => {
  it('returns the requested count without replacement', () => {
    const out = sample(mulberry32(1), range(100), 10);
    expect(out).toHaveLength(10);
    expect(new Set(out).size).toBe(10);
  });

  it('caps at the pool size rather than repeating or padding', () => {
    const out = sample(mulberry32(1), range(4), 10);
    expect(out).toHaveLength(4);
    expect(new Set(out).size).toBe(4);
  });

  it('returns an empty list for a non-positive count', () => {
    expect(sample(mulberry32(1), range(10), 0)).toEqual([]);
    expect(sample(mulberry32(1), range(10), -3)).toEqual([]);
  });
});

describe('pick', () => {
  it('returns undefined for an empty list', () => {
    expect(pick(mulberry32(1), [])).toBeUndefined();
  });

  it('always returns a member of the list', () => {
    const rng = mulberry32(11);
    const items = ['a', 'b', 'c'];
    for (let i = 0; i < 100; i++) expect(items).toContain(pick(rng, items));
  });
});

describe('weightedSample', () => {
  it('returns the requested count without replacement', () => {
    const out = weightedSample(mulberry32(1), range(50), () => 1, 10);
    expect(out).toHaveLength(10);
    expect(new Set(out).size).toBe(10);
  });

  it('favours heavier items', () => {
    // One heavy item among many light ones should be picked far more often
    // than its share of the population.
    const heavy = 'heavy';
    const items = [heavy, ...range(19).map((i) => `light-${i}`)];
    const rng = mulberry32(31);
    let hits = 0;
    const trials = 2_000;
    for (let t = 0; t < trials; t++) {
      const drawn = weightedSample(rng, items, (item) => (item === heavy ? 20 : 1), 3);
      if (drawn.includes(heavy)) hits++;
    }
    // Uniform sampling of 3 from 20 would hit it ~15% of the time.
    expect(hits / trials).toBeGreaterThan(0.5);
  });

  it('is reproducible for a given seed', () => {
    const weight = (n: number) => n + 1;
    const a = weightedSample(mulberry32(9), range(40), weight, 12);
    const b = weightedSample(mulberry32(9), range(40), weight, 12);
    expect(a).toEqual(b);
  });

  it('does not return the same order every time across draws', () => {
    const rng = mulberry32(4);
    const first = weightedSample(rng, range(40), (n) => n + 1, 10);
    const second = weightedSample(rng, range(40), (n) => n + 1, 10);
    expect(first).not.toEqual(second);
  });

  it('back-fills zero-weight items rather than returning a short list', () => {
    // Only two items carry weight, but five are asked for.
    const items = range(10);
    const out = weightedSample(mulberry32(2), items, (n) => (n < 2 ? 1 : 0), 5);
    expect(out).toHaveLength(5);
    expect(new Set(out).size).toBe(5);
    expect(out).toContain(0);
    expect(out).toContain(1);
  });

  it('caps at the pool size', () => {
    expect(weightedSample(mulberry32(1), range(3), () => 1, 99)).toHaveLength(3);
  });

  it('returns an empty list for a non-positive count', () => {
    expect(weightedSample(mulberry32(1), range(10), () => 1, 0)).toEqual([]);
  });

  it('tolerates NaN and negative weights without crashing', () => {
    const out = weightedSample(mulberry32(1), range(10), (n) => (n % 2 ? NaN : -1), 4);
    expect(out).toHaveLength(4);
    expect(new Set(out).size).toBe(4);
  });
});
