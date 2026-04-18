import fs from 'node:fs/promises';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

import { createSyntheticVolumeMovieTiffPaths } from './helpers/syntheticTiff';
import { launchViewerFromChannelFixtures, STANDARD_VOXEL_RESOLUTION } from './helpers/workflows';

function buildTrackCsvBuffer(): Buffer {
  const rows = [
    ['1', '0', '0', '10', '10', '5', '100', '0'],
    ['1', '0', '1', '11', '11', '5', '110', '0'],
    ['1', '0', '2', '12', '12', '5', '120', '0'],
  ];
  return Buffer.from(rows.map((row) => row.join(',')).join('\n'));
}

async function disableFilePickers(page: Page) {
  await page.addInitScript(() => {
    delete (window as Window & { showSaveFilePicker?: unknown }).showSaveFilePicker;
    delete (window as Window & { showOpenFilePicker?: unknown }).showOpenFilePicker;
  });
}

async function openCameraWindow(page: Page) {
  await page.getByRole('button', { name: 'View', exact: true }).click();
  await page.getByRole('menuitem', { name: 'View selection', exact: true }).click();
  await expect(page.locator('.floating-window--camera').getByRole('heading', { name: 'View selection' })).toBeVisible();
}

async function getCameraDebugState(page: Page) {
  return page.evaluate(() => {
    const getter = (
      window as Window & {
        __LLSM_CAMERA_WINDOW_STATE__?: (() => {
          cameraWindowState: {
            cameraPosition: { x: number; y: number; z: number };
            cameraRotation: { yaw: number; pitch: number; roll: number };
          } | null;
          translationSpeedMultiplier: number;
          rotationSpeedMultiplier: number;
          savedViews: Array<{
            id: string;
            label: string;
            mode: 'free-roam' | 'voxel-follow';
            cameraPosition: { x: number; y: number; z: number };
            cameraRotation: { yaw: number; pitch: number; roll: number };
            followedVoxel?: { x: number; y: number; z: number };
          }>;
          selectedCameraViewId: string | null;
          volumeShapeZYX: [number, number, number];
          followedTrackId: string | null;
          followedVoxel: { x: number; y: number; z: number } | null;
        }) | null;
      }
    ).__LLSM_CAMERA_WINDOW_STATE__;
    return getter ? getter() : null;
  });
}

async function waitForCameraState(page: Page) {
  await page.waitForFunction(() => {
    const getter = (
      window as Window & {
        __LLSM_CAMERA_WINDOW_STATE__?: (() => { cameraWindowState: unknown } | null) | null;
      }
    ).__LLSM_CAMERA_WINDOW_STATE__;
    return Boolean(getter && getter()?.cameraWindowState);
  });
}

async function setCameraDraft(
  page: Page,
  {
    position,
    rotation,
  }: {
    position?: Partial<{ x: number; y: number; z: number }>;
    rotation?: Partial<{ yaw: number; pitch: number; roll: number }>;
  },
) {
  const assignSpinbutton = async (selector: string, value: number) => {
    const input = page.locator(selector);
    await expect(input).toBeVisible();
    await input.fill(String(value));
    await expect(input).toHaveValue(String(value));
  };
  const assignRange = async (selector: string, value: number) => {
    const input = page.locator(selector);
    await expect(input).toBeVisible();
    await input.evaluate((element, nextValue) => {
      const target = element as HTMLInputElement;
      target.value = String(nextValue);
      target.dispatchEvent(new Event('input', { bubbles: true }));
      target.dispatchEvent(new Event('change', { bubbles: true }));
    }, value);
    await expect(input).toHaveValue(String(value));
  };

  if (position?.x !== undefined) {
    await assignSpinbutton('#camera-position-x', position.x);
  }
  if (position?.y !== undefined) {
    await assignSpinbutton('#camera-position-y', position.y);
  }
  if (position?.z !== undefined) {
    await assignSpinbutton('#camera-position-z', position.z);
  }
  if (rotation?.yaw !== undefined) {
    await assignRange('#camera-rotation-yaw', rotation.yaw);
  }
  if (rotation?.pitch !== undefined) {
    await assignRange('#camera-rotation-pitch', rotation.pitch);
  }
  if (rotation?.roll !== undefined) {
    await assignRange('#camera-rotation-roll', rotation.roll);
  }
}

async function setFollowVoxelDraft(page: Page, coordinate: { x: number; y: number; z: number }) {
  const assign = async (selector: string, value: number) => {
    const input = page.locator(selector);
    await expect(input).toBeVisible();
    await input.fill(String(value));
    await expect(input).toHaveValue(String(value));
  };
  await assign('#camera-follow-x', coordinate.x + 1);
  await assign('#camera-follow-y', coordinate.y + 1);
  await assign('#camera-follow-z', coordinate.z + 1);
}

async function clickCameraButton(page: Page, label: string) {
  await page.locator('.floating-window--camera').getByRole('button', { name: label, exact: true }).click({ force: true });
}

