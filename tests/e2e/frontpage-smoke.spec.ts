import { expect, test } from '@playwright/test';
import { resolveDatasetFixture } from './helpers/dataset';
import { launchViewerFromFixture, STANDARD_VOXEL_RESOLUTION } from './helpers/workflows';

const fixture = resolveDatasetFixture();

test('@smoke can preprocess local TIFF fixture and launch viewer', async ({ page }) => {
  await launchViewerFromFixture(page, fixture, {
    channelName: 'Ch1',
    voxelResolution: STANDARD_VOXEL_RESOLUTION
  });
  await expect(
    page.getByRole('button', { name: /Start playback|Pause playback/ })
  ).toBeVisible();
});
