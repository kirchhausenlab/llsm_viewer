import { expect, test } from '@playwright/test';
import { resolveDatasetFixture } from './helpers/dataset';
import { launchViewerFromFixture, STANDARD_VOXEL_RESOLUTION } from './helpers/workflows';

const fixture = resolveDatasetFixture();

test('@smoke playback controls work after launch', async ({ page }) => {
  const { timepointCount } = await launchViewerFromFixture(page, fixture, {
    channelName: 'Ch1',
    voxelResolution: STANDARD_VOXEL_RESOLUTION
  });

  const topMenu = page.locator('.viewer-top-menu');
  const playbackCounter = topMenu.locator('.viewer-top-menu-slider-counter--time');
  await expect(playbackCounter).toHaveText(`1/${timepointCount}`);

  const timepointSlider = topMenu.getByLabel('Timepoint').first();
  await timepointSlider.focus();
  for (let index = 1; index < timepointCount; index += 1) {
    await page.keyboard.press('ArrowRight');
  }
  await expect(playbackCounter).toHaveText(`${timepointCount}/${timepointCount}`);

  for (let index = 1; index < timepointCount; index += 1) {
    await page.keyboard.press('ArrowLeft');
  }
  await expect(playbackCounter).toHaveText(`1/${timepointCount}`);

  const startPlaybackButton = topMenu.getByRole('button', { name: 'Start playback' });
  await expect(startPlaybackButton).toBeVisible();
  await startPlaybackButton.evaluate((element) => {
    (element as HTMLButtonElement).click();
  });
  const pausePlaybackButton = topMenu.getByRole('button', { name: 'Pause playback' });
  await expect(pausePlaybackButton).toBeVisible();
  await pausePlaybackButton.evaluate((element) => {
    (element as HTMLButtonElement).click();
  });
  await expect(topMenu.getByRole('button', { name: 'Start playback' })).toBeVisible();

  await expect(topMenu.getByRole('button', { name: 'Reset view' })).toBeVisible();
});
