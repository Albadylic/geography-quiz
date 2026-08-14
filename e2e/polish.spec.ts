import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

const DIST = join(process.cwd(), 'dist');

/** T7.4 — the plan's budget for what a first visit downloads. */
const INITIAL_JS_BUDGET = 400 * 1024;

test.describe('performance budget (T7.4)', () => {
  test('initial JS stays under 400KB', () => {
    const html = readFileSync(join(DIST, 'index.html'), 'utf8');
    // Only the entry script is downloaded up front; every screen is lazy.
    const entry = /<script[^>]+src="(\/assets\/[^"]+\.js)"/.exec(html)?.[1];
    expect(entry, 'no entry script found in index.html').toBeTruthy();

    const bytes = statSync(join(DIST, entry!)).size;
    expect(
      bytes,
      `entry chunk is ${(bytes / 1024).toFixed(1)}KB, budget is ${INITIAL_JS_BUDGET / 1024}KB`,
    ).toBeLessThan(INITIAL_JS_BUDGET);
  });

  test('the dataset is not in the initial download', () => {
    const html = readFileSync(join(DIST, 'index.html'), 'utf8');
    const entry = /<script[^>]+src="(\/assets\/[^"]+\.js)"/.exec(html)?.[1];
    expect(entry, 'no entry script found in index.html').toBeTruthy();
    const contents = readFileSync(join(DIST, entry as string), 'utf8');

    // 250 entities would be unmistakable in the entry chunk.
    expect(contents).not.toContain('Ouagadougou');
    expect(readdirSync(join(DIST, 'assets')).some((f) => f.startsWith('entities.generated'))).toBe(
      true,
    );
  });

  test('flags are served as separate files, not inlined', () => {
    const flags = readdirSync(join(DIST, 'flags')).filter((f) => f.endsWith('.svg'));
    expect(flags.length).toBe(250);
  });
});

test.describe('responsive audit (T7.2)', () => {
  test.use({ viewport: { width: 360, height: 740 } });

  test('the eight-option grid is usable at 360px', async ({ page }) => {
    await page.goto('/play/flags/setup');
    const difficulty = page.getByRole('group', { name: /difficulty/i });
    await difficulty.getByText('Hard', { exact: true }).click();
    await page.getByRole('button', { name: /start quiz/i }).click();

    const options = page.locator('ul li button');
    await expect(options).toHaveCount(8);

    // Every option is on screen, tappable, and inside the viewport.
    for (let i = 0; i < 8; i++) {
      const box = (await options.nth(i).boundingBox())!;
      expect(box.height, `option ${i + 1} is too short to tap`).toBeGreaterThanOrEqual(44);
      expect(box.x, `option ${i + 1} starts off-screen`).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, `option ${i + 1} overflows`).toBeLessThanOrEqual(361);
    }
  });

  test('no screen scrolls sideways at 360px', async ({ page }) => {
    for (const path of ['/', '/stats', '/settings', '/revision', '/play/flags/setup']) {
      await page.goto(path);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${path} scrolls sideways by ${overflow}px`).toBeLessThanOrEqual(1);
    }
  });
});

test.describe('accessibility (T7.1)', () => {
  test('offers a skip link that reaches the main content', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Tab');
    const focused = page.locator(':focus');
    await expect(focused).toHaveText(/skip to/i);

    await focused.press('Enter');
    await expect(page.locator('#main')).toBeFocused();
  });

  test('every interactive control shows a focus ring', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    const outline = await page.locator(':focus').evaluate((node) => {
      const style = getComputedStyle(node);
      return { width: style.outlineWidth, style: style.outlineStyle };
    });
    expect(outline.style).not.toBe('none');
    expect(parseFloat(outline.width)).toBeGreaterThan(0);
  });

  test('a flag never names its country while the question is open', async ({ page }) => {
    await page.goto('/play/flags/setup');
    await page.getByRole('button', { name: /start quiz/i }).click();

    const alts = await page.locator('main img').evaluateAll((nodes) =>
      nodes.map((node) => ({
        alt: (node as HTMLImageElement).alt,
        title: node.getAttribute('title'),
      })),
    );
    for (const { alt, title } of alts) {
      expect(alt).toMatch(/^(The flag in question|Flag option \d+)$/);
      expect(title).toBeNull();
    }
  });
});
