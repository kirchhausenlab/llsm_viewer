import { expect, test } from '@playwright/test';

test('@visual front page initial state', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Mirante4D' })).toBeVisible();

  await expect(page).toHaveScreenshot('frontpage-initial.png', {
    fullPage: true
  });
});

test('@visual front page setup mode', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Set up new experiment' }).click();
  await expect(page.getByRole('heading', { name: 'Set up new experiment' })).toBeVisible();

  await expect(page).toHaveScreenshot('frontpage-setup.png', {
    fullPage: true
  });
});
