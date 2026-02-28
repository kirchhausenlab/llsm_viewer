import { expect, test } from '@playwright/test';
import { resolveDatasetFixture } from './helpers/dataset';
import { launchViewerFromFixture, STANDARD_VOXEL_RESOLUTION } from './helpers/workflows';

const fixture = resolveDatasetFixture();

test('@smoke channels panel controls work after launch', async ({ page }) => {
  await launchViewerFromFixture(page, fixture, {
    channelName: 'Ch1',
    voxelResolution: STANDARD_VOXEL_RESOLUTION
  });

  const channelsWindow = page.locator('.floating-window--channels');
  await expect(channelsWindow.getByRole('heading', { name: 'Channels' })).toBeVisible();

  const invertButton = channelsWindow.getByRole('button', { name: 'Invert' });
  await expect(invertButton).toHaveAttribute('aria-pressed', 'false');
  await invertButton.evaluate((element) => {
    (element as HTMLButtonElement).click();
  });
  await expect(invertButton).toHaveAttribute('aria-pressed', 'true');
  await invertButton.evaluate((element) => {
    (element as HTMLButtonElement).click();
  });
  await expect(invertButton).toHaveAttribute('aria-pressed', 'false');

  const autoButton = channelsWindow.getByRole('button', { name: 'Auto' });
  await expect(autoButton).toBeEnabled();
  await autoButton.evaluate((element) => {
    (element as HTMLButtonElement).click();
  });

  const brightnessSlider = channelsWindow.getByLabel('Brightness');
  await expect(brightnessSlider).toBeVisible();
  await expect(brightnessSlider).toBeEnabled();
  await brightnessSlider.evaluate((element) => {
    const input = element as HTMLInputElement;
    input.value = '64';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });

  const blueTintButton = channelsWindow.getByRole('button', { name: 'Blue' });
  await blueTintButton.evaluate((element) => {
    (element as HTMLButtonElement).click();
  });
  await expect(blueTintButton).toHaveAttribute('aria-pressed', 'true');

  const customTintInput = channelsWindow.getByLabel('Choose custom tint color');
  await customTintInput.fill('#00ff00');
  await expect(customTintInput).toHaveValue('#00ff00');

  await channelsWindow.getByRole('button', { name: 'Reset' }).evaluate((element) => {
    (element as HTMLButtonElement).click();
  });
  await expect(invertButton).toHaveAttribute('aria-pressed', 'false');
  await expect(brightnessSlider).toBeVisible();
});
