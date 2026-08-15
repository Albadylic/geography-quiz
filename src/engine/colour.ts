import { entities as allEntities } from '@/data/entities.generated';
import { templateById, type FlagTemplate } from '@/data/flag-templates';
import { COLOUR_TOKENS, type ColourToken } from '@/data/constants';
import type { Entity } from '@/data/schema';
import { isInCountrySet } from './pool';
import { shuffle, type Rng } from './rng';
import type { CountrySet } from './types';

/**
 * Colour the Flag — plan §7.
 *
 * Regions are discrete paths, so filling one is setting a fill; there is no
 * flood fill. Grading compares colour *tokens*, never hex values, so it is
 * exact equality and a near-miss blue can never grade as correct.
 */

export type ColourDifficulty = 'easy' | 'medium' | 'hard';

/** Decoys added beyond the flag's own colours, per §7. */
export const DECOY_COUNT: Record<ColourDifficulty, number> = {
  easy: 0,
  medium: 3,
  hard: 6,
};

/**
 * Only entities with a colouring spec appear in this mode (§7), narrowed to
 * the player's country set so one choice governs the whole app.
 */
export function colourablePool(
  countrySet: CountrySet = 'all',
  entities: readonly Entity[] = allEntities,
): Entity[] {
  return entities.filter(
    (entity) => entity.colouring !== undefined && isInCountrySet(entity, countrySet),
  );
}

export interface ColourQuestion {
  id: string;
  entityId: string;
  template: FlagTemplate;
  /** region id -> the token that region must end up as. */
  answer: Record<string, ColourToken>;
  /** The palette offered, already shuffled. */
  palette: ColourToken[];
}

/**
 * Colour families, so a decoy is never a near-duplicate of a correct colour.
 *
 * §7 is explicit that two blues in one palette is a perception test rather
 * than a knowledge test. Grading is on exact tokens, so offering `navy`
 * alongside a correct `blue` would ask the player to discriminate shades they
 * were never taught — families are what rule that out.
 */
const COLOUR_FAMILY: Record<ColourToken, string> = {
  red: 'red',
  crimson: 'red',
  maroon: 'red',
  orange: 'orange',
  yellow: 'yellow',
  gold: 'yellow',
  green: 'green',
  'dark-green': 'green',
  'light-green': 'green',
  blue: 'blue',
  navy: 'blue',
  'light-blue': 'blue',
  cyan: 'blue',
  purple: 'purple',
  magenta: 'purple',
  pink: 'pink',
  brown: 'brown',
  black: 'black',
  white: 'white',
  grey: 'grey',
};

export function colourFamily(token: ColourToken): string {
  return COLOUR_FAMILY[token];
}

/**
 * Builds the palette for one question: the correct colours plus `decoys`
 * drawn from families that do not appear in the answer, all shuffled (§7).
 */
export function buildPalette(
  rng: Rng,
  answer: Record<string, ColourToken>,
  difficulty: ColourDifficulty,
): ColourToken[] {
  const correct = [...new Set(Object.values(answer))];
  const usedFamilies = new Set(correct.map(colourFamily));

  const candidates = COLOUR_TOKENS.filter(
    (token) => !usedFamilies.has(colourFamily(token)),
  );

  // One decoy per family, so the decoys are not near-duplicates of each other
  // either — six shades of the same green would be just as unfair.
  const byFamily = new Map<string, ColourToken>();
  for (const token of shuffle(rng, candidates)) {
    const family = colourFamily(token);
    if (!byFamily.has(family)) byFamily.set(family, token);
  }

  const decoys = shuffle(rng, [...byFamily.values()]).slice(0, DECOY_COUNT[difficulty]);
  return shuffle(rng, [...correct, ...decoys]);
}

export function buildColourQuestion(
  rng: Rng,
  entity: Entity,
  difficulty: ColourDifficulty,
  index: number,
): ColourQuestion | null {
  const spec = entity.colouring;
  if (!spec) return null;

  const template = templateById(spec.templateId);
  if (!template) return null;

  const answer = spec.regions as Record<string, ColourToken>;
  return {
    id: `c${index + 1}-${entity.id}`,
    entityId: entity.id,
    template,
    answer,
    palette: buildPalette(rng, answer, difficulty),
  };
}

export interface RegionResult {
  regionId: string;
  label: string;
  expected: ColourToken;
  given: ColourToken | null;
  correct: boolean;
}

export interface ColourGrade {
  results: RegionResult[];
  correctCount: number;
  regionCount: number;
  /** Every region must match its token exactly (§7). */
  allCorrect: boolean;
}

/**
 * Grades a filled-in flag. Comparison is exact token equality — the palette is
 * tokens rather than free hex values precisely so this can be (§7).
 */
export function gradeColouring(
  question: ColourQuestion,
  filled: Partial<Record<string, ColourToken>>,
): ColourGrade {
  const results: RegionResult[] = question.template.regions.map((region) => {
    const expected = question.answer[region.id]!;
    const given = filled[region.id] ?? null;
    return {
      regionId: region.id,
      label: region.label,
      expected,
      given,
      correct: given === expected,
    };
  });

  const correctCount = results.filter((result) => result.correct).length;
  return {
    results,
    correctCount,
    regionCount: results.length,
    allCorrect: correctCount === results.length,
  };
}

/** Human-readable colour names for the palette swatches (§7, §11). */
export const COLOUR_NAMES: Record<ColourToken, string> = {
  red: 'Red',
  crimson: 'Crimson',
  maroon: 'Maroon',
  orange: 'Orange',
  yellow: 'Yellow',
  gold: 'Gold',
  green: 'Green',
  'dark-green': 'Dark green',
  'light-green': 'Light green',
  blue: 'Blue',
  navy: 'Navy',
  'light-blue': 'Light blue',
  cyan: 'Cyan',
  purple: 'Purple',
  magenta: 'Magenta',
  pink: 'Pink',
  brown: 'Brown',
  black: 'Black',
  white: 'White',
  grey: 'Grey',
};

/** Hex used only to paint the swatch and the template; never graded. */
export const COLOUR_HEX: Record<ColourToken, string> = {
  red: '#e01b24',
  crimson: '#a50034',
  maroon: '#6b1024',
  orange: '#ff7f18',
  yellow: '#ffdd00',
  gold: '#d4af37',
  green: '#009b48',
  'dark-green': '#04502a',
  'light-green': '#6fcf5f',
  blue: '#0052b4',
  navy: '#001a57',
  'light-blue': '#57b7e8',
  cyan: '#00c2cb',
  purple: '#6a1b9a',
  magenta: '#d6006e',
  pink: '#f48fb1',
  brown: '#7b4b26',
  black: '#0a0a0a',
  white: '#ffffff',
  grey: '#9e9e9e',
};
