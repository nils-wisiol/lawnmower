import { expect, test } from '@playwright/test';

import { encodeShortForm } from '../../src/gen/index.ts';

// H5 UX integration (hexagonal.md §H5): the player can opt a *new* lawn into hex from
// the on-screen controls, the 6-way controls note teaches the extra keys, and a shared
// hex code round-trips through the URL hash — reproducing the exact level after reload.

// A known hex level to open by URL (deterministic from its seed, so a reload of the
// same hash reproduces the identical board by construction).
const HEX_CODE = encodeShortForm({ seed: 4242, width: 8, height: 6, coverage: 0.7, shape: 'hex' });

// These exercise the returning-visitor boot (no shared link → generated default), so
// mark the tutorial seen; a first-ever visit would open the tutorial lawn instead.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('lawnmower:v1:tutorial-seen', '1');
    } catch {
      /* ignore */
    }
  });
});

test('choosing Hex + New lawn generates a hex level and shows the 6-way note', async ({ page }) => {
  await page.goto('/');
  const game = page.locator('#game');
  await expect(game).toHaveAttribute('data-status', 'playing');

  // Square is the default: the 6-way hint stays hidden so the familiar game is unchanged.
  const hint = page.locator('.controls-hint');
  await expect(hint).toBeHidden();
  await expect.poll(() => new URL(page.url()).hash).toMatch(/^#\d+\.\d+\.\d+x\d+\.\d+$/);

  // Opt into hex: the note appears immediately, and "New lawn" now hands out a hex board
  // whose shareable code carries the explicit geometry tag.
  await page.locator('.shape-select').selectOption('hex');
  await expect(hint).toBeVisible();
  await expect(hint).toContainText('6 directions');

  await page.locator('.new-lawn').click();
  await expect(game).toHaveAttribute('data-status', 'playing');
  await expect.poll(() => new URL(page.url()).hash).toMatch(/^#3\.hex\.\d+\.\d+x\d+\.\d+$/);
  // The picker still reads hex and the note still teaches it.
  await expect(page.locator('.shape-select')).toHaveValue('hex');
  await expect(hint).toBeVisible();
});

test('a shared hex code reproduces the exact level after reload', async ({ page }) => {
  await page.goto(`/#${HEX_CODE}`);
  const game = page.locator('#game');
  await expect(game).toHaveAttribute('data-status', 'playing');
  // The shape picker reflects the loaded hex board and surfaces its controls note.
  await expect(page.locator('.shape-select')).toHaveValue('hex');
  await expect(page.locator('.controls-hint')).toBeVisible();
  // The URL still names the exact hex level — copying it shares that level.
  await expect.poll(() => new URL(page.url()).hash).toBe(`#${HEX_CODE}`);

  // Reload the shared link: the same hex level boots again (deterministic from its seed).
  await page.reload();
  await expect(game).toHaveAttribute('data-status', 'playing');
  await expect.poll(() => new URL(page.url()).hash).toBe(`#${HEX_CODE}`);
  await expect(page.locator('.shape-select')).toHaveValue('hex');
});
