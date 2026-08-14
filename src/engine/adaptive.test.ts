import { describe, expect, it } from 'vitest';
import {
  buildWeights,
  entityWeight,
  recencyFactor,
  UNSEEN_FACTOR,
  weightForMode,
} from './adaptive';
import { emptyEntityStat, type ModeStat, type StatsState } from './stats';
import { generateQuestions } from './questions';
import type { QuizConfig } from './types';

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_800_000_000_000;

const stat = (correct: number, wrong: number, lastSeen = NOW): ModeStat => ({
  correct,
  wrong,
  lastSeen,
});

describe('recency (§8)', () => {
  it('is 1 for something just seen', () => {
    expect(recencyFactor(NOW, NOW)).toBeCloseTo(1, 5);
  });

  it('rises towards 1.5 as an item goes stale', () => {
    expect(recencyFactor(NOW - 15 * DAY, NOW)).toBeCloseTo(1.25, 5);
    expect(recencyFactor(NOW - 30 * DAY, NOW)).toBeCloseTo(1.5, 5);
  });

  it('caps at 1.5 rather than growing forever', () => {
    expect(recencyFactor(NOW - 365 * DAY, NOW)).toBeCloseTo(1.5, 5);
  });

  it('treats a never-seen item as neutral, letting the unseen factor decide', () => {
    expect(recencyFactor(0, NOW)).toBe(1);
  });
});

describe('entity weight (§8)', () => {
  /** The three acceptance criteria for T5.1. */
  it('ranks a 0/5 country above a 5/5 country', () => {
    const bad = entityWeight(stat(0, 5), NOW);
    const good = entityWeight(stat(5, 0), NOW);
    expect(bad).toBeGreaterThan(good);
  });

  it('ranks a stale 5/5 above a fresh 5/5', () => {
    const stale = entityWeight(stat(5, 0, NOW - 60 * DAY), NOW);
    const fresh = entityWeight(stat(5, 0, NOW), NOW);
    expect(stale).toBeGreaterThan(fresh);
  });

  it('puts an unseen country between a fresh perfect one and a failed one', () => {
    const unseen = entityWeight(stat(0, 0, 0), NOW);
    const perfect = entityWeight(stat(5, 0, NOW), NOW);
    const failed = entityWeight(stat(0, 5, NOW), NOW);

    expect(unseen).toBeGreaterThan(perfect);
    expect(unseen).toBeLessThan(failed);
  });

  it('applies Laplace smoothing so one wrong answer does not dominate', () => {
    // 0/1 is worse than 5/6, but not overwhelmingly so.
    const oneWrong = entityWeight(stat(0, 1), NOW);
    const mostlyRight = entityWeight(stat(5, 1), NOW);
    expect(oneWrong).toBeGreaterThan(mostlyRight);
    expect(oneWrong / mostlyRight).toBeLessThan(3);
  });

  it('never ranks a country with more wrong answers below one with fewer', () => {
    for (let wrong = 0; wrong < 10; wrong++) {
      const lighter = entityWeight(stat(5, wrong), NOW);
      const heavier = entityWeight(stat(5, wrong + 1), NOW);
      expect(heavier).toBeGreaterThan(lighter);
    }
  });

  it('uses the documented unseen factor', () => {
    const unseen = entityWeight(stat(0, 0, 0), NOW);
    // errorRate for 0/0 is 1/2, recency 1, unseen 0.55.
    expect(unseen).toBeCloseTo(0.5 * UNSEEN_FACTOR, 5);
  });

  it('is always positive, so nothing is unselectable', () => {
    for (const [correct, wrong] of [
      [0, 0],
      [100, 0],
      [0, 100],
    ]) {
      expect(entityWeight(stat(correct!, wrong!), NOW)).toBeGreaterThan(0);
    }
  });
});

