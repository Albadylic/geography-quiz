/**
 * Small explicit fixtures for schema and engine unit tests.
 *
 * These are deliberately *not* real dataset rows: tests that need real data
 * import the generated dataset instead. These exist so schema tests can be
 * malformed on purpose without inventing country facts (working rules: no
 * hard-coded country data outside src/data).
 */

/** A minimal well-formed entity, as raw JSON for the parser to validate. */
export function validEntityInput(overrides: Record<string, unknown> = {}) {
  return {
    id: 'testland',
    iso2: 'TL',
    iso3: 'TLD',
    name: 'Testland',
    aliases: ['Test Land'],
    status: 'un-member',
    continent: 'Europe',
    subregion: 'Test Region',
    capitals: [{ name: 'Testville', aliases: [], isPrimary: true }],
    flag: { file: '/flags/tl.svg', colours: ['red', 'white'], aspectRatio: 1.5 },
    tier: 1,
    ...overrides,
  };
}

/** A second entity so cross-reference tests have something to point at. */
export function secondEntityInput(overrides: Record<string, unknown> = {}) {
  return validEntityInput({
    id: 'otherland',
    iso2: 'OL',
    iso3: 'OLD',
    name: 'Otherland',
    aliases: [],
    capitals: [{ name: 'Othertown', aliases: [], isPrimary: true }],
    flag: { file: '/flags/ol.svg', colours: ['blue'], aspectRatio: 2 },
    ...overrides,
  });
}
