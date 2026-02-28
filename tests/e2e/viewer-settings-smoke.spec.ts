import { expect, test } from '@playwright/test';
import { resolveDatasetFixture } from './helpers/dataset';
import { launchViewerFromFixture, STANDARD_VOXEL_RESOLUTION } from './helpers/workflows';

const fixture = resolveDatasetFixture();

test('@smoke viewer settings controls work after launch', async ({ page }) => {
  await launchViewerFromFixture(page, fixture, {
    channelName: 'Ch1',
    voxelResolution: STANDARD_VOXEL_RESOLUTION
  });

  await page.getByRole('button', { name: 'Show viewer settings window' }).evaluate((element) => {
    (element as HTMLButtonElement).click();
  });
  const viewerSettingsWindow = page.locator('.floating-window--viewer-settings');
  await expect(viewerSettingsWindow.getByRole('heading', { name: 'Viewer settings' })).toBeVisible();

  const samplingButton = viewerSettingsWindow.getByRole('button', { name: /Trilinear|Nearest/ });
  await expect(samplingButton).toBeVisible();
  const initialSamplingLabel = (await samplingButton.textContent())?.trim();
  await samplingButton.evaluate((element) => {
    (element as HTMLButtonElement).click();
  });
  if (initialSamplingLabel === 'Trilinear') {
    await expect(viewerSettingsWindow.getByRole('button', { name: 'Nearest' })).toBeVisible();
  } else {
    await expect(viewerSettingsWindow.getByRole('button', { name: 'Trilinear' })).toBeVisible();
  }

  const blendingButton = viewerSettingsWindow.getByRole('button', { name: /Additive|Alpha/ });
  await expect(blendingButton).toBeVisible();
  const initialBlendingLabel = (await blendingButton.textContent())?.trim();
  await blendingButton.evaluate((element) => {
    (element as HTMLButtonElement).click();
  });
  if (initialBlendingLabel === 'Additive') {
    await expect(viewerSettingsWindow.getByRole('button', { name: 'Alpha' })).toBeVisible();
  } else {
    await expect(viewerSettingsWindow.getByRole('button', { name: 'Additive' })).toBeVisible();
  }

  const fpsSlider = viewerSettingsWindow.locator('#fps-slider');
  await expect(fpsSlider).toBeVisible();
  await fpsSlider.evaluate((element) => {
    const input = element as HTMLInputElement;
    input.value = '12';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect(fpsSlider).toHaveValue('12');

  await page.getByRole('button', { name: 'Close viewer settings window' }).evaluate((element) => {
    (element as HTMLButtonElement).click();
  });
  await expect(viewerSettingsWindow).toBeHidden();
});
