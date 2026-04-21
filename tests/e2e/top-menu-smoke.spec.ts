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
    items: ['Channels', 'View selection', 'Screen capture', 'Backgrounds', 'Render settings', 'Camera settings', 'Hover settings']
  },
  {
    buttonLabel: 'Edit',
    menuLabel: 'edit menu',
    items: ['Props', 'Paintbrush', 'Draw ROI', 'ROI Manager', 'Set measurements']
  },
  {
    buttonLabel: 'Tracks',
    menuLabel: 'tracks menu',
    items: ['Tracks window', 'Amplitude plot', 'Plot settings', 'Tracks settings']
  },
  {
    buttonLabel: 'Help',
    menuLabel: 'help menu',
    items: ['About', 'Controls']
  }
] as const;

test('@smoke top menu shows the expected dropdown structure after launch', async ({ page }) => {
  test.setTimeout(300_000);

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
});
