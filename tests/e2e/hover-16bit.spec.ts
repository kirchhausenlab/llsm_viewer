import { expect, test } from '@playwright/test';

import { createCustomVolumeTiffPath } from './helpers/syntheticTiff';
import { launchViewerFromChannelFixtures, STANDARD_VOXEL_RESOLUTION } from './helpers/workflows';

test('@smoke hover reports full-range uint16 values after 16-bit preprocessing', async ({ page }) => {
  const tiffPath = createCustomVolumeTiffPath({
    width: 4,
    height: 4,
    depth: 4,
    dataType: 'uint16',
    label: 'hover-16bit',
    fill: () => 65535,
  });

  await launchViewerFromChannelFixtures(
    page,
    [{ name: 'U16', tiffPaths: [tiffPath] }],
    { voxelResolution: STANDARD_VOXEL_RESOLUTION, renderIn16Bit: true }
  );

  const surface = page.locator('.render-surface');
  await expect(surface).toBeVisible();
  const box = await surface.boundingBox();
  expect(box).not.toBeNull();
  if (!box) {
    return;
  }

  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await page.waitForTimeout(150);

  await expect(page.locator('.viewer-top-menu-intensity')).toContainText('65535');
});
