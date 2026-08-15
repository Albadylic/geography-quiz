import { describe, expect, it } from 'vitest';
import { entities } from '@/data/entities.generated';
import type { Continent, Entity } from '@/data/schema';
import { buildPool, isInContinent, summarisePool } from './pool';
import { buildOptions, generateQuestions, optionLabel, primaryCapital } from './questions';
import { mulberry32 } from './rng';
import { OPTION_COUNT, type Difficulty, type QuizConfig } from './types';

const byId = new Map(entities.map((e) => [e.id, e]));
const entity = (id: string): Entity => {
  const found = byId.get(id);
  if (!found) throw new Error(`entity "${id}" missing from the dataset`);
  return found;
};

function config(overrides: Partial<QuizConfig> = {}): QuizConfig {
  return {
    mode: 'flags',
    direction: 'a-to-b',
    difficulty: 'medium',
    length: 20,
    pool: { continents: 'all', source: 'all', countrySet: 'all' },
    seed: 1234,
    ...overrides,
  };
}

describe('pool building (§5.2 step 1)', () => {
  it('includes every entity for a flags quiz over all continents', () => {
    expect(buildPool(config()).length).toBe(entities.length);
  });

  it('excludes entities with no capital from capitals pools, by data not by list', () => {
    const pool = buildPool(config({ mode: 'capitals' }));
    expect(pool.every((e) => e.capitals.length > 0)).toBe(true);
    expect(pool.find((e) => e.id === 'antarctica')).toBeUndefined();
    expect(pool.find((e) => e.id === 'hong-kong')).toBeUndefined();
    // and they are still available for flags
    expect(buildPool(config({ mode: 'flags' })).find((e) => e.id === 'antarctica')).toBeDefined();
  });

  it('filters by continent', () => {
    const pool = buildPool(config({ pool: { continents: ['Oceania'], source: 'all', countrySet: 'all' } }));
    expect(pool.length).toBeGreaterThan(0);
    expect(pool.every((e) => isInContinent(e, 'Oceania'))).toBe(true);
  });

  it('includes transcontinental entities in both continent filters', () => {
    const europe = buildPool(config({ pool: { continents: ['Europe'], source: 'all', countrySet: 'all' } }));
    const asia = buildPool(config({ pool: { continents: ['Asia'], source: 'all', countrySet: 'all' } }));
    expect(europe.map((e) => e.id)).toContain('russia');
    expect(asia.map((e) => e.id)).toContain('russia');
  });

  it('applies the country set as a filter on status (§3.3)', () => {
    const pool = buildPool(config({ pool: { continents: 'all', source: 'all', countrySet: 'un' } }));
    expect(pool).toHaveLength(195);
    expect(pool.every((e) => e.status === 'un-member' || e.status === 'un-observer')).toBe(true);
  });
});

describe('length capping (§5.2 step 2)', () => {
  it('caps a 100-question request to the size of a small pool', () => {
    const oceania = buildPool(config({ pool: { continents: ['Oceania'], source: 'all', countrySet: 'all' } }));
    const summary = summarisePool(oceania, 100);
    expect(summary.capped).toBe(true);
    expect(summary.questionCount).toBe(oceania.length);
    expect(summary.questionCount).toBeLessThan(100);
  });

  it('does not report a cap when the pool is big enough', () => {
    const summary = summarisePool(buildPool(config()), 20);
    expect(summary.capped).toBe(false);
    expect(summary.questionCount).toBe(20);
  });

  it("treats 'all' as the whole pool and never as a cap", () => {
    const pool = buildPool(config());
    const summary = summarisePool(pool, 'all');
    expect(summary.capped).toBe(false);
    expect(summary.questionCount).toBe(pool.length);
  });
});

