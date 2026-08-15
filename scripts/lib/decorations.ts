/**
 * Pulling flag emblems out of the real flag SVGs — follow-up F4.
 *
 * Colour the Flag paints a template of bands and discs, which leaves Lebanon
 * as three plain stripes with no cedar and Ghana with no star. The emblems are
 * lifted from the shipped artwork rather than redrawn, so nothing here is a
 * hand-approximated tree.
 *
 * The rule that separates an emblem from a band: a shape is a decoration when
 * its colour is **not one of the colours the player is being asked to paint**.
 * Ghana's black star is black, and no region of Ghana's spec is black, so it is
 * an emblem. Sweden's yellow cross is yellow and the `cross` region *is*
 * yellow, so it stays paintable — which is the distinction that a
 * "small shapes are emblems" heuristic would get wrong.
 *
 * Nothing here decides what ships. Extraction produces candidates; the
 * allowlist in `data/overrides.json` decides, and every entry on it has been
 * looked at rendered rather than merely counted.
 */

/** One extracted shape: path data, a literal fill, and any inherited transform. */
export interface Decoration {
  d: string;
  fill: string;
  transform?: string;
}

export interface ExtractionResult {
  decorations: Decoration[];
  /** Why nothing was extracted, for the report. Absent on success. */
  skipped?: string;
}

/**
 * The templates are drawn on a 640×480 canvas, which is also what flag-icons
 * uses for its 4x3 assets, so an extracted path needs no rescaling. A flag on
 * any other canvas is skipped rather than scaled by guesswork.
 */
export const TEMPLATE_VIEWBOX = '0 0 640 480';

/**
 * Caps. A national coat of arms is hundreds of paths and tens of kilobytes —
 * Mexico's is 318 shapes — and shipping those would cost every player a large
 * download for a handful of flags. Emblems are small: a star, a crescent, a
 * cedar. Anything past these caps is reported and left out.
 */
export const MAX_SHAPES = 12;
export const MAX_PATH_BYTES = 4_000;

/** Elements that never paint anything themselves. */
const NON_PAINTING = new Set(['defs', 'clippath', 'mask', 'symbol', 'marker', 'pattern']);

/** Shapes we can turn into path data. `use` is deliberately absent: see below. */
const SHAPES = new Set(['path', 'circle', 'rect', 'ellipse', 'polygon']);

interface Painted {
  tag: string;
  attrs: Record<string, string>;
  /** Transforms from every enclosing <g>, outermost first. */
  transforms: string[];
  /**
   * The fill actually in effect: the shape's own, or the nearest enclosing
   * group's, or black. `fill` inherits in SVG, and Mongolia's soyombo is drawn
   * as a dozen unfilled shapes inside `<g fill="#ffd900">` — read literally
   * they are black, which is both the wrong colour and the wrong verdict about
   * whether they are an emblem at all.
   */
  fill: string;
}

function parseAttributes(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const match of raw.matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g)) {
    attrs[match[1]!] = match[2]!;
  }
  return attrs;
}

/**
 * Walks the painted shapes of an SVG in document order, carrying the transform
 * of every enclosing group and ignoring anything inside `<defs>` and friends.
 *
 * Deliberately a scanner rather than a DOM: the build has no DOM, and flag
 * assets are machine-generated with a shape that this handles exactly.
 */
export function paintedShapes(svg: string): Painted[] {
  const out: Painted[] = [];
  const groups: Array<{ transform?: string; fill?: string }> = [];
  let insideNonPainting = 0;

  const inheritedFill = () => {
    for (let i = groups.length - 1; i >= 0; i--) {
      const fill = groups[i]!.fill;
      if (fill) return fill;
    }
    return undefined;
  };

  for (const match of svg.matchAll(/<(\/?)([\w:-]+)([^>]*?)(\/?)>/g)) {
    const [, closing, rawTag, rawAttrs, selfClosing] = match;
    const tag = rawTag!.replace(/^\w+:/, '').toLowerCase();

    if (closing) {
      if (insideNonPainting > 0) {
        if (NON_PAINTING.has(tag)) insideNonPainting--;
      } else if (tag === 'g' || tag === 'svg') {
        groups.pop();
      }
      continue;
    }

    if (NON_PAINTING.has(tag)) {
      if (!selfClosing) insideNonPainting++;
      continue;
    }
    if (insideNonPainting > 0) continue;

    const attrs = parseAttributes(rawAttrs ?? '');

    // `<svg>` inherits to its children exactly as `<g>` does, and Mongolia's
    // soyombo takes its yellow from the root element rather than from any
    // group — read as black, it is both the wrong colour and, since black is
    // not one of Mongolia's painted colours either way, a lucky guess.
    if (tag === 'g' || tag === 'svg') {
      if (!selfClosing) {
        const group: { transform?: string; fill?: string } = {};
        if (attrs.transform) group.transform = attrs.transform;
        if (attrs.fill) group.fill = attrs.fill;
        groups.push(group);
      }
      continue;
    }

    if (SHAPES.has(tag) || tag === 'use') {
      // SVG's own default: an element with no fill anywhere up the tree paints
      // black. Syria's flag is drawn exactly that way.
      const fill = attrs.fill ?? inheritedFill() ?? '#000';
      out.push({
        tag,
        attrs,
        fill,
        transforms: [
          ...groups.map((group) => group.transform).filter((t): t is string => t !== undefined),
          ...(attrs.transform ? [attrs.transform] : []),
        ],
      });
    }
  }

  return out;
}

