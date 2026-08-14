import { describe, expect, it } from 'vitest';
import { entities } from '@/data/entities.generated';
import {
  MAX_SUGGESTIONS,
  MIN_LENGTH_FOR_SOLE_SUGGESTION,
  MIN_QUERY_LENGTH,
  suggest,
} from './suggest';

const names = (query: string) => suggest(query, 'name').map((s) => s.label);
const capitals = (query: string) => suggest(query, 'capital').map((s) => s.label);

describe('suggestion length rules (§5.3, §14)', () => {
  it('suggests nothing below two characters', () => {
    expect(names('')).toEqual([]);
    expect(names('f')).toEqual([]);
    expect(names(' g ')).toEqual([]);
    expect(MIN_QUERY_LENGTH).toBe(2);
  });

  it('suggests at two characters once there is more than one candidate', () => {
    const result = names('fr');
    expect(result.length).toBeGreaterThan(1);
    expect(result).toContain('France');
  });

  it('never shows more than eight suggestions', () => {
    for (const query of ['sa', 'gu', 'ma', 'ni', 'un', 'so', 'new']) {
      expect(suggest(query, 'name').length).toBeLessThanOrEqual(MAX_SUGGESTIONS);
    }
    expect(MAX_SUGGESTIONS).toBe(8);
  });
});

/**
 * The T2.2 acceptance criterion, checked exhaustively rather than by example.
 */
describe('never handing the answer to a two-character prefix', () => {
  it('never returns a sole suggestion for any two-character query', () => {
    const alphabet = 'abcdefghijklmnopqrstuvwxyz';
    const offenders: string[] = [];

    for (const first of alphabet) {
      for (const second of alphabet) {
        const query = first + second;
        for (const kind of ['name', 'capital'] as const) {
          const results = suggest(query, kind);
          if (results.length === 1) {
            offenders.push(`${kind} "${query}" -> ${results[0]!.label}`);
          }
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it('offers a lone suggestion from three characters on', () => {
    expect(names('zim')).toEqual(['Zimbabwe']);
    expect(MIN_LENGTH_FOR_SOLE_SUGGESTION).toBe(3);
  });

  /**
   * Regression: with the threshold at 4, "fr" offered France but "fra" offered
   * nothing, because France was then the only match and lone results were
   * withheld. A suggestion that vanishes as you type reads as a broken box.
   */
  it('never makes a suggestion disappear as more characters are typed', () => {
    const offenders: string[] = [];
    for (const name of ['France', 'Zimbabwe', 'Japan', 'Peru', 'Netherlands', 'Chad']) {
      let seen = false;
      for (let length = MIN_QUERY_LENGTH; length <= name.length; length++) {
        const shown = names(name.slice(0, length)).includes(name);
        if (shown) seen = true;
        else if (seen) offenders.push(`"${name}" vanished at "${name.slice(0, length)}"`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('still shows several suggestions at short prefixes when several match', () => {
    const result = names('ne');
    expect(result.length).toBeGreaterThan(1);
    expect(result).toContain('Netherlands');
  });
});

describe('ranking and content', () => {
  it('puts prefix matches before substring matches', () => {
    const result = names('ind');
    expect(result[0]).toBe('India');
    // Both India and Indonesia are prefix matches; something containing "ind"
    // elsewhere may follow, but never before them.
    expect(result.indexOf('Indonesia')).toBeLessThan(
      result.indexOf('India') === -1 ? Infinity : Number.MAX_SAFE_INTEGER,
    );
  });

  it('finds a country by a word in the middle of its name', () => {
    expect(names('guinea')).toContain('Papua New Guinea');
  });

  it('finds a country through an alias but offers its canonical name', () => {
    // Someone who knows it as "Côte d'Ivoire" must be able to find it.
    expect(names('cote')).toContain('Ivory Coast');
    expect(names('cote')).not.toContain("Côte d'Ivoire");
    expect(names('holl')).toContain('Netherlands');
    expect(names('holl')).not.toContain('Holland');
  });

  it('ignores diacritics and punctuation in the query', () => {
    expect(names('curac')).toContain('Curaçao');
    expect(names('timor leste')).toContain('Timor-Leste');
  });

  it('finds a capital through its alias but offers the canonical spelling', () => {
    expect(capitals('den haag')).toContain('The Hague');
    expect(capitals('den haag')).not.toContain('Den Haag');
  });

  it('suggests capitals in capital mode, not country names', () => {
    const result = capitals('par');
    expect(result).toContain('Paris');
    expect(result).not.toContain('France');
  });

  it('suggests secondary capitals too, so any accepted answer is reachable', () => {
    expect(capitals('cape')).toContain('Cape Town');
    expect(capitals('la p')).toContain('La Paz');
  });

  it('returns nothing for a query that matches nothing', () => {
    expect(names('qqzz')).toEqual([]);
  });

  it('carries the entity id alongside the label', () => {
    const [first] = suggest('fran', 'name');
    expect(first!.entityId).toBe('france');
    expect(first!.label).toBe('France');
  });

  it('offers a label that is exactly a dataset spelling', () => {
    const known = new Set(entities.map((entity) => entity.name));
    for (const suggestion of suggest('sa', 'name')) {
      expect(known.has(suggestion.label)).toBe(true);
    }
  });
});
