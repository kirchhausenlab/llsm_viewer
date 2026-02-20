import { expect, test } from '@playwright/test';
import { resolveDatasetFixture } from './helpers/dataset';
import { launchViewerFromChannelFixtures, STANDARD_VOXEL_RESOLUTION } from './helpers/workflows';

const fixture = resolveDatasetFixture();

test('@nightly can launch with raw and segmentation channels and preserve per-channel controls', async ({ page }) => {
  test.setTimeout(6 * 60_000);

  // Nightly multi-channel scenarios can exceed browser storage quotas with full fixtures.
  // Use one timepoint per channel to keep coverage while staying within local limits.
  const reducedTimepointFixture = fixture.tiffPaths.slice(0, 1);

  await launchViewerFromChannelFixtures(
    page,
    [
      {
        name: 'Raw',
        tiffPaths: reducedTimepointFixture,
        segmentation: false
      },
      {
        name: 'Seg',
        tiffPaths: reducedTimepointFixture,
        segmentation: true
      }
    ],
    { voxelResolution: STANDARD_VOXEL_RESOLUTION }
  );

  const channelsWindow = page.locator('.floating-window--channels');
  await expect(channelsWindow.getByRole('heading', { name: 'Channels' })).toBeVisible();

  const channelTabs = channelsWindow.getByRole('tablist', { name: 'Volume channels' });
  await expect(channelTabs.getByRole('tab')).toHaveCount(2);

  const rawTab = channelTabs.getByRole('tab').nth(0);
  const segTab = channelTabs.getByRole('tab').nth(1);
  const invertButton = channelsWindow.getByRole('button', { name: 'Invert' });

  await rawTab.evaluate((element) => {
    (element as HTMLButtonElement).click();
  });
  await expect(rawTab).toHaveAttribute('aria-selected', 'true');
  await expect(invertButton).toBeEnabled();

  await segTab.evaluate((element) => {
    (element as HTMLButtonElement).click();
  });
  await expect(segTab).toHaveAttribute('aria-selected', 'true');
  await expect(invertButton).toBeDisabled();
  await expect(invertButton).toHaveAttribute('title', 'Invert LUT is unavailable for segmentation volumes.');

  const playbackWindow = page.locator('.floating-window--playback');
  await expect(playbackWindow.getByRole('heading', { name: 'Viewer controls' })).toBeVisible();
  await expect(playbackWindow.getByRole('button', { name: 'Reset view' })).toBeVisible();
  await expect(invertButton).toBeDisabled();
});
