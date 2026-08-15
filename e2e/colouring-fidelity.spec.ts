import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { FLAG_TEMPLATES } from '../src/data/flag-templates/index.ts';
import { entities } from '../src/data/entities.generated.ts';
import { COLOUR_HEX } from '../src/engine/colour.ts';

/**
 * R6 — is a flag's template the right *shape* for its flag?
 *
 * `auditColouring` in the data build checks that a spec's region names match
 * its template and that its colours appear in the real flag's palette. It has
 * no idea about geometry, which is how India shipped as three *vertical* bands
 * and Afghanistan as three horizontal ones: both pass every check the build can
 * make, and both show the player the wrong flag.
 *
 * **What is measured, and why it is not a plain image diff.** Comparing the
 * painted flag to the real one pixel for pixel mostly measures the palette:
 * Colour mode paints in twenty tokens, so Germany's `gold` renders `#d4af37`
 * against a real `#ffce00` and two thirds of the flag "differs" while the
 * geometry is perfect. That number cannot tell a wrong template from a
 * approximate shade.
 *
 * So this measures the partition instead. Each template region is rendered in
 * an identifying colour, giving a map of which region owns which pixel. For
 * each region we take the *modal* colour the real flag actually has there, and
 * count the pixels the real flag disagrees with. A template whose regions line
 * up with the flag's own areas of flat colour scores near zero whatever
 * palette we paint it in; one whose bands run the wrong way scores terribly.
 * Colour correctness is already the build's job — this is only about shape.
 *
 * It is a *baseline* test, not a threshold test. Some difference is irreducible:
 * templates are simplifications, and a flag whose coat of arms we do not draw
 * can never partition perfectly. What must not happen is a flag getting
 * **worse**, so each entity's current score is recorded in
 * `data/colouring-fidelity.json` and the test fails when one regresses.
 *
 * Regenerate the baselines after a deliberate change:
 *
 *     UPDATE_FIDELITY=1 npx playwright test e2e/colouring-fidelity.spec.ts
 */

const BASELINE_PATH = join(process.cwd(), 'data', 'colouring-fidelity.json');

/**
 * Room for anti-aliasing and font-free rasterisation differences between runs.
 * Small enough that a real geometry change cannot hide underneath it — the
 * mistakes this exists to catch move the number by tens of points, not one.
 */
const TOLERANCE = 0.01;

/** Comparison resolution. Small on purpose: it absorbs edge noise and is fast. */
const WIDTH = 160;
const HEIGHT = 120;

interface Baselines {
  [entityId: string]: number;
}

const templatesById = new Map(FLAG_TEMPLATES.map((template) => [template.id, template]));

/**
 * The template's regions, each painted an identifying colour rather than its
 * real one, so rasterising it yields a map of which region owns which pixel.
 *
 * Region *n* is painted `rgb(n+1, 0, 0)`: exact, unmistakable, and blended
 * edge pixels land on values that match no region, which is how boundary
 * anti-aliasing is excluded from the comparison rather than counted as error.
 *
 * Emblems get their own index at the end, because they are part of what the
 * player is shown and a flag whose star we draw genuinely explains more of its
 * artwork than one whose star we do not.
 */
function regionMapSvg(entityId: string): string | null {
  const entity = entities.find((candidate) => candidate.id === entityId);
  const spec = entity?.colouring;
  if (!entity || !spec) return null;

  const template = templatesById.get(spec.templateId);
  if (!template) return null;

  const parts = template.regions.map(
    (region, index) => `<path d="${region.d}" fill="rgb(${index + 1},0,0)"/>`,
  );

  const emblemIndex = template.regions.length + 1;
  for (const decoration of spec.decorations ?? []) {
    parts.push(
      `<path d="${decoration.d}" fill="rgb(${emblemIndex},0,0)"${
        decoration.transform ? ` transform="${decoration.transform}"` : ''
      }/>`,
    );
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${template.viewBox}" ` +
    `width="640" height="480">${parts.join('')}</svg>`
  );
}

/** Kept so the spec's colours are still exercised, and to catch a bad token. */
function usesEveryRegion(entityId: string): boolean {
  const spec = entities.find((candidate) => candidate.id === entityId)?.colouring;
  const template = spec ? templatesById.get(spec.templateId) : undefined;
  if (!spec || !template) return false;
  return template.regions.every((region) => {
    const token = spec.regions[region.id];
    return token !== undefined && COLOUR_HEX[token] !== undefined;
  });
}

/**
 * How much of the real flag the template's partition fails to explain, 0 (every
 * region is one flat colour in the real flag) to 1 (the partition tells you
 * nothing).
 *
 * Done in the page rather than in Node so no image-decoding dependency is
 * needed: the browser already rasterises SVG, and canvas already reads pixels.
 */
