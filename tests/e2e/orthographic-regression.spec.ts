import { expect, test, type Page } from '@playwright/test';

import {
  averageAbsoluteDifference,
  collectPrimaryCanvasMetrics,
  forceViewerRender,
} from './helpers/canvasMetrics';
import { createSyntheticVolumeMovieTiffPaths } from './helpers/syntheticTiff';
import { launchViewerFromChannelFixtures, STANDARD_VOXEL_RESOLUTION } from './helpers/workflows';

async function openCameraSettings(page: Page) {
  await page.getByRole('button', { name: 'View', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Camera settings' }).click();
  const viewerSettingsWindow = page.locator('.floating-window--camera-settings');
  await expect(viewerSettingsWindow.getByRole('heading', { name: 'Camera settings' })).toBeVisible();
  return viewerSettingsWindow;
}

async function openChannelsWindow(page: Page) {
  await page.getByRole('button', { name: 'View', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Channels' }).click();
  const channelsWindow = page.locator('.floating-window--channels');
  await expect(channelsWindow.getByRole('heading', { name: 'Channels' })).toBeVisible();
  return channelsWindow;
}

async function readDebugCameraSummary(page: Page): Promise<{
  projectionMode: string | null;
  zoom: number | null;
} | null> {
  return page.evaluate(() => {
    const getter = (window as Window & { __LLSM_VOLUME_RESOURCE_SUMMARY__?: (() => unknown) | null })
      .__LLSM_VOLUME_RESOURCE_SUMMARY__;
    if (typeof getter !== 'function') {
      return null;
    }
    const summary = getter() as { camera?: { projectionMode?: unknown; zoom?: unknown } } | null;
    const projectionMode = typeof summary?.camera?.projectionMode === 'string' ? summary.camera.projectionMode : null;
    const zoom = typeof summary?.camera?.zoom === 'number' ? summary.camera.zoom : null;
    return { projectionMode, zoom };
  });
}

async function centerPointerOnViewer(page: Page) {
  const canvas = page.locator('.render-surface canvas');
  const box = await canvas.boundingBox();
  if (!box) {
    throw new Error('Viewer canvas is not visible.');
  }
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
}

async function readOffscreenRenderMetrics(page: Page): Promise<{
  nonBlackPixels: number;
  avgLuma: number;
} | null> {
  return page.evaluate(() => {
    const capture = (window as Window & {
      __LLSM_CAPTURE_RENDER_TARGET_METRICS__?: (() => Record<string, unknown> | null) | null;
    }).__LLSM_CAPTURE_RENDER_TARGET_METRICS__;
    if (typeof capture !== 'function') {
      return null;
    }
    const metrics = capture();
    if (!metrics) {
      return null;
    }
    const nonBlackPixels = typeof metrics.nonBlackPixels === 'number' ? metrics.nonBlackPixels : 0;
    const avgLuma = typeof metrics.avgLuma === 'number' ? metrics.avgLuma : 0;
    return { nonBlackPixels, avgLuma };
  });
}

test('@smoke orthographic rendering remains visible and nearly invariant under W/S motion', async ({ page }) => {
  const tiffPaths = createSyntheticVolumeMovieTiffPaths({ seed: 17 });

  await launchViewerFromChannelFixtures(
    page,
    [{ name: 'Ortho Stability', tiffPaths }],
    { voxelResolution: STANDARD_VOXEL_RESOLUTION }
  );

  const viewerSettingsWindow = await openCameraSettings(page);
  const isometricButton = viewerSettingsWindow.getByRole('button', { name: 'Isometric', exact: true });
  await isometricButton.evaluate((element) => {
    (element as HTMLButtonElement).click();
  });
  await expect(isometricButton).toHaveAttribute('aria-pressed', 'true');

  await forceViewerRender(page);
  const before = await collectPrimaryCanvasMetrics(page);
  expect(before.nonBlackSamples).toBeGreaterThan(0);
  expect(before.avgLuma).toBeGreaterThan(0);

  await page.keyboard.press('KeyW');
  await forceViewerRender(page);
  const afterW = await collectPrimaryCanvasMetrics(page);

  expect(afterW.nonBlackSamples).toBeGreaterThan(0);
  expect(afterW.avgLuma).toBeGreaterThan(0);
  expect(averageAbsoluteDifference(before.sampleGrid, afterW.sampleGrid)).toBeLessThan(8);

  await page.keyboard.press('KeyS');
  await forceViewerRender(page);
  const afterReturn = await collectPrimaryCanvasMetrics(page);
  expect(afterReturn.nonBlackSamples).toBeGreaterThan(0);
  expect(averageAbsoluteDifference(before.sampleGrid, afterReturn.sampleGrid)).toBeLessThan(6);
});

test('@smoke orthographic zoom-out clamps before rendering becomes unstable', async ({ page }) => {
  const tiffPaths = createSyntheticVolumeMovieTiffPaths({ seed: 29 });

  await launchViewerFromChannelFixtures(
    page,
    [{ name: 'Ortho Zoom Clamp', tiffPaths }],
    { voxelResolution: STANDARD_VOXEL_RESOLUTION }
  );

  const viewerSettingsWindow = await openCameraSettings(page);
  const isometricButton = viewerSettingsWindow.getByRole('button', { name: 'Isometric', exact: true });
  await isometricButton.evaluate((element) => {
    (element as HTMLButtonElement).click();
  });
  await expect(isometricButton).toHaveAttribute('aria-pressed', 'true');

  await forceViewerRender(page);
  await centerPointerOnViewer(page);

  const initialCamera = await readDebugCameraSummary(page);
  const initialMetrics = await readOffscreenRenderMetrics(page);
  expect(initialCamera?.projectionMode).toBe('orthographic');
  expect(initialCamera?.zoom ?? 0).toBeGreaterThan(0);
  expect(initialMetrics?.nonBlackPixels ?? 0).toBeGreaterThan(0);

  let previousZoom = initialCamera?.zoom ?? 0;
  let plateauCount = 0;
  let clampedZoom = previousZoom;

  for (let step = 0; step < 18; step += 1) {
    await page.mouse.wheel(0, 1200);
    await forceViewerRender(page);
    const camera = await readDebugCameraSummary(page);
    const metrics = await readOffscreenRenderMetrics(page);
    expect(camera?.projectionMode).toBe('orthographic');
    expect(camera?.zoom ?? 0).toBeGreaterThan(0);
    expect(metrics?.nonBlackPixels ?? 0).toBeGreaterThan(0);

    const nextZoom = camera?.zoom ?? 0;
    if (nextZoom < previousZoom - 1e-6) {
      plateauCount = 0;
    } else {
      plateauCount += 1;
    }
    previousZoom = nextZoom;
    clampedZoom = nextZoom;

    if (plateauCount >= 3) {
      break;
    }
  }

  expect(plateauCount).toBeGreaterThanOrEqual(3);

  const atClamp = await readOffscreenRenderMetrics(page);
  expect(atClamp?.nonBlackPixels ?? 0).toBeGreaterThan(0);
  expect(atClamp?.avgLuma ?? 0).toBeGreaterThan(0);
  expect((atClamp?.nonBlackPixels ?? 0) / Math.max(initialMetrics?.nonBlackPixels ?? 1, 1)).toBeGreaterThan(0.05);

  for (let step = 0; step < 4; step += 1) {
    await page.mouse.wheel(0, 1200);
    await forceViewerRender(page);
  }

  const afterExtraZoom = await readDebugCameraSummary(page);
  const afterExtraMetrics = await readOffscreenRenderMetrics(page);
  expect(afterExtraZoom?.projectionMode).toBe('orthographic');
  expect(afterExtraZoom?.zoom ?? 0).toBeGreaterThan(0);
  expect(Math.abs((afterExtraZoom?.zoom ?? 0) - clampedZoom)).toBeLessThan(1e-6);
  expect(afterExtraMetrics?.nonBlackPixels ?? 0).toBeGreaterThan(0);
  expect(afterExtraMetrics?.avgLuma ?? 0).toBeGreaterThan(0);
  expect(Math.abs((afterExtraMetrics?.nonBlackPixels ?? 0) - (atClamp?.nonBlackPixels ?? 0))).toBeLessThan(32);
});

test('@smoke display sliders do not blank the volume in perspective or orthographic', async ({ page }) => {
  const tiffPaths = createSyntheticVolumeMovieTiffPaths({ seed: 23 });

  await launchViewerFromChannelFixtures(
    page,
    [{ name: 'Slider Stability', tiffPaths }],
    { voxelResolution: STANDARD_VOXEL_RESOLUTION }
  );

  const channelsWindow = await openChannelsWindow(page);
  const viewerSettingsWindow = await openCameraSettings(page);
  const isometricButton = viewerSettingsWindow.getByRole('button', { name: 'Isometric', exact: true });
  const perspectiveButton = viewerSettingsWindow.getByRole('button', { name: 'Perspective', exact: true });

  const ensureVisible = async () => {
    await forceViewerRender(page);
    const metrics = await collectPrimaryCanvasMetrics(page);
    expect(metrics.nonBlackSamples).toBeGreaterThan(0);
    expect(metrics.avgLuma).toBeGreaterThan(0);
  };

  const minimumSlider = channelsWindow.locator('input[id^="layer-window-min-"]').first();
  const maximumSlider = channelsWindow.locator('input[id^="layer-window-max-"]').first();
  const brightnessSlider = channelsWindow.getByLabel('Brightness');
  const contrastSlider = channelsWindow.getByLabel('Contrast');

  const setRangeValue = async (locator: typeof minimumSlider, value: string) => {
    await locator.evaluate((element, nextValue) => {
      const input = element as HTMLInputElement;
      input.value = String(nextValue);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, value);
  };

  await ensureVisible();
  await setRangeValue(minimumSlider, '0.95');
  await ensureVisible();
  await setRangeValue(maximumSlider, '0.96');
  await ensureVisible();
  await setRangeValue(brightnessSlider, '0');
  await ensureVisible();
  await setRangeValue(contrastSlider, '0');
  await ensureVisible();
  await channelsWindow.getByRole('button', { name: 'Reset' }).evaluate((element) => {
    (element as HTMLButtonElement).click();
  });
  await ensureVisible();

  await isometricButton.evaluate((element) => {
    (element as HTMLButtonElement).click();
  });
  await expect(isometricButton).toHaveAttribute('aria-pressed', 'true');
  await ensureVisible();
  await setRangeValue(minimumSlider, '0.95');
  await ensureVisible();
  await setRangeValue(maximumSlider, '0.96');
  await ensureVisible();
  await setRangeValue(brightnessSlider, '0');
  await ensureVisible();
  await setRangeValue(contrastSlider, '0');
  await ensureVisible();
  await channelsWindow.getByRole('button', { name: 'Reset' }).evaluate((element) => {
    (element as HTMLButtonElement).click();
  });
  await ensureVisible();

  await perspectiveButton.evaluate((element) => {
    (element as HTMLButtonElement).click();
  });
  await expect(perspectiveButton).toHaveAttribute('aria-pressed', 'true');
  await ensureVisible();
});
