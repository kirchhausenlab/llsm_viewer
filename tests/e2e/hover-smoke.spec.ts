import { expect, test } from '@playwright/test';
import { resolveDatasetFixture } from './helpers/dataset';
import { launchViewerFromFixture, STANDARD_VOXEL_RESOLUTION } from './helpers/workflows';

const fixture = resolveDatasetFixture();

function parseCoordinates(text: string): { x: number; y: number; z: number } | null {
  const match = text.match(/\(([-\d]+),\s*([-\d]+),\s*([-\d]+)\)/);
  if (!match) {
    return null;
  }
  return {
    x: Number.parseInt(match[1], 10),
    y: Number.parseInt(match[2], 10),
    z: Number.parseInt(match[3], 10),
  };
}

test('@smoke hover intensity and coordinates respond to pointer movement after launch', async ({ page }) => {
  await launchViewerFromFixture(page, fixture, {
    channelName: 'Ch1',
    voxelResolution: STANDARD_VOXEL_RESOLUTION
  });

  const intensityStatus = page.locator('.viewer-top-menu-intensity');
  const coordinatesText = page.locator('.viewer-top-menu-coordinates');
  const surface = page.locator('.render-surface');
  await expect(surface).toBeVisible();

  const box = await surface.boundingBox();
  expect(box).not.toBeNull();
  if (!box) {
    return;
  }

  const probeRows = [0.3, 0.4, 0.5, 0.6, 0.7];
  const probeCols = [0.2, 0.35, 0.5, 0.65, 0.8];
  const uniqueCoordinateKeys = new Set<string>();

  for (const row of probeRows) {
    for (const col of probeCols) {
      const x = box.x + box.width * col;
      const y = box.y + box.height * row;
      await page.mouse.move(x, y);
      await page.mouse.move(x + 2, y + 1);
      await page.waitForTimeout(120);

      const statusText = (await intensityStatus.textContent()) ?? '';
      if (statusText.includes('—')) {
        continue;
      }

      const coordinateValue = parseCoordinates((await coordinatesText.textContent()) ?? '');
      if (!coordinateValue) {
        continue;
      }
      uniqueCoordinateKeys.add(`${coordinateValue.x}:${coordinateValue.y}:${coordinateValue.z}`);
      if (uniqueCoordinateKeys.size >= 2) {
        break;
      }
    }
    if (uniqueCoordinateKeys.size >= 2) {
      break;
    }
  }

  expect(uniqueCoordinateKeys.size).toBeGreaterThanOrEqual(2);
});
