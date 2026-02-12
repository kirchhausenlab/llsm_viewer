import { expect, test } from '@playwright/test';
import { resolveDatasetFixture } from './helpers/dataset';
import { launchViewerFromFixture } from './helpers/workflows';

const fixture = resolveDatasetFixture();

test('@smoke playback controls and viewer mode toggles work after launch', async ({ page }) => {
  test.skip(!fixture.available, fixture.reason ?? 'Local TIFF fixture is unavailable.');

  const { timepointCount } = await launchViewerFromFixture(page, fixture);

  const playbackWindow = page.locator('.floating-window--playback');
  await expect(playbackWindow.getByRole('heading', { name: 'Viewer controls' })).toBeVisible();

  const progressLabel = playbackWindow.locator('label[for="playback-slider"]');
  await expect(progressLabel).toContainText(`1 / ${timepointCount}`);

  await playbackWindow.getByRole('button', { name: 'Go to last frame' }).click();
  await expect(progressLabel).toContainText(`${timepointCount} / ${timepointCount}`);

  await playbackWindow.getByRole('button', { name: 'Go to first frame' }).click();
  await expect(progressLabel).toContainText(`1 / ${timepointCount}`);

  const startPlaybackButton = playbackWindow.getByRole('button', { name: 'Start playback' });
  await expect(startPlaybackButton).toBeVisible();
  await startPlaybackButton.click();
  const pausePlaybackButton = playbackWindow.getByRole('button', { name: 'Pause playback' });
  await expect(pausePlaybackButton).toBeVisible();
  await pausePlaybackButton.click();
  await expect(playbackWindow.getByRole('button', { name: 'Start playback' })).toBeVisible();

  await playbackWindow.getByRole('button', { name: '3D view' }).click();
  await expect(playbackWindow.getByRole('button', { name: '2D view' })).toBeVisible();
  await expect(playbackWindow.locator('#z-plane-slider')).toBeVisible();
  await playbackWindow.getByRole('button', { name: '2D view' }).click();
  await expect(playbackWindow.getByRole('button', { name: '3D view' })).toBeVisible();
});
