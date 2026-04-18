import { expect, test, type Page } from '@playwright/test';

import { createCustomVolumeTiffPath } from './helpers/syntheticTiff';
import { launchViewerFromChannelFixtures, STANDARD_VOXEL_RESOLUTION } from './helpers/workflows';

async function openRoiManagerWindow(page: Page) {
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('menuitem', { name: 'ROI Manager' }).click();
  const roiManagerWindow = page.locator('.floating-window--roi-manager');
  await expect(roiManagerWindow.getByRole('heading', { name: 'ROI Manager' })).toBeVisible();
  return roiManagerWindow;
}

async function setWorkingRoi(page: Page, roi: {
  shape: 'line' | 'rectangle' | 'ellipse';
  mode: '2d' | '3d';
  start: { x: number; y: number; z: number };
  end: { x: number; y: number; z: number };
  color: string;
}) {
  await page.evaluate((nextRoi) => {
    const setter = (window as Window & {
      __LLSM_SET_WORKING_ROI__?: ((roi: typeof nextRoi | null) => boolean) | null;
    }).__LLSM_SET_WORKING_ROI__;
    if (typeof setter !== 'function') {
      throw new Error('__LLSM_SET_WORKING_ROI__ is unavailable');
    }
    setter(nextRoi);
  }, roi);
}

test('@smoke ROI measurements preserve uint16 intensity values after 16-bit preprocessing', async ({ page }) => {
  const tiffPath = createCustomVolumeTiffPath({
    width: 4,
    height: 4,
    depth: 1,
    dataType: 'uint16',
    label: 'roi-16bit',
    fill: () => 65535,
  });

  await launchViewerFromChannelFixtures(
    page,
    [{ name: 'U16', tiffPaths: [tiffPath] }],
    { voxelResolution: STANDARD_VOXEL_RESOLUTION, renderIn16Bit: true }
  );

  const channelsWindow = page.locator('.floating-window--channels');
  await channelsWindow.getByRole('button', { name: 'Close' }).click();
  await expect(channelsWindow).toHaveCount(0);

  const roiManagerWindow = await openRoiManagerWindow(page);
  await setWorkingRoi(page, {
    shape: 'rectangle',
    mode: '2d',
    start: { x: 0, y: 0, z: 0 },
    end: { x: 1, y: 1, z: 0 },
    color: '#FF00FF',
  });
  await roiManagerWindow.getByRole('button', { name: 'Add' }).click();
  await roiManagerWindow.locator('.roi-manager-list-item').first().click();
  await roiManagerWindow.getByRole('button', { name: 'Measure' }).click();

  const measurementsWindow = page.locator('.floating-window--measurements');
  await expect(measurementsWindow.getByRole('heading', { name: 'Measurements' })).toBeVisible();
  const firstRow = measurementsWindow.locator('.measurements-table tbody tr').first();
  await expect(firstRow).toContainText('65535');
});
