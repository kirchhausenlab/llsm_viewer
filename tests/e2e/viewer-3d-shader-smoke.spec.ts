import { expect, test } from '@playwright/test';
import { resolveDatasetFixture } from './helpers/dataset';
import { launchViewerFromFixture, STANDARD_VOXEL_RESOLUTION } from './helpers/workflows';

const fixture = resolveDatasetFixture();

function isShaderCompileConsoleError(text: string): boolean {
  if (text.includes('THREE.WebGLProgram: Shader Error')) {
    return true;
  }
  if (text.includes('VALIDATE_STATUS false')) {
    return true;
  }
  if (text.includes('Fragment shader is not compiled')) {
    return true;
  }
  return false;
}

test('@smoke entering 3D view does not trigger shader compile errors', async ({ page }) => {
  const shaderErrors: string[] = [];
  page.on('console', (message) => {
    const text = message.text();
    if (isShaderCompileConsoleError(text)) {
      shaderErrors.push(text);
    }
  });

  await launchViewerFromFixture(page, fixture, {
    channelName: 'Ch1',
    voxelResolution: STANDARD_VOXEL_RESOLUTION
  });

  const playbackWindow = page.locator('.floating-window--playback');
  const modeButton = playbackWindow.locator('.viewer-mode-row button').first();
  await expect(modeButton).toBeVisible();
  const initialModeLabel = (await modeButton.textContent())?.trim() ?? '';
  if (initialModeLabel !== '3D view') {
    await modeButton.click();
    await expect(modeButton).toHaveText('3D view');
  }

  await page.waitForTimeout(1200);
  expect(shaderErrors, `shader errors observed in browser console:\n${shaderErrors.join('\n')}`).toEqual([]);

  const renderProbe = await page.evaluate(async () => {
    const canvas = document.querySelector('.render-surface canvas') as HTMLCanvasElement | null;
    if (!canvas) {
      return { ok: false, reason: 'viewer canvas not found' };
    }

    const gl = (canvas.getContext('webgl2') || canvas.getContext('webgl')) as
      | WebGL2RenderingContext
      | WebGLRenderingContext
      | null;
    if (!gl) {
      return { ok: false, reason: 'webgl context not available' };
    }

    const readSample = () => {
      const width = canvas.width;
      const height = canvas.height;
      if (width <= 0 || height <= 0) {
        return { nonBlackSamples: 0, totalSamples: 0 };
      }

      const samplesPerAxis = 6;
      let nonBlackSamples = 0;
      let totalSamples = 0;
      const rgba = new Uint8Array(4);
      for (let yIndex = 1; yIndex <= samplesPerAxis; yIndex += 1) {
        for (let xIndex = 1; xIndex <= samplesPerAxis; xIndex += 1) {
          const x = Math.floor((xIndex / (samplesPerAxis + 1)) * (width - 1));
          const y = Math.floor((yIndex / (samplesPerAxis + 1)) * (height - 1));
          gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
          totalSamples += 1;
          if (rgba[0] > 3 || rgba[1] > 3 || rgba[2] > 3 || rgba[3] > 3) {
            nonBlackSamples += 1;
          }
        }
      }
      return { nonBlackSamples, totalSamples };
    };

    for (let frame = 0; frame < 20; frame += 1) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const sample = readSample();
      if (sample.nonBlackSamples > 0) {
        return { ok: true, ...sample };
      }
    }

    const finalSample = readSample();
    return {
      ok: false,
      reason: `3D canvas appears blank (nonBlackSamples=${finalSample.nonBlackSamples}/${finalSample.totalSamples})`,
      ...finalSample
    };
  });

  expect(renderProbe.ok, JSON.stringify(renderProbe)).toBe(true);
});
