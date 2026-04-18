import { expect, test, type Page } from '@playwright/test';

import {
  averageAbsoluteDifference,
  collectPrimaryCanvasMetrics,
  forceViewerRender,
} from './helpers/canvasMetrics';
import { createSyntheticVolumeMovieTiffPaths } from './helpers/syntheticTiff';
import { launchViewerFromChannelFixtures, STANDARD_VOXEL_RESOLUTION } from './helpers/workflows';

async function openCameraSettings(page: Page) {
  await page.getByRole('button', { name: 'View', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Camera settings' }).click();
  const viewerSettingsWindow = page.locator('.floating-window--camera-settings');
  await expect(viewerSettingsWindow.getByRole('heading', { name: 'Camera settings' })).toBeVisible();
  return viewerSettingsWindow;
}

async function openChannelsWindow(page: Page) {
  await page.getByRole('button', { name: 'View', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Channels' }).click();
  const channelsWindow = page.locator('.floating-window--channels');
  await expect(channelsWindow.getByRole('heading', { name: 'Channels' })).toBeVisible();
  return channelsWindow;
}

test('@smoke orthographic rendering remains visible and nearly invariant under W/S motion', async ({ page }) => {
  const tiffPaths = createSyntheticVolumeMovieTiffPaths({ seed: 17 });

  await launchViewerFromChannelFixtures(
    page,
    [{ name: 'Ortho Stability', tiffPaths }],
    { voxelResolution: STANDARD_VOXEL_RESOLUTION }
  );

  const viewerSettingsWindow = await openCameraSettings(page);
  const isometricButton = viewerSettingsWindow.getByRole('button', { name: 'Isometric', exact: true });
  await isometricButton.evaluate((element) => {
    (element as HTMLButtonElement).click();
  });
  await expect(isometricButton).toHaveAttribute('aria-pressed', 'true');

  await forceViewerRender(page);
  const before = await collectPrimaryCanvasMetrics(page);
  expect(before.nonBlackSamples).toBeGreaterThan(0);
  expect(before.avgLuma).toBeGreaterThan(0);

  await page.keyboard.press('KeyW');
  await forceViewerRender(page);
  const afterW = await collectPrimaryCanvasMetrics(page);

  expect(afterW.nonBlackSamples).toBeGreaterThan(0);
  expect(afterW.avgLuma).toBeGreaterThan(0);
  expect(averageAbsoluteDifference(before.sampleGrid, afterW.sampleGrid)).toBeLessThan(8);

  await page.keyboard.press('KeyS');
  await forceViewerRender(page);
  const afterReturn = await collectPrimaryCanvasMetrics(page);
  expect(afterReturn.nonBlackSamples).toBeGreaterThan(0);
  expect(averageAbsoluteDifference(before.sampleGrid, afterReturn.sampleGrid)).toBeLessThan(6);
});

test('@smoke display sliders do not blank the volume in perspective or orthographic', async ({ page }) => {
  const tiffPaths = createSyntheticVolumeMovieTiffPaths({ seed: 23 });

  await launchViewerFromChannelFixtures(
    page,
    [{ name: 'Slider Stability', tiffPaths }],
    { voxelResolution: STANDARD_VOXEL_RESOLUTION }
  );

  const channelsWindow = await openChannelsWindow(page);
  const viewerSettingsWindow = await openCameraSettings(page);
  const isometricButton = viewerSettingsWindow.getByRole('button', { name: 'Isometric', exact: true });
  const perspectiveButton = viewerSettingsWindow.getByRole('button', { name: 'Perspective', exact: true });

  const ensureVisible = async () => {
    await forceViewerRender(page);
    const metrics = await collectPrimaryCanvasMetrics(page);
    expect(metrics.nonBlackSamples).toBeGreaterThan(0);
    expect(metrics.avgLuma).toBeGreaterThan(0);
  };

  const minimumSlider = channelsWindow.locator('input[id^="layer-window-min-"]').first();
  const maximumSlider = channelsWindow.locator('input[id^="layer-window-max-"]').first();
  const brightnessSlider = channelsWindow.getByLabel('Brightness');
  const contrastSlider = channelsWindow.getByLabel('Contrast');

  const setRangeValue = async (locator: typeof minimumSlider, value: string) => {
    await locator.evaluate((element, nextValue) => {
      const input = element as HTMLInputElement;
      input.value = String(nextValue);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, value);
  };

  await ensureVisible();
  await setRangeValue(minimumSlider, '0.95');
  await ensureVisible();
  await setRangeValue(maximumSlider, '0.96');
  await ensureVisible();
  await setRangeValue(brightnessSlider, '0');
  await ensureVisible();
  await setRangeValue(contrastSlider, '0');
  await ensureVisible();
  await channelsWindow.getByRole('button', { name: 'Reset' }).evaluate((element) => {
    (element as HTMLButtonElement).click();
  });
  await ensureVisible();

  await isometricButton.evaluate((element) => {
    (element as HTMLButtonElement).click();
  });
  await expect(isometricButton).toHaveAttribute('aria-pressed', 'true');
  await ensureVisible();
  await setRangeValue(minimumSlider, '0.95');
  await ensureVisible();
  await setRangeValue(maximumSlider, '0.96');
  await ensureVisible();
  await setRangeValue(brightnessSlider, '0');
  await ensureVisible();
  await setRangeValue(contrastSlider, '0');
  await ensureVisible();
  await channelsWindow.getByRole('button', { name: 'Reset' }).evaluate((element) => {
    (element as HTMLButtonElement).click();
  });
  await ensureVisible();

  await perspectiveButton.evaluate((element) => {
    (element as HTMLButtonElement).click();
  });
  await expect(perspectiveButton).toHaveAttribute('aria-pressed', 'true');
  await ensureVisible();
});