/** A shape's own path data. Primitives are converted; anything else is null. */
function pathDataFor(shape: Painted): string | null {
  const { tag, attrs } = shape;
  const number = (name: string) => Number(attrs[name] ?? 0);

  switch (tag) {
    case 'path':
      return attrs.d ?? null;
    case 'rect': {
      const [x, y, width, height] = [number('x'), number('y'), number('width'), number('height')];
      if (!width || !height) return null;
      return `M${x} ${y}h${width}v${height}h${-width}z`;
    }
    case 'circle': {
      const r = number('r');
      if (!r) return null;
      const [cx, cy] = [number('cx'), number('cy')];
      // Two arcs: a single 360° arc is a no-op in SVG.
      return `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${r * 2} 0a${r} ${r} 0 1 0 ${-r * 2} 0z`;
    }
    case 'ellipse': {
      const [rx, ry] = [number('rx'), number('ry')];
      if (!rx || !ry) return null;
      const [cx, cy] = [number('cx'), number('cy')];
      return `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${rx * 2} 0a${rx} ${ry} 0 1 0 ${-rx * 2} 0z`;
    }
    case 'polygon': {
      const points = (attrs.points ?? '').trim();
      return points ? `M${points}z` : null;
    }
    default:
      return null;
  }
}

/**
 * Extracts the emblem shapes of one flag.
 *
 * `regionFamilies` is the set of colour families the player will be painting;
 * `familyOfFill` turns a literal SVG fill into one of those families, or null
 * for `none` and for anything unparseable.
 */
export function extractDecorations(
  svg: string,
  regionFamilies: ReadonlySet<string>,
  familyOfFill: (fill: string) => string | null,
): ExtractionResult {
  const viewBox = /viewBox="([^"]+)"/.exec(svg)?.[1]?.trim();
  if (viewBox !== TEMPLATE_VIEWBOX) {
    return { decorations: [], skipped: `viewBox is "${viewBox ?? 'absent'}", not the template's` };
  }

  const shapes = paintedShapes(svg);

  /*
    `<use>` re-draws a shape defined elsewhere, usually rotated — India's
    chakra is one spoke plus twenty-three uses. Resolving those means resolving
    references and nested transforms, and getting it subtly wrong paints a
    wrong flag. A flag that needs them is reported and skipped instead.
  */
  const usesReferences = shapes.some((shape) => shape.tag === 'use');

  const candidates: Decoration[] = [];
  for (const shape of shapes) {
    if (shape.tag === 'use') continue;

    const fill = shape.fill;
    const family = familyOfFill(fill);
    if (family === null || regionFamilies.has(family)) continue;

    const d = pathDataFor(shape);
    if (!d) continue;

    const decoration: Decoration = { d, fill };
    const transform = shape.transforms.join(' ');
    if (transform) decoration.transform = transform;
    candidates.push(decoration);
  }

  if (candidates.length === 0) return { decorations: [] };
  if (usesReferences) {
    return { decorations: [], skipped: 'artwork uses <use> references' };
  }
  if (candidates.length > MAX_SHAPES) {
    return { decorations: [], skipped: `${candidates.length} shapes (coat of arms?)` };
  }

  const bytes = candidates.reduce((total, candidate) => total + candidate.d.length, 0);
  if (bytes > MAX_PATH_BYTES) {
    return { decorations: [], skipped: `${bytes} bytes of path data` };
  }

  return { decorations: candidates };
}
