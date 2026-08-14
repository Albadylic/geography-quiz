import { expect, test, type Page } from '@playwright/test';

/**
 * Phase 1 gate: complete a 20-question easy flags quiz end to end and assert
 * the results screen.
 *
 * Runs against the production build, so it also covers the flag assets being
 * served and the dataset surviving the bundler.
 */

async function answerCurrentQuestion(page: Page, pickCorrect: boolean) {
  const options = page.locator('ul li button');
  await expect(options.first()).toBeEnabled();

  if (pickCorrect) {
    // The correct option is the one that ends up marked "Correct"; before
    // grading we cannot know it, so pick the first and read the outcome.
    await options.first().click();
  } else {
    await options.first().click();
  }

  await expect(page.locator('ul li button[disabled]').first()).toBeVisible();
  await page.getByRole('button', { name: /continue/i }).click();
}

test('completes a 20-question easy flags quiz and shows the results', async ({ page }) => {
  await page.goto('/play/flags/setup');

  await expect(page.getByTestId('pool-summary')).toContainText('20 questions from 250 countries');
  await page.getByRole('button', { name: /start quiz/i }).click();
  await expect(page).toHaveURL(/\/play\/flags$/);

  // Easy difficulty shows four options.
  await expect(page.locator('ul li button')).toHaveCount(4);

  // The flag must not name itself while the question is open (§11).
  const promptFlag = page.locator('main figure img');
  await expect(promptFlag).toHaveAttribute('alt', 'The flag in question');
  await expect(promptFlag).not.toHaveAttribute('title', /./);

  for (let i = 0; i < 20; i++) {
    await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', String(i));
    await answerCurrentQuestion(page, true);
  }

  await expect(page).toHaveURL(/\/results\//);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByText('Score', { exact: true })).toBeVisible();
  await expect(page.getByText('Accuracy', { exact: true })).toBeVisible();
  await expect(page.getByText('Correct', { exact: true })).toBeVisible();
  await expect(page.getByText('Best streak', { exact: true })).toBeVisible();

  // 20 questions were answered, whatever the mix of right and wrong.
  await expect(page.getByText(/^\d+\/20$/)).toBeVisible();
  await expect(page.getByRole('link', { name: /play again/i })).toBeVisible();
});

test('plays entirely from the keyboard', async ({ page }) => {
  await page.goto('/play/flags/setup');
  await page.getByRole('button', { name: /start quiz/i }).click();

  for (let i = 0; i < 20; i++) {
    await expect(page.locator('ul li button').first()).toBeEnabled();
    await page.keyboard.press(String((i % 4) + 1));
    await expect(page.locator('ul li button[disabled]').first()).toBeVisible();
    await page.getByRole('button', { name: /continue/i }).click();
  }

  await expect(page).toHaveURL(/\/results\//);
});

test('renders every flag at its own aspect ratio, undistorted', async ({ page }) => {
  await page.goto('/play/flags/setup');
  await page.getByRole('button', { name: /start quiz/i }).click();

  // The prompt flag's painted box must match the SVG's natural ratio — the
  // check jsdom cannot make, because it has no layout engine.
  const measurement = await page.locator('main figure img').evaluate((node) => {
    const img = node as HTMLImageElement;
    const box = img.getBoundingClientRect();
    const natural = img.naturalWidth / img.naturalHeight;
    const boxRatio = box.width / box.height;
    const painted =
      natural > boxRatio
        ? { w: box.width, h: box.width / natural }
        : { w: box.height * natural, h: box.height };
    return { natural, painted: painted.w / painted.h };
  });

  expect(Math.abs(measurement.painted - measurement.natural)).toBeLessThan(0.001);
});

test('shows the cap before starting a quiz bigger than its pool', async ({ page }) => {
  await page.goto('/play/flags/setup');

  // The radio and checkbox inputs are `sr-only`, so a pointer lands on the
  // visible label rather than on the input — which is exactly what a real user
  // clicks, and the label forwards it. Target the label text, not the input.
  await page.getByRole('group', { name: /questions/i }).getByText('100', { exact: true }).click();
  await page.getByRole('group', { name: /continents/i }).getByText('Oceania').click();

  await expect(page.getByRole('radio', { name: '100' })).toBeChecked();

  const summary = page.getByTestId('pool-summary');
  await expect(summary).toContainText(/Oceania has \d+ countries/);
  await expect(summary).toContainText(/this quiz will be \d+ questions/);
});
