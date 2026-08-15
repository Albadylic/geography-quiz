import { describe, expect, it } from 'vitest';
import { entities } from '@/data/entities.generated';
import { FLAG_TEMPLATES, templateById } from '@/data/flag-templates';
import type { ColourToken } from '@/data/schema';
import {
  buildColourQuestion,
  buildPalette,
  colourablePool,
  colourFamily,
  COLOUR_HEX,
  COLOUR_NAMES,
  DECOY_COUNT,
  gradeColouring,
  type ColourDifficulty,
} from './colour';
import { mulberry32 } from './rng';

const byId = new Map(entities.map((e) => [e.id, e]));
const entity = (id: string) => byId.get(id)!;

describe('templates (T6.1, T6.5)', () => {
  it('ships the fourteen templates §7 names, plus the R7 ratio variants', () => {
    expect(FLAG_TEMPLATES.map((template) => template.id).sort()).toEqual([
      'canton-plain',
      'crescent-star',
      'diagonal-split',
      'disc-centre',
      'disc-offset',
      // Added in R7: flags whose bands are not even thirds or halves were
      // being drawn on templates that were, which visibly misdrew them.
      'hoist-band-2',
      'horizontal-2',
      'horizontal-3',
      'horizontal-3-1-2-1',
      'horizontal-3-2-1-2',
      'horizontal-3-2-3-2',
      'horizontal-3-uneven',
      'horizontal-5',
      'nordic-cross',
      'saltire',
      'triangle-hoist',
      'vertical-2',
      'vertical-2-1-3',
      'vertical-2-2-3',
      'vertical-3',
    ]);
  });

  /**
   * Every template §7 names is built, but `canton-plain` has no entity: every
   * real canton carries a device (a Union Jack, a constellation, a star), so
   * no flag in the dataset is a plain field plus a plain canton. It ships
   * because §7 specifies it and a future spec may use it. This test pins the
   * exception so a second unused template cannot creep in unnoticed.
   */
  it('has specs for every template except the documented exception', () => {
    const used = new Set(colourablePool().map((entity) => entity.colouring!.templateId));
    const unused = FLAG_TEMPLATES.map((template) => template.id)
      .filter((id) => !used.has(id))
      .sort();
    expect(unused).toEqual(['canton-plain']);
  });

  it('gives every region an id, a label and path data', () => {
    for (const template of FLAG_TEMPLATES) {
      expect(template.regions.length).toBeGreaterThan(0);
      for (const region of template.regions) {
        expect(region.id, template.id).toMatch(/^[a-z-]+$/);
        expect(region.label.length, `${template.id}.${region.id}`).toBeGreaterThan(0);
        expect(region.d.length, `${template.id}.${region.id}`).toBeGreaterThan(0);
      }
    }
  });

  it('never repeats a region id within a template', () => {
    for (const template of FLAG_TEMPLATES) {
      const ids = template.regions.map((region) => region.id);
      expect(new Set(ids).size, template.id).toBe(ids.length);
    }
  });
});

describe('the colourable pool (§7)', () => {
  it('contains only entities with a colouring spec', () => {
    const pool = colourablePool();
    expect(pool.length).toBeGreaterThan(50);
    expect(pool.every((candidate) => candidate.colouring !== undefined)).toBe(true);
  });

  it('points every spec at a template that exists, with all regions assigned', () => {
    for (const candidate of colourablePool()) {
      const spec = candidate.colouring!;
      const template = templateById(spec.templateId);
      expect(template, `${candidate.id} -> ${spec.templateId}`).toBeDefined();

      const assigned = Object.keys(spec.regions).sort();
      const expected = template!.regions.map((region) => region.id).sort();
      expect(assigned, candidate.id).toEqual(expected);
    }
  });
});

