import { expect, test } from '@playwright/test';

import { createCustomVolumeTiffPath, createSyntheticVolumeMovieTiffPaths } from './helpers/syntheticTiff';
import { computePngBrightnessStats } from './helpers/png';
import { launchViewerFromChannelFixtures, STANDARD_VOXEL_RESOLUTION } from './helpers/workflows';

test('@smoke playback controls work on uint16 intensity datasets preprocessed in 16-bit mode', async ({ page }) => {
  const tiffPaths = createSyntheticVolumeMovieTiffPaths({
    timepoints: 3,
    width: 4,
    height: 4,
    depth: 2,
    dataType: 'uint16',
    seed: 11
  });
  const { timepointCount } = await launchViewerFromChannelFixtures(
    page,
    [{ name: 'U16 Playback', tiffPaths }],
    { voxelResolution: STANDARD_VOXEL_RESOLUTION, renderIn16Bit: true }
  );

  const topMenu = page.locator('.viewer-top-menu');
  const playbackCounter = topMenu.locator('.viewer-top-menu-slider-counter--time');
  await expect(playbackCounter).toHaveText(`1/${timepointCount}`);

  const timepointSlider = topMenu.getByLabel('Timepoint').first();
  await timepointSlider.focus();
  await page.keyboard.press('ArrowRight');
  await expect(playbackCounter).toHaveText(`2/${timepointCount}`);

  const startPlaybackButton = topMenu.getByRole('button', { name: 'Start playback' });
  await startPlaybackButton.click();
  const pausePlaybackButton = topMenu.getByRole('button', { name: 'Pause playback' });
  await expect(pausePlaybackButton).toBeVisible();
  await pausePlaybackButton.click();
  await expect(topMenu.getByRole('button', { name: 'Start playback' })).toBeVisible();
});

test('@smoke 16-bit rendering produces a non-black frame without WebGL upload warnings', async ({ page }) => {
  const consoleMessages: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'warning' || message.type() === 'error') {
      consoleMessages.push(message.text());
    }
  });

  const tiffPath = createCustomVolumeTiffPath({
    width: 12,
    height: 12,
    depth: 6,
    dataType: 'uint16',
    label: 'viewer-16bit-render',
    fill: () => 65535,
  });

  await launchViewerFromChannelFixtures(
    page,
    [{ name: 'U16 Render', tiffPaths: [tiffPath] }],
    { voxelResolution: STANDARD_VOXEL_RESOLUTION, renderIn16Bit: true }
  );

  await page.waitForTimeout(1200);
  await page.evaluate(async () => {
    const forceRender = (window as Window & { __LLSM_FORCE_RENDER__?: (() => boolean) | null }).__LLSM_FORCE_RENDER__;
    if (typeof forceRender === 'function') {
      forceRender();
      forceRender();
      forceRender();
    }
    await new Promise((resolve) => window.setTimeout(resolve, 50));
    return true;
  });
  const renderSurface = page.locator('.render-surface');
  await expect(renderSurface).toBeVisible();
  const screenshot = await renderSurface.screenshot();
  const brightness = computePngBrightnessStats(screenshot);

  expect(brightness.nonZeroPixels).toBeGreaterThan(0);
  expect(brightness.maxLuminance).toBeGreaterThan(0);
  expect(brightness.meanLuminance).toBeGreaterThan(1);
  expect(
    consoleMessages.some((message) =>
      message.includes('Attempt to use non-existing WebGL internal format') ||
      message.includes('glTexStorage3D: Invalid internal format')
    )
  ).toBe(false);
});

test('@smoke binary-like intensity datasets default to ISO rendering after 16-bit preprocessing', async ({ page }) => {
  const tiffPath = createCustomVolumeTiffPath({
    width: 8,
    height: 8,
    depth: 4,
    dataType: 'uint16',
    label: 'binary-16bit-default-iso',
    fill: (x, y, z) => ((x + y + z) % 3 === 0 ? 65535 : 0),
  });

  await launchViewerFromChannelFixtures(
    page,
    [{ name: 'Binary U16', tiffPaths: [tiffPath] }],
    { voxelResolution: STANDARD_VOXEL_RESOLUTION, renderIn16Bit: true }
  );

  await expect(page.getByLabel('Render mode')).toHaveValue('iso');
});
