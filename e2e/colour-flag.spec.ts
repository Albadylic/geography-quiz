import { expect, test } from '@playwright/test';

/**
 * §12 E2E: complete a Colour the Flag round.
 *
 * Runs against the production build, so it also covers the templates rendering
 * as real SVG geometry rather than only as data.
 */
test('completes a Colour the Flag round', async ({ page }) => {
  await page.goto('/play/colour/setup');
  await expect(page.getByText(/\d+ flags are available/)).toBeVisible();

  await page.getByRole('button', { name: /easy/i }).click();

  const flag = page.getByRole('img', { name: /blank flag of/i });
  await expect(flag).toBeVisible();

  const regions = flag.locator('[data-region]');
  const regionCount = await regions.count();
  expect(regionCount).toBeGreaterThanOrEqual(2);

  // Every swatch carries a visible colour name, not just a chip (§7).
  const palette = page.getByRole('group', { name: /colours/i });
  const swatches = palette.getByRole('button').filter({ hasNotText: /eraser/i });
  for (const swatch of await swatches.all()) {
    await expect(swatch).not.toHaveText('');
  }

  /*
   * The topmost region is clicked for real, to prove hit-testing works. The
   * rest are dispatched directly: a background region such as a Nordic flag's
   * field spans the whole canvas, so its bounding-box centre sits *under* the
   * cross. Clicking there correctly paints the cross — which is the right
   * behaviour for a user and the wrong thing for a fill loop to rely on.
   */
  await swatches.first().click();
  await regions.last().click();
  await expect(regions.last()).not.toHaveAttribute('aria-label', /not filled/);

  for (let i = 0; i < regionCount; i++) {
    await regions.nth(i).dispatchEvent('click');
  }

  await page.getByRole('button', { name: /check my flag/i }).click();

  // The summary shows per-region results next to the real flag (§7).
  await expect(page.getByText(/the real flag/i)).toBeVisible();
  await expect(page.getByRole('img', { name: /^Flag of / })).toBeVisible();
  await expect(page.getByRole('button', { name: /next flag|finish/i })).toBeVisible();
});

test('undo, erase and clear all work on a real canvas', async ({ page }) => {
  await page.goto('/play/colour/setup');
  await page.getByRole('button', { name: /medium/i }).click();

  const flag = page.getByRole('img', { name: /blank flag of/i });
  const regions = flag.locator('[data-region]');
  const palette = page.getByRole('group', { name: /colours/i });

  // The last region is drawn on top, so it is always clickable at its centre.
  const target = regions.last();

  await palette.getByRole('button').first().click();
  await target.click();
  await expect(target).not.toHaveAttribute('aria-label', /not filled/);

  await page.getByRole('button', { name: /^undo$/i }).click();
  await expect(target).toHaveAttribute('aria-label', /not filled/);

  await page.getByRole('button', { name: /^redo$/i }).click();
  await expect(target).not.toHaveAttribute('aria-label', /not filled/);

  await page.getByRole('button', { name: /clear all/i }).click();
  await expect(target).toHaveAttribute('aria-label', /not filled/);
});

/**
 * F4: an emblem is drawn over the painting, and a click meant for the band
 * underneath must reach it.
 *
 * This can only be proved in a real browser. jsdom has no layout and no
 * hit-testing, so a unit test can assert `pointer-events: none` is *set* but
 * never that it works — and getting this wrong makes the band under Ghana's
 * star unpaintable, which is the sort of thing you only find by playing.
 */
test('an emblem never swallows a click meant for the flag', async ({ page }) => {
  /*
    The round is seeded from Math.random, and only 16 of the 89 colourable
    flags carry an emblem — left to chance this test would quietly skip about
    one run in seven. Pinning the seed makes it either run or fail, never
    evaporate.
  */
  await page.addInitScript(() => {
    Math.random = () => 0.5;
  });

  await page.goto('/play/colour/setup');
  await page.getByRole('button', { name: /easy/i }).click();

  const flag = page.getByRole('img', { name: /blank flag of/i });
  const palette = page.getByRole('group', { name: /colours/i });
  const swatches = palette.getByRole('button').filter({ hasNotText: /eraser/i });

  // Walk the round to the first flag that has an emblem.
  let emblem = flag.locator('[data-decorations] path');
  for (let i = 0; i < 9 && (await emblem.count()) === 0; i++) {
    await swatches.first().click();
    const regions = flag.locator('[data-region]');
    for (let r = 0; r < (await regions.count()); r++) {
      await regions.nth(r).dispatchEvent('click');
    }
    await page.getByRole('button', { name: /check my flag/i }).click();
    await page.getByRole('button', { name: /next flag|finish/i }).click();
    emblem = flag.locator('[data-decorations] path');
  }
  await expect(emblem.first()).toBeVisible();

  const box = (await emblem.first().boundingBox())!;
  await swatches.first().click();
  // A real mouse click at the emblem's centre, so the browser hit-tests it.
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

  // Something underneath got painted: the click was not eaten by the emblem.
  const filled = flag.locator('[data-region]:not([aria-label*="not filled"])');
  await expect(filled).not.toHaveCount(0);
});
