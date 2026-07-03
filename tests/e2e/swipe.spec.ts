import { expect, test } from '@playwright/test';

import { decodeShortForm, generate } from '../../src/gen/index.ts';
import { DEFAULT_LEVEL_CODE } from '../../src/game/defaultLevel.ts';
import type { InputDirection } from '../../src/model/index.ts';
import { walkToInputs } from '../helpers/solve.ts';

// Net finger travel per swipe, well over the module's threshold, per direction.
// Net finger travel per intent. Cardinals are pure axis swipes; the hex diagonals
// (never swiped on this square level) point at the flat-top hex headings, so the map
// covers the whole intent set.
const DELTA: Record<InputDirection, { dx: number; dy: number }> = {
  up: { dx: 0, dy: -60 },
  down: { dx: 0, dy: 60 },
  left: { dx: -60, dy: 0 },
  right: { dx: 60, dy: 0 },
  upRight: { dx: 52, dy: -30 },
  downRight: { dx: 52, dy: 30 },
  upLeft: { dx: -52, dy: -30 },
  downLeft: { dx: -52, dy: 30 },
};

const OPPOSITE: Record<InputDirection, InputDirection> = {
  up: 'down',
  down: 'up',
  left: 'right',
  right: 'left',
  upLeft: 'downRight',
  downRight: 'upLeft',
  upRight: 'downLeft',
  downLeft: 'upRight',
};

// Same generated default level the app boots; the walk is a proven perfect mow,
// so replaying it as swipes must drive the board to a win (mirrors the keyboard
// playthrough, but over the touch pipeline + real DOM wiring).
const { level, walk } = generate(decodeShortForm(DEFAULT_LEVEL_CODE));

// Dispatch a synthetic touch swipe (start → move → end) on the canvas centre.
// Desktop Chromium lacks a touchscreen but still exposes the Touch/TouchEvent
// constructors, which is enough to exercise the swipe listener end-to-end.
async function swipe(page: import('@playwright/test').Page, dx: number, dy: number): Promise<void> {
  await page.evaluate(
    ([dx, dy]) => {
      const canvas = document.querySelector('canvas.board') as HTMLCanvasElement;
      const rect = canvas.getBoundingClientRect();
      const x0 = rect.left + rect.width / 2;
      const y0 = rect.top + rect.height / 2;
      const mk = (x: number, y: number) =>
        new Touch({ identifier: 1, target: canvas, clientX: x, clientY: y });
      const fire = (type: string, x: number, y: number) => {
        const touches = type === 'touchend' ? [] : [mk(x, y)];
        canvas.dispatchEvent(
          new TouchEvent(type, {
            bubbles: true,
            cancelable: true,
            touches,
            targetTouches: touches,
            changedTouches: [mk(x, y)],
          }),
        );
      };
      fire('touchstart', x0, y0);
      fire('touchmove', x0 + dx / 2, y0 + dy / 2);
      fire('touchend', x0 + dx, y0 + dy);
    },
    [dx, dy] as const,
  );
}

test('plays the generated default level to a win with swipes', async ({ page }) => {
  const inputs = walkToInputs(level, walk);

  await page.goto(`/#${DEFAULT_LEVEL_CODE}`);
  const game = page.locator('#game');
  await expect(game).toHaveAttribute('data-status', 'playing');

  for (const input of inputs) {
    const { dx, dy } = DELTA[input];
    await swipe(page, dx, dy);
  }

  await expect(game).toHaveAttribute('data-status', 'won');
  await expect(page.locator('.status')).toContainText('You won');
});

test('a tap restarts after a crash', async ({ page }) => {
  const inputs = walkToInputs(level, walk);
  const first = inputs[0];

  await page.goto(`/#${DEFAULT_LEVEL_CODE}`);
  const game = page.locator('#game');

  // Swipe onto the first walk cell, then reverse straight back onto the mowed
  // start → hard fail. Layout-independent, mirrors the keyboard crash test.
  await swipe(page, DELTA[first].dx, DELTA[first].dy);
  await swipe(page, DELTA[OPPOSITE[first]].dx, DELTA[OPPOSITE[first]].dy);
  await expect(game).toHaveAttribute('data-status', 'lost');

  // A tap (sub-threshold gesture) is the touch restart.
  await swipe(page, 0, 0);
  await expect(game).toHaveAttribute('data-status', 'playing');
});
