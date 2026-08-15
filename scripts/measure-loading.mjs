import { chromium } from 'playwright';

/**
 * The loading measurement used to find the problem, re-run to check the fix.
 * Throttled to 1.5 Mbps / 40 ms.
 *
 * Timings are taken *inside the page*, from the click to the element
 * appearing. Driving it from Playwright's own `waitFor` adds ~500 ms of
 * polling and actionability overhead, which is real but is the harness's, not
 * the app's — and it swamps exactly the differences being measured.
 *
 *   node .measure.mjs <port>
 */
const PORT = process.argv[2] ?? '4180';
const BASE = `http://localhost:${PORT}`;
const RUNS = 5;

async function throttle(ctx, page) {
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 40,
    downloadThroughput: (1.5 * 1024 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
  });
}

/** Clicks in-page and resolves when `selector` exists, in milliseconds. */
function clickAndWait(page, clickSelector, selector) {
  return page.evaluate(
    ([click, target]) => {
      const t0 = performance.now();
      document.querySelector(click).click();
      return new Promise((resolve) => {
        const tick = () => {
          if (document.querySelector(target)) resolve(Math.round(performance.now() - t0));
          else requestAnimationFrame(tick);
        };
        tick();
      });
    },
    [clickSelector, selector],
  );
}

async function measure({ pauseOnHome, repeatVisit }) {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  if (repeatVisit) {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500); // let the worker install and precache
  }
  await throttle(ctx, page);

  const t = Date.now();
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.locator('a[href="/play/flags/setup"]').waitFor();
  const home = Date.now() - t;

  if (pauseOnHome) await page.waitForTimeout(pauseOnHome);

  const setup = await clickAndWait(
    page,
    'a[href="/play/flags/setup"]',
    '[data-testid="pool-summary"]',
  );

  // Hard: eight options, the worst case for flag payload.
  await page.getByRole('radio', { name: /^hard/i }).click({ force: true });
  const firstQ = await page.evaluate(() => {
    const t0 = performance.now();
    [...document.querySelectorAll('button')]
      .find((b) => /start quiz/i.test(b.textContent))
      .click();
    return new Promise((resolve) => {
      const tick = () => {
        const images = [...document.querySelectorAll('main img')];
        if (images.length > 0 && images.every((i) => i.complete)) {
          resolve(Math.round(performance.now() - t0));
        } else requestAnimationFrame(tick);
      };
      tick();
    });
  });

  await page.locator('ul li button').first().click();
  const nextQ = await page.evaluate(() => {
    const t0 = performance.now();
    [...document.querySelectorAll('button')]
      .find((b) => /continue/i.test(b.textContent))
      .click();
    return new Promise((resolve) => {
      const tick = () => {
        const images = [...document.querySelectorAll('main img')];
        if (images.length > 0 && images.every((i) => i.complete)) {
          resolve(Math.round(performance.now() - t0));
        } else requestAnimationFrame(tick);
      };
      tick();
    });
  });

  await browser.close();
  return { home, setup, firstQ, nextQ };
}

const scenarios = [
  ['first visit, clicks immediately', { pauseOnHome: 0, repeatVisit: false }],
  ['first visit, 1.5s on home', { pauseOnHome: 1500, repeatVisit: false }],
  ['repeat visit (worker warm)', { pauseOnHome: 0, repeatVisit: true }],
];

for (const [label, options] of scenarios) {
  const runs = [];
  for (let i = 0; i < RUNS; i++) runs.push(await measure(options));
  const median = (key) =>
    runs.map((r) => r[key]).sort((a, b) => a - b)[Math.floor(RUNS / 2)];
  console.log(
    `${label.padEnd(34)} home ${String(median('home')).padStart(5)}ms  ` +
      `setup ${String(median('setup')).padStart(4)}ms  ` +
      `firstQ ${String(median('firstQ')).padStart(4)}ms  ` +
      `nextQ ${String(median('nextQ')).padStart(4)}ms`,
  );
}
