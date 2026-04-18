import { expect, test, type Page } from '@playwright/test';

import { createCustomVolumeTiffPath } from './helpers/syntheticTiff';
import { forceViewerRender } from './helpers/canvasMetrics';
import { launchViewerFromChannelFixtures, STANDARD_VOXEL_RESOLUTION } from './helpers/workflows';

async function openChannelsWindow(page: Page) {
  await page.getByRole('button', { name: 'View', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Channels' }).click();
  const channelsWindow = page.locator('.floating-window--channels');
  await expect(channelsWindow.getByRole('heading', { name: 'Channels' })).toBeVisible();
  return channelsWindow;
}

async function collectMagentaCanvasMetrics(page: Page) {
  return page.evaluate(async () => {
    const canvas = document.querySelector('.render-surface canvas') as HTMLCanvasElement | null;
    if (!canvas) {
      return { magentaPixels: 0, magentaScore: 0 };
    }
    const gl =
      (canvas.getContext('webgl2') || canvas.getContext('webgl')) as
        | WebGL2RenderingContext
        | WebGLRenderingContext
        | null;
    if (!gl) {
      return { magentaPixels: 0, magentaScore: 0 };
    }

    const width = Math.max(1, canvas.width);
    const height = Math.max(1, canvas.height);
    const pixels = new Uint8Array(width * height * 4);

    for (let frame = 0; frame < 8; frame += 1) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }

    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

    let magentaPixels = 0;
    let magentaScore = 0;
    for (let offset = 0; offset < pixels.length; offset += 4) {
      const r = pixels[offset] ?? 0;
      const g = pixels[offset + 1] ?? 0;
      const b = pixels[offset + 2] ?? 0;
      const a = pixels[offset + 3] ?? 0;
      if (a < 8) {
        continue;
      }
      const score = Math.max(0, Math.min(r, b) - g);
      if (r >= 120 && b >= 120 && g <= 110 && score >= 40) {
        magentaPixels += 1;
        magentaScore += score;
      }
    }

    return { magentaPixels, magentaScore };
  });
}

async function collectRoiOcclusionMetrics(page: Page) {
  return page.evaluate(() => {
    const getter = (window as Window & {
      __LLSM_CAPTURE_ROI_OCCLUSION_METRICS__?: (() => { alphaNonWhite: number; prepassNonBlack: number } | null) | null;
    }).__LLSM_CAPTURE_ROI_OCCLUSION_METRICS__;
    return typeof getter === 'function' ? getter() : null;
  });
}

test('3D ROI is attenuated by Beer-Lambert foreground volume data', async ({ page }) => {
  const width = 20;
  const height = 20;
  const depth = 20;
  const slabMin = 4;
  const slabMax = 15;
  const slabFrontZ = 12;
  const slabBackZ = 17;
  const tiffPath = createCustomVolumeTiffPath({
    width,
    height,
    depth,
    label: 'roi-bl-attenuation',
    fill: (x, y, z) => {
      const insideXY = x >= slabMin && x <= slabMax && y >= slabMin && y <= slabMax;
      const insideZ = z >= slabFrontZ && z <= slabBackZ;
      return insideXY && insideZ ? 255 : 0;
    },
  });

  await launchViewerFromChannelFixtures(
    page,
    [{ name: 'BL ROI', tiffPaths: [tiffPath] }],
    { voxelResolution: STANDARD_VOXEL_RESOLUTION }
  );

  const channelsWindow = await openChannelsWindow(page);

  await channelsWindow.getByLabel('Render mode').selectOption('mip');
  await page.evaluate(() => {
    const setter = (window as Window & {
      __LLSM_SET_WORKING_ROI__?: ((roi: {
        shape: 'rectangle';
        mode: '3d';
        start: { x: number; y: number; z: number };
        end: { x: number; y: number; z: number };
        color: string;
      } | null) => boolean) | null;
    }).__LLSM_SET_WORKING_ROI__;
    if (typeof setter !== 'function') {
      throw new Error('__LLSM_SET_WORKING_ROI__ is unavailable');
    }
    setter({
      shape: 'rectangle',
      mode: '3d',
      start: { x: 6, y: 6, z: 14 },
      end: { x: 13, y: 13, z: 18 },
      color: '#FF00FF',
    });
  });

  await forceViewerRender(page);
  const mipMetrics = await collectMagentaCanvasMetrics(page);
  expect(mipMetrics.magentaPixels).toBeGreaterThan(80);
  expect(mipMetrics.magentaScore).toBeGreaterThan(4000);

  await channelsWindow.getByLabel('Render mode').selectOption('bl');
  await forceViewerRender(page);
  const blMetrics = await collectMagentaCanvasMetrics(page);
  const roiOcclusionMetrics = await collectRoiOcclusionMetrics(page);

  expect(blMetrics.magentaPixels, `roi occlusion metrics: ${JSON.stringify(roiOcclusionMetrics)}`).toBeGreaterThan(0);
  expect(blMetrics.magentaPixels, `roi occlusion metrics: ${JSON.stringify(roiOcclusionMetrics)}`).toBeLessThan(mipMetrics.magentaPixels * 0.75);
  expect(blMetrics.magentaScore, `roi occlusion metrics: ${JSON.stringify(roiOcclusionMetrics)}`).toBeLessThan(mipMetrics.magentaScore * 0.75);
});
