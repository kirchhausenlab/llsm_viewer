import { expect, test } from '@playwright/test';
import { resolveDatasetFixture } from './helpers/dataset';
import { launchViewerFromFixture } from './helpers/workflows';

const fixture = resolveDatasetFixture();

test('@smoke top menu help and exit flows work after launch', async ({ page }) => {
  test.skip(!fixture.available, fixture.reason ?? 'Local TIFF fixture is unavailable.');

  await launchViewerFromFixture(page, fixture);

  await page.getByRole('button', { name: 'Help' }).click();
  const helpMenu = page.getByRole('menu', { name: 'help menu' });
  await expect(helpMenu).toBeVisible();
  await helpMenu.getByRole('menuitem', { name: 'Navigation controls' }).click();

  const navigationHeading = page.getByRole('heading', { name: 'Navigation controls' });
  await expect(navigationHeading).toBeVisible();
  await page.getByRole('button', { name: 'Close navigation controls' }).click();
  await expect(navigationHeading).toBeHidden();

  await page.getByRole('button', { name: 'File' }).click();
  const fileMenu = page.getByRole('menu', { name: 'file menu' });
  await expect(fileMenu).toBeVisible();
  const exitItem = fileMenu.getByRole('menuitem', { name: 'Exit' });
  await expect(exitItem).toBeVisible();
  const dialogHandled = new Promise<void>((resolve) => {
    page.once('dialog', async (dialog) => {
      await dialog.accept();
      resolve();
    });
  });
  await exitItem.click({ force: true });
  await dialogHandled;

  await expect(page.getByRole('heading', { name: 'Set up new experiment' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'File', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Preprocess experiment' })).toBeVisible();
});
