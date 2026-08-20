import { chromium } from 'playwright';

/**
 * Interaction cost under CPU throttling.
 *
 * `measure-loading.mjs` throttles the *network* to answer "how long until I can
 * play". This answers the other half: once the app is up, does anything it does
 * cost enough to be felt on hardware a player might actually own?
 *
 * What is measured is **main-thread blocking inside the page**, via the
 * longtask PerformanceObserver — not wall-clock around Playwright calls. Each
 * `click`/`evaluate` is a CDP round trip costing several milliseconds, and
 * timing around them measures the harness as much as the app. Longtasks are
 * immune to that: the browser reports a task only if it actually occupied the
 * main thread for 50ms or more, which is the thing a player feels as jank.
 *
 * So a result of "no longtasks" means the interaction never blocked long
 * enough to drop a frame, however slow the harness looked.
 *
 *   node scripts/measure-interaction.mjs [port] [rate,rate,...]
 */
const PORT = process.argv[2] ?? '4173';
const BASE = `http://localhost:${PORT}`;
const RATES = (process.argv[3] ?? '1,4,6').split(',').map(Number);
const REPEATS = 5;

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

async function session(rate) {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate });
  return { browser, page };
}

/** Starts collecting longtasks, discarding anything from before this point. */
async function watchBlocking(page) {
  await page.evaluate(() => {
    window.__tasks = [];
    window.__obs?.disconnect();
    window.__obs = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) window.__tasks.push(Math.round(entry.duration));
    });
    window.__obs.observe({ entryTypes: ['longtask'] });
  });
}

/** Longtasks seen since `watchBlocking`: how many, and the worst one. */
async function blocking(page) {
  const tasks = await page.evaluate(() => window.__tasks ?? []);
  return { count: tasks.length, worst: tasks.length ? Math.max(...tasks) : 0,
           total: tasks.reduce((n, d) => n + d, 0) };
}

async function startQuiz(page, mode, difficulty, direction) {
  await page.goto(`${BASE}/play/${mode}/setup`);
  await page.getByRole('button', { name: /start quiz/i }).waitFor();
  if (direction) {
    await page.getByRole('group', { name: /direction/i }).getByText(direction).click();
  }
  if (difficulty) {
    await page
      .getByRole('group', { name: /difficulty/i })
      .getByText(difficulty, { exact: true })
      .click();
  }
  await page.getByRole('button', { name: /start quiz/i }).click();
  await page.locator('main').first().waitFor();
}

const results = [];
const record = (rate, name, b) => results.push({ rate, name, ...b });

for (const rate of RATES) {
  // --- expert mode: the only per-keystroke JS path in the app ---
  {
    const { browser, page } = await session(rate);
    await startQuiz(page, 'capitals', 'Expert');
    const box = page.getByRole('combobox');
    await box.waitFor();
    await watchBlocking(page);
    for (const ch of 'wellington') await box.press(ch);
    record(rate, 'expert: typing a 10-letter answer', await blocking(page));
    await browser.close();
  }

  // --- hard flags: 8 options, the biggest re-render in the app ---
  {
    const { browser, page } = await session(rate);
    await startQuiz(page, 'flags', 'Hard', /country . flag/i);
    await page.locator('ul li button').first().waitFor();
    await page.waitForFunction(() =>
      [...document.querySelectorAll('main img')].every((im) => im.complete));
    await watchBlocking(page);
    for (let i = 0; i < REPEATS; i++) {
      await page.locator('ul li button').first().click();
      await page.getByRole('button', { name: /continue/i }).click();
      await page.waitForFunction(() =>
        [...document.querySelectorAll('main img')].every((im) => im.complete));
    }
    record(rate, `hard quiz: ${REPEATS} question advances`, await blocking(page));
    await browser.close();
  }

  // --- revision: opening a 45-card deck sorts and shuffles on open ---
  {
    const { browser, page } = await session(rate);
    await page.goto(`${BASE}/revision`);
    const europe = page.getByRole('button', { name: /^Europe/ });
    await europe.waitFor();
    await watchBlocking(page);
    await europe.click();
    await page.getByRole('button', { name: /tap to turn over/i }).waitFor();
    record(rate, 'revision: open a 45-card deck', await blocking(page));
    await browser.close();
  }

  // --- colour: paint every region and grade ---
  {
    const { browser, page } = await session(rate);
    await page.goto(`${BASE}/play/colour/setup`);
    await page.getByRole('button', { name: /easy/i }).waitFor();
    await page.getByRole('button', { name: /easy/i }).click();
    const flag = page.getByRole('img', { name: /blank flag of/i });
    await flag.waitFor();
    const swatch = page.getByRole('group', { name: /colours/i }).getByRole('button').first();
    await swatch.click();
    const regions = flag.locator('[data-region]');
    await watchBlocking(page);
    for (let i = 0; i < (await regions.count()); i++) await regions.nth(i).dispatchEvent('click');
    await page.getByRole('button', { name: /check my flag/i }).click();
    await page.getByRole('button', { name: /next flag|finish/i }).waitFor();
    record(rate, 'colour: paint all regions + grade', await blocking(page));
    await browser.close();
  }

  // --- cold load of the play route, which is where the work is concentrated ---
  {
    const { browser, page } = await session(rate);
    await page.addInitScript(() => {
      window.__tasks = [];
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) window.__tasks.push(Math.round(e.duration));
      }).observe({ entryTypes: ['longtask'] });
    });
    await page.goto(`${BASE}/play/flags/setup`);
    await page.getByRole('button', { name: /start quiz/i }).waitFor();
    record(rate, 'cold: load + boot the setup screen', await blocking(page));
    await browser.close();
  }
}

const names = [...new Set(results.map((r) => r.name))];
console.log('\nMain-thread blocking by CPU throttling');
console.log('Longtasks (>50ms) during each interaction: count / worst / total ms.');
console.log('No longtask means no dropped frame, however slow the harness looked.\n');
console.log('interaction'.padEnd(38) + RATES.map((r) => `${r}x CPU`.padStart(16)).join(''));
for (const name of names) {
  const cells = RATES.map((rate) => {
    const hit = results.find((r) => r.rate === rate && r.name === name);
    return (hit ? `${hit.count} / ${hit.worst} / ${hit.total}` : '-').padStart(16);
  });
  console.log(name.padEnd(38) + cells.join(''));
}
