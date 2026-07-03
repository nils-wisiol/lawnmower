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

const OPPOSITE: Record<InputDirection, InputDirection> = {
  up: 'down',
  down: 'up',
  left: 'right',
  right: 'left',
};

// The app boots the generated default level; the generator hands us the walk that
// proves it solvable, so we drive that exact solution via real key presses — no
// hand-routed key list — and assert the win surfaces in the DOM.
const { level, walk } = generate(decodeShortForm(DEFAULT_LEVEL_CODE));

test('plays the generated default level to a win with arrow keys', async ({ page }) => {
  const inputs = walkToInputs(level, walk);

  await page.goto('/');
  const game = page.locator('#game');
  await expect(game).toHaveAttribute('data-status', 'playing');

  for (const input of inputs) {
    await page.keyboard.press(ARROW[input]);
  }

  await expect(game).toHaveAttribute('data-status', 'won');
  await expect(page.locator('.status')).toContainText('You won');
});

test('re-mowing a tile crashes, and R restarts', async ({ page }) => {
  const inputs = walkToInputs(level, walk);
  const first = inputs[0];

  await page.goto('/');
  const game = page.locator('#game');

  // Start is mowed on load; step to the first walk cell, then reverse straight
  // back onto the (now mowed) start → hard fail. Layout-independent.
  await page.keyboard.press(ARROW[first]);
  await page.keyboard.press(ARROW[OPPOSITE[first]]);
  await expect(game).toHaveAttribute('data-status', 'lost');

  await page.keyboard.press('r');
  await expect(game).toHaveAttribute('data-status', 'playing');
});
