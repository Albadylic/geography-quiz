/**
 * Data pipeline — plan §3.2.
 *
 * Reads the committed world-countries snapshot (the dataset REST Countries is
 * built from), merges data/overrides.json, copies the flag assets, derives
 * everything derivable from the assets themselves, validates the result with
 * the Zod schema, and emits:
 *
 *   src/data/entities.generated.ts   the typed, committed dataset
 *   data-report.md                   every manual override and every warning
 *   public/flags/*.svg               the flag assets
 *
 * Run deliberately (`npm run build:data`), never as part of `npm run build` —
 * the dataset is not allowed to change silently under the tests.
 *
 * The script is deterministic: same inputs, byte-identical outputs.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import worldCountries from 'world-countries';
import { templateById } from '../src/data/flag-templates/index.ts';
import {
  COLOUR_TOKENS,
  ColourTokenSchema,
  EntityListSchema,
  type ColourToken,
  type Continent,
  type Entity,
  type Status,
} from '../src/data/schema.ts';
import { slugify } from '../src/lib/text.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FLAG_SRC = join(ROOT, 'node_modules', 'flag-icons', 'flags');
const FLAG_OUT = join(ROOT, 'public', 'flags');

// ---------------------------------------------------------------------------
// Overrides
// ---------------------------------------------------------------------------

interface CapitalOverride {
  name: string;
  aliases: string[];
  isPrimary: boolean;
  note?: string;
}

interface ColouringOverride {
  templateId: string;
  regions: Record<string, string>;
}

interface Overrides {
  colouring: Record<string, ColouringOverride>;
  statuses: Record<string, Status>;
  sovereigns: Record<string, string>;
  altContinents: Record<string, Continent[]>;
  capitals: Record<string, CapitalOverride[]>;
  extraAliases: Record<string, string[]>;
  squareFlags: string[];
  confusableWith: Record<string, string[]>;
  tierOne: string[];
  notes: Record<string, string>;
}

const overrides = JSON.parse(
  readFileSync(join(ROOT, 'data', 'overrides.json'), 'utf8'),
) as Overrides;

/**
 * Hand-sourced flag assets, which take precedence over flag-icons. Each one
 * must carry its provenance — the build writes public/flags/CREDITS.md from
 * these fields, and an asset without a licence does not ship.
 */
interface HandSourcedAsset {
  entityId: string;
  source: string;
  licence: string;
  author: string;
  credit: string;
  reason: string;
}

const handSourced = (
  JSON.parse(
    readFileSync(join(ROOT, 'data', 'hand-sourced', 'manifest.json'), 'utf8'),
  ) as { assets: Record<string, HandSourcedAsset> }
).assets;

/** Warnings surfaced in data-report.md. A fatal problem throws instead. */
const warnings: string[] = [];

// ---------------------------------------------------------------------------
// Continent derivation
// ---------------------------------------------------------------------------

/**
 * The snapshot has a coarse `region` ("Americas") and a finer `subregion`.
 * §3.1 wants seven continents, so the Americas are split on subregion and the
 * Antarctic region is renamed. Every (region, subregion) pair in the snapshot
 * is covered; an unknown pair is fatal rather than silently defaulted.
 */
function continentOf(region: string, subregion: string, name: string): Continent {
  switch (region) {
    case 'Africa':
    case 'Asia':
    case 'Europe':
    case 'Oceania':
      return region;
    case 'Antarctic':
      return 'Antarctica';
    case 'Americas':
      return subregion === 'South America' ? 'South America' : 'North America';
    default:
      throw new Error(`Unknown region "${region}" (subregion "${subregion}") on ${name}`);
  }
}

// ---------------------------------------------------------------------------
// Flag assets: copy, and derive aspect ratio + palette from the real file
// ---------------------------------------------------------------------------

/**
 * Representative RGB for each colour token. Used only to bucket the hex values
 * that actually appear in the flag SVGs — the tokens themselves are what the
 * app stores and what Colour mode grades against (§7), so grading never
 * touches these numbers.
 */