async function unexplained(page: Page, mapSvg: string, flagUrl: string): Promise<number> {
  return page.evaluate(
    async ([markup, url, width, height]) => {
      const rasterise = (src: string) =>
        new Promise<Uint8ClampedArray>((resolve, reject) => {
          const image = new Image();
          image.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = width as number;
            canvas.height = height as number;
            const context = canvas.getContext('2d')!;
            // White ground: an SVG with transparent areas must compare against
            // something stable, not against whatever was in the buffer.
            context.fillStyle = '#ffffff';
            context.fillRect(0, 0, canvas.width, canvas.height);
            context.drawImage(image, 0, 0, canvas.width, canvas.height);
            resolve(context.getImageData(0, 0, canvas.width, canvas.height).data);
          };
          image.onerror = () => reject(new Error(`could not rasterise ${src.slice(0, 60)}`));
          image.src = src;
        });

      const [map, real] = await Promise.all([
        rasterise(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup as string)}`),
        rasterise(url as string),
      ]);

      /** Coarse colour key, so a gradient or JPEG-ish noise is not many colours. */
      const key = (i: number) =>
        ((real[i]! >> 4) << 8) | ((real[i + 1]! >> 4) << 4) | (real[i + 2]! >> 4);

      // Pass one: the real flag's commonest colour inside each region.
      const counts = new Map<number, Map<number, number>>();
      for (let i = 0; i < map.length; i += 4) {
        // Green and blue are zero only on an unblended region fill; anything
        // else is an anti-aliased boundary pixel and is not evidence.
        if (map[i + 1] !== 0 || map[i + 2] !== 0) continue;
        const region = map[i]!;
        if (region === 0) continue;

        let tally = counts.get(region);
        if (!tally) counts.set(region, (tally = new Map()));
        const colour = key(i);
        tally.set(colour, (tally.get(colour) ?? 0) + 1);
      }

      const modal = new Map<number, number>();
      for (const [region, tally] of counts) {
        let best = -1;
        let bestCount = -1;
        for (const [colour, count] of tally) {
          if (count > bestCount) {
            bestCount = count;
            best = colour;
          }
        }
        modal.set(region, best);
      }

      // Pass two: how much of the flag that prediction gets wrong.
      let considered = 0;
      let wrong = 0;
      for (let i = 0; i < map.length; i += 4) {
        if (map[i + 1] !== 0 || map[i + 2] !== 0) continue;
        const region = map[i]!;
        if (region === 0) continue;
        considered++;
        if (key(i) !== modal.get(region)) wrong++;
      }

      return considered === 0 ? 1 : wrong / considered;
    },
    [mapSvg, flagUrl, WIDTH, HEIGHT] as const,
  );
}

const spec_entities = entities.filter((entity) => entity.colouring !== undefined);

test.describe('colouring fidelity (R6)', () => {
  test('every colouring spec is still the right shape for its flag', async ({ page }) => {
    expect(spec_entities.length, 'no colouring specs found').toBeGreaterThan(50);

    await page.goto('/');

    const measured: Baselines = {};
    for (const entity of spec_entities) {
      expect(usesEveryRegion(entity.id), `${entity.id} has an unpaintable region`).toBe(true);
      const svg = regionMapSvg(entity.id);
      expect(svg, `${entity.id} produced no region map`).not.toBeNull();
      measured[entity.id] = await unexplained(page, svg!, entity.flag.file);
    }

    if (process.env.UPDATE_FIDELITY) {
      const sorted = Object.fromEntries(
        Object.entries(measured)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([id, value]) => [id, Number(value.toFixed(4))]),
      );
      writeFileSync(BASELINE_PATH, `${JSON.stringify(sorted, null, 2)}\n`);

      const worst = Object.entries(measured)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 15)
        .map(([id, value]) => `  ${id.padEnd(24)} ${(value * 100).toFixed(1)}%`)
        .join('\n');
      console.log(`\nWorst-fitting templates (share of flag the partition fails to explain):\n${worst}\n`);
      return;
    }

    const baselines = JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as Baselines;

    const regressions: string[] = [];
    const missing: string[] = [];
    for (const [id, value] of Object.entries(measured)) {
      const baseline = baselines[id];
      if (baseline === undefined) {
        missing.push(id);
        continue;
      }
      if (value > baseline + TOLERANCE) {
        regressions.push(
          `${id}: ${(value * 100).toFixed(1)}% unexplained, was ${(baseline * 100).toFixed(1)}%`,
        );
      }
    }

    // A spec with no baseline has never been looked at — the same rule the
    // decoration allowlist enforces, for the same reason.
    expect(
      missing,
      `these specs have no fidelity baseline; run UPDATE_FIDELITY=1 and review the result`,
    ).toEqual([]);

    expect(regressions, 'these templates now fit their flags worse').toEqual([]);
  });
});
