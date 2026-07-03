import { expect, test } from '@playwright/test';

import { decodeShortForm, generate } from '../../src/gen/index.ts';
import {
  DEFAULT_LEVEL_CODE,
  defaultCodedLevel,
  fitLevelSize,
} from '../../src/game/defaultLevel.ts';
import type { InputDirection } from '../../src/model/index.ts';
import { walkToInputs } from '../helpers/solve.ts';

const ARROW: Record<InputDirection, string> = {
  up: 'ArrowUp',
  down: 'ArrowDown',
  left: 'ArrowLeft',
  right: 'ArrowRight',
};

// The default level's generator walk proves it solvable; we replay it to win.
const { level, walk } = generate(decodeShortForm(DEFAULT_LEVEL_CODE));

// These exercise the generated-default boot (i.e. a returning visitor). A first-ever
// visit would open the M6 tutorial instead, so mark it seen before each test.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('lawnmower:v1:tutorial-seen', '1');
    } catch {
      /* ignore */
    }
  });
});

// The no-hash boot level is sized to the viewport (its dimensions follow the
// screen), so its code isn't the fixed DEFAULT_LEVEL_CODE. Derive the expected
// code from the page's own viewport, exactly as the app does, so the assertion
// holds regardless of the browser's window size.
async function bootCode(page: import('@playwright/test').Page): Promise<string> {
  const vp = await page.evaluate(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));
  return defaultCodedLevel(fitLevelSize(vp)).code!;
}

test('boot puts the current level code in the URL hash (shareable)', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#game')).toHaveAttribute('data-status', 'playing');
  // The URL now names the exact level on screen — copying it shares that level.
  await expect.poll(() => new URL(page.url()).hash).toBe(`#${await bootCode(page)}`);
});

test('N skips mid-play to a fresh lawn and updates the URL', async ({ page }) => {
  await page.goto('/');
  const game = page.locator('#game');
  await expect(game).toHaveAttribute('data-status', 'playing');
  const boot = `#${await bootCode(page)}`;
  await expect.poll(() => new URL(page.url()).hash).toBe(boot);

  // Without winning, N should hand out a new lawn (not sit idle) and the shareable
  // URL should follow it to the new level's code.
  await page.keyboard.press('n');
  await expect(game).toHaveAttribute('data-status', 'playing');
  await expect.poll(() => new URL(page.url()).hash).not.toBe(boot);
  await expect.poll(() => new URL(page.url()).hash).toMatch(/^#\d+\.\d+\.\d+x\d+\.\d+$/);
});

test('a shared seed URL reproduces the level and is playable to a win', async ({ page }) => {
  const inputs = walkToInputs(level, walk);

  // Opening the shared link boots that exact level (M5 done-criterion).
  await page.goto(`/#${DEFAULT_LEVEL_CODE}`);
  const game = page.locator('#game');
  await expect(game).toHaveAttribute('data-status', 'playing');

  for (const input of inputs) {
    await page.keyboard.press(ARROW[input]);
  }
  await expect(game).toHaveAttribute('data-status', 'won');
});

test('pasting a level code loads that level', async ({ page }) => {
  await page.goto('/');
  await page.locator('.seed-input').fill(DEFAULT_LEVEL_CODE);
  await page.locator('.seed-load').click();

  await expect(page.locator('#game')).toHaveAttribute('data-status', 'playing');
  await expect.poll(() => new URL(page.url()).hash).toBe(`#${DEFAULT_LEVEL_CODE}`);
});

test('best time survives a reload (persistence)', async ({ page }) => {
  const inputs = walkToInputs(level, walk);

  await page.goto(`/#${DEFAULT_LEVEL_CODE}`);
  const game = page.locator('#game');
  for (const input of inputs) {
    await page.keyboard.press(ARROW[input]);
  }
  await expect(game).toHaveAttribute('data-status', 'won');
  // The completion time is now stored as the best for this level code.
  await expect(page.locator('.best-time')).toContainText('Best:');

  // Reload the same URL: the stored best time comes back for this level.
  await page.reload();
  await expect(game).toHaveAttribute('data-status', 'playing');
  await expect(page.locator('.best-time')).toContainText(/Best: \d:\d{2}/);
});
