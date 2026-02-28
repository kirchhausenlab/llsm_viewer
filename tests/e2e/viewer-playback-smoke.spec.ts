import { expect, test } from '@playwright/test';
import { resolveDatasetFixture } from './helpers/dataset';
import { launchViewerFromFixture, STANDARD_VOXEL_RESOLUTION } from './helpers/workflows';

const fixture = resolveDatasetFixture();

test('@smoke playback controls work after launch', async ({ page }) => {
  const { timepointCount } = await launchViewerFromFixture(page, fixture, {
    channelName: 'Ch1',
    voxelResolution: STANDARD_VOXEL_RESOLUTION
  });

  const playbackWindow = page.locator('.floating-window--playback');
  await expect(playbackWindow.getByRole('heading', { name: 'Viewer controls' })).toBeVisible();

  const progressLabel = playbackWindow.locator('label[for="playback-slider"]');
  await expect(progressLabel).toContainText(`1 / ${timepointCount}`);

  await playbackWindow.getByRole('button', { name: 'Go to last frame' }).evaluate((element) => {
    (element as HTMLButtonElement).click();
  });
  await expect(progressLabel).toContainText(`${timepointCount} / ${timepointCount}`);

  await playbackWindow.getByRole('button', { name: 'Go to first frame' }).evaluate((element) => {
    (element as HTMLButtonElement).click();
  });
  await expect(progressLabel).toContainText(`1 / ${timepointCount}`);

  const startPlaybackButton = playbackWindow.getByRole('button', { name: 'Start playback' });
  await expect(startPlaybackButton).toBeVisible();
  await startPlaybackButton.evaluate((element) => {
    (element as HTMLButtonElement).click();
  });
  const pausePlaybackButton = playbackWindow.getByRole('button', { name: 'Pause playback' });
  await expect(pausePlaybackButton).toBeVisible();
  await pausePlaybackButton.evaluate((element) => {
    (element as HTMLButtonElement).click();
  });
  await expect(playbackWindow.getByRole('button', { name: 'Start playback' })).toBeVisible();

  await expect(playbackWindow.getByRole('button', { name: 'Reset view' })).toBeVisible();
});