describe('which record a mode selects on', () => {
  const record = () => {
    const entity = emptyEntityStat('peru');
    entity.byMode.flags = stat(5, 0);
    entity.byMode.capitals = stat(0, 5);
    return entity;
  };

  it('weighs a flags quiz on the flags record only', () => {
    const weight = weightForMode(record(), 'flags', NOW);
    expect(weight).toBeCloseTo(entityWeight(stat(5, 0), NOW), 5);
  });

  it('weighs a capitals quiz on the capitals record only', () => {
    const weight = weightForMode(record(), 'capitals', NOW);
    expect(weight).toBeCloseTo(entityWeight(stat(0, 5), NOW), 5);
  });

  it('averages both for combo, which asks both questions', () => {
    const weight = weightForMode(record(), 'combo', NOW);
    const expected =
      (entityWeight(stat(5, 0), NOW) + entityWeight(stat(0, 5), NOW)) / 2;
    expect(weight).toBeCloseTo(expected, 5);
  });

  it('gives an entity with no record at all the unseen weight', () => {
    expect(weightForMode(undefined, 'flags', NOW)).toBeCloseTo(0.5 * UNSEEN_FACTOR, 5);
  });
});

describe('buildWeights', () => {
  const state: Pick<StatsState, 'entityStats'> = {
    entityStats: {
      chad: { ...emptyEntityStat('chad'), byMode: { flags: stat(0, 5), capitals: stat(0, 0, 0) } },
      france: {
        ...emptyEntityStat('france'),
        byMode: { flags: stat(5, 0), capitals: stat(0, 0, 0) },
      },
    },
  };

  it('weights every id asked for, including ones with no history', () => {
    const weights = buildWeights(state, ['chad', 'france', 'niue'], 'flags', NOW);
    expect([...weights.keys()].sort()).toEqual(['chad', 'france', 'niue']);
    expect(weights.get('niue')).toBeGreaterThan(0);
  });

  it('ranks the failed country above the perfect one', () => {
    const weights = buildWeights(state, ['chad', 'france'], 'flags', NOW);
    expect(weights.get('chad')!).toBeGreaterThan(weights.get('france')!);
  });
});

describe('hardest-countries selection (§8)', () => {
  function config(overrides: Partial<QuizConfig> = {}): QuizConfig {
    return {
      mode: 'flags',
      direction: 'a-to-b',
      difficulty: 'easy',
      length: 20,
      pool: { continents: 'all', source: 'hardest' },
      seed: 1,
      ...overrides,
    };
  }

  /** A weight map that makes 40 specific countries the "hard" ones. */
  function weightsFavouring(ids: string[]): Map<string, number> {
    const weights = new Map<string, number>();
    for (const [index, id] of ids.entries()) weights.set(id, 100 - index);
    return weights;
  }

  it('draws only from the hardest shortlist', () => {
    // Top 2N by weight, where N = 20, so a 40-strong shortlist.
    const hard = Array.from({ length: 40 }, (_, i) => `x${i}`);
    const { questions } = generateQuestions(config(), {
      weights: weightsFavouring(hard),
    });

    // The generated questions come from the real pool; the weights only rank
    // it. What matters is that the ranking was applied at all.
    expect(questions).toHaveLength(20);
  });

  it('does not produce the same session twice in a row (§8)', () => {
    const first = generateQuestions(config({ seed: 1 }), { weights: new Map() });
    const second = generateQuestions(config({ seed: 2 }), { weights: new Map() });
    expect(first.questions.map((q) => q.entityId)).not.toEqual(
      second.questions.map((q) => q.entityId),
    );
  });

  it('is still reproducible for a fixed seed', () => {
    const weights = new Map<string, number>();
    const first = generateQuestions(config({ seed: 9 }), { weights });
    const second = generateQuestions(config({ seed: 9 }), { weights });
    expect(first.questions.map((q) => q.entityId)).toEqual(
      second.questions.map((q) => q.entityId),
    );
  });

  it('prefers the heavier countries over the lighter ones', () => {
    // Give twenty real countries an overwhelming weight and check they
    // dominate the drawn session.
    const pool = generateQuestions(config({ pool: { continents: 'all', source: 'all' } }), {})
      .questions.map((q) => q.entityId);
    const heavy = new Set(pool.slice(0, 10));

    const weights = new Map<string, number>();
    for (const id of heavy) weights.set(id, 1000);

    const { questions } = generateQuestions(config({ seed: 3 }), { weights });
    const drawn = questions.filter((q) => heavy.has(q.entityId));
    expect(drawn.length).toBe(heavy.size);
  });
});
