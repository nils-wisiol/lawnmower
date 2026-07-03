import { expect, test } from '@playwright/test';

import { decodeShortForm, generate } from '../../src/gen/index.ts';
import { DEFAULT_LEVEL_CODE } from '../../src/game/defaultLevel.ts';
import type { InputDirection } from '../../src/model/index.ts';
import { walkToInputs } from '../helpers/solve.ts';

const ARROW: Record<InputDirection, string> = {
  up: 'ArrowUp',
  down: 'ArrowDown',
  left: 'ArrowLeft',
  right: 'ArrowRight',
};

// The M4 play loop: start → win (with a recorded time) → next level. Drives the
// generator's own solution to the win, then advances to a fresh level.
const { level, walk } = generate(decodeShortForm(DEFAULT_LEVEL_CODE));

test('records a completion time on win and advances to the next level', async ({ page }) => {
  const inputs = walkToInputs(level, walk);

  await page.goto('/');
  const game = page.locator('#game');
  const status = page.locator('.status');

  // The clock is free until the first move (default policy), so it reads 0:00 first.
  await expect(status).toContainText('0:00');

  for (const input of inputs) {
    await page.keyboard.press(ARROW[input]);
  }

  await expect(game).toHaveAttribute('data-status', 'won');
  // Win screen reports a formatted completion time, e.g. "You won in 0:03.1!".
  await expect(status).toContainText(/You won in \d:\d{2}\.\d/);

  // N continues to the next lawn — a fresh, playable level.
  await page.keyboard.press('n');
  await expect(game).toHaveAttribute('data-status', 'playing');
});

test('R replays the same level after a win', async ({ page }) => {
  const inputs = walkToInputs(level, walk);

  await page.goto('/');
  const game = page.locator('#game');

  for (const input of inputs) {
    await page.keyboard.press(ARROW[input]);
  }
  await expect(game).toHaveAttribute('data-status', 'won');

  await page.keyboard.press('r');
  await expect(game).toHaveAttribute('data-status', 'playing');
});
