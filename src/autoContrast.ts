import type { NormalizedVolume } from './volumeProcessing';
import { MIN_WINDOW_WIDTH } from './state/layerSettings';

const HISTOGRAM_BINS = 256;
export const HISTOGRAM_FIRST_VALID_BIN = 1;
const DEFAULT_AUTO_THRESHOLD_DENOMINATOR = 10000;
const DEFAULT_LOWER_QUANTILE = 0.005;
const DEFAULT_UPPER_QUANTILE = 0.995;
// Use a very gentle count threshold on the first auto pass so the maximum stays near the
// histogram tail even when high-intensity voxels are extremely sparse.
const INITIAL_MAX_THRESHOLD_MULTIPLIER = 0.02;

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
  const luminance = Math.round(sourceR * 0.2126 + sourceG * 0.7152 + sourceB * 0.0722);
  if (channels === 3) {
    return luminance;
  }

  // For RGBA or higher channel counts, derive intensity from RGB only so alpha does not skew
  // histogram tails or auto windowing.
  return luminance;
}

function computeHistogram(volume: NormalizedVolume): CachedHistogram {
  const { normalized, width, height, depth } = volume;
  const channels = Math.max(1, volume.channels);
  const voxelCount = width * height * depth;
  const expectedLength = voxelCount * channels;
  const histogram = new Uint32Array(HISTOGRAM_BINS);

  if (normalized.length < expectedLength) {
    const error = new Error(
      `Normalized volume length (${normalized.length}) is less than expected (${expectedLength}) for ${width}x${height}x${depth} with ${channels} channel(s).`
    );
    console.error(error);
    throw error;
  }

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
  for (let i = HISTOGRAM_FIRST_VALID_BIN; i < bins; i++) {
    totalCount += histogram[i];
  }

  const nextThreshold =
    previousThreshold < 10
      ? DEFAULT_AUTO_THRESHOLD_DENOMINATOR
      : Math.max(1, Math.floor(previousThreshold / 2));

  const defaultResult: AutoWindowResult = {
    windowMin: 0,
    windowMax: 1,
    nextThreshold
  };

  const totalVoxelCount = volume.width * volume.height * volume.depth;

  if (totalCount === 0 || totalVoxelCount === 0) {
    return defaultResult;
  }

  const minThreshold = totalVoxelCount / nextThreshold;
  const maxThreshold =
    previousThreshold < 10
      ? minThreshold * INITIAL_MAX_THRESHOLD_MULTIPLIER
      : minThreshold;
  const limit = totalCount / 10;

  let i = HISTOGRAM_FIRST_VALID_BIN - 1;
  let found = false;
  while (!found && i < bins - 1) {
    i++;
    let count = histogram[i];
    if (count > limit) {
      count = 0;
    }
    found = count > minThreshold;
  }
  const hmin = i;

  i = bins;
  found = false;
  while (!found && i > HISTOGRAM_FIRST_VALID_BIN) {
    i--;
    let count = histogram[i];
    if (count > limit) {
      count = 0;
    }
    found = count > maxThreshold;
  }
  const hmax = Math.max(i, HISTOGRAM_FIRST_VALID_BIN);

  if (hmax < hmin) {
    return defaultResult;
  }

  const scale = bins > 1 ? 1 / (bins - 1) : 0;
  let windowMin = hmin * scale;
  let windowMax = hmax * scale;

  if (windowMax - windowMin < MIN_WINDOW_WIDTH) {
    if (windowMax <= windowMin) {
      windowMax = Math.min(1, windowMin + MIN_WINDOW_WIDTH);
    } else {
      const center = (windowMin + windowMax) * 0.5;
      windowMin = Math.max(0, center - MIN_WINDOW_WIDTH / 2);
      windowMax = Math.min(1, center + MIN_WINDOW_WIDTH / 2);
    }
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
    nextThreshold
  };
}

export function getVolumeHistogram(volume: NormalizedVolume): Uint32Array {
  return getCachedHistogram(volume);
}

export function invalidateVolumeHistogram(volume: NormalizedVolume) {
  histogramCache.delete(volume);
}

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

export function computeHistogramQuantileWindow(
  volume: NormalizedVolume,
  lowerQuantile = DEFAULT_LOWER_QUANTILE,
  upperQuantile = DEFAULT_UPPER_QUANTILE
): { windowMin: number; windowMax: number } | null {
  const histogram = getCachedHistogram(volume);
  const bins = histogram.length;

  let totalCount = 0;
  for (let i = HISTOGRAM_FIRST_VALID_BIN; i < bins; i++) {
    totalCount += histogram[i];
  }

  if (totalCount === 0) {
    return null;
  }

  const safeLower = clamp01(lowerQuantile);
  const safeUpper = clamp01(upperQuantile);
  const targetLower = Math.min(safeLower, safeUpper) * totalCount;
  const targetUpper = Math.max(safeLower, safeUpper) * totalCount;

  let cumulative = 0;
  let lowerBin = HISTOGRAM_FIRST_VALID_BIN;
  for (let i = HISTOGRAM_FIRST_VALID_BIN; i < bins; i++) {
    cumulative += histogram[i];
    if (cumulative >= targetLower) {
      lowerBin = i;
      break;
    }
  }

  cumulative = 0;
  let upperBin = bins - 1;
  for (let i = HISTOGRAM_FIRST_VALID_BIN; i < bins; i++) {
    cumulative += histogram[i];
    if (cumulative >= targetUpper) {
      upperBin = i;
      break;
    }
  }

  if (upperBin < lowerBin) {
    const swap = upperBin;
    upperBin = lowerBin;
    lowerBin = swap;
  }

  const scale = bins > 1 ? 1 / (bins - 1) : 0;
  let windowMin = lowerBin * scale;
  let windowMax = upperBin * scale;

  windowMin = clamp01(windowMin);
  windowMax = clamp01(windowMax);

  if (windowMax - windowMin < MIN_WINDOW_WIDTH) {
    if (windowMax <= windowMin) {
      windowMax = Math.min(1, windowMin + MIN_WINDOW_WIDTH);
    } else {
      const center = (windowMin + windowMax) * 0.5;
      windowMin = Math.max(0, center - MIN_WINDOW_WIDTH / 2);
      windowMax = Math.min(1, center + MIN_WINDOW_WIDTH / 2);
    }
    if (windowMax - windowMin < MIN_WINDOW_WIDTH) {
      if (windowMin === 0) {
        windowMax = Math.min(1, windowMin + MIN_WINDOW_WIDTH);
      } else {
        windowMin = Math.max(0, windowMax - MIN_WINDOW_WIDTH);
      }
    }
  }

  return { windowMin, windowMax };
}
