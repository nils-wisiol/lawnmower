import { expect, test } from '@playwright/test';

test('blank scaffold page loads', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Lawnmower');
  await expect(page.getByRole('heading', { name: 'Lawnmower' })).toBeVisible();
});
