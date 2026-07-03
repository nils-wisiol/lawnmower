import { expect, test } from '@playwright/test';

// On a phone there is no N key, so the "New lawn" button is the tap equivalent:
// it hands out a fresh lawn. Boot syncs the current lawn's code into the URL hash,
// so advancing is observable as the hash changing to a different level code.
test('the New lawn button advances to a fresh lawn (tap equivalent of N)', async ({ page }) => {
  await page.goto('/');
  const game = page.locator('#game');
  await expect(game).toHaveAttribute('data-status', 'playing');

  await expect.poll(() => new URL(page.url()).hash).not.toBe('');
  const before = new URL(page.url()).hash;

  await page.getByRole('button', { name: 'New lawn' }).click();

  await expect(game).toHaveAttribute('data-status', 'playing');
  await expect.poll(() => new URL(page.url()).hash).not.toBe(before);
});
