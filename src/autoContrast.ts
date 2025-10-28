import type { NormalizedVolume } from './volumeProcessing';

const HISTOGRAM_BINS = 256;
const AUTO_THRESHOLD_INITIAL = 5000;
const AUTO_THRESHOLD_RESET_LIMIT = 10;

export type AutoWindowResult = {
  windowMin: number;
  windowMax: number;
  nextThreshold: number;
};

type CachedHistogram = {
  histogram: Uint32Array;
  width: number;
  height: number;
  depth: number;
  channels: number;
  length: number;
};

let histogramCache = new WeakMap<NormalizedVolume, CachedHistogram>();

function computeIntensity(
  data: Uint8Array,
  offset: number,
  channels: number
): number {
  const sourceR = data[offset] ?? 0;
  if (channels <= 1) {
    return sourceR;
  }

  const sourceG = data[offset + 1] ?? 0;
  if (channels === 2) {
    return Math.round((sourceR + sourceG) * 0.5);
  }

  const sourceB = data[offset + 2] ?? 0;
  if (channels === 3) {
    return Math.round(sourceR * 0.2126 + sourceG * 0.7152 + sourceB * 0.0722);
  }

  const sourceA = data[offset + 3] ?? 0;
  return Math.max(sourceR, sourceG, sourceB, sourceA);
}

function computeHistogram(volume: NormalizedVolume): CachedHistogram {
  const { normalized, width, height, depth } = volume;
  const channels = Math.max(1, volume.channels);
  const voxelCount = width * height * depth;
  const histogram = new Uint32Array(HISTOGRAM_BINS);

  if (voxelCount === 0 || normalized.length === 0) {
    return { histogram, width, height, depth, channels, length: normalized.length };
  }

  for (let index = 0, offset = 0; index < voxelCount; index++, offset += channels) {
    const intensity = computeIntensity(normalized, offset, channels);
    const clamped = intensity < 0 ? 0 : intensity > 255 ? 255 : intensity;
    histogram[clamped]++;
  }

  return { histogram, width, height, depth, channels, length: normalized.length };
}

function getCachedHistogram(volume: NormalizedVolume): Uint32Array {
  const cached = histogramCache.get(volume);
  if (cached) {
    const { width, height, depth, channels, length } = cached;
    if (
      width === volume.width &&
      height === volume.height &&
      depth === volume.depth &&
      channels === Math.max(1, volume.channels) &&
      length === volume.normalized.length
    ) {
      return cached.histogram;
    }
  }

  const computed = computeHistogram(volume);
  histogramCache.set(volume, computed);
  return computed.histogram;
}

export function clearHistogramCache() {
  histogramCache = new WeakMap<NormalizedVolume, CachedHistogram>();
}

export function computeAutoWindow(
  volume: NormalizedVolume,
  previousThreshold = 0
): AutoWindowResult {
  const histogram = getCachedHistogram(volume);
  const bins = histogram.length;
  const voxelCount = Math.max(0, volume.width * volume.height * volume.depth);
  const limit = Math.max(1, Math.floor(voxelCount / 10));

  const nextThreshold =
    previousThreshold < AUTO_THRESHOLD_RESET_LIMIT
      ? AUTO_THRESHOLD_INITIAL
      : Math.max(1, Math.floor(previousThreshold / 2));

  const threshold = nextThreshold > 0 ? voxelCount / nextThreshold : voxelCount;

  let hmin = 0;
  let foundMin = false;
  for (let i = 0; i < bins; i++) {
    let count = histogram[i];
    if (count > limit) {
      count = 0;
    }
    if (count > threshold) {
      hmin = i;
      foundMin = true;
      break;
    }
  }

  let hmax = bins - 1;
  let foundMax = false;
  for (let i = bins - 1; i >= 0; i--) {
    let count = histogram[i];
    if (count > limit) {
      count = 0;
    }
    if (count > threshold) {
      hmax = i;
      foundMax = true;
      break;
    }
  }

  let windowMin = 0;
  let windowMax = 1;

  if (foundMin && foundMax && hmax >= hmin) {
    const scale = bins > 1 ? 1 / (bins - 1) : 0;
    windowMin = hmin * scale;
    windowMax = hmax * scale;
    if (windowMax <= windowMin) {
      if (hmax < bins - 1) {
        windowMax = (hmax + 1) * scale;
      } else if (hmin > 0) {
        windowMin = (hmin - 1) * scale;
      } else {
        windowMin = 0;
        windowMax = 1;
      }
    }
  }

  return { windowMin, windowMax, nextThreshold };
}

export function getVolumeHistogram(volume: NormalizedVolume): Uint32Array {
  return getCachedHistogram(volume);
}

export function invalidateVolumeHistogram(volume: NormalizedVolume) {
  histogramCache.delete(volume);
}
