import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { entities } from './entities.generated';
import { EntityListSchema } from './schema';
import { templateById } from './flag-templates';
import { COLOUR_HEX } from '@/engine/colour';

const PUBLIC_DIR = join(process.cwd(), 'public');

/**
 * Data tests — §12. These assert against the real generated dataset rather
 * than fixtures, because their whole point is to catch the dataset drifting.
 */

const byId = new Map(entities.map((e) => [e.id, e]));

describe('dataset', () => {
  it('validates against the schema, including cross-entity invariants', () => {
    const result = EntityListSchema.safeParse(entities);
    if (!result.success) {
      const summary = result.error.issues
        .slice(0, 10)
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('\n');
      throw new Error(`Dataset failed validation:\n${summary}`);
    }
    expect(result.success).toBe(true);
  });

  it('covers at least 250 entities (§2 boundary)', () => {
    expect(entities.length).toBeGreaterThanOrEqual(250);
  });

  it('has exactly 193 UN members', () => {
    expect(entities.filter((e) => e.status === 'un-member')).toHaveLength(193);
  });

  it('has no duplicate ids', () => {
    expect(new Set(entities.map((e) => e.id)).size).toBe(entities.length);
  });

  it('has no duplicate names', () => {
    const names = entities.map((e) => e.name.toLowerCase());
    expect(new Set(names).size).toBe(entities.length);
  });

  it('resolves every sovereignId', () => {
    const unresolved = entities
      .filter((e) => e.sovereignId && !byId.has(e.sovereignId))
      .map((e) => `${e.id} -> ${e.sovereignId}`);
    expect(unresolved).toEqual([]);
  });

  it('resolves every confusableWith reference', () => {
    const unresolved = entities.flatMap((e) =>
      (e.confusableWith ?? [])
        .filter((ref) => !byId.has(ref))
        .map((ref) => `${e.id} -> ${ref}`),
    );
    expect(unresolved).toEqual([]);
  });

  it('resolves every flag.sharedWith reference', () => {
    const unresolved = entities.flatMap((e) =>
      (e.flag.sharedWith ?? [])
        .filter((ref) => !byId.has(ref))
        .map((ref) => `${e.id} -> ${ref}`),
    );
    expect(unresolved).toEqual([]);
  });

  it('keeps confusableWith symmetric, so the ladder works from either side', () => {
    const asymmetric = entities.flatMap((e) =>
      (e.confusableWith ?? [])
        .filter((ref) => !(byId.get(ref)?.confusableWith ?? []).includes(e.id))
        .map((ref) => `${e.id} -> ${ref} is not mirrored`),
    );
    expect(asymmetric).toEqual([]);
  });

  it('keeps flag.sharedWith symmetric', () => {
    const asymmetric = entities.flatMap((e) =>
      (e.flag.sharedWith ?? [])
        .filter((ref) => !(byId.get(ref)?.flag.sharedWith ?? []).includes(e.id))
        .map((ref) => `${e.id} -> ${ref} is not mirrored`),
    );
    expect(asymmetric).toEqual([]);
  });
});

describe('entities the plan calls out by name (T0.3)', () => {
  const expected: Array<[string, { continent: string; capital: string | null }]> = [
    ['palestine', { continent: 'Asia', capital: 'Ramallah' }],
    ['vatican-city', { continent: 'Europe', capital: 'Vatican City' }],
    ['puerto-rico', { continent: 'North America', capital: 'San Juan' }],
    ['kosovo', { continent: 'Europe', capital: 'Pristina' }],
    ['taiwan', { continent: 'Asia', capital: 'Taipei' }],
    ['greenland', { continent: 'North America', capital: 'Nuuk' }],
    ['hong-kong', { continent: 'Asia', capital: null }],
  ];

  it.each(expected)('%s is present with the right continent and capital', (id, want) => {
    const entity = byId.get(id);
    expect(entity, `${id} is missing from the dataset`).toBeDefined();
    expect(entity!.continent).toBe(want.continent);
    const primary = entity!.capitals.find((c) => c.isPrimary);
    expect(primary?.name ?? null).toBe(want.capital);
  });

  it('gives the disputed and observer entities a status other than un-member', () => {
    expect(byId.get('palestine')!.status).toBe('un-observer');
    expect(byId.get('vatican-city')!.status).toBe('un-observer');
    expect(byId.get('kosovo')!.status).toBe('partially-recognised');
    expect(byId.get('taiwan')!.status).toBe('partially-recognised');
    expect(byId.get('western-sahara')!.status).toBe('partially-recognised');
    expect(byId.get('hong-kong')!.status).toBe('special-administrative-region');
  });

  it('points dependencies at their sovereign', () => {
    expect(byId.get('puerto-rico')!.sovereignId).toBe('united-states');
    expect(byId.get('greenland')!.sovereignId).toBe('denmark');
    expect(byId.get('hong-kong')!.sovereignId).toBe('china');
  });
});

