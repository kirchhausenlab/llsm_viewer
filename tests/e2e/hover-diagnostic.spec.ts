import { test } from '@playwright/test';
import { resolveDatasetFixture } from './helpers/dataset';
import { launchViewerFromFixture, STANDARD_VOXEL_RESOLUTION } from './helpers/workflows';

const fixture = resolveDatasetFixture();

test('diagnostic: hover text and coordinates on volume fixture', async ({ page }, testInfo) => {
  await launchViewerFromFixture(page, fixture, {
    channelName: 'DiagHover',
    voxelResolution: STANDARD_VOXEL_RESOLUTION,
  });

  const surface = page.locator('.render-surface');
  const status = page.locator('.viewer-top-menu-intensity');
  const coords = page.locator('.viewer-top-menu-coordinates');
  const box = await surface.boundingBox();

  if (!box) {
    throw new Error('Render surface bounding box unavailable.');
  }

  const probes = [
    { x: box.x + box.width * 0.50, y: box.y + box.height * 0.50 },
    { x: box.x + box.width * 0.35, y: box.y + box.height * 0.55 },
    { x: box.x + box.width * 0.65, y: box.y + box.height * 0.45 },
  ];

  const samples: Array<{
    index: number;
    intensityText: string;
    coordinatesText: string;
  }> = [];

  for (let index = 0; index < probes.length; index += 1) {
    const probe = probes[index]!;
    await page.mouse.move(probe.x, probe.y);
    await page.waitForTimeout(180);
    samples.push({
      index,
      intensityText: ((await status.textContent()) ?? '').trim(),
      coordinatesText: ((await coords.textContent()) ?? '').trim(),
    });
  }

  const runtime = await page.evaluate(() => {
    const getter = (window as Window & { __LLSM_VOLUME_RESOURCE_SUMMARY__?: (() => unknown) | null })
      .__LLSM_VOLUME_RESOURCE_SUMMARY__;
    return typeof getter === 'function' ? getter() : null;
  });

  const screenshotPath = testInfo.outputPath('hover-diagnostic.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });

  console.log(`[hover-diagnostic] screenshot=${screenshotPath}`);
  console.log(`[hover-diagnostic] samples=${JSON.stringify(samples)}`);
  console.log(`[hover-diagnostic] runtime=${JSON.stringify(runtime)}`);
});

