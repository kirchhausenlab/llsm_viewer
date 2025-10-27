import {
  createVolumeTypedArray,
  type VolumeDataType,
  type VolumePayload,
  type VolumeTypedArray
} from './types/volume';

export type NormalizedVolume = {
  width: number;
  height: number;
  depth: number;
  channels: number;
  /**
   * Normalized voxel data. This view must be treated as read-only because it
   * can share the underlying buffer with the source volume when normalization
   * is already in the [0, 255] range.
   */
  readonly normalized: Uint8Array;
  min: number;
  max: number;
};

export type NormalizationParameters = {
  min: number;
  max: number;
};

const createDeterministicRng = (seed: number): (() => number) => {
  let state = seed >>> 0;
  if (state === 0) {
    state = 0x6d2b79f5;
  }
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const createSegmentationColorTable = (maxLabel: number, seed: number): Uint8Array => {
  const table = new Uint8Array((maxLabel + 1) * 3);
  if (maxLabel === 0) {
    return table;
  }
  const rng = createDeterministicRng(seed);
  for (let label = 1; label <= maxLabel; label++) {
    let r = Math.floor(rng() * 256);
    let g = Math.floor(rng() * 256);
    let b = Math.floor(rng() * 256);
    if (r === 0 && g === 0 && b === 0) {
      r = 255;
    }
    const index = label * 3;
    table[index] = r;
    table[index + 1] = g;
    table[index + 2] = b;
  }
  return table;
};

export function colorizeSegmentationVolume(volume: VolumePayload, seed: number): NormalizedVolume {
  const { width, height, depth, dataType } = volume;
  const source = createSourceArray(volume.data, dataType);

  const voxelCount = source.length;
  let maxLabel = 0;
  for (let i = 0; i < voxelCount; i++) {
    const value = Math.trunc(source[i]);
    if (value > maxLabel) {
      maxLabel = value;
    }
  }

  const colorTable = createSegmentationColorTable(maxLabel, seed);
  const normalized = new Uint8Array(voxelCount * 3);

  for (let i = 0; i < voxelCount; i++) {
    const raw = Math.trunc(source[i]);
    const label = raw <= 0 ? 0 : raw > maxLabel ? maxLabel : raw;
    const tableIndex = label * 3;
    const destIndex = i * 3;
    normalized[destIndex] = colorTable[tableIndex];
    normalized[destIndex + 1] = colorTable[tableIndex + 1];
    normalized[destIndex + 2] = colorTable[tableIndex + 2];
  }

  return {
    width,
    height,
    depth,
    channels: 3,
    normalized,
    min: 0,
    max: 255
  };
}

export function computeNormalizationParameters(volumes: VolumePayload[]): NormalizationParameters {
  if (volumes.length === 0) {
    return { min: 0, max: 1 };
  }

  const allUint8 = volumes.every((volume) => volume.dataType === 'uint8');
  if (allUint8) {
    return { min: 0, max: 255 };
  }

  const floatVolumes = volumes.filter(
    (volume) => volume.dataType === 'float32' || volume.dataType === 'float64'
  );
  const volumesToScan = floatVolumes.length > 0 ? floatVolumes : volumes;

  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;

  for (const volume of volumesToScan) {
    if (Number.isFinite(volume.min) && volume.min < min) {
      min = volume.min;
    }
    if (Number.isFinite(volume.max) && volume.max > max) {
      max = volume.max;
    }
  }

  if (!Number.isFinite(min) || min === Number.POSITIVE_INFINITY) {
    min = 0;
  }
  if (!Number.isFinite(max) || max === Number.NEGATIVE_INFINITY) {
    max = min === 0 ? 1 : min + 1;
  }
  if (min === max) {
    max = min + 1;
  }

  return { min, max };
}

export function normalizeVolume(
  volume: VolumePayload,
  parameters: NormalizationParameters
): NormalizedVolume {
  const { width, height, depth, channels, data, dataType } = volume;
  const source = createSourceArray(data, dataType);

  const { min, max } = parameters;

  if (
    dataType === 'uint8' &&
    min === 0 &&
    max === 255 &&
    source instanceof Uint8Array
  ) {
    return {
      width,
      height,
      depth,
      channels,
      normalized: source,
      min,
      max
    };
  }

  const totalValues = source.length;
  const range = max - min || 1;
  const normalized = new Uint8Array(totalValues);

  for (let i = 0; i < totalValues; i++) {
    const normalizedValue = (source[i] - min) / range;
    const clamped = Math.max(0, Math.min(1, normalizedValue));
    normalized[i] = Math.round(clamped * 255);
  }

  return {
    width,
    height,
    depth,
    channels,
    normalized,
    min,
    max
  };
}

type SourceArray = VolumeTypedArray;

function createSourceArray(data: ArrayBufferLike, dataType: VolumeDataType): SourceArray {
  return createVolumeTypedArray(dataType, data);
}