describe('question selection', () => {
  it('never repeats a country within a session', () => {
    const { questions } = generateQuestions(config({ length: 100 }));
    const ids = questions.map((q) => q.entityId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("shuffles the whole pool for length 'all'", () => {
    const { questions } = generateQuestions(
      config({ length: 'all', pool: { continents: ['South America'], source: 'all', countrySet: 'all' } }),
    );
    const pool = buildPool(config({ pool: { continents: ['South America'], source: 'all', countrySet: 'all' } }));
    expect(questions).toHaveLength(pool.length);
    expect(new Set(questions.map((q) => q.entityId))).toEqual(new Set(pool.map((e) => e.id)));
  });

  it('produces an identical session for an identical seed (§12)', () => {
    const first = generateQuestions(config({ seed: 987, length: 50 }));
    const second = generateQuestions(config({ seed: 987, length: 50 }));
    expect(first).toEqual(second);
  });

  it('produces a different session for a different seed', () => {
    const first = generateQuestions(config({ seed: 1, length: 50 }));
    const second = generateQuestions(config({ seed: 2, length: 50 }));
    expect(first.questions.map((q) => q.entityId)).not.toEqual(
      second.questions.map((q) => q.entityId),
    );
  });
});

describe('option sets (§5.2 step 5)', () => {
  const difficulties: Difficulty[] = ['easy', 'medium', 'hard'];

  it.each(difficulties)('shows %s its configured number of options', (difficulty) => {
    const { questions } = generateQuestions(config({ difficulty, length: 50 }));
    for (const question of questions) {
      expect(question.options, question.id).toHaveLength(
        OPTION_COUNT[difficulty as keyof typeof OPTION_COUNT],
      );
    }
  });

  it('omits options entirely in expert mode', () => {
    const { questions } = generateQuestions(config({ difficulty: 'expert', length: 20 }));
    for (const question of questions) expect(question.options).toBeUndefined();
  });

  it('always contains exactly one correct option', () => {
    for (const difficulty of difficulties) {
      const { questions } = generateQuestions(config({ difficulty, length: 100 }));
      for (const question of questions) {
        const correct = question.options!.filter((id) => question.correctIds.includes(id));
        expect(correct, `${question.id} @ ${difficulty}`).toHaveLength(1);
      }
    }
  });

  it('never repeats an option', () => {
    for (const difficulty of difficulties) {
      const { questions } = generateQuestions(config({ difficulty, length: 100 }));
      for (const question of questions) {
        expect(new Set(question.options).size, question.id).toBe(question.options!.length);
      }
    }
  });

  it('never shows two options with the same label', () => {
    for (const direction of ['a-to-b', 'b-to-a'] as const) {
      for (const mode of ['flags', 'capitals'] as const) {
        const { questions } = generateQuestions(
          config({ mode, direction, difficulty: 'hard', length: 100 }),
        );
        for (const question of questions) {
          const labels = question.options!.map((id) =>
            optionLabel(entity(id), question.answerKind),
          );
          expect(new Set(labels).size, `${question.id} ${mode}/${direction}`).toBe(
            labels.length,
          );
          expect(labels.every((label) => label.length > 0)).toBe(true);
        }
      }
    }
  });

  it('never shows two identical flags in one option set (§3.3)', () => {
    // Both directions matter: when options are flags they must differ from one
    // another, and when the prompt is a flag no option may fly the same one.
    for (const direction of ['a-to-b', 'b-to-a'] as const) {
      const { questions } = generateQuestions(
        config({ direction, difficulty: 'hard', length: 'all' }),
      );
      for (const question of questions) {
        const chosen = question.options!.map(entity);
        for (const option of chosen) {
          const clashes = (option.flag.sharedWith ?? []).filter((sharedId) =>
            chosen.some((other) => other.id === sharedId),
          );
          expect(clashes, `${question.id}: ${option.id} clashes with ${clashes}`).toEqual(
            [],
          );
        }
      }
    }
  });

  it('never leaks an out-of-continent entity into the answer slot (§12)', () => {
    const continents: Continent[] = ['Europe', 'Oceania', 'Africa'];
    for (const continent of continents) {
      const { questions } = generateQuestions(
        config({ pool: { continents: [continent], source: 'all', countrySet: 'all' }, length: 'all' }),
      );
      for (const question of questions) {
        for (const id of question.options!) {
          expect(
            isInContinent(entity(id), continent),
            `${question.id}: ${id} is not in ${continent}`,
          ).toBe(true);
        }
      }
    }
  });
});

describe('the distractor ladder (§5.2 step 4)', () => {
  it('offers Romania on a hard flags question for Chad', () => {
    const chad = entity('chad');
    const pool = buildPool(config());
    // Sampled across seeds: the curated confusable is the top rung, so it
    // should appear essentially always rather than occasionally.
    let withRomania = 0;
    const trials = 30;
    for (let seed = 0; seed < trials; seed++) {
      const options = buildOptions(
        mulberry32(seed),
        chad,
        pool,
        { difficulty: 'hard', mode: 'flags' },
        'name',
        'flag',
      );
      if (options.includes('romania')) withRomania++;
    }
    expect(withRomania).toBe(trials);
  });

  it('prefers same-subregion distractors at hard before reaching further out', () => {
    const france = entity('france');
    const pool = buildPool(config());
    const options = buildOptions(
      mulberry32(7),
      france,
      pool,
      { difficulty: 'hard', mode: 'flags' },
      'name',
      'flag',
    );
    const distractors = options.filter((id) => id !== 'france').map(entity);
    const near = distractors.filter(
      (e) => (france.confusableWith ?? []).includes(e.id) || e.subregion === france.subregion,
    );
    // 8 options = 7 distractors; France has curated confusables plus a
    // populous subregion, so all of them should come from the near tiers.
    expect(near.length).toBe(distractors.length);
  });

  it('inverts the ladder on easy, preferring a different continent (§5.2)', () => {
    const france = entity('france');
    const pool = buildPool(config());
    const options = buildOptions(
      mulberry32(3),
      france,
      pool,
      { difficulty: 'easy', mode: 'flags' },
      'name',
      'flag',
    );
    const distractors = options.filter((id) => id !== 'france').map(entity);
    expect(distractors.every((e) => e.continent !== 'Europe')).toBe(true);
  });

  it('does not use flag-confusables to pick capital distractors', () => {
    // Chad/Romania are confusable by flag only; their capitals are not, and
    // Romania is on another continent, which §6.2 rules out at medium+.
    const chad = entity('chad');
    const pool = buildPool(config({ mode: 'capitals' }));
    let withRomania = 0;
    for (let seed = 0; seed < 30; seed++) {
      const options = buildOptions(
        mulberry32(seed),
        chad,
        pool,
        { difficulty: 'hard', mode: 'capitals' },
        'capital',
        'name',
      );
      if (options.includes('romania')) withRomania++;
    }
    expect(withRomania).toBe(0);
  });

  it('keeps capital distractors on the same continent at medium and above (§6.2)', () => {
    const { questions } = generateQuestions(
      config({ mode: 'capitals', difficulty: 'medium', length: 'all' }),
    );
    let offContinent = 0;
    for (const question of questions) {
      const answer = entity(question.entityId);
      for (const id of question.options!) {
        const option = entity(id);
        if (option.id !== answer.id && option.continent !== answer.continent) {
          offContinent++;
        }
      }
    }
    // Small continents cannot always fill 6 slots from their own pool, so this
    // is "vanishingly rare", not "never" — the fallback tier exists so those
    // questions still get a full option set.
    const totalOptions = questions.length * 6;
    expect(offContinent / totalOptions).toBeLessThan(0.02);
  });
});

describe('prompts and directions (§6.1)', () => {
  it('asks flag → name for a-to-b', () => {
    const { questions } = generateQuestions(config({ direction: 'a-to-b', length: 20 }));
    for (const question of questions) {
      expect(question.prompt.kind).toBe('flag');
      expect(question.answerKind).toBe('name');
      expect(question.prompt.value).toBe(entity(question.entityId).flag.file);
    }
  });

  it('asks name → flag for b-to-a', () => {
    const { questions } = generateQuestions(config({ direction: 'b-to-a', length: 20 }));
    for (const question of questions) {
      expect(question.prompt.kind).toBe('name');
      expect(question.answerKind).toBe('flag');
    }
  });

  it('alternates directions for mixed', () => {
    const { questions } = generateQuestions(config({ direction: 'mixed', length: 50 }));
    const kinds = new Set(questions.map((q) => q.prompt.kind));
    expect(kinds).toEqual(new Set(['flag', 'name']));
  });

  it('asks country → capital and capital → country in capitals mode', () => {
    const forward = generateQuestions(
      config({ mode: 'capitals', direction: 'a-to-b', length: 20 }),
    );
    for (const question of forward.questions) {
      expect(question.prompt.kind).toBe('name');
      expect(question.answerKind).toBe('capital');
    }

    const reverse = generateQuestions(
      config({ mode: 'capitals', direction: 'b-to-a', length: 20 }),
    );
    for (const question of reverse.questions) {
      expect(question.prompt.kind).toBe('capital');
      expect(question.answerKind).toBe('name');
      expect(question.prompt.value).toBe(primaryCapital(entity(question.entityId)));
    }
  });

  it('labels a capital option with the entity primary capital, not a secondary', () => {
    // South Africa has three capitals; only Pretoria may be shown as its label,
    // so Cape Town can never appear as a distractor against South Africa.
    const southAfrica = entity('south-africa');
    expect(optionLabel(southAfrica, 'capital')).toBe('Pretoria');
  });
});

/**
 * Country sets — the pool a game draws from. The default exists because a quiz
 * over all 250 entities is mostly territories nobody set out to learn.
 */
describe('country sets (§3.3)', () => {
  const poolFor = (countrySet: 'un' | 'un-plus-disputed' | 'all') =>
    buildPool(config({ pool: { continents: 'all', source: 'all', countrySet } }));

  it('has the sizes the setup screen promises', () => {
    expect(poolFor('un')).toHaveLength(195);
    expect(poolFor('un-plus-disputed')).toHaveLength(198);
    expect(poolFor('all')).toHaveLength(250);
  });

  it('nests, so widening the choice only ever adds countries', () => {
    const un = new Set(poolFor('un').map((e) => e.id));
    const disputed = new Set(poolFor('un-plus-disputed').map((e) => e.id));
    const all = new Set(poolFor('all').map((e) => e.id));

    for (const id of un) expect(disputed.has(id), `${id} vanished`).toBe(true);
    for (const id of disputed) expect(all.has(id), `${id} vanished`).toBe(true);
  });

  it('includes the observers in the default set, but no territories', () => {
    const ids = new Set(poolFor('un').map((e) => e.id));
    expect(ids.has('palestine')).toBe(true);
    expect(ids.has('vatican-city')).toBe(true);
    expect(ids.has('puerto-rico')).toBe(false);
    expect(ids.has('greenland')).toBe(false);
    expect(ids.has('hong-kong')).toBe(false);
  });

  it('admits the disputed three only from the middle set up', () => {
    for (const id of ['kosovo', 'taiwan', 'western-sahara']) {
      expect(poolFor('un').some((e) => e.id === id), id).toBe(false);
      expect(poolFor('un-plus-disputed').some((e) => e.id === id), id).toBe(true);
      expect(poolFor('all').some((e) => e.id === id), id).toBe(true);
    }
  });

  it('keeps distractors inside the chosen set, not just the answers', () => {
    const { questions } = generateQuestions(
      config({ pool: { continents: 'all', source: 'all', countrySet: 'un' }, length: 100 }),
    );
    for (const question of questions) {
      for (const id of question.options!) {
        const status = entity(id).status;
        expect(['un-member', 'un-observer'], `${id} leaked in`).toContain(status);
      }
    }
  });

  it('still excludes entities with no capital, on top of the set filter', () => {
    const pool = buildPool(
      config({ mode: 'capitals', pool: { continents: 'all', source: 'all', countrySet: 'all' } }),
    );
    expect(pool.every((e) => e.capitals.length > 0)).toBe(true);
  });
});

describe('easy favours familiar countries (tier)', () => {
  /** Mean familiarity tier of the countries a run of sessions asked about. */
  function meanTier(difficulty: Difficulty, seeds: number[]): number {
    const tiers = seeds.flatMap(
      (seed) =>
        generateQuestions(config({ difficulty, seed, length: 20 })).questions.map(
          (question) => entity(question.entityId).tier,
        ),
    );
    return tiers.reduce((total, tier) => total + tier, 0) / tiers.length;
  }

  const seeds = Array.from({ length: 40 }, (_, index) => index * 7919 + 1);

  it('asks about more familiar countries on easy than on hard', () => {
    const easy = meanTier('easy', seeds);
    const hard = meanTier('hard', seeds);

    // Not a hair's breadth: the whole point is that easy feels different.
    expect(easy).toBeLessThan(hard - 0.3);
    expect(easy).toBeLessThan(1.6);
  });

  it('still reaches the obscure ones, so a long easy quiz teaches something', () => {
    const asked = new Set(
      seeds.flatMap((seed) =>
        generateQuestions(config({ difficulty: 'easy', seed, length: 20 })).questions.map(
          (question) => entity(question.entityId).tier,
        ),
      ),
    );
    expect(asked).toContain(3);
  });

  it('stays deterministic and repeat-free', () => {
    const first = generateQuestions(config({ difficulty: 'easy', seed: 4242, length: 50 }));
    const second = generateQuestions(config({ difficulty: 'easy', seed: 4242, length: 50 }));
    expect(first).toEqual(second);

    const ids = first.questions.map((question) => question.entityId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('can still fill a pool too small to be choosy', () => {
    // 12 countries in South America, 20 asked for: every one must appear
    // exactly once rather than the weighting producing a short session.
    const { questions } = generateQuestions(
      config({
        difficulty: 'easy',
        length: 20,
        pool: { continents: ['South America'], source: 'all', countrySet: 'all' },
      }),
    );
    const pool = buildPool(
      config({ pool: { continents: ['South America'], source: 'all', countrySet: 'all' } }),
    );
    expect(new Set(questions.map((q) => q.entityId))).toEqual(new Set(pool.map((e) => e.id)));
  });

  it('does not override hardest-countries mode, which is an explicit request', () => {
    // Niue is tier 3 and would rarely be chosen by the easy weighting, but a
    // player who asked for their weak countries gets their weak countries.
    const weights = new Map([['niue', 100]]);
    const { questions } = generateQuestions(
      config({
        difficulty: 'easy',
        length: 20,
        pool: { continents: 'all', source: 'hardest', countrySet: 'all' },
      }),
      { weights },
    );
    expect(questions.map((q) => q.entityId)).toContain('niue');
  });

  it('offers familiar distractors on easy, obscure ones on hard', () => {
    const rng = mulberry32(99);
    const pool = buildPool(config({ pool: { continents: 'all', source: 'all', countrySet: 'all' } }));

    const obscureDistractors = (difficulty: Difficulty) =>
      pool
        .slice(0, 60)
        .flatMap((answer) =>
          buildOptions(rng, answer, pool, { difficulty, mode: 'flags' }, 'name', 'flag').filter(
            (id) => id !== answer.id && entity(id).tier === 3,
          ),
        ).length;

    // Easy has 174 familiar candidates to draw 3 from, so it never has to
    // reach the tier-3 rung at all.
    expect(obscureDistractors('easy')).toBe(0);
    expect(obscureDistractors('hard')).toBeGreaterThan(0);
  });
});
