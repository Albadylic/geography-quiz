import { describe, expect, it } from 'vitest';
import { entities } from '@/data/entities.generated';
import type { Entity } from '@/data/schema';
import { fuzzyTolerance, levenshtein, normalise } from '@/lib/normalise';
import { acceptedForms, buildAnswerIndex, matchesText } from './grading';

const byId = new Map(entities.map((e) => [e.id, e]));
const entity = (id: string): Entity => {
  const found = byId.get(id);
  if (!found) throw new Error(`entity "${id}" missing`);
  return found;
};

const index = buildAnswerIndex();
const matchesName = (input: string, id: string) =>
  matchesText(input, entity(id), 'name', { index });
const matchesCapital = (input: string, id: string) =>
  matchesText(input, entity(id), 'capital', { index });

describe('normalise (§5.3)', () => {
  it('lowercases', () => {
    expect(normalise('FRANCE')).toBe('france');
  });

  it('strips diacritics', () => {
    expect(normalise('Côte d’Ivoire')).toBe('cote d ivoire');
    expect(normalise('Curaçao')).toBe('curacao');
    expect(normalise('Åland')).toBe('aland');
  });

  it('strips punctuation to a space, so apostrophes are optional', () => {
    expect(normalise("Cote d'Ivoire")).toBe(normalise('Cote d Ivoire'));
    expect(normalise('Timor-Leste')).toBe('timor leste');
    expect(normalise('Guinea-Bissau')).toBe('guinea bissau');
  });

  it('drops the article "the" but not the letters inside a word', () => {
    expect(normalise('The Netherlands')).toBe('netherlands');
    expect(normalise('The Gambia')).toBe('gambia');
    expect(normalise('Netherlands')).toBe('netherlands');
  });

  it('collapses whitespace and trims', () => {
    expect(normalise('  South   Africa  ')).toBe('south africa');
  });

  it('returns empty for input with nothing in it', () => {
    expect(normalise('   ')).toBe('');
    expect(normalise('!!!')).toBe('');
  });
});

describe('levenshtein', () => {
  it('measures the standard distances', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3);
    expect(levenshtein('france', 'france')).toBe(0);
    expect(levenshtein('', 'abc')).toBe(3);
  });

  it('caps out early without lying about being under the cap', () => {
    // Real distance is 3; asking for a max of 1 must not report <= 1.
    expect(levenshtein('kitten', 'sitting', 1)).toBeGreaterThan(1);
  });

  it('agrees with the uncapped result when under the cap', () => {
    expect(levenshtein('kyrgystan', 'kyrgyzstan', 2)).toBe(1);
  });
});

describe('fuzzyTolerance', () => {
  it('forgives one character under eight, two at eight or more', () => {
    expect(fuzzyTolerance('iran')).toBe(1);
    expect(fuzzyTolerance('austria')).toBe(1);
    expect(fuzzyTolerance('kyrgystan')).toBe(2);
  });
});

describe('accepted spellings', () => {
  it('accepts the exact name', () => {
    expect(matchesName('France', 'france')).toBe(true);
  });

  it('is case and whitespace insensitive', () => {
    expect(matchesName('  fRaNcE ', 'france')).toBe(true);
  });

  it('accepts documented aliases (§12)', () => {
    expect(matchesName('USA', 'united-states')).toBe(true);
    expect(matchesName('the netherlands', 'netherlands')).toBe(true);
    expect(matchesName('Holland', 'netherlands')).toBe(true);
    expect(matchesName('Burma', 'myanmar')).toBe(true);
    expect(matchesName('Czech Republic', 'czechia')).toBe(true);
    expect(matchesName('Swaziland', 'eswatini')).toBe(true);
  });

  it('accepts "Cote d Ivoire" without the diacritic or apostrophe (§12)', () => {
    expect(matchesName('Cote d Ivoire', 'ivory-coast')).toBe(true);
    expect(matchesName("Côte d'Ivoire", 'ivory-coast')).toBe(true);
    expect(matchesName('Ivory Coast', 'ivory-coast')).toBe(true);
  });

  it('accepts every alias in the dataset for its own entity (§12)', () => {
    const failures: string[] = [];
    for (const candidate of entities) {
      for (const alias of candidate.aliases) {
        if (!matchesText(alias, candidate, 'name', { index })) {
          failures.push(`${candidate.id}: "${alias}"`);
        }
      }
      if (!matchesText(candidate.name, candidate, 'name', { index })) {
        failures.push(`${candidate.id}: own name "${candidate.name}"`);
      }
    }
    expect(failures).toEqual([]);
  });

  it('accepts every capital and capital alias for its own entity', () => {
    const failures: string[] = [];
    for (const candidate of entities) {
      for (const form of acceptedForms(candidate, 'capital')) {
        if (!matchesText(form, candidate, 'capital', { index })) {
          failures.push(`${candidate.id}: "${form}"`);
        }
      }
    }
    expect(failures).toEqual([]);
  });
});

describe('forgiving a misspelling (§5.3)', () => {
  it('accepts "Kyrgystan" (§12)', () => {
    expect(matchesName('Kyrgystan', 'kyrgyzstan')).toBe(true);
  });

  it('accepts "Ouagadoudou" (§12)', () => {
    expect(matchesCapital('Ouagadoudou', 'burkina-faso')).toBe(true);
  });

  it('accepts a single dropped letter in a long name', () => {
    expect(matchesName('Madagascr', 'madagascar')).toBe(true);
    expect(matchesName('Phillipines', 'philippines')).toBe(true);
  });

  it('rejects something that is simply a different word', () => {
    expect(matchesName('Belgium', 'france')).toBe(false);
    expect(matchesName('Peru', 'chile')).toBe(false);
  });
});