describe('capitals (§3.3)', () => {
  it('gives every entity with capitals exactly one primary', () => {
    const broken = entities
      .filter((e) => e.capitals.length > 0)
      .filter((e) => e.capitals.filter((c) => c.isPrimary).length !== 1)
      .map((e) => e.id);
    expect(broken).toEqual([]);
  });

  const multiCapital: Array<[string, string[]]> = [
    ['south-africa', ['Pretoria', 'Cape Town', 'Bloemfontein']],
    ['bolivia', ['Sucre', 'La Paz']],
    ['sri-lanka', ['Sri Jayawardenepura Kotte', 'Colombo']],
    ['netherlands', ['Amsterdam', 'The Hague']],
    ['eswatini', ['Mbabane', 'Lobamba']],
  ];

  it.each(multiCapital)('%s carries all of its capitals', (id, expectedNames) => {
    const entity = byId.get(id);
    expect(entity, `${id} is missing`).toBeDefined();
    const names = entity!.capitals.map((c) => c.name);
    expect(names.sort()).toEqual([...expectedNames].sort());
    expect(entity!.capitals.filter((c) => c.isPrimary)).toHaveLength(1);
  });

  it('leaves entities with no capital genuinely empty, for the pool filter to exclude', () => {
    // Locked decision 4: exclusion is by data, never by a hard-coded list.
    expect(byId.get('antarctica')!.capitals).toEqual([]);
    expect(byId.get('hong-kong')!.capitals).toEqual([]);
  });
});

describe('flags', () => {
  it('gives every entity a flag path and at least one colour', () => {
    for (const entity of entities) {
      expect(entity.flag.file, entity.id).toMatch(/^\/flags\/[a-z0-9-]+\.svg$/);
      expect(entity.flag.colours.length, entity.id).toBeGreaterThan(0);
    }
  });

  it('records a plausible aspect ratio for every entity', () => {
    for (const entity of entities) {
      expect(entity.flag.aspectRatio, entity.id).toBeGreaterThan(0.5);
      expect(entity.flag.aspectRatio, entity.id).toBeLessThan(3);
    }
  });

  it('ships the square asset for square flags, so FlagImage has both cases', () => {
    expect(byId.get('switzerland')!.flag.aspectRatio).toBe(1);
    expect(byId.get('vatican-city')!.flag.aspectRatio).toBe(1);
    // and the common case is genuinely a different shape
    expect(byId.get('france')!.flag.aspectRatio).toBeCloseTo(4 / 3, 3);
  });

  it('has an asset on disk for every entity (T0.4)', () => {
    const missing = entities
      .filter((e) => !existsSync(join(PUBLIC_DIR, e.flag.file)))
      .map((e) => `${e.id} -> ${e.flag.file}`);
    expect(missing).toEqual([]);
  });

  it('ships no flag asset that no entity references', () => {
    const referenced = new Set(entities.map((e) => e.flag.file.replace('/flags/', '')));
    const orphans = readdirSync(join(PUBLIC_DIR, 'flags'))
      .filter((file) => file.endsWith('.svg'))
      .filter((file) => !referenced.has(file));
    expect(orphans).toEqual([]);
  });

  it('serves every asset as real SVG, never a placeholder', () => {
    for (const entity of entities) {
      const svg = readFileSync(join(PUBLIC_DIR, entity.flag.file), 'utf8');
      expect(svg, entity.id).toMatch(/<svg[\s>]/);
      expect(svg.length, entity.id).toBeGreaterThan(100);
    }
  });

  it('records the licence of every shipped asset in CREDITS.md (T0.4)', () => {
    const credits = readFileSync(join(PUBLIC_DIR, 'flags', 'CREDITS.md'), 'utf8');
    expect(credits).toMatch(/flag-icons/);
    expect(credits).toMatch(/MIT/);
    // Saint Helena is hand-sourced because flag-icons ships the Union Jack for
    // it; its provenance has to be recorded individually.
    expect(credits).toMatch(/sh\.svg/);
    expect(credits).toMatch(/Public domain/);
  });

  it('gives Saint Helena its own flag rather than the Union Jack', () => {
    const saintHelena = byId.get('saint-helena-ascension-and-tristan-da-cunha')!;
    expect(saintHelena.flag.sharedWith).toBeUndefined();
    const svg = readFileSync(join(PUBLIC_DIR, saintHelena.flag.file), 'utf8');
    const unionJack = readFileSync(
      join(PUBLIC_DIR, byId.get('united-kingdom')!.flag.file),
      'utf8',
    );
    expect(svg).not.toBe(unionJack);
  });

  it('marks the entities that fly an identical flag (§3.3)', () => {
    // Nine entities fly the French tricolour; the question generator relies on
    // this to keep two identical flags out of one option set.
    const france = byId.get('france')!;
    expect(france.flag.sharedWith).toContain('reunion');
    expect(france.flag.sharedWith).toContain('mayotte');
    expect(byId.get('reunion')!.flag.sharedWith).toContain('france');
    expect(byId.get('united-states')!.flag.sharedWith).toContain(
      'united-states-minor-outlying-islands',
    );
  });
});

