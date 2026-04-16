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
  await page.getByRole('menuitem', { name: 'Render settings' }).click();

  const viewerSettingsWindow = page.locator('.floating-window--viewer-settings');
  await expect(viewerSettingsWindow.getByRole('heading', { name: 'Render settings' })).toBeVisible();

  const perspectiveButton = viewerSettingsWindow.getByRole('button', { name: 'Perspective', exact: true });
  const orthographicButton = viewerSettingsWindow.getByRole('button', { name: 'Orthographic', exact: true });

  await expect(perspectiveButton).toHaveAttribute('aria-pressed', 'true');
  await expect(orthographicButton).toHaveAttribute('aria-pressed', 'false');

  await orthographicButton.evaluate((element) => {
    (element as HTMLButtonElement).click();
  });

  await expect(orthographicButton).toHaveAttribute('aria-pressed', 'true');
  await expect(perspectiveButton).toHaveAttribute('aria-pressed', 'false');
  await forceViewerRender(page);
  const orthographicMetrics = await collectPrimaryCanvasMetrics(page);
  expect(orthographicMetrics.nonBlackSamples).toBeGreaterThan(0);
  expect(orthographicMetrics.avgLuma).toBeGreaterThan(0);

  await perspectiveButton.evaluate((element) => {
    (element as HTMLButtonElement).click();
  });

  await expect(perspectiveButton).toHaveAttribute('aria-pressed', 'true');
  await expect(orthographicButton).toHaveAttribute('aria-pressed', 'false');
  await forceViewerRender(page);
  const perspectiveMetrics = await collectPrimaryCanvasMetrics(page);
  expect(perspectiveMetrics.nonBlackSamples).toBeGreaterThan(0);
  expect(perspectiveMetrics.avgLuma).toBeGreaterThan(0);

  await expect(page.locator('.volume-viewer canvas')).toBeVisible();
});