/**
 * The heart of the matter. Without the "exact name of another country is never
 * a typo" rule, each of these grades a real, different country as correct.
 */
describe('never accepting a different country', () => {
  it('rejects "Australia" for Austria (§12, the classic false positive)', () => {
    expect(matchesName('Australia', 'austria')).toBe(false);
    // and the reverse
    expect(matchesName('Austria', 'australia')).toBe(false);
  });

  it('rejects "Iran" for Iraq, which are one edit apart', () => {
    expect(levenshtein('iran', 'iraq')).toBe(1);
    expect(matchesName('Iran', 'iraq')).toBe(false);
    expect(matchesName('Iraq', 'iran')).toBe(false);
  });

  it('rejects "Zambia" for Gambia, which are one edit apart', () => {
    expect(levenshtein('zambia', 'gambia')).toBe(1);
    expect(matchesName('Zambia', 'gambia')).toBe(false);
    expect(matchesName('Gambia', 'zambia')).toBe(false);
  });

  it('rejects "Niger" for Nigeria and the reverse', () => {
    expect(matchesName('Niger', 'nigeria')).toBe(false);
    expect(matchesName('Nigeria', 'niger')).toBe(false);
  });

  it('rejects "Mali" for Malawi', () => {
    expect(matchesName('Mali', 'malawi')).toBe(false);
  });

  it('rejects "India" for Indonesia', () => {
    expect(matchesName('India', 'indonesia')).toBe(false);
  });

  /**
   * Exhaustive: no country's exact name may ever grade as any other country.
   * This is the property the guard exists to hold.
   */
  it('never grades one country as another, across the whole dataset', () => {
    const collisions: string[] = [];
    for (const typed of entities) {
      for (const target of entities) {
        if (typed.id === target.id) continue;
        if (matchesText(typed.name, target, 'name', { index })) {
          collisions.push(`typing "${typed.name}" graded as ${target.name}`);
        }
      }
    }
    expect(collisions).toEqual([]);
  });

  /**
   * Same property for capitals, with one honest exception: capital *names* are
   * not unique. Kingston is the capital of both Jamaica and Norfolk Island,
   * Oranjestad of both Aruba and Sint Eustatius, and Jerusalem is listed for
   * both Israel and Palestine. Typing a name the target genuinely holds is a
   * correct answer, so those are excluded — what must never happen is a
   * *fuzzy* match onto a capital the target does not have.
   */
  it('never fuzzy-matches one capital onto a different country', () => {
    const collisions: string[] = [];
    const withCapitals = entities.filter((e) => e.capitals.length > 0);
    for (const typed of withCapitals) {
      const primary = typed.capitals.find((c) => c.isPrimary)!.name;
      for (const target of withCapitals) {
        if (typed.id === target.id) continue;
        // Genuinely shared name: the target really does have this capital.
        const targetHasIt = acceptedForms(target, 'capital').some(
          (form) => normalise(form) === normalise(primary),
        );
        if (targetHasIt) continue;
        if (matchesText(primary, target, 'capital', { index })) {
          collisions.push(`typing "${primary}" graded as ${target.name}'s capital`);
        }
      }
    }
    expect(collisions).toEqual([]);
  });

  it('accepts a genuinely shared capital name for either country', () => {
    // Kingston really is the capital of both.
    expect(matchesCapital('Kingston', 'jamaica')).toBe(true);
    expect(matchesCapital('Kingston', 'norfolk-island')).toBe(true);
  });
});

describe('multi-capital entities (§3.3)', () => {
  it('accepts any of South Africa three capitals (§12)', () => {
    expect(matchesCapital('Pretoria', 'south-africa')).toBe(true);
    expect(matchesCapital('Cape Town', 'south-africa')).toBe(true);
    expect(matchesCapital('Bloemfontein', 'south-africa')).toBe(true);
  });

  it('accepts either of Bolivia two capitals', () => {
    expect(matchesCapital('Sucre', 'bolivia')).toBe(true);
    expect(matchesCapital('La Paz', 'bolivia')).toBe(true);
  });

  it('accepts both Netherlands capitals, including an alias', () => {
    expect(matchesCapital('Amsterdam', 'netherlands')).toBe(true);
    expect(matchesCapital('The Hague', 'netherlands')).toBe(true);
    expect(matchesCapital('Den Haag', 'netherlands')).toBe(true);
  });

  it('accepts both Sri Lanka capitals', () => {
    expect(matchesCapital('Sri Jayawardenepura Kotte', 'sri-lanka')).toBe(true);
    expect(matchesCapital('Colombo', 'sri-lanka')).toBe(true);
  });

  it('still rejects a capital that belongs to someone else', () => {
    expect(matchesCapital('Nairobi', 'south-africa')).toBe(false);
  });
});

describe('empty and skipped input', () => {
  it('never grades empty input as correct', () => {
    expect(matchesName('', 'france')).toBe(false);
    expect(matchesName('   ', 'france')).toBe(false);
    expect(matchesName('!!!', 'france')).toBe(false);
  });
});
