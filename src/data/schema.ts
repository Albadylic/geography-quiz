import { z } from 'zod';

/**
 * Entity schema — plan §3.1.
 *
 * "Entity" in code, "country" in the UI (§2): the dataset covers UN members,
 * observers, partially-recognised states and dependencies, and arguing about
 * whether Puerto Rico is a country in a variable name is not a good use of
 * anyone's time.
 *
 * The Zod schema and the TypeScript types are kept in lockstep by deriving the
 * types from the schema, so a field can never drift between the two.
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

export const ContinentSchema = z.enum(CONTINENTS);
export type Continent = z.infer<typeof ContinentSchema>;

export const STATUSES = [
  'un-member',
  'un-observer',
  'partially-recognised',
  'dependency',
  'special-administrative-region',
] as const;

export const StatusSchema = z.enum(STATUSES);
export type Status = z.infer<typeof StatusSchema>;

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

export const ColourTokenSchema = z.enum(COLOUR_TOKENS);
export type ColourToken = z.infer<typeof ColourTokenSchema>;

/** A stable slug id: lowercase, digits and single hyphens. Never reused. */
export const SlugSchema = z
  .string()
  .min(2)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'must be a lowercase hyphenated slug');

export const CapitalSchema = z.object({
  name: z.string().min(1),
  /** Alternative spellings and transliterations accepted in expert mode. */
  aliases: z.array(z.string().min(1)).default([]),
  /** The canonical answer. Exactly one capital per entity carries this. */
  isPrimary: z.boolean(),
  /** e.g. "seat of government", "legislative capital" — shown in review. */
  note: z.string().min(1).optional(),
});
export type Capital = z.infer<typeof CapitalSchema>;

export const ColouringSpecSchema = z.object({
  templateId: z.string().min(1),
  /** region name -> colour token. Validated against the template in §7. */
  regions: z.record(z.string().min(1), ColourTokenSchema),
});
export type ColouringSpec = z.infer<typeof ColouringSpecSchema>;

export const FlagSchema = z.object({
  /** Public path, e.g. "/flags/pr.svg". */
  file: z.string().regex(/^\/flags\/[a-z0-9-]+\.svg$/, 'must be a /flags/*.svg path'),
  /** Canonical palette, used by Colour mode and for distractor sanity checks. */
  colours: z.array(ColourTokenSchema).min(1),
  /** width / height. 1.5 for 3:2, 1 for square, 2.5454… for Qatar. */
  aspectRatio: z.number().positive().finite(),
  /**
   * Some dependencies fly their sovereign's flag. Marked here so two identical
   * flags never appear in the same option set (§3.3).
   */
  sharedWith: z.array(SlugSchema).optional(),
});
export type Flag = z.infer<typeof FlagSchema>;

