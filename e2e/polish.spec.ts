import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

const DIST = join(process.cwd(), 'dist');

/** T7.4 — the plan's budget for what a first visit downloads. */
const INITIAL_JS_BUDGET = 400 * 1024;

test.describe('performance budget (T7.4)', () => {
  // Reads dist/ from the filesystem and never opens a page, so running it once
  // per browser just re-reads identical bytes. See the note in
  // colouring-fidelity.spec.ts — same principle.
  test.skip(({ browserName }) => browserName !== 'chromium', 'inspects the build, not a browser');

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

/**
 * R8 — the app uses history routing, so /stats and a shared /results/:id are
 * URLs no file exists for. Without a fallback they 404 on every static host;
 * it works in `vite preview` only because preview rewrites for you, which is
 * exactly the kind of difference that is found in production.
 */
test.describe('deep links survive a static host (R8)', () => {
  test('ships an SPA rewrite and a 404.html copy of the shell', () => {
    // Reads dist/ from the filesystem and never opens a page, so running it
    // once per browser just re-reads identical bytes. See the note in
    // colouring-fidelity.spec.ts — same principle.
    test.skip(test.info().project.name !== 'chromium', 'inspects the build, not a browser');

    const shell = readFileSync(join(DIST, 'index.html'), 'utf8');

    // Netlify and Cloudflare Pages.
    expect(readFileSync(join(DIST, '_redirects'), 'utf8')).toMatch(
      /^\/\*\s+\/index\.html\s+200$/m,
    );
    // GitHub Pages, which ignores _redirects and serves 404.html instead.
    expect(readFileSync(join(DIST, '404.html'), 'utf8')).toBe(shell);
  });

  test('a deep link loads the app rather than an error page', async ({ page }) => {
    await page.goto('/stats');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });
});

/**
 * R9 — the worker's cache version must move with the build.
 *
 * It shipped as the literal 'v1', so the activate handler's "delete caches
 * that are not this version" could never match anything and the first
 * index.html a user ever cached outlived every deploy.
 */
test.describe('service worker cache version (R9)', () => {
  // Reads dist/ from the filesystem and never opens a page, so running it once
  // per browser just re-reads identical bytes. See the note in
  // colouring-fidelity.spec.ts — same principle.
  test.skip(({ browserName }) => browserName !== 'chromium', 'inspects the build, not a browser');

  const swVersion = () => /const VERSION = '([^']+)'/.exec(readFileSync(join(DIST, 'sw.js'), 'utf8'))?.[1];

  test('is stamped from the build, not left as a placeholder', () => {
    const version = swVersion();
    expect(version, 'no VERSION found in the built sw.js').toBeTruthy();
    expect(version).not.toBe('__SW_VERSION__');
    expect(version).not.toBe('v1');
    expect(version).toMatch(/^[0-9a-f]{12}$/);
  });

  test('tracks the asset hashes, so a changed build rotates the cache', () => {
    const version = swVersion()!;
    const assets = readdirSync(join(DIST, 'assets')).sort().join(',');
    const expected = createHash('sha256').update(assets).digest('hex').slice(0, 12);

    // Same derivation the build uses: identical assets keep the cache, and any
    // new hashed filename produces a different version.
    expect(version).toBe(expected);
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