describe('continents', () => {
  it('assigns every entity one of the seven continents', () => {
    const continents = new Set(entities.map((e) => e.continent));
    expect([...continents].sort()).toEqual([
      'Africa',
      'Antarctica',
      'Asia',
      'Europe',
      'North America',
      'Oceania',
      'South America',
    ]);
  });

  it('puts transcontinental entities in both filters (§3.3)', () => {
    expect(byId.get('russia')!.continent).toBe('Europe');
    expect(byId.get('russia')!.altContinents).toContain('Asia');
    expect(byId.get('egypt')!.altContinents).toContain('Asia');
  });

  it('never repeats the primary continent in altContinents', () => {
    const broken = entities
      .filter((e) => (e.altContinents ?? []).includes(e.continent))
      .map((e) => e.id);
    expect(broken).toEqual([]);
  });
});

describe('confusable pairs seeded from §5.2', () => {
  const pairs: Array<[string, string]> = [
    ['chad', 'romania'],
    ['monaco', 'indonesia'],
    ['ireland', 'ivory-coast'],
    ['norway', 'iceland'],
    ['slovenia', 'slovakia'],
    ['slovenia', 'russia'],
    ['australia', 'new-zealand'],
    ['senegal', 'mali'],
  ];

  it.each(pairs)('%s is marked confusable with %s', (a, b) => {
    expect(byId.get(a)?.confusableWith).toContain(b);
    expect(byId.get(b)?.confusableWith).toContain(a);
  });
});

/** Follow-up F4 — emblems lifted from the real SVGs for Colour the Flag. */
describe('flag decorations', () => {
  const decorated = entities.filter(
    (entity) => (entity.colouring?.decorations ?? []).length > 0,
  );

  it('ships emblems for the flags that have one', () => {
    expect(decorated.length).toBeGreaterThanOrEqual(16);
    for (const id of ['ghana', 'lebanon', 'syria', 'philippines']) {
      expect(byId.get(id)!.colouring!.decorations!.length, id).toBeGreaterThan(0);
    }
  });

  it('is path data and a literal colour, nothing else', () => {
    for (const entity of decorated) {
      for (const decoration of entity.colouring!.decorations!) {
        // Starts with a moveto and contains only path syntax: no stray markup,
        // no `url(#...)` reference to a gradient the template does not carry.
        expect(decoration.d, entity.id).toMatch(/^[Mm]/);
        expect(decoration.d, entity.id).toMatch(/^[\sA-Za-z0-9.,+-]+$/);
        expect(decoration.fill, entity.id).toMatch(/^(#[0-9a-fA-F]{3,8}|[a-z]+)$/);
      }
    }
  });

  /**
   * The emblem is never the same colour as a region of its own flag — which
   * is the rule that produced it, checked here against the exact hexes the app
   * paints with. (The rule itself is tested on its own inputs in
   * `scripts/lib/decorations.test.ts`; this is the shipped data obeying it.)
   */
  it('never paints in the exact colour of a region of its own flag', () => {
    for (const entity of decorated) {
      const spec = entity.colouring!;
      const painted = new Set(
        Object.values(spec.regions).map((token) => COLOUR_HEX[token].toLowerCase()),
      );
      for (const decoration of spec.decorations!) {
        expect(painted, `${entity.id}: ${decoration.fill}`).not.toContain(
          decoration.fill.toLowerCase(),
        );
      }
    }
  });

  it('does not add a region, so nothing about it can be graded', () => {
    for (const entity of decorated) {
      const spec = entity.colouring!;
      const template = templateById(spec.templateId)!;
      // Grading walks the template's regions; the emblem is not among them.
      expect(Object.keys(spec.regions).sort(), entity.id).toEqual(
        template.regions.map((region) => region.id).sort(),
      );
    }
  });

  it('stays small enough that no flag is a coat of arms', () => {
    for (const entity of decorated) {
      const bytes = entity
        .colouring!.decorations!.reduce((total, one) => total + one.d.length, 0);
      expect(bytes, entity.id).toBeLessThanOrEqual(4_000);
      expect(entity.colouring!.decorations!.length, entity.id).toBeLessThanOrEqual(12);
    }
  });

  it('costs the dataset little enough to be worth it', () => {
    const bytes = decorated.reduce(
      (total, entity) =>
        total +
        entity.colouring!.decorations!.reduce((sum, one) => sum + one.d.length, 0),
      0,
    );
    // The whole feature, across every flag that has one.
    expect(bytes).toBeLessThan(20_000);
  });
});