export const EntitySchema = z
  .object({
    id: SlugSchema,
    iso2: z
      .string()
      .regex(/^[A-Z]{2}$/, 'ISO 3166-1 alpha-2 is two uppercase letters')
      .optional(),
    iso3: z
      .string()
      .regex(/^[A-Z]{3}$/, 'ISO 3166-1 alpha-3 is three uppercase letters')
      .optional(),
    name: z.string().min(1),
    officialName: z.string().min(1).optional(),
    /** "USA", "Holland", "Burma", "Czechia" — all accepted in expert mode. */
    aliases: z.array(z.string().min(1)).default([]),
    status: StatusSchema,
    /** "united-states" for Puerto Rico. Must resolve to another entity. */
    sovereignId: SlugSchema.optional(),
    /** Primary continent — what the continent filter keys on. */
    continent: ContinentSchema,
    /** Russia, Turkey, Egypt: also reachable through these filters. */
    altContinents: z.array(ContinentSchema).optional(),
    /** "Caribbean", "Nordic" — the second rung of the distractor ladder. */
    subregion: z.string().min(1).optional(),
    /** May be empty: Antarctica and a few territories have no capital (§3.3). */
    capitals: z.array(CapitalSchema).default([]),
    flag: FlagSchema,
    /** Present only for templatable flags (§7). */
    colouring: ColouringSpecSchema.optional(),
    /** Curated: ["romania"] on Chad. Every id must resolve. */
    confusableWith: z.array(SlugSchema).optional(),
    /** Familiarity: 1 = France, 3 = Niue. Drives easy-mode pool weighting. */
    tier: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    population: z.number().int().nonnegative().optional(),
  })
  .strict()
  .superRefine((entity, ctx) => {
    const primaries = entity.capitals.filter((c) => c.isPrimary);
    if (entity.capitals.length > 0 && primaries.length !== 1) {
      ctx.addIssue({
        code: 'custom',
        path: ['capitals'],
        message: `expected exactly one isPrimary capital, found ${primaries.length}`,
      });
    }

    const capitalNames = entity.capitals.map((c) => c.name.toLowerCase());
    const duplicateCapital = capitalNames.find(
      (name, i) => capitalNames.indexOf(name) !== i,
    );
    if (duplicateCapital) {
      ctx.addIssue({
        code: 'custom',
        path: ['capitals'],
        message: `duplicate capital "${duplicateCapital}"`,
      });
    }

    if (entity.altContinents?.includes(entity.continent)) {
      ctx.addIssue({
        code: 'custom',
        path: ['altContinents'],
        message: `altContinents repeats the primary continent "${entity.continent}"`,
      });
    }

    if (entity.confusableWith?.includes(entity.id)) {
      ctx.addIssue({
        code: 'custom',
        path: ['confusableWith'],
        message: 'an entity cannot be confusable with itself',
      });
    }

    if (entity.sovereignId === entity.id) {
      ctx.addIssue({
        code: 'custom',
        path: ['sovereignId'],
        message: 'an entity cannot be its own sovereign',
      });
    }

    if (entity.flag.sharedWith?.includes(entity.id)) {
      ctx.addIssue({
        code: 'custom',
        path: ['flag', 'sharedWith'],
        message: 'an entity cannot share a flag with itself',
      });
    }
  });

export type Entity = z.infer<typeof EntitySchema>;

/**
 * Dataset-level validation: the cross-entity invariants that a per-entity
 * schema cannot see. Run by the data build (T0.3) and by the data tests (§12).
 */
export const EntityListSchema = z.array(EntitySchema).superRefine((entities, ctx) => {
  const ids = new Set<string>();
  const names = new Map<string, string>();

  for (const [index, entity] of entities.entries()) {
    if (ids.has(entity.id)) {
      ctx.addIssue({
        code: 'custom',
        path: [index, 'id'],
        message: `duplicate entity id "${entity.id}"`,
      });
    }
    ids.add(entity.id);

    const nameKey = entity.name.toLowerCase();
    const clash = names.get(nameKey);
    if (clash) {
      ctx.addIssue({
        code: 'custom',
        path: [index, 'name'],
        message: `duplicate entity name "${entity.name}" (also on "${clash}")`,
      });
    }
    names.set(nameKey, entity.id);
  }

  // Reference integrity — every cross-reference must resolve to a real entity.
  for (const [index, entity] of entities.entries()) {
    if (entity.sovereignId && !ids.has(entity.sovereignId)) {
      ctx.addIssue({
        code: 'custom',
        path: [index, 'sovereignId'],
        message: `sovereignId "${entity.sovereignId}" does not resolve`,
      });
    }
    for (const [j, ref] of (entity.confusableWith ?? []).entries()) {
      if (!ids.has(ref)) {
        ctx.addIssue({
          code: 'custom',
          path: [index, 'confusableWith', j],
          message: `confusableWith "${ref}" does not resolve`,
        });
      }
    }
    for (const [j, ref] of (entity.flag.sharedWith ?? []).entries()) {
      if (!ids.has(ref)) {
        ctx.addIssue({
          code: 'custom',
          path: [index, 'flag', 'sharedWith', j],
          message: `flag.sharedWith "${ref}" does not resolve`,
        });
      }
    }
  }
});
