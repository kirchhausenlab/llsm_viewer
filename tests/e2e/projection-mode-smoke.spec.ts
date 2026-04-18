import { expect, test } from '@playwright/test';

import { collectPrimaryCanvasMetrics, forceViewerRender } from './helpers/canvasMetrics';
import { createSyntheticVolumeMovieTiffPaths } from './helpers/syntheticTiff';
import { launchViewerFromChannelFixtures, STANDARD_VOXEL_RESOLUTION } from './helpers/workflows';

test('@smoke projection mode can switch between perspective and orthographic after launch', async ({ page }) => {
  const tiffPaths = createSyntheticVolumeMovieTiffPaths({ seed: 7 });

  await launchViewerFromChannelFixtures(
    page,
    [
      {
        name: 'Projection Smoke',
        tiffPaths,
      }
    ],
    { voxelResolution: STANDARD_VOXEL_RESOLUTION }
  );

  await page.getByRole('button', { name: 'View', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Camera settings' }).click();

  const viewerSettingsWindow = page.locator('.floating-window--camera-settings');
  await expect(viewerSettingsWindow.getByRole('heading', { name: 'Camera settings' })).toBeVisible();

  const perspectiveButton = viewerSettingsWindow.getByRole('button', { name: 'Perspective', exact: true });
  const isometricButton = viewerSettingsWindow.getByRole('button', { name: 'Isometric', exact: true });

  await expect(perspectiveButton).toHaveAttribute('aria-pressed', 'true');
  await expect(isometricButton).toHaveAttribute('aria-pressed', 'false');

  await isometricButton.evaluate((element) => {
    (element as HTMLButtonElement).click();
  });

  await expect(isometricButton).toHaveAttribute('aria-pressed', 'true');
  await expect(perspectiveButton).toHaveAttribute('aria-pressed', 'false');
  await forceViewerRender(page);
  const orthographicMetrics = await collectPrimaryCanvasMetrics(page);
  expect(orthographicMetrics.nonBlackSamples).toBeGreaterThan(0);
  expect(orthographicMetrics.avgLuma).toBeGreaterThan(0);

  await perspectiveButton.evaluate((element) => {
    (element as HTMLButtonElement).click();
  });

  await expect(perspectiveButton).toHaveAttribute('aria-pressed', 'true');
  await expect(isometricButton).toHaveAttribute('aria-pressed', 'false');
  await forceViewerRender(page);
  const perspectiveMetrics = await collectPrimaryCanvasMetrics(page);
  expect(perspectiveMetrics.nonBlackSamples).toBeGreaterThan(0);
  expect(perspectiveMetrics.avgLuma).toBeGreaterThan(0);

  await expect(page.locator('.volume-viewer canvas')).toBeVisible();
});
