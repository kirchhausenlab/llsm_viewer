import { expect, test, type Page } from '@playwright/test';

import { resolveDatasetFixture } from './helpers/dataset';
import { launchViewerFromFixture, STANDARD_VOXEL_RESOLUTION } from './helpers/workflows';

type FrameTimingStats = {
  frameCount: number;
  meanMs: number;
  medianMs: number;
  p95Ms: number;
  minMs: number;
  maxMs: number;
};

const fixture = resolveDatasetFixture();
const FRAME_SAMPLE_RENDER_COUNT = 8;

function resolveOptionalPositiveNumber(raw: string | undefined): number | null {
  if (!raw) {
    return null;
  }
  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

async function readCameraDistance(page: Page): Promise<number | null> {
  return page.evaluate(() => {
    const getter = (window as Window & { __LLSM_VOLUME_RESOURCE_SUMMARY__?: (() => unknown) | null })
      .__LLSM_VOLUME_RESOURCE_SUMMARY__;
    if (typeof getter !== 'function') {
      return null;
    }
    const summary = getter() as {
      camera?: {
        position?: [number, number, number];
        target?: [number, number, number] | null;
      } | null;
    } | null;
    const position = summary?.camera?.position;
    const target = summary?.camera?.target;
    if (!Array.isArray(position) || position.length < 3 || !Array.isArray(target) || target.length < 3) {
      return null;
    }
    const dx = (position[0] ?? 0) - (target[0] ?? 0);
    const dy = (position[1] ?? 0) - (target[1] ?? 0);
    const dz = (position[2] ?? 0) - (target[2] ?? 0);
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
    return Number.isFinite(distance) ? distance : null;
  });
}

function summarizeFrameTiming(samplesMs: number[]): FrameTimingStats {
  const safeDeltas = samplesMs
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((left, right) => left - right);
  if (safeDeltas.length === 0) {
    return {
      frameCount: 0,
      meanMs: 0,
      medianMs: 0,
      p95Ms: 0,
      minMs: 0,
      maxMs: 0
    };
  }

  const sum = safeDeltas.reduce((total, value) => total + value, 0);
  const medianIndex = Math.floor((safeDeltas.length - 1) * 0.5);
  const p95Index = Math.min(
    safeDeltas.length - 1,
    Math.max(0, Math.ceil(safeDeltas.length * 0.95) - 1)
  );

  return {
    frameCount: safeDeltas.length,
    meanMs: sum / safeDeltas.length,
    medianMs: safeDeltas[medianIndex] ?? 0,
    p95Ms: safeDeltas[p95Index] ?? 0,
    minMs: safeDeltas[0] ?? 0,
    maxMs: safeDeltas[safeDeltas.length - 1] ?? 0
  };
}

async function sampleFrameTiming(page: Page): Promise<FrameTimingStats> {
  const sampleTimes: number[] = [];
  for (let sample = 0; sample < FRAME_SAMPLE_RENDER_COUNT; sample += 1) {
    const renderDurationMs = await page.evaluate(() => {
      const forceRender = (window as Window & { __LLSM_FORCE_RENDER__?: (() => boolean) | null })
        .__LLSM_FORCE_RENDER__;
      if (typeof forceRender !== 'function') {
        return null;
      }
      const start = performance.now();
      const didRender = forceRender();
      const end = performance.now();
      if (!didRender) {
        return null;
      }
      return end - start;
    });
    if (typeof renderDurationMs === 'number' && Number.isFinite(renderDurationMs) && renderDurationMs > 0) {
      sampleTimes.push(renderDurationMs);
    }
    await page.waitForTimeout(0);
  }

  return summarizeFrameTiming(sampleTimes);
}

async function setCameraDistance(page: Page, distance: number): Promise<boolean> {
  return page.evaluate((nextDistance) => {
    const setter = (window as Window & { __LLSM_SET_CAMERA_DISTANCE__?: ((distance: number) => boolean) | null })
      .__LLSM_SET_CAMERA_DISTANCE__;
    if (typeof setter !== 'function') {
      return false;
    }
    return Boolean(setter(nextDistance));
  }, distance);
}

test('@nightly benchmark: close-up viewer frame pacing', async ({ page }) => {
  test.setTimeout(8 * 60_000);

  const closeupMaxP95Ms = resolveOptionalPositiveNumber(process.env.VIEWER_CLOSEUP_MAX_P95_MS);
  const closeupMaxMedianMs = resolveOptionalPositiveNumber(process.env.VIEWER_CLOSEUP_MAX_MEDIAN_MS);

  await launchViewerFromFixture(page, fixture, {
    channelName: 'PerfCh1',
    voxelResolution: STANDARD_VOXEL_RESOLUTION
  });

  const canvas = page.locator('.render-surface canvas');
  await expect(canvas).toBeVisible();

  await page.waitForTimeout(1200);
  const farDistance = await readCameraDistance(page);
  const farTiming = await sampleFrameTiming(page);

  if (farDistance !== null && Number.isFinite(farDistance)) {
    const targetCloseDistance = Math.max(0.25, farDistance * 0.2);
    const moved = await setCameraDistance(page, targetCloseDistance);
    expect(moved).toBe(true);
    await page.waitForTimeout(350);
  }

  const closeDistance = await readCameraDistance(page);
  const closeTiming = await sampleFrameTiming(page);

  console.log(
    `[viewer-closeup-perf] farDistance=${farDistance ?? 'n/a'} closeDistance=${closeDistance ?? 'n/a'} ` +
      `farMedianMs=${farTiming.medianMs.toFixed(2)} farP95Ms=${farTiming.p95Ms.toFixed(2)} ` +
      `closeMedianMs=${closeTiming.medianMs.toFixed(2)} closeP95Ms=${closeTiming.p95Ms.toFixed(2)}`
  );

  expect(farTiming.frameCount).toBeGreaterThanOrEqual(1);
  expect(closeTiming.frameCount).toBeGreaterThanOrEqual(1);

  if (
    farDistance !== null &&
    closeDistance !== null &&
    Number.isFinite(farDistance) &&
    Number.isFinite(closeDistance)
  ) {
    expect(closeDistance).toBeLessThan(farDistance * 0.98);
  }

  if (closeupMaxP95Ms !== null) {
    expect(closeTiming.p95Ms).toBeLessThanOrEqual(closeupMaxP95Ms);
  }
  if (closeupMaxMedianMs !== null) {
    expect(closeTiming.medianMs).toBeLessThanOrEqual(closeupMaxMedianMs);
  }
});
