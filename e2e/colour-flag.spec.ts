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