test('@smoke camera window updates free-roam pose and saves free-roam views', async ({ page }) => {
  await disableFilePickers(page);
  const tiffPaths = createSyntheticVolumeMovieTiffPaths({ seed: 21 });
  await launchViewerFromChannelFixtures(
    page,
    [
      {
        name: 'Camera Window',
        tiffPaths,
      },
    ],
    { voxelResolution: STANDARD_VOXEL_RESOLUTION },
  );
  await openCameraWindow(page);
  await waitForCameraState(page);

  const initialState = await getCameraDebugState(page);
  expect(initialState?.cameraWindowState).not.toBeNull();
  const initialPosition = initialState!.cameraWindowState!.cameraPosition;
  const updatedPosition = {
    x: initialPosition.x,
    y: initialPosition.y,
    z: Number((initialPosition.z + 5).toFixed(3)),
  };

  await setCameraDraft(page, {
    position: updatedPosition,
  });
  await clickCameraButton(page, 'Update view');
  await expect
    .poll(async () => Number(await page.locator('#camera-position-z').inputValue()))
    .toBeCloseTo(updatedPosition.z, 1);
  console.log('camera update applied');

  await clickCameraButton(page, 'Add');

  const secondPosition = {
    x: updatedPosition.x,
    y: updatedPosition.y,
    z: Number((updatedPosition.z + 3).toFixed(3)),
  };
  await setCameraDraft(page, {
    position: { z: secondPosition.z },
  });
  await clickCameraButton(page, 'Update view');
  await clickCameraButton(page, 'Add');

  await expect(page.locator('.camera-window-view')).toHaveCount(2);
});

test('@smoke camera window saves, loads, and restores voxel-follow views', async ({ page }, testInfo) => {
  await disableFilePickers(page);
  const tiffPaths = createSyntheticVolumeMovieTiffPaths({ seed: 23 });
  await launchViewerFromChannelFixtures(
    page,
    [
      {
        name: 'Camera Save Load',
        tiffPaths,
      },
    ],
    { voxelResolution: STANDARD_VOXEL_RESOLUTION },
  );
  await openCameraWindow(page);
  await waitForCameraState(page);

  const initialState = await getCameraDebugState(page);
  expect(initialState?.cameraWindowState).not.toBeNull();
  const initialPosition = initialState!.cameraWindowState!.cameraPosition;
  const updatedPosition = {
    x: initialPosition.x,
    y: initialPosition.y,
    z: Number((initialPosition.z + 5).toFixed(3)),
  };

  await clickCameraButton(page, 'Add');
  await setFollowVoxelDraft(page, { x: 1, y: 1, z: 1 });
  await clickCameraButton(page, 'Follow');
  await page.waitForFunction(() => {
    const getter = (
      window as Window & {
        __LLSM_CAMERA_WINDOW_STATE__?: (() => { followedVoxel: { x: number; y: number; z: number } | null }) | null;
      }
    ).__LLSM_CAMERA_WINDOW_STATE__;
    const state = getter?.();
    return Boolean(state?.followedVoxel && state.followedVoxel.x === 1 && state.followedVoxel.y === 1 && state.followedVoxel.z === 1);
  });
  await clickCameraButton(page, 'Add');

  const downloadPromise = page.waitForEvent('download');
  await clickCameraButton(page, 'Save');
  const download = await downloadPromise;
  const downloadPath = await download.path();
  expect(download.suggestedFilename()).toContain('camera_views');
  expect(downloadPath).not.toBeNull();
  const downloadText = await fs.readFile(downloadPath!, 'utf8');
  const downloadJson = JSON.parse(downloadText) as {
    version: number;
    shapeZYX: [number, number, number];
    views: unknown[];
  };
  expect(downloadJson.version).toBe(1);
  expect(downloadJson.shapeZYX).toEqual(initialState!.volumeShapeZYX);
  expect(downloadJson.views).toHaveLength(2);

  await clickCameraButton(page, 'Stop');
  await clickCameraButton(page, 'Clear');
  await expect(page.locator('.camera-window-view')).toHaveCount(0);

  const customViewsPath = path.join(testInfo.outputDir, 'camera-views.json');
  await fs.mkdir(testInfo.outputDir, { recursive: true });
  const customPayload = {
    version: 1,
    shapeZYX: initialState!.volumeShapeZYX,
    views: [
      {
        label: 'Loaded Free',
        mode: 'free-roam',
        cameraPosition: updatedPosition,
        cameraRotation: { yaw: 5, pitch: 0, roll: 0 },
      },
      {
        label: 'Loaded Voxel',
        mode: 'voxel-follow',
        cameraPosition: {
          x: initialPosition.x,
          y: initialPosition.y,
          z: Number((initialPosition.z + 2).toFixed(3)),
        },
        cameraRotation: { yaw: 35, pitch: 0, roll: 0 },
        followedVoxel: { x: 1, y: 1, z: 1 },
      },
    ],
  };
  await fs.writeFile(customViewsPath, JSON.stringify(customPayload, null, 2));
  await page.locator('input[data-camera-load-input="true"]').setInputFiles(customViewsPath);
  await expect(page.locator('.camera-window-view')).toHaveCount(2);

  await page.locator('.camera-window-view').nth(1).click();
  await page.waitForFunction(() => {
    const getter = (
      window as Window & {
        __LLSM_CAMERA_WINDOW_STATE__?: (() => {
          followedVoxel: { x: number; y: number; z: number } | null;
          cameraWindowState: { cameraPosition: { z: number } } | null;
        }) | null;
      }
    ).__LLSM_CAMERA_WINDOW_STATE__;
    const state = getter?.();
    return Boolean(
      state?.followedVoxel &&
        state.followedVoxel.x === 1 &&
        state.followedVoxel.y === 1 &&
        state.followedVoxel.z === 1 &&
        state.cameraWindowState,
    );
  });
  await expect(page.locator('#camera-follow-x')).toBeDisabled();
  await expect(page.locator('.floating-window--camera').getByRole('button', { name: 'Stop', exact: true })).toBeEnabled();

  await clickCameraButton(page, 'Stop');
  await page.waitForFunction(() => {
    const getter = (
      window as Window & {
        __LLSM_CAMERA_WINDOW_STATE__?: (() => { followedVoxel: { x: number; y: number; z: number } | null }) | null;
      }
    ).__LLSM_CAMERA_WINDOW_STATE__;
    return getter?.()?.followedVoxel === null;
  });
  await expect(page.locator('#camera-follow-x')).toBeEditable();
});