const TOKEN_RGB: Record<ColourToken, [number, number, number]> = {
  red: [224, 27, 36],
  crimson: [165, 0, 52],
  maroon: [107, 16, 36],
  orange: [255, 127, 24],
  yellow: [255, 221, 0],
  gold: [212, 175, 55],
  green: [0, 155, 72],
  'dark-green': [4, 80, 42],
  'light-green': [111, 207, 95],
  blue: [0, 82, 180],
  navy: [0, 26, 87],
  'light-blue': [87, 183, 232],
  cyan: [0, 194, 203],
  purple: [106, 27, 154],
  magenta: [214, 0, 110],
  pink: [244, 143, 177],
  brown: [123, 75, 38],
  black: [10, 10, 10],
  white: [255, 255, 255],
  grey: [158, 158, 158],
};

/** The five CSS colour names that appear in the flag-icons set. */
const NAMED_COLOURS: Record<string, [number, number, number]> = {
  red: [255, 0, 0],
  green: [0, 128, 0],
  gold: [255, 215, 0],
  gray: [128, 128, 128],
  purple: [128, 0, 128],
};

function parseColour(value: string): [number, number, number] | null {
  const v = value.trim().toLowerCase();
  const named = NAMED_COLOURS[v];
  if (named) return named;

  const hex = /^#([0-9a-f]{3,8})$/.exec(v)?.[1];
  if (!hex) return null;

  if (hex.length === 3 || hex.length === 4) {
    const [r, g, b] = [hex[0]!, hex[1]!, hex[2]!].map((c) => parseInt(c + c, 16));
    return [r!, g!, b!];
  }
  if (hex.length === 6 || hex.length === 8) {
    return [
      parseInt(hex.slice(0, 2), 16),
      parseInt(hex.slice(2, 4), 16),
      parseInt(hex.slice(4, 6), 16),
    ];
  }
  return null;
}

/**
 * "Redmean" colour distance — a cheap approximation of perceptual distance
 * that is markedly better than plain RGB Euclidean at not calling every dark
 * colour black. Good enough to bucket flat flag colours into tokens.
 */
function colourDistance(
  a: [number, number, number],
  b: [number, number, number],
): number {
  const rmean = (a[0] + b[0]) / 2;
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt(
    (((512 + rmean) * dr * dr) / 256) + 4 * dg * dg + (((767 - rmean) * db * db) / 256),
  );
}

function nearestToken(rgb: [number, number, number]): ColourToken {
  let best: ColourToken = COLOUR_TOKENS[0];
  let bestDistance = Infinity;
  for (const token of COLOUR_TOKENS) {
    const distance = colourDistance(rgb, TOKEN_RGB[token]);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = token;
    }
  }
  return best;
}

interface FlagAsset {
  file: string;
  aspectRatio: number;
  colours: ColourToken[];
  /** Hash of the artwork alone, used to find entities flying the same flag. */
  artworkHash: string;
}

/**
 * Fingerprints the artwork, ignoring the per-file `id` attributes flag-icons
 * generates. Nine entities fly the French tricolour and their SVGs differ only
 * by those ids — comparing whole files would miss every one of them.
 */
