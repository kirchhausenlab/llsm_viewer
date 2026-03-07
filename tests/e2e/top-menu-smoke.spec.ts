import { expect, test } from '@playwright/test';

import { resolveDatasetFixture } from './helpers/dataset';
import { launchViewerFromFixture, STANDARD_VOXEL_RESOLUTION } from './helpers/workflows';

const fixture = resolveDatasetFixture();

const expectedMenus = [
  {
    buttonLabel: 'File',
    menuLabel: 'file menu',
    items: ['Save changes', 'Reset changes', 'Recenter windows', 'Diagnostics', 'Exit']
  },
  {
    buttonLabel: 'View',
    menuLabel: 'view menu',
    items: ['Channels window', 'Camera', 'Record', 'Background', 'Render settings', 'Hover settings']
  },
  {
    buttonLabel: 'Edit',
    menuLabel: 'edit menu',
    items: ['Props', 'Paintbrush', 'Measure']
  },
  {
    buttonLabel: 'Tracks',
    menuLabel: 'tracks menu',
    items: ['Tracks window', 'Amplitude plot', 'Tracks settings']
  },
  {
    buttonLabel: 'Help',
    menuLabel: 'help menu',
    items: ['About', 'Navigation controls']
  }
] as const;

test('@smoke top menu shows the expected dropdown structure after launch', async ({ page }) => {
  await launchViewerFromFixture(page, fixture, {
    channelName: 'Ch1',
    voxelResolution: STANDARD_VOXEL_RESOLUTION
  });

  await expect(page.locator('.viewer-top-menu-dropdown-trigger')).toHaveText(
    expectedMenus.map((entry) => entry.buttonLabel)
  );

  for (const entry of expectedMenus) {
    await page.getByRole('button', { name: entry.buttonLabel, exact: true }).click();
    const menu = page.getByRole('menu', { name: entry.menuLabel });
    await expect(menu).toBeVisible();
    await expect(menu.getByRole('menuitem')).toHaveText(entry.items);
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
  }

  await page.getByRole('button', { name: 'Help', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Navigation controls' }).click();
  const navigationWindow = page.locator('.navigation-help-window');
  await expect(navigationWindow).toBeVisible();
  await page.getByRole('button', { name: 'Close Navigation controls window' }).click();
  await expect(navigationWindow).toHaveCount(0);

  await page.getByRole('button', { name: 'File', exact: true }).click();
  const dialogHandled = new Promise<void>((resolve) => {
    page.once('dialog', async (dialog) => {
      await dialog.accept();
      resolve();
    });
  });
  await page.getByRole('menuitem', { name: 'Exit' }).click();
  await dialogHandled;
  await expect(page.getByRole('heading', { name: 'Set up new experiment' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'File', exact: true })).toHaveCount(0);
});
