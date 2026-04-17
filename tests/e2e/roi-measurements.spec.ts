import fs from 'node:fs';

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

async function addSavedRoi(page: Page, roiManagerWindow: ReturnType<Page['locator']>, roi: Parameters<typeof setWorkingRoi>[1]) {
  await setWorkingRoi(page, roi);
  await expect(roiManagerWindow.getByRole('button', { name: 'Add' })).toBeEnabled();
  await roiManagerWindow.getByRole('button', { name: 'Add' }).click();
}

test.describe('ROI measurements', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      delete (window as Window & { showSaveFilePicker?: unknown }).showSaveFilePicker;
      delete (window as Window & { showOpenFilePicker?: unknown }).showOpenFilePicker;
    });
  });

  test('ROI manager multi-selection opens a measurements snapshot with ordered rows', async ({ page }) => {
    const channelATiff = createCustomVolumeTiffPath({
      width: 4,
      height: 4,
      depth: 4,
      label: 'roi-measure-a',
      fill: () => 10,
    });
    const channelBTiff = createCustomVolumeTiffPath({
      width: 4,
      height: 4,
      depth: 4,
      label: 'roi-measure-b',
      fill: () => 20,
    });

    await launchViewerFromChannelFixtures(
      page,
      [
        { name: 'Ch1', tiffPaths: [channelATiff] },
        { name: 'Ch2', tiffPaths: [channelBTiff] },
      ],
      { voxelResolution: STANDARD_VOXEL_RESOLUTION }
    );
    const channelsWindow = page.locator('.floating-window--channels');
    await channelsWindow.getByRole('button', { name: 'Close' }).click();
    await expect(channelsWindow).toHaveCount(0);

    const roiManagerWindow = await openRoiManagerWindow(page);

    await addSavedRoi(page, roiManagerWindow, {
      shape: 'rectangle',
      mode: '2d',
      start: { x: 0, y: 0, z: 0 },
      end: { x: 1, y: 1, z: 0 },
      color: '#FF00FF',
    });
    await addSavedRoi(page, roiManagerWindow, {
      shape: 'rectangle',
      mode: '2d',
      start: { x: 2, y: 2, z: 0 },
      end: { x: 2, y: 2, z: 0 },
      color: '#00FFAA',
    });

    const roiButtons = roiManagerWindow.locator('.roi-manager-list-item');
    await expect(roiButtons).toHaveCount(2);
    await roiButtons.nth(0).click();
    await roiButtons.nth(1).click({ modifiers: ['Shift'] });

    await expect(roiManagerWindow.locator('.roi-manager-selection-badge.is-active')).toHaveText(['1']);
    await expect(roiManagerWindow.locator('.roi-manager-selection-badge:not(.is-active)')).toHaveText(['2']);

    await roiManagerWindow.getByRole('button', { name: 'Measure' }).click();
    const measurementsWindow = page.locator('.floating-window--measurements');
    await expect(measurementsWindow.getByRole('heading', { name: 'Measurements' })).toBeVisible();

    const rows = measurementsWindow.locator('.measurements-table tbody tr');
    await expect(rows).toHaveCount(4);
    await expect(rows.nth(0)).toContainText('1');
    await expect(rows.nth(0)).toContainText('Ch1');
    await expect(rows.nth(0)).toContainText('4');
    await expect(rows.nth(0)).toContainText('10.000');
    await expect(rows.nth(1)).toContainText('Ch2');
    await expect(rows.nth(1)).toContainText('20.000');
    await expect(rows.nth(2)).toContainText('2');
    await expect(rows.nth(2)).toContainText('1');
  });

  test('ROI manager can export the current ROI state as JSON', async ({ page }) => {
    const channelATiff = createCustomVolumeTiffPath({
      width: 4,
      height: 4,
      depth: 4,
      label: 'roi-save-a',
      fill: () => 10,
    });

    await launchViewerFromChannelFixtures(
      page,
      [{ name: 'Ch1', tiffPaths: [channelATiff] }],
      { voxelResolution: STANDARD_VOXEL_RESOLUTION }
    );
    const channelsWindow = page.locator('.floating-window--channels');
    await channelsWindow.getByRole('button', { name: 'Close' }).click();
    await expect(channelsWindow).toHaveCount(0);

    const roiManagerWindow = await openRoiManagerWindow(page);
    await addSavedRoi(page, roiManagerWindow, {
      shape: 'rectangle',
      mode: '2d',
      start: { x: 0, y: 0, z: 0 },
      end: { x: 1, y: 1, z: 0 },
      color: '#FF00FF',
    });
    await expect(roiManagerWindow.locator('.roi-manager-list-item')).toHaveCount(1);
    const downloadPromise = page.waitForEvent('download');
    await roiManagerWindow.getByRole('button', { name: 'Save' }).click();
    const download = await downloadPromise;
    const downloadPath = await download.path();
    if (!downloadPath) {
      throw new Error('ROI JSON download path is unavailable.');
    }
    const savedJson = JSON.parse(fs.readFileSync(downloadPath, 'utf8')) as {
      version: number;
      savedRois: Array<{ id: string; name: string }>;
      selectedSavedRoiIds: string[];
      activeSavedRoiId: string | null;
    };
    expect(savedJson.version).toBe(1);
    expect(savedJson.savedRois).toHaveLength(1);
    expect(savedJson.selectedSavedRoiIds).toHaveLength(1);
    expect(savedJson.activeSavedRoiId).toBe(savedJson.savedRois[0]!.id);
  });
});
