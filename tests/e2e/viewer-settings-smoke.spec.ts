import { expect, test } from '@playwright/test';
import { resolveDatasetFixture } from './helpers/dataset';
import { launchViewerFromFixture, STANDARD_VOXEL_RESOLUTION } from './helpers/workflows';

const fixture = resolveDatasetFixture();

test('@smoke viewer settings controls work after launch', async ({ page }) => {
  await launchViewerFromFixture(page, fixture, {
    channelName: 'Ch1',
    voxelResolution: STANDARD_VOXEL_RESOLUTION
  });

  await page.getByRole('button', { name: 'View', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Render settings' }).click();
  const viewerSettingsWindow = page.locator('.floating-window--viewer-settings');
  await expect(viewerSettingsWindow.getByRole('heading', { name: 'Render settings' })).toBeVisible();

  const blendingButton = viewerSettingsWindow.getByRole('button', {
    name: /Additive color blending|Alpha color blending/
  });
  await expect(blendingButton).toBeVisible();
  const initialBlendingLabel = (await blendingButton.textContent())?.trim();
  await blendingButton.evaluate((element) => {
    (element as HTMLButtonElement).click();
  });
  if (initialBlendingLabel === 'Additive color blending') {
    await expect(
      viewerSettingsWindow.getByRole('button', { name: 'Alpha color blending' })
    ).toBeVisible();
  } else {
    await expect(
      viewerSettingsWindow.getByRole('button', { name: 'Additive color blending' })
    ).toBeVisible();
  }

  const fpsSlider = viewerSettingsWindow.locator('#fps-slider');
  await expect(fpsSlider).toBeVisible();
  await expect(viewerSettingsWindow.locator('#volume-steps-slider')).toBeVisible();
  await fpsSlider.evaluate((element) => {
    const input = element as HTMLInputElement;
    input.value = '12';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect(fpsSlider).toHaveValue('12');

  await expect(viewerSettingsWindow.getByLabel(/MIP early exit/)).toBeVisible();

  await page.getByRole('button', { name: 'Close Render settings window' }).evaluate((element) => {
    (element as HTMLButtonElement).click();
  });
  await expect(viewerSettingsWindow).toBeHidden();
});
