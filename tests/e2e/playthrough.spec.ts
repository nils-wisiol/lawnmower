import { expect, test } from '@playwright/test';

import { levelFromAscii, type InputDirection } from '../../src/model/index.ts';
import { DEMO_LEVEL_MAP } from '../../src/game/demoLevel.ts';
import { findSolution } from '../helpers/solve.ts';

const ARROW: Record<InputDirection, string> = {
  up: 'ArrowUp',
  down: 'ArrowDown',
  left: 'ArrowLeft',
  right: 'ArrowRight',
};

// M2 done-criterion: a human can play the level to completion in the browser.
// We drive the same solution the model proves exists, via real key presses, and
// assert the win state surfaces in the DOM.
test('plays the demo level to a win with arrow keys', async ({ page }) => {
  const solution = findSolution(levelFromAscii(DEMO_LEVEL_MAP));
  expect(solution, 'demo level must be solvable').toBeDefined();

  await page.goto('/');
  const game = page.locator('#game');
  await expect(game).toHaveAttribute('data-status', 'playing');

  for (const input of solution!) {
    await page.keyboard.press(ARROW[input]);
  }

  await expect(game).toHaveAttribute('data-status', 'won');
  await expect(page.locator('.status')).toContainText('You won');
});

test('re-mowing a tile crashes, and R restarts', async ({ page }) => {
  await page.goto('/');
  const game = page.locator('#game');

  // Start mows (0,0); right mows (1,0); left re-enters the mowed start → crash.
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowLeft');
  await expect(game).toHaveAttribute('data-status', 'lost');

  await page.keyboard.press('r');
  await expect(game).toHaveAttribute('data-status', 'playing');
});
