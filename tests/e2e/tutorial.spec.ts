import { expect, test } from '@playwright/test';

// M6 onboarding. A first-ever visit (empty storage) opens the tutorial lawn with a
// coach that teaches the rules; the coach advances as you play, and a returning
// visitor instead lands straight on a generated lawn. The tutorial stays reachable
// by its reserved #tutorial code.

/** Mark the tutorial as already seen, simulating a returning visitor. */
async function markTutorialSeen(page: import('@playwright/test').Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('lawnmower:v1:tutorial-seen', '1');
    } catch {
      /* private mode — the app just re-shows the tutorial, harmless here */
    }
  });
}

test('a first visit opens the tutorial with a coach that advances on a move', async ({ page }) => {
  await page.goto('/');
  const game = page.locator('#game');
  const coach = page.locator('.coach');

  await expect(game).toHaveAttribute('data-status', 'playing');
  await expect.poll(() => new URL(page.url()).hash).toBe('#tutorial');
  await expect(coach).toBeVisible();
  const startText = (await coach.textContent())?.trim();
  expect(startText).toBeTruthy();

  // A first move swaps the coach from the opening prompt to the "keep mowing" tip.
  await page.keyboard.press('ArrowRight');
  await expect(game).toHaveAttribute('data-status', 'playing');
  await expect(coach).not.toHaveText(startText!);
});

test('a returning visitor boots a generated lawn with no coach', async ({ page }) => {
  await markTutorialSeen(page);
  await page.goto('/');

  await expect(page.locator('#game')).toHaveAttribute('data-status', 'playing');
  await expect.poll(() => new URL(page.url()).hash).not.toBe('#tutorial');
  await expect(page.locator('.coach')).toBeHidden();
});

test('the tutorial is reachable by its #tutorial code, coach included', async ({ page }) => {
  // Even for a returning visitor, opening the reserved code loads the tutorial lawn.
  await markTutorialSeen(page);
  await page.goto('/#tutorial');

  await expect(page.locator('#game')).toHaveAttribute('data-status', 'playing');
  await expect.poll(() => new URL(page.url()).hash).toBe('#tutorial');
  await expect(page.locator('.coach')).toBeVisible();
});
