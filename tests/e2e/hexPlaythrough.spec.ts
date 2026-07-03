import { expect, test } from '@playwright/test';

import { encodeShortForm, generate } from '../../src/gen/index.ts';
import { boardExtent, cellCenterPx } from '../../src/render/canvasRenderer.ts';
import type { CellId, InputDirection } from '../../src/model/index.ts';
import { walkToInputs } from '../helpers/solve.ts';

// The visible payoff of the hex work (hexagonal.md H3): a generated flat-top hex level
// renders and plays end-to-end in the real browser — over the hexagon-drawing renderer,
// the 6-way keys, and the pixel→hex hit-test — mirroring the square playthrough/clickmove
// e2es. The generator hands us the walk that proves the level solvable, so we drive that
// exact perfect mow (no hand-routed input list) and assert the win surfaces in the DOM.
const CONFIG = { seed: 7, width: 8, height: 6, coverage: 0.7, shape: 'hex' as const };
const CODE = encodeShortForm(CONFIG); // e.g. 3.hex.7.8x6.70
const { level, walk } = generate(CONFIG);

// Key per intent. A flat-top hex uses the vertical pair (arrows) plus the four Q/E/Z/C
// diagonals; left/right stay unmapped on hex (never pressed here) but the map is total.
const KEY: Record<InputDirection, string> = {
  up: 'ArrowUp',
  down: 'ArrowDown',
  left: 'ArrowLeft',
  right: 'ArrowRight',
  upLeft: 'q',
  upRight: 'e',
  downLeft: 'z',
  downRight: 'c',
};

// A cell's centre as a fraction of the board's on-screen box, from the renderer's own
// layout + outline-based extent — so the click lands on the true hex centre whatever
// cell size the board is fitted to (cellSize cancels out of the fraction).
const extent = boardExtent(level);
function cellFraction(cell: CellId): { fx: number; fy: number } {
  const { cx, cy } = cellCenterPx(level, cell, 1, extent);
  return { fx: cx / extent.width, fy: cy / extent.height };
}

async function clickCell(page: import('@playwright/test').Page, cell: CellId): Promise<void> {
  const { fx, fy } = cellFraction(cell);
  await page.evaluate(
    ([fx, fy]) => {
      const canvas = document.querySelector('canvas.board') as HTMLCanvasElement;
      const rect = canvas.getBoundingClientRect();
      const x = rect.left + fx * rect.width;
      const y = rect.top + fy * rect.height;
      canvas.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: x, clientY: y }));
    },
    [fx, fy] as const,
  );
}

test('plays a generated hex level to a win with the 6-way keys', async ({ page }) => {
  const inputs = walkToInputs(level, walk);

  await page.goto(`/#${CODE}`);
  const game = page.locator('#game');
  await expect(game).toHaveAttribute('data-status', 'playing');

  for (const input of inputs) {
    await page.keyboard.press(KEY[input]);
  }

  await expect(game).toHaveAttribute('data-status', 'won');
  await expect(page.locator('.status')).toContainText('You won');
});

test('plays a generated hex level to a win with click/tap-to-move', async ({ page }) => {
  // Prove the walk is drivable one legal neighbour at a time (fails loudly otherwise).
  walkToInputs(level, walk);

  await page.goto(`/#${CODE}`);
  const game = page.locator('#game');
  await expect(game).toHaveAttribute('data-status', 'playing');

  for (let i = 1; i < walk.length; i++) {
    await clickCell(page, walk[i]);
  }

  await expect(game).toHaveAttribute('data-status', 'won');
  await expect(page.locator('.status')).toContainText('You won');
});
