import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

/**
 * Some CI images ship Chromium at a revision that does not match the one this
 * Playwright version would download. Where such a build exists, point at it
 * rather than fetching another copy; everywhere else fall back to Playwright's
 * own managed browser.
 */
function preinstalledChromium(): string | undefined {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!root || !existsSync(root)) return undefined;
  for (const entry of readdirSync(root)) {
    if (!entry.startsWith('chromium-')) continue;
    const candidate = join(root, entry, 'chrome-linux', 'chrome');
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

const chromiumPath = preinstalledChromium();

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  ...(process.env.CI ? { workers: 1 } : {}),
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        ...(chromiumPath ? { launchOptions: { executablePath: chromiumPath } } : {}),
      },
    },
    /*
      Firefox and WebKit run only where their browsers are actually installed.
      The sandbox this was built in ships Chromium alone, and a project that
      cannot launch fails the whole suite for a reason that has nothing to do
      with the app — so they are opt-in via PLAYWRIGHT_ALL_BROWSERS, which CI
      sets after `playwright install`.
    */
    ...(process.env.PLAYWRIGHT_ALL_BROWSERS
      ? [
          { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
          { name: 'webkit', use: { ...devices['Desktop Safari'] } },
        ]
      : []),
  ],
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173 --host 127.0.0.1',
    url: 'http://127.0.0.1:4173',
    /*
      Never reuse. Several specs read `dist/` from disk — the 400KB budget, the
      service worker version, the SPA fallback — and reusing a preview server
      left running from an earlier build skips `npm run build` entirely, so
      those assertions silently measure stale output and pass green.
    */
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
