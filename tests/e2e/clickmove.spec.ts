import { expect, test } from '@playwright/test';

import { decodeShortForm, generate } from '../../src/gen/index.ts';
import { DEFAULT_LEVEL_CODE } from '../../src/game/defaultLevel.ts';
import type { CellId, Level } from '../../src/model/index.ts';
import { walkToInputs } from '../helpers/solve.ts';

// Same generated default level the app boots. Click/tap-to-move (hexagonal.md §2.6)
// is a new modality alongside keys/swipe: replaying the generator's perfect walk as
// clicks on each successive cell must drive the board to a win, over the real
// pixel→cell hit-test (renderer.cellAtPixel) and the app's pointer wiring.
const { level, walk } = generate(decodeShortForm(DEFAULT_LEVEL_CODE));

/** Grid extent in cell units, matching the renderer's own `bounds`. */
function boardBounds(level: Level): { minX: number; minY: number; cols: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  for (const cell of level.topology.cells) {
    const { x, y } = level.topology.layout(cell);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
  }
  return { minX, minY, cols: maxX - minX + 1 };
}
const { minX, minY, cols } = boardBounds(level);

/** The 0-based cell-unit offset of a cell from the board's top-left origin. */
function cellOffset(cell: CellId): { lx: number; ly: number } {
  const { x, y } = level.topology.layout(cell);
  return { lx: x - minX, ly: y - minY };
}

// Dispatch a synthetic mouse click at the CSS-pixel centre of a board cell, computed
// from the level's own layout so the test mirrors the renderer's cell placement
// (cellSize = canvas CSS width / columns) without reaching into private renderer state.
async function clickCell(page: import('@playwright/test').Page, cell: CellId): Promise<void> {
  const { lx, ly } = cellOffset(cell);
  await page.evaluate(
    ([lx, ly, cols]) => {
      const canvas = document.querySelector('canvas.board') as HTMLCanvasElement;
      const rect = canvas.getBoundingClientRect();
      const cellSize = rect.width / cols;
      const x = rect.left + (lx + 0.5) * cellSize;
      const y = rect.top + (ly + 0.5) * cellSize;
      canvas.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: x, clientY: y }));
    },
    [lx, ly, cols] as const,
  );
}

test('plays the generated default level to a win with click-to-move', async ({ page }) => {
  // Prove the walk is drivable one legal neighbour at a time (fails loudly otherwise).
  walkToInputs(level, walk);

  await page.goto(`/#${DEFAULT_LEVEL_CODE}`);
  const game = page.locator('#game');
  await expect(game).toHaveAttribute('data-status', 'playing');

  for (let i = 1; i < walk.length; i++) {
    await clickCell(page, walk[i]);
  }

  await expect(game).toHaveAttribute('data-status', 'won');
  await expect(page.locator('.status')).toContainText('You won');
});

test('a mid-play click on the current (non-neighbour) cell is a no-op', async ({ page }) => {
  await page.goto(`/#${DEFAULT_LEVEL_CODE}`);
  const game = page.locator('#game');
  await expect(game).toHaveAttribute('data-status', 'playing');

  const before = await page.locator('.status').textContent();
  // Click the mower's own start cell: it is not a neighbour of itself, so the tap
  // hit-tests to a blocked move — progress must be untouched (§2.6).
  await clickCell(page, walk[0]);

  await expect(game).toHaveAttribute('data-status', 'playing');
  expect(await page.locator('.status').textContent()).toBe(before);
});

test('a click restarts the lawn after a crash (desktop tap analogue)', async ({ page }) => {
  await page.goto(`/#${DEFAULT_LEVEL_CODE}`);
  const game = page.locator('#game');

  // Step onto the first walk cell, then back onto the mowed start → hard fail.
  await clickCell(page, walk[1]);
  await clickCell(page, walk[0]);
  await expect(game).toHaveAttribute('data-status', 'lost');

  // On a finished lawn a click falls back to restart (there is no N key on touch).
  await clickCell(page, walk[0]);
  await expect(game).toHaveAttribute('data-status', 'playing');
});
