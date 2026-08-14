/**
 * Runtime constants from the entity schema.
 *
 * Split out of `schema.ts` deliberately: that module defines Zod schemas at
 * module scope, so importing a single value like `CONTINENTS` from it pulled
 * the whole of Zod — 72KB — into the app bundle, even though nothing at
 * runtime validates anything. Only the data build and the data tests need Zod.
 *
 * Types may still be imported from `schema.ts`; type imports are erased.
 */

export const CONTINENTS = [
  'Africa',
  'Asia',
  'Europe',
  'North America',
  'South America',
  'Oceania',
  'Antarctica',
] as const;

export const STATUSES = [
  'un-member',
  'un-observer',
  'partially-recognised',
  'dependency',
  'special-administrative-region',
] as const;

/**
 * Colour tokens for the flag palette and for Colour the Flag (§7).
 * Grading compares tokens, never hex values, so the comparison is exact
 * equality and a near-miss blue can never be graded as correct.
 */
export const COLOUR_TOKENS = [
  'red',
  'crimson',
  'maroon',
  'orange',
  'yellow',
  'gold',
  'green',
  'dark-green',
  'light-green',
  'blue',
  'navy',
  'light-blue',
  'cyan',
  'purple',
  'magenta',
  'pink',
  'brown',
  'black',
  'white',
  'grey',
] as const;

export type Continent = (typeof CONTINENTS)[number];
export type Status = (typeof STATUSES)[number];
export type ColourToken = (typeof COLOUR_TOKENS)[number];