describe('palette difficulty (§7)', () => {
  const answer: Record<string, ColourToken> = {
    left: 'blue',
    middle: 'white',
    right: 'red',
  };

  it('offers exactly the right colours on easy', () => {
    const palette = buildPalette(mulberry32(1), answer, 'easy');
    expect([...palette].sort()).toEqual(['blue', 'red', 'white']);
  });

  it.each<[ColourDifficulty, number]>([
    ['easy', 0],
    ['medium', 3],
    ['hard', 6],
  ])('adds %s its %i decoys', (difficulty, decoys) => {
    const palette = buildPalette(mulberry32(2), answer, difficulty);
    const correct = new Set(Object.values(answer));
    expect(palette).toHaveLength(correct.size + decoys);
    expect(DECOY_COUNT[difficulty]).toBe(decoys);
  });

  it('always contains every correct colour', () => {
    for (const difficulty of ['easy', 'medium', 'hard'] as const) {
      for (let seed = 0; seed < 20; seed++) {
        const palette = buildPalette(mulberry32(seed), answer, difficulty);
        for (const token of Object.values(answer)) {
          expect(palette, `${difficulty} seed ${seed}`).toContain(token);
        }
      }
    }
  });

  /**
   * §7: decoys are never near-duplicates of a correct colour — no two blues.
   * That would be a perception test, not a knowledge test.
   */
  it('never offers a decoy from the same colour family as a correct colour', () => {
    for (const difficulty of ['medium', 'hard'] as const) {
      for (let seed = 0; seed < 50; seed++) {
        const palette = buildPalette(mulberry32(seed), answer, difficulty);
        const correctFamilies = new Set(Object.values(answer).map(colourFamily));
        const decoys = palette.filter(
          (token) => !Object.values(answer).includes(token),
        );
        for (const decoy of decoys) {
          expect(
            correctFamilies.has(colourFamily(decoy)),
            `${difficulty} seed ${seed}: ${decoy} clashes with a correct colour`,
          ).toBe(false);
        }
      }
    }
  });

  it('never offers two decoys from the same family as each other', () => {
    for (let seed = 0; seed < 50; seed++) {
      const palette = buildPalette(mulberry32(seed), answer, 'hard');
      const decoys = palette.filter((token) => !Object.values(answer).includes(token));
      const families = decoys.map(colourFamily);
      expect(new Set(families).size, `seed ${seed}`).toBe(families.length);
    }
  });

  it('is shuffled rather than always listing the answer first', () => {
    const firsts = new Set(
      Array.from({ length: 20 }, (_, seed) => buildPalette(mulberry32(seed), answer, 'hard')[0]),
    );
    expect(firsts.size).toBeGreaterThan(1);
  });

  it('is reproducible for a seed', () => {
    expect(buildPalette(mulberry32(7), answer, 'hard')).toEqual(
      buildPalette(mulberry32(7), answer, 'hard'),
    );
  });
});

describe('building a question', () => {
  it('carries the template, the answer and a palette', () => {
    const question = buildColourQuestion(mulberry32(1), entity('france'), 'medium', 0)!;
    expect(question.entityId).toBe('france');
    expect(question.template.id).toBe('vertical-3');
    expect(question.answer).toEqual({ left: 'blue', middle: 'white', right: 'red' });
    expect(question.palette.length).toBe(3 + 3);
  });

  it('returns null for an entity with no spec', () => {
    expect(buildColourQuestion(mulberry32(1), entity('antarctica'), 'easy', 0)).toBeNull();
  });
});

describe('grading (§7)', () => {
  const question = buildColourQuestion(mulberry32(1), entity('france'), 'easy', 0)!;

  it('accepts an exactly correct flag', () => {
    const grade = gradeColouring(question, { left: 'blue', middle: 'white', right: 'red' });
    expect(grade.allCorrect).toBe(true);
    expect(grade.correctCount).toBe(3);
  });

  it('requires every region to match, not most of them', () => {
    const grade = gradeColouring(question, { left: 'blue', middle: 'white', right: 'green' });
    expect(grade.allCorrect).toBe(false);
    expect(grade.correctCount).toBe(2);
  });

  it('compares tokens exactly, so a near-miss shade is wrong', () => {
    // navy is the same family as blue, and still not the answer.
    const grade = gradeColouring(question, { left: 'navy', middle: 'white', right: 'red' });
    expect(grade.results.find((result) => result.regionId === 'left')!.correct).toBe(false);
  });

  it('treats an unfilled region as wrong rather than skipping it', () => {
    const grade = gradeColouring(question, { left: 'blue', middle: 'white' });
    const right = grade.results.find((result) => result.regionId === 'right')!;
    expect(right.given).toBeNull();
    expect(right.correct).toBe(false);
    expect(grade.regionCount).toBe(3);
  });

  it('reports every region with its label and expected colour, for the summary', () => {
    const grade = gradeColouring(question, {});
    expect(grade.results.map((result) => result.label)).toEqual([
      'Left band',
      'Middle band',
      'Right band',
    ]);
    expect(grade.results.map((result) => result.expected)).toEqual(['blue', 'white', 'red']);
  });
});

describe('colour tokens carry a name and a swatch colour (§7, §11)', () => {
  it('names every token in the palette', () => {
    for (const template of FLAG_TEMPLATES) {
      void template;
    }
    for (const candidate of colourablePool()) {
      for (const token of Object.values(candidate.colouring!.regions)) {
        expect(COLOUR_NAMES[token], token).toBeTruthy();
        expect(COLOUR_HEX[token], token).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });
});
