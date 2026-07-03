import { expect, test } from '@playwright/test';

// Moving to a new lawn pushes a browser-history entry, so the player can press
// Back to return to a previous lawn (and Forward to come back). Each level change
// is a real navigation, not an in-place URL rewrite.
test('level changes go into browser history — Back/Forward navigate lawns', async ({ page }) => {
  await page.goto('/');
  const game = page.locator('#game');
  const hash = () => new URL(page.url()).hash;

  await expect(game).toHaveAttribute('data-status', 'playing');
  await expect.poll(hash).not.toBe('');
  const first = hash();

  // Advance twice, collecting each lawn's code.
  await page.getByRole('button', { name: 'New lawn' }).click();
  await expect.poll(hash).not.toBe(first);
  const second = hash();

  await page.getByRole('button', { name: 'New lawn' }).click();
  await expect.poll(hash).not.toBe(second);
  const third = hash();

  // Back steps through the previously played lawns, restoring each into play.
  await page.goBack();
  await expect.poll(hash).toBe(second);
  await expect(game).toHaveAttribute('data-status', 'playing');

  await page.goBack();
  await expect.poll(hash).toBe(first);
  await expect(game).toHaveAttribute('data-status', 'playing');

  // Forward returns to a later lawn.
  await page.goForward();
  await expect.poll(hash).toBe(second);
  await expect(game).toHaveAttribute('data-status', 'playing');

  // Sanity: the three lawns really were distinct levels.
  expect(new Set([first, second, third]).size).toBe(3);
});
