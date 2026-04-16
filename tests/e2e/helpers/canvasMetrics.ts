import type { Page } from '@playwright/test';

export type CanvasMetrics = {
  width: number;
  height: number;
  nonBlackSamples: number;
  totalSamples: number;
  avgLuma: number;
  sampleGrid: number[];
};

export async function forceViewerRender(page: Page): Promise<void> {
  await page.evaluate(() => {
    const forceRender = (window as Window & { __LLSM_FORCE_RENDER__?: (() => boolean) | null }).__LLSM_FORCE_RENDER__;
    if (typeof forceRender === 'function') {
      forceRender();
      forceRender();
      forceRender();
    }
  });
  await page.waitForTimeout(80);
}

export async function collectPrimaryCanvasMetrics(page: Page): Promise<CanvasMetrics> {
  return page.evaluate(async () => {
    const canvas = document.querySelector('.render-surface canvas') as HTMLCanvasElement | null;
    if (!canvas) {
      return {
        width: 0,
        height: 0,
        nonBlackSamples: 0,
        totalSamples: 0,
        avgLuma: 0,
        sampleGrid: [],
      } satisfies CanvasMetrics;
    }

    const gl =
      (canvas.getContext('webgl2') || canvas.getContext('webgl')) as
        | WebGL2RenderingContext
        | WebGLRenderingContext
        | null;
    if (!gl) {
      return {
        width: canvas.width,
        height: canvas.height,
        nonBlackSamples: 0,
        totalSamples: 0,
        avgLuma: 0,
        sampleGrid: [],
      } satisfies CanvasMetrics;
    }

    let nonBlackSamples = 0;
    let totalSamples = 0;
    let avgLuma = 0;
    let sampleGrid: number[] = [];

    const readSampleGrid = () => {
      const nextGrid: number[] = [];
      const rgba = new Uint8Array(4);
      const samplesPerAxis = 6;
      let nextNonBlackSamples = 0;
      let lumaSum = 0;
      for (let yIndex = 1; yIndex <= samplesPerAxis; yIndex += 1) {
        for (let xIndex = 1; xIndex <= samplesPerAxis; xIndex += 1) {
          const x = Math.floor((xIndex / (samplesPerAxis + 1)) * (canvas.width - 1));
          const y = Math.floor((yIndex / (samplesPerAxis + 1)) * (canvas.height - 1));
          gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
          const luma = (rgba[0] ?? 0) + (rgba[1] ?? 0) + (rgba[2] ?? 0);
          nextGrid.push(luma);
          lumaSum += luma;
          if (luma > 3 || (rgba[3] ?? 0) > 3) {
            nextNonBlackSamples += 1;
          }
        }
      }
      return {
        sampleGrid: nextGrid,
        nonBlackSamples: nextNonBlackSamples,
        totalSamples: nextGrid.length,
        avgLuma: nextGrid.length > 0 ? lumaSum / (nextGrid.length * 3) : 0,
      };
    };

    for (let frame = 0; frame < 20; frame += 1) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const sample = readSampleGrid();
      sampleGrid = sample.sampleGrid;
      nonBlackSamples = sample.nonBlackSamples;
      totalSamples = sample.totalSamples;
      avgLuma = sample.avgLuma;
      if (nonBlackSamples > 0) {
        break;
      }
    }

    return {
      width: canvas.width,
      height: canvas.height,
      nonBlackSamples,
      totalSamples,
      avgLuma,
      sampleGrid,
    } satisfies CanvasMetrics;
  });
}

export function averageAbsoluteDifference(left: number[], right: number[]): number {
  const count = Math.min(left.length, right.length);
  if (count === 0) {
    return Number.POSITIVE_INFINITY;
  }
  let total = 0;
  for (let index = 0; index < count; index += 1) {
    total += Math.abs((left[index] ?? 0) - (right[index] ?? 0));
  }
  return total / count;
}
