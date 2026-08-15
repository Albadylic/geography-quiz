import { describe, expect, it } from 'vitest';
import { extractDecorations, paintedShapes } from './decorations';

/**
 * The extraction rule, tested on artwork small enough to read — follow-up F4.
 *
 * These are the shapes the real flag files take, reduced: a flag that is bands
 * plus an emblem, a flag whose emblem inherits its colour, a flag whose emblem
 * is the same colour as a band it must not be confused with.
 */

/** The colour families the tests speak in. Real fills, crudely bucketed. */
const FAMILY: Record<string, string> = {
  '#ce1126': 'red',
  red: 'red',
  '#fcd116': 'yellow',
  '#006b3f': 'green',
  '#00a850': 'green',
  '#000001': 'black',
  '#000': 'black',
  '#fff': 'white',
  none: '',
};
const familyOfFill = (fill: string) => FAMILY[fill.toLowerCase()] || null;

const wrap = (body: string, attrs = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 480"${attrs}>${body}</svg>`;

describe('the emblem rule', () => {
  it('takes a shape whose colour is not one being painted', () => {
    // Ghana, reduced: three bands and a black star.
    const svg = wrap(
      `<path fill="#006b3f" d="M0 0h640v480H0z"/>
       <path fill="#fcd116" d="M0 0h640v320H0z"/>
       <path fill="#ce1126" d="M0 0h640v160H0z"/>
       <path fill="#000001" d="m320 160 52 160-136-99h168z"/>`,
    );

    const { decorations } = extractDecorations(
      svg,
      new Set(['red', 'yellow', 'green']),
      familyOfFill,
    );

    expect(decorations).toEqual([{ d: 'm320 160 52 160-136-99h168z', fill: '#000001' }]);
  });

  it('leaves a painted region alone even when it is emblem-shaped', () => {
    // The Sweden case: a cross is a small, distinctive shape, but it is a
    // region of the template and the player has to colour it. Anything keying
    // off shape rather than colour gets this wrong.
    const svg = wrap(
      `<path fill="#ce1126" d="M0 0h640v480H0z"/>
       <path fill="#fcd116" d="M0 200h640v80H0zM180 0h80v480h-80z"/>`,
    );

    const { decorations } = extractDecorations(svg, new Set(['red', 'yellow']), familyOfFill);
    expect(decorations).toEqual([]);
  });

  it('carries the transform of every enclosing group', () => {
    // Lebanon's cedar sits inside a translate+scale, and is in the wrong place
    // and the wrong size without it.
    const svg = wrap(
      `<g transform="translate(80)scale(.9375)">
         <path fill="#ce1126" d="M-128 384h768v128h-768z"/>
         <path fill="#00a850" d="M252 130c-8 15-13 15-26 26z"/>
       </g>`,
    );

    const { decorations } = extractDecorations(svg, new Set(['red', 'white']), familyOfFill);
    expect(decorations).toEqual([
      { d: 'M252 130c-8 15-13 15-26 26z', fill: '#00a850', transform: 'translate(80)scale(.9375)' },
    ]);
  });

  it('reads a fill inherited from an ancestor, not the black SVG defaults to', () => {
    // Mongolia's soyombo takes its yellow from the root <svg>. Read literally
    // each shape is black, which is the wrong colour *and* the wrong verdict.
    const svg = wrap(
      `<path fill="#ce1126" d="M0 0h640v480H0z"/>
       <circle cx="107" cy="182" r="40"/>`,
      ' fill="#fcd116"',
    );

    const { decorations } = extractDecorations(svg, new Set(['red']), familyOfFill);
    expect(decorations).toHaveLength(1);
    expect(decorations[0]!.fill).toBe('#fcd116');
    expect(decorations[0]!.d).toMatch(/^M67 182a40 40 /);
  });

  it('still treats a shape with no fill anywhere as black, which SVG does too', () => {
    // Syria's flag is drawn this way.
    const svg = wrap(
      `<path fill="#ce1126" d="M0 0h640v480H0z"/>
       <path d="m320 160 52 160-136-99h168z"/>`,
    );

    const { decorations } = extractDecorations(svg, new Set(['red']), familyOfFill);
    expect(decorations).toHaveLength(1);
    expect(decorations[0]!.fill).toBe('#000');
  });

  it('ignores anything that paints nothing', () => {
    const svg = wrap(
      `<defs><clipPath id="a"><path fill="#000001" d="M0 0h640v480H0z"/></clipPath></defs>
       <path fill="#ce1126" d="M0 0h640v480H0z"/>
       <path fill="none" d="M0 0h10v10H0z"/>`,
    );

    expect(extractDecorations(svg, new Set(['red']), familyOfFill).decorations).toEqual([]);
  });
});

describe('what it refuses to touch', () => {
  it('skips a coat of arms rather than shipping kilobytes of it', () => {
    const arms = Array.from(
      { length: 40 },
      (_, i) => `<path fill="#000001" d="M${i} ${i}h5v5h-5z"/>`,
    ).join('');
    const svg = wrap(`<path fill="#ce1126" d="M0 0h640v480H0z"/>${arms}`);

    const { decorations, skipped } = extractDecorations(svg, new Set(['red']), familyOfFill);
    expect(decorations).toEqual([]);
    expect(skipped).toMatch(/40 shapes/);
  });

  it('skips artwork drawn with <use>, rather than resolving it wrongly', () => {
    // India's chakra is one spoke and twenty-three re-uses of it.
    const svg = wrap(
      `<path fill="#ce1126" d="M0 0h640v480H0z"/>
       <path id="spoke" fill="#000001" d="M0 17 1 7 0 2z"/>
       <use href="#spoke" transform="rotate(15)"/>`,
    );

    const { decorations, skipped } = extractDecorations(svg, new Set(['red']), familyOfFill);
    expect(decorations).toEqual([]);
    expect(skipped).toMatch(/<use>/);
  });

  it('skips a flag drawn on a different canvas from the templates', () => {
    const svg = `<svg viewBox="0 0 512 512"><path fill="#000001" d="M0 0h512v512H0z"/></svg>`;
    expect(extractDecorations(svg, new Set(['red']), familyOfFill).skipped).toMatch(/viewBox/);
  });
});

describe('reading the artwork', () => {
  it('converts the primitives flags are drawn with into path data', () => {
    const svg = wrap(
      `<rect x="10" y="20" width="30" height="40" fill="#fff"/>
       <circle cx="100" cy="100" r="25" fill="#fff"/>
       <polygon points="0,0 10,0 5,10" fill="#fff"/>`,
    );

    const { decorations } = extractDecorations(svg, new Set(['red']), familyOfFill);
    expect(decorations.map((d) => d.d)).toEqual([
      'M10 20h30v40h-30z',
      'M75 100a25 25 0 1 0 50 0a25 25 0 1 0 -50 0z',
      'M0,0 10,0 5,10z',
    ]);
  });

  it('does not let a group transform leak past its closing tag', () => {
    const svg = wrap(
      `<g transform="translate(80)"><path fill="#fff" d="M0 0h1v1z"/></g>
       <path fill="#fff" d="M9 9h1v1z"/>`,
    );

    const shapes = paintedShapes(svg);
    expect(shapes[0]!.transforms).toEqual(['translate(80)']);
    expect(shapes[1]!.transforms).toEqual([]);
  });
});
