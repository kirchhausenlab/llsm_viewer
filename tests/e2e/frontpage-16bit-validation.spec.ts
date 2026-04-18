import { expect, test } from '@playwright/test';

import { createCustomVolumeTiffPath } from './helpers/syntheticTiff';
import { STANDARD_VOXEL_RESOLUTION } from './helpers/workflows';

async function configureSingleChannel(page: import('@playwright/test').Page, name: string, tiffPath: string) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Set up new experiment' }).click();
  await expect(page.getByRole('heading', { name: 'Set up new experiment' })).toBeVisible();
  await page.getByRole('button', { name: '3D movie' }).click();
  await page.getByLabel('X:').fill(STANDARD_VOXEL_RESOLUTION.x);
  await page.getByLabel('Y:').fill(STANDARD_VOXEL_RESOLUTION.y);
  await page.getByLabel('Z:').fill(STANDARD_VOXEL_RESOLUTION.z);

  await page.getByRole('button', { name: '+ Add channel' }).click();
  const channelSection = page
    .locator('.setup-section')
    .filter({ has: page.getByRole('heading', { name: 'Channels' }) })
    .first();
  const channelTab = channelSection.locator('.setup-row [role="tab"]').first();
  await channelTab.click();
  await channelTab.dblclick();
  const nameInput = channelTab.locator('.channel-name-input');
  await expect(nameInput).toBeVisible();
  await nameInput.fill(name);
  await nameInput.press('Enter');

  const channelRow = channelTab.locator('xpath=ancestor::*[@role="listitem"][1]').first();
  await channelRow.locator('input[type="file"][accept*=".tif"]').setInputFiles([tiffPath]);
}

test('front page blocks 16-bit preprocessing when all non-segmentation inputs are 8-bit', async ({ page }) => {
  const uint8Path = createCustomVolumeTiffPath({
    width: 4,
    height: 4,
    depth: 1,
    dataType: 'uint8',
    label: 'frontpage-8bit-only',
    fill: () => 42,
  });

  await configureSingleChannel(page, '8-bit only', uint8Path);
  await page.getByRole('checkbox', { name: 'Render in 16bit' }).check();
  await page.getByRole('button', { name: 'Preprocess experiment' }).click();

  await expect(page.getByText('Render in 16bit is only useful', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Launch viewer' })).toHaveCount(0);
});

test('front page allows 16-bit preprocessing when a non-segmentation input is higher precision', async ({ page }) => {
  const uint16Path = createCustomVolumeTiffPath({
    width: 4,
    height: 4,
    depth: 1,
    dataType: 'uint16',
    label: 'frontpage-16bit-ok',
    fill: () => 65535,
  });

  await configureSingleChannel(page, '16-bit input', uint16Path);
  await page.getByRole('checkbox', { name: 'Render in 16bit' }).check();
  await page.getByRole('button', { name: 'Preprocess experiment' }).click();

  await expect(page.getByRole('button', { name: 'Launch viewer' })).toBeVisible({ timeout: 240_000 });
  await expect(page.locator('.warning-window-message')).toHaveCount(0);
});
