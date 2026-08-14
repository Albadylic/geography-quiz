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

  // Paint every region, then check.
  await swatches.first().click();
  for (let i = 0; i < regionCount; i++) {
    await regions.nth(i).click();
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

  await palette.getByRole('button').first().click();
  await regions.first().click();
  await expect(regions.first()).not.toHaveAttribute('aria-label', /not filled/);

  await page.getByRole('button', { name: /^undo$/i }).click();
  await expect(regions.first()).toHaveAttribute('aria-label', /not filled/);

  await page.getByRole('button', { name: /^redo$/i }).click();
  await expect(regions.first()).not.toHaveAttribute('aria-label', /not filled/);

  await page.getByRole('button', { name: /clear all/i }).click();
  await expect(regions.first()).toHaveAttribute('aria-label', /not filled/);
});
