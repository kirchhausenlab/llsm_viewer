import type { NormalizedVolume } from './volumeProcessing';
import { MIN_WINDOW_WIDTH } from './state/layerSettings';

const HISTOGRAM_BINS = 256;
const LOWER_QUANTILE = 0.0005;
const UPPER_QUANTILE = 0.9995;
const RANGE_PADDING_FRACTION = 0.1;

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
  let totalCount = 0;
  for (let i = 0; i < bins; i++) {
    totalCount += histogram[i];
  }

  const defaultResult = {
    windowMin: 0,
    windowMax: 1,
    nextThreshold: previousThreshold > 0 ? previousThreshold : 1
  } satisfies AutoWindowResult;

  if (totalCount === 0) {
    return defaultResult;
  }

  const lowerTarget = Math.max(0, totalCount * LOWER_QUANTILE);
  const upperTarget = Math.min(totalCount, totalCount * UPPER_QUANTILE);

  let cumulative = 0;
  let hmin = 0;
  for (let i = 0; i < bins; i++) {
    cumulative += histogram[i];
    if (cumulative >= lowerTarget) {
      hmin = i;
      break;
    }
  }

  cumulative = 0;
  let hmax = bins - 1;
  for (let i = 0; i < bins; i++) {
    cumulative += histogram[i];
    if (cumulative >= upperTarget) {
      hmax = i;
      break;
    }
  }

  if (hmax <= hmin) {
    let firstNonZero = -1;
    let lastNonZero = -1;
    for (let i = 0; i < bins; i++) {
      if (histogram[i] > 0) {
        firstNonZero = i;
        break;
      }
    }
    for (let i = bins - 1; i >= 0; i--) {
      if (histogram[i] > 0) {
        lastNonZero = i;
        break;
      }
    }
    if (firstNonZero === -1 || lastNonZero === -1 || lastNonZero <= firstNonZero) {
      return defaultResult;
    }
    hmin = firstNonZero;
    hmax = lastNonZero;
  }

  const scale = bins > 1 ? 1 / (bins - 1) : 0;
  let windowMin = hmin * scale;
  let windowMax = hmax * scale;

  if (windowMax <= windowMin) {
    windowMax = Math.min(1, windowMin + MIN_WINDOW_WIDTH);
  }

  const baseRange = Math.max(windowMax - windowMin, MIN_WINDOW_WIDTH);
  const padding = Math.max(MIN_WINDOW_WIDTH * 0.5, baseRange * RANGE_PADDING_FRACTION);
  windowMin = Math.max(0, windowMin - padding);
  windowMax = Math.min(1, windowMax + padding);

  if (windowMax - windowMin < MIN_WINDOW_WIDTH) {
    const center = (windowMin + windowMax) * 0.5;
    const halfWidth = Math.max(MIN_WINDOW_WIDTH / 2, (windowMax - windowMin) / 2);
    windowMin = Math.max(0, center - halfWidth);
    windowMax = Math.min(1, center + halfWidth);
    if (windowMax - windowMin < MIN_WINDOW_WIDTH) {
      if (windowMin === 0) {
        windowMax = Math.min(1, windowMin + MIN_WINDOW_WIDTH);
      } else {
        windowMin = Math.max(0, windowMax - MIN_WINDOW_WIDTH);
      }
    }
  }

  return {
    windowMin,
    windowMax,
    nextThreshold: defaultResult.nextThreshold
  };
}

export function getVolumeHistogram(volume: NormalizedVolume): Uint32Array {
  return getCachedHistogram(volume);
}

export function invalidateVolumeHistogram(volume: NormalizedVolume) {
  histogramCache.delete(volume);
}