function artworkFingerprint(svg: string): string {
  const artwork = svg
    .replace(/id="[^"]*"/g, '')
    .replace(/url\(#[^)]*\)/g, 'url()')
    .replace(/\s+/g, ' ')
    .trim();
  return createHash('sha256').update(artwork).digest('hex');
}

/**
 * Copies the flag SVG into public/flags and reads back what the asset itself
 * says: the aspect ratio comes from its viewBox and the palette from its fills,
 * so neither is a number anyone typed in by hand.
 */
/**
 * The rendered size of an SVG: its viewBox if it has one, otherwise its
 * width/height attributes. Hand-sourced files from Commons often carry only
 * the latter.
 */
function svgDimensions(svg: string, code: string): [number, number] {
  const viewBox = /viewBox="([\d.\s-]+)"/.exec(svg)?.[1];
  if (viewBox) {
    const parts = viewBox.trim().split(/\s+/).map(Number);
    const [width, height] = [parts[2], parts[3]];
    if (width && height) return [width, height];
  }

  const width = Number(/\bwidth="([\d.]+)(?:px)?"/.exec(svg)?.[1]);
  const height = Number(/\bheight="([\d.]+)(?:px)?"/.exec(svg)?.[1]);
  if (width && height) return [width, height];

  throw new Error(`Flag ${code}.svg has neither a usable viewBox nor width/height`);
}

function buildFlagAsset(iso2: string, id: string): FlagAsset {
  const variant = overrides.squareFlags.includes(id) ? '1x1' : '4x3';
  const code = iso2.toLowerCase();
  const hand = handSourced[code];
  const source = hand
    ? join(ROOT, 'data', 'hand-sourced', `${code}.svg`)
    : join(FLAG_SRC, variant, `${code}.svg`);

  let svg: string;
  try {
    svg = readFileSync(source, 'utf8');
  } catch {
    throw new Error(
      `No flag asset for ${id} (expected ${variant}/${code}.svg). Source it by hand into data/hand-sourced/ with a manifest entry recording its licence — do not substitute a placeholder.`,
    );
  }

  if (hand && hand.entityId !== id) {
    throw new Error(
      `Hand-sourced asset ${code}.svg claims entity "${hand.entityId}" but is being used for "${id}"`,
    );
  }

  const [width, height] = svgDimensions(svg, code);

  const colours: ColourToken[] = [];
  const addToken = (token: ColourToken) => {
    if (!colours.includes(token)) colours.push(token);
  };

  /**
   * A `<path>` with no `fill` attribute renders black — that is the SVG
   * default, not an absent colour. Syria's flag is drawn exactly that way, and
   * missing it made the extracted palette claim the flag had no black in it.
   */
  for (const match of svg.matchAll(/<(?:path|rect|circle|polygon|ellipse)\b([^>]*)>/g)) {
    const attributes = match[1] ?? '';
    if (!/\bfill=/.test(attributes)) addToken('black');
  }

  for (const match of svg.matchAll(/(?:fill|stop-color)="([^"]+)"/g)) {
    const rgb = parseColour(match[1]!);
    if (!rgb) continue;
    addToken(nearestToken(rgb));
  }
  if (colours.length === 0) {
    warnings.push(`${id}: no colours could be read from ${code}.svg; defaulted to white`);
    colours.push('white');
  }

  writeFileSync(join(FLAG_OUT, `${code}.svg`), svg);

  return {
    file: `/flags/${code}.svg`,
    aspectRatio: Number((width / height).toFixed(4)),
    colours,
    artworkHash: artworkFingerprint(svg),
  };
}

/** id -> artwork fingerprint, populated as entities are assembled. */
const artworkHashes = new Map<string, string>();

// ---------------------------------------------------------------------------
// Entity assembly
// ---------------------------------------------------------------------------

/**
 * Aliases worth accepting as typed answers: the snapshot's altSpellings minus
 * the bare ISO code and minus anything not in Latin script (a player typing
 * Cyrillic into an English quiz is not the case we are serving), plus the
 * curated extras.
 */
function aliasesFor(
  altSpellings: string[],
  iso2: string,
  id: string,
  name: string,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (value: string) => {
    const trimmed = value.trim();
    const key = trimmed.toLowerCase();
    if (!trimmed || key === name.toLowerCase() || seen.has(key)) return;
    seen.add(key);
    out.push(trimmed);
  };

  for (const spelling of altSpellings) {
    if (spelling === iso2) continue;
    // Latin script only — accented Latin is fine, other scripts are not.
    if (!/^[\p{Script=Latin}\p{M}0-9\s'’\-.,()]+$/u.test(spelling)) continue;
    add(spelling);
  }
  for (const extra of overrides.extraAliases[id] ?? []) add(extra);

  return out;
}

/** Familiarity heuristic — see the $tierOne note in overrides.json. */
function tierFor(id: string, status: Status, area: number): 1 | 2 | 3 {
  if (status !== 'un-member' && status !== 'un-observer') {
    return overrides.tierOne.includes(id) ? 1 : 3;
  }
  if (overrides.tierOne.includes(id)) return 1;
  if (area >= 300_000) return 1;
  if (area < 1_000) return 3;
  return 2;
}

function statusFor(id: string, unMember: boolean): Status {
  const override = overrides.statuses[id];
  if (override) return override;
  return unMember ? 'un-member' : 'dependency';
}

/** Symmetric closure of the curated confusable pairs (§5.2). */
function buildConfusableIndex(): Map<string, Set<string>> {
  const index = new Map<string, Set<string>>();
  const link = (a: string, b: string) => {
    if (a === b) return;
    if (!index.has(a)) index.set(a, new Set());
    index.get(a)!.add(b);
  };
  for (const [id, partners] of Object.entries(overrides.confusableWith)) {
    for (const partner of partners) {
      link(id, partner);
      link(partner, id);
    }
  }
  return index;
}

interface SourceCountry {
  name: { common: string; official: string };
  cca2: string;
  cca3: string;
  capital: string[];
  region: string;
  subregion: string;
  unMember: boolean;
  altSpellings: string[];
  area: number;
}

function buildEntities(): Entity[] {
  const confusable = buildConfusableIndex();
  const source = worldCountries as unknown as SourceCountry[];

  const entities = source.map((country): Entity => {
    const id = slugify(country.name.common);
    const status = statusFor(id, country.unMember);
    const flag = buildFlagAsset(country.cca2, id);
    artworkHashes.set(id, flag.artworkHash);

    const capitalOverride = overrides.capitals[id];
    const capitals: CapitalOverride[] =
      capitalOverride ??
      country.capital.map((name, index) => ({
        name,
        aliases: [],
        isPrimary: index === 0,
      }));

    const entity: Entity = {
      id,
      iso2: country.cca2,
      iso3: country.cca3,
      name: country.name.common,
      officialName: country.name.official,
      aliases: aliasesFor(country.altSpellings, country.cca2, id, country.name.common),
      status,
      continent: continentOf(country.region, country.subregion, country.name.common),
      capitals: capitals.map((capital) => ({
        name: capital.name,
        aliases: capital.aliases ?? [],
        isPrimary: capital.isPrimary,
        ...(capital.note ? { note: capital.note } : {}),
      })),
      flag: { file: flag.file, colours: flag.colours, aspectRatio: flag.aspectRatio },
      tier: tierFor(id, status, country.area),
    };

    const sovereignId = overrides.sovereigns[id];
    if (sovereignId) entity.sovereignId = sovereignId;

    const altContinents = overrides.altContinents[id];
    if (altContinents) entity.altContinents = altContinents;

    if (country.subregion) entity.subregion = country.subregion;

    const partners = confusable.get(id);
    if (partners) entity.confusableWith = [...partners].sort();

    const colouring = overrides.colouring[id];
    if (colouring) {
      entity.colouring = {
        templateId: colouring.templateId,
        regions: Object.fromEntries(
          Object.entries(colouring.regions).map(([region, token]) => [
            region,
            ColourTokenSchema.parse(token),
          ]),
        ),
      };
    }

    return entity;
  });

  // Deterministic order, so the generated file is stable across runs.
  entities.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return entities;
}

// ---------------------------------------------------------------------------
// Consistency checks the schema cannot express
// ---------------------------------------------------------------------------

function auditEntities(entities: Entity[]): void {
  const byId = new Map(entities.map((e) => [e.id, e]));

  // Every override key must name a real entity — a typo'd slug would otherwise
  // silently do nothing.
  const sections: Array<[string, string[]]> = [
    ['statuses', Object.keys(overrides.statuses)],
    ['sovereigns', Object.keys(overrides.sovereigns)],
    ['altContinents', Object.keys(overrides.altContinents)],
    ['capitals', Object.keys(overrides.capitals)],
    ['extraAliases', Object.keys(overrides.extraAliases)],
    ['squareFlags', overrides.squareFlags],
    ['tierOne', overrides.tierOne],
    ['notes', Object.keys(overrides.notes)],
    [
      'confusableWith',
      [
        ...Object.keys(overrides.confusableWith),
        ...Object.values(overrides.confusableWith).flat(),
      ],
    ],
  ];
  for (const [section, keys] of sections) {
    for (const key of keys) {
      if (!byId.has(key)) {
        throw new Error(`overrides.${section} names "${key}", which is not an entity id`);
      }
    }
  }

  // Entities flying the same flag must say so, so an option set never shows
  // the same artwork twice (§3.3). Grouped by artwork, not by filename: the
  // French tricolour ships as nine separate files.
  const byArtwork = new Map<string, string[]>();
  for (const entity of entities) {
    const hash = artworkHashes.get(entity.id)!;
    const list = byArtwork.get(hash) ?? [];
    list.push(entity.id);
    byArtwork.set(hash, list);
  }
  for (const ids of byArtwork.values()) {
    if (ids.length > 1) {
      const sorted = [...ids].sort();
      warnings.push(`Identical flag artwork shared by ${sorted.join(', ')}`);
      for (const id of sorted) {
        byId.get(id)!.flag.sharedWith = sorted.filter((other) => other !== id);
      }
    }
  }

  auditColouring(entities);

  const unMembers = entities.filter((e) => e.status === 'un-member');
  if (unMembers.length !== 193) {
    warnings.push(
      `Expected 193 UN members, found ${unMembers.length} — check overrides.statuses`,
    );
  }

  for (const entity of entities) {
    if (entity.capitals.length === 0 && entity.status === 'un-member') {
      warnings.push(`${entity.id} is a UN member with no capital — is that right?`);
    }
  }
}

/**
 * Colour the Flag specs — §7 and T6.2.
 *
 * Two checks. The first is structural: every region in a spec must exist in
 * its template, and every region of the template must be assigned, or the
 * player would be asked to fill a region with no right answer.
 *
 * The second is factual, and is the one that earns its keep: every colour a
 * spec claims must actually appear in the palette extracted from that entity's
 * real SVG. A spec written from a mis-remembered flag — Ireland as green,
 * white and *red* — fails the build instead of teaching the wrong thing.
 */
const COLOUR_FAMILIES: Record<string, string> = {
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

function familyOf(token: string): string {
  return COLOUR_FAMILIES[token] ?? token;
}

function auditColouring(entities: Entity[]): void {
  const problems: string[] = [];

  for (const entity of entities) {
    const spec = entity.colouring;
    if (!spec) continue;

    const template = templateById(spec.templateId);
    if (!template) {
      problems.push(`${entity.id}: unknown template "${spec.templateId}"`);
      continue;
    }

    const templateRegions = new Set(template.regions.map((region) => region.id));
    const specRegions = new Set(Object.keys(spec.regions));

    for (const region of specRegions) {
      if (!templateRegions.has(region)) {
        problems.push(`${entity.id}: region "${region}" is not in template ${template.id}`);
      }
    }
    for (const region of templateRegions) {
      if (!specRegions.has(region)) {
        problems.push(`${entity.id}: region "${region}" of ${template.id} is unassigned`);
      }
    }

    /**
     * Compared by colour *family*, not by exact token. The palette is bucketed
     * from the SVG's real hex values, which are finer-grained than anyone
     * names a flag: France's blue reads as navy, Japan's disc as crimson,
     * Germany's gold as yellow. Requiring an exact match would reject correct
     * specs over shade. Families still catch the mistakes that matter — a spec
     * claiming Ireland's third band is red fails, because red and orange are
     * different families.
     */
    const paletteFamilies = new Set(entity.flag.colours.map(familyOf));
    for (const [region, token] of Object.entries(spec.regions)) {
      if (!paletteFamilies.has(familyOf(token))) {
        problems.push(
          `${entity.id}: "${region}" is ${token}, but its flag palette is [${entity.flag.colours.join(', ')}]`,
        );
      }
    }
  }

  if (problems.length > 0) {
    throw new Error(`Colouring specs failed validation:\n  ${problems.join('\n  ')}`);
  }
}

// ---------------------------------------------------------------------------
// Emit
// ---------------------------------------------------------------------------

function emitDataset(entities: Entity[]): void {
  const body = entities
    .map((entity) => JSON.stringify(entity, null, 2).replace(/^/gm, '  '))
    .join(',\n');

  const file = `/**
 * GENERATED FILE — do not edit by hand.
 *
 * Produced by scripts/build-data.ts from the world-countries snapshot and
 * data/overrides.json. Regenerate with \`npm run build:data\`, and read
 * data-report.md for what needed a manual override.
 */
import type { Entity } from './schema';

export const entities: readonly Entity[] = [
${body}
];

export default entities;
`;

  writeFileSync(join(ROOT, 'src', 'data', 'entities.generated.ts'), file);
}

/**
 * public/flags/CREDITS.md — the licence of every shipped flag asset (T0.4).
 * The bulk set is one MIT licence; anything hand-sourced is listed individually
 * with its provenance.
 */
function emitCredits(entities: Entity[]): void {
  const byId = new Map(entities.map((e) => [e.id, e]));
  const handSourcedRows = Object.entries(handSourced)
    .map(([code, asset]) => {
      const name = byId.get(asset.entityId)?.name ?? asset.entityId;
      return [
        `### ${name} — \`${code}.svg\``,
        '',
        `- **Source:** ${asset.source}`,
        `- **Licence:** ${asset.licence}`,
        `- **Author:** ${asset.author}`,
        `- **Credit:** ${asset.credit}`,
        `- **Why hand-sourced:** ${asset.reason}`,
      ].join('\n');
    })
    .join('\n\n');

  const flagIconsCount = entities.length - Object.keys(handSourced).length;
  const licence = readFileSync(
    join(ROOT, 'node_modules', 'flag-icons', 'LICENSE'),
    'utf8',
  ).trim();

  const credits = `# Flag asset credits

Generated by \`npm run build:data\`. Do not edit by hand — edit
\`data/hand-sourced/manifest.json\` and rebuild.

${entities.length} flag assets ship with this app.

## flag-icons — ${flagIconsCount} assets

Everything not listed under "Hand-sourced" below comes from
[flag-icons](https://github.com/lipis/flag-icons), used under the MIT licence.

Assets are taken from the \`4x3\` set, except for entities whose flag is
officially square, which use the \`1x1\` set so the shape is right.

\`\`\`
${licence}
\`\`\`

## Hand-sourced — ${Object.keys(handSourced).length} asset(s)

${handSourcedRows || '_None._'}
`;

  writeFileSync(join(FLAG_OUT, 'CREDITS.md'), credits);
}

function emitReport(entities: Entity[]): void {
  const count = (predicate: (e: Entity) => boolean) => entities.filter(predicate).length;
  const list = (predicate: (e: Entity) => boolean) =>
    entities
      .filter(predicate)
      .map((e) => e.name)
      .join(', ');

  const byStatus = [...new Set(entities.map((e) => e.status))]
    .sort()
    .map((status) => `| \`${status}\` | ${count((e) => e.status === status)} |`)
    .join('\n');

  const byContinent = [...new Set(entities.map((e) => e.continent))]
    .sort()
    .map((continent) => {
      const primary = count((e) => e.continent === continent);
      const withAlt = count(
        (e) => e.continent === continent || (e.altContinents ?? []).includes(continent),
      );
      return `| ${continent} | ${primary} | ${withAlt} |`;
    })
    .join('\n');

  const multiCapital = entities
    .filter((e) => e.capitals.length > 1)
    .map(
      (e) =>
        `| ${e.name} | ${e.capitals
          .map((c) => `${c.name}${c.isPrimary ? ' **(primary)**' : ''}${c.note ? ` — _${c.note}_` : ''}`)
          .join('<br>')} |`,
    )
    .join('\n');

  const notes = Object.entries(overrides.notes)
    .map(([id, note]) => `- **${entities.find((e) => e.id === id)?.name ?? id}** — ${note}`)
    .join('\n');

  const overrideCounts = [
    ['Status corrections', Object.keys(overrides.statuses).length],
    ['Sovereign assignments', Object.keys(overrides.sovereigns).length],
    ['Transcontinental entries', Object.keys(overrides.altContinents).length],
    ['Capital list replacements', Object.keys(overrides.capitals).length],
    ['Extra alias sets', Object.keys(overrides.extraAliases).length],
    ['Square-flag assets', overrides.squareFlags.length],
    ['Confusable seed entries', Object.keys(overrides.confusableWith).length],
  ]
    .map(([label, n]) => `| ${label} | ${n} |`)
    .join('\n');

  const report = `# Data report

Generated by \`npm run build:data\`. Do not edit by hand.

**${entities.length} entities.** Source: the \`world-countries\` snapshot (the dataset
REST Countries is built from), layered with \`data/overrides.json\`. Flag assets come
from \`flag-icons\` (MIT).

## Coverage

| Status | Entities |
| --- | --- |
${byStatus}

| Continent | Primary | Including transcontinental |
| --- | --- | --- |
${byContinent}

- Entities with no capital (excluded from capitals and combo questions by the pool
  filter, never by a hard-coded list): **${count((e) => e.capitals.length === 0)}** — ${list((e) => e.capitals.length === 0)}
- Entities with more than one capital: **${count((e) => e.capitals.length > 1)}**
- Entities carrying curated confusable partners: **${count((e) => (e.confusableWith ?? []).length > 0)}**
- Distinct flag aspect ratios: ${[...new Set(entities.map((e) => e.flag.aspectRatio))].sort().join(', ')}

## Manual overrides

| Section | Entries |
| --- | --- |
${overrideCounts}

### Multiple capitals

| Entity | Capitals |
| --- | --- |
${multiCapital}

### Notes

${notes}

## Derived, not sourced

These fields are computed by the build rather than taken from a source, and are
listed here so nothing looks more authoritative than it is.

- \`continent\` — derived from the snapshot's \`region\`/\`subregion\`. The Americas
  are split into North and South America on subregion; \`Antarctic\` is renamed to
  \`Antarctica\`.
- \`flag.aspectRatio\` — read from the shipped SVG's \`viewBox\`, so it always
  describes the asset that actually renders. flag-icons normalises its artwork to
  4:3; entities listed in \`squareFlags\` ship the 1:1 asset instead.
- \`flag.colours\` — the distinct fill colours found in the SVG, bucketed to the
  nearest colour token by perceptual distance. Detailed emblems can contribute
  colours a person would not name when describing the flag.
- \`tier\` — an explicit familiarity heuristic, not sourced data. See
  \`$tierOne\` in \`data/overrides.json\` for the rule.
- \`population\` — **not populated.** The snapshot in use carries no population
  figures, and inventing them was not an option. The field stays optional.

## Warnings

${warnings.length === 0 ? '_None._' : warnings.map((w) => `- ${w}`).join('\n')}
`;

  writeFileSync(join(ROOT, 'data-report.md'), report);
}

// ---------------------------------------------------------------------------

function main(): void {
  rmSync(FLAG_OUT, { recursive: true, force: true });
  mkdirSync(FLAG_OUT, { recursive: true });

  const entities = buildEntities();
  auditEntities(entities);

  const parsed = EntityListSchema.safeParse(entities);
  if (!parsed.success) {
    console.error('Dataset failed validation:\n');
    for (const issue of parsed.error.issues.slice(0, 40)) {
      const index = issue.path[0];
      const name = typeof index === 'number' ? entities[index]?.name : '?';
      console.error(`  ${name} — ${issue.path.join('.')}: ${issue.message}`);
    }
    process.exit(1);
  }

  emitDataset(parsed.data);
  emitCredits(parsed.data);
  emitReport(parsed.data);

  const flagCount = readdirSync(FLAG_OUT).filter((f) => f.endsWith('.svg')).length;
  const digest = createHash('sha256')
    .update(readFileSync(join(ROOT, 'src', 'data', 'entities.generated.ts')))
    .digest('hex')
    .slice(0, 12);

  console.log(`✓ ${parsed.data.length} entities validated`);
  console.log(`✓ ${flagCount} flag assets copied to public/flags`);
  console.log(`✓ src/data/entities.generated.ts (sha256:${digest})`);
  console.log(`✓ data-report.md`);
  if (warnings.length > 0) {
    console.log(`\n${warnings.length} warning(s) — see data-report.md:`);
    for (const warning of warnings) console.log(`  · ${warning}`);
  }
}

main();
