import { describe, expect, it } from 'vitest';
import { EntityListSchema, EntitySchema } from './schema';
import { secondEntityInput, validEntityInput } from './__fixtures__/entities.fixture';

/** All messages from a failed parse, joined, for readable assertions. */
function messagesFor(input: unknown): string {
  const result = EntitySchema.safeParse(input);
  expect(result.success).toBe(false);
  if (result.success) return '';
  return result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n');
}

function listMessagesFor(input: unknown): string {
  const result = EntityListSchema.safeParse(input);
  expect(result.success).toBe(false);
  if (result.success) return '';
  return result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n');
}

describe('EntitySchema', () => {
  it('accepts a well-formed entity', () => {
    const result = EntitySchema.safeParse(validEntityInput());
    expect(result.success).toBe(true);
  });

  it('defaults aliases and capitals to empty arrays', () => {
    const input = validEntityInput();
    delete (input as Record<string, unknown>).aliases;
    delete (input as Record<string, unknown>).capitals;
    const result = EntitySchema.parse(input);
    expect(result.aliases).toEqual([]);
    expect(result.capitals).toEqual([]);
  });

  it('allows an entity with no capital at all (Antarctica case)', () => {
    expect(EntitySchema.safeParse(validEntityInput({ capitals: [] })).success).toBe(true);
  });

  it('names the offending field for an unknown continent', () => {
    expect(messagesFor(validEntityInput({ continent: 'Atlantis' }))).toMatch(/continent/);
  });

  it('names the offending field for an unknown status', () => {
    expect(messagesFor(validEntityInput({ status: 'colony' }))).toMatch(/status/);
  });

  it('rejects an id that is not a slug, saying so', () => {
    expect(messagesFor(validEntityInput({ id: 'Test Land' }))).toMatch(
      /id: .*lowercase hyphenated slug/,
    );
  });

  it('rejects a flag path outside /flags and explains the expected shape', () => {
    expect(messagesFor(validEntityInput({ flag: { file: 'tl.png', colours: ['red'], aspectRatio: 1.5 } }))).toMatch(
      /flag\.file: .*\/flags\/\*\.svg/,
    );
  });

  it('rejects a non-positive aspect ratio', () => {
    const flag = { file: '/flags/tl.svg', colours: ['red'], aspectRatio: 0 };
    expect(messagesFor(validEntityInput({ flag }))).toMatch(/flag\.aspectRatio/);
  });

  it('rejects a flag with no colours', () => {
    const flag = { file: '/flags/tl.svg', colours: [], aspectRatio: 1.5 };
    expect(messagesFor(validEntityInput({ flag }))).toMatch(/flag\.colours/);
  });

  it('rejects an unknown colour token', () => {
    const flag = { file: '/flags/tl.svg', colours: ['puce'], aspectRatio: 1.5 };
    expect(messagesFor(validEntityInput({ flag }))).toMatch(/flag\.colours/);
  });

  it('rejects unknown extra fields rather than silently dropping them', () => {
    expect(messagesFor(validEntityInput({ capitol: 'Testville' }))).toMatch(/capitol/);
  });

  it('rejects an invalid tier', () => {
    expect(messagesFor(validEntityInput({ tier: 4 }))).toMatch(/tier/);
  });

  it('rejects a malformed iso2 with an explanation', () => {
    expect(messagesFor(validEntityInput({ iso2: 'tl' }))).toMatch(/iso2: .*two uppercase/);
  });

  describe('capital invariants', () => {
    it('requires exactly one primary capital when capitals exist', () => {
      const capitals = [
        { name: 'Testville', aliases: [], isPrimary: true },
        { name: 'Otherville', aliases: [], isPrimary: true },
      ];
      expect(messagesFor(validEntityInput({ capitals }))).toMatch(
        /capitals: expected exactly one isPrimary capital, found 2/,
      );
    });

    it('rejects capitals with no primary', () => {
      const capitals = [{ name: 'Testville', aliases: [], isPrimary: false }];
      expect(messagesFor(validEntityInput({ capitals }))).toMatch(
        /expected exactly one isPrimary capital, found 0/,
      );
    });

    it('rejects a duplicated capital name', () => {
      const capitals = [
        { name: 'Testville', aliases: [], isPrimary: true },
        { name: 'testville', aliases: [], isPrimary: false },
      ];
      expect(messagesFor(validEntityInput({ capitals }))).toMatch(/duplicate capital/);
    });
  });

  describe('self-reference invariants', () => {
    it('rejects altContinents repeating the primary continent', () => {
      expect(messagesFor(validEntityInput({ altContinents: ['Europe'] }))).toMatch(
        /altContinents repeats the primary continent/,
      );
    });

    it('rejects an entity confusable with itself', () => {
      expect(messagesFor(validEntityInput({ confusableWith: ['testland'] }))).toMatch(
        /cannot be confusable with itself/,
      );
    });

    it('rejects an entity that is its own sovereign', () => {
      expect(messagesFor(validEntityInput({ sovereignId: 'testland' }))).toMatch(
        /cannot be its own sovereign/,
      );
    });
  });
});

describe('EntityListSchema', () => {
  it('accepts a well-formed pair', () => {
    const result = EntityListSchema.safeParse([validEntityInput(), secondEntityInput()]);
    expect(result.success).toBe(true);
  });

  it('rejects duplicate ids', () => {
    const input = [validEntityInput(), secondEntityInput({ id: 'testland' })];
    expect(listMessagesFor(input)).toMatch(/duplicate entity id "testland"/);
  });

  it('rejects duplicate names case-insensitively', () => {
    const input = [validEntityInput(), secondEntityInput({ name: 'TESTLAND' })];
    expect(listMessagesFor(input)).toMatch(/duplicate entity name/);
  });

  it('rejects an unresolvable sovereignId', () => {
    const input = [validEntityInput({ sovereignId: 'atlantis' })];
    expect(listMessagesFor(input)).toMatch(/sovereignId "atlantis" does not resolve/);
  });

  it('rejects an unresolvable confusableWith reference', () => {
    const input = [validEntityInput({ confusableWith: ['atlantis' ] })];
    expect(listMessagesFor(input)).toMatch(/confusableWith "atlantis" does not resolve/);
  });

  it('accepts cross-references that do resolve', () => {
    const input = [
      validEntityInput({ confusableWith: ['otherland'] }),
      secondEntityInput({ sovereignId: 'testland' }),
    ];
    expect(EntityListSchema.safeParse(input).success).toBe(true);
  });
});
