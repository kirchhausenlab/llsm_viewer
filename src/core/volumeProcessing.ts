import {
  createVolumeTypedArray,
  type VolumeDataType,
  type VolumePayload,
  type VolumeTypedArray
} from '../types/volume';

export type NormalizedVolume = {
  width: number;
  height: number;
  depth: number;
  channels: number;
  dataType: VolumeDataType;
  /**
   * Normalized voxel data. This view must be treated as read-only because it
   * can share the underlying buffer with the source volume when normalization
   * is already in the [0, 255] range.
   */
  readonly normalized: Uint8Array;
  /**
   * Optional precomputed intensity histogram for the normalized bytes, using the
   * viewer's intensity definition (1ch=R, 2ch=avg(R,G), >=3ch=luminance(R,G,B)).
   */
  histogram?: Uint32Array;
  min: number;
  max: number;
  segmentationLabels?: Uint32Array;
  segmentationLabelDataType?: VolumeDataType;
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

const hsvToRgb = (h: number, s: number, v: number): [number, number, number] => {
  const hue = ((h % 360) + 360) % 360;
  const chroma = v * s;
  const hueSector = hue / 60;
  const intermediate = chroma * (1 - Math.abs((hueSector % 2) - 1));

  let r1 = 0;
  let g1 = 0;
  let b1 = 0;

  if (hueSector >= 0 && hueSector < 1) {
    r1 = chroma;
    g1 = intermediate;
  } else if (hueSector >= 1 && hueSector < 2) {
    r1 = intermediate;
    g1 = chroma;
  } else if (hueSector >= 2 && hueSector < 3) {
    g1 = chroma;
    b1 = intermediate;
  } else if (hueSector >= 3 && hueSector < 4) {
    g1 = intermediate;
    b1 = chroma;
  } else if (hueSector >= 4 && hueSector < 5) {
    r1 = intermediate;
    b1 = chroma;
  } else {
    r1 = chroma;
    b1 = intermediate;
  }

  const match = v - chroma;

  const toByte = (value: number): number => {
    const adjusted = value + match;
    const clamped = Math.min(1, Math.max(0, adjusted));
    return Math.round(clamped * 255);
  };

  return [toByte(r1), toByte(g1), toByte(b1)];
};

const createSegmentationColorTable = (maxLabel: number, seed: number): Uint8Array => {
  const table = new Uint8Array((maxLabel + 1) * 3);
  // Ensure label 0 is always mapped to black so it renders transparent.
  table[0] = 0;
  table[1] = 0;
  table[2] = 0;

  if (maxLabel === 0) {
    return table;
  }
  const rng = createDeterministicRng(seed);
  for (let label = 1; label <= maxLabel; label++) {
    const hue = rng() * 360;
    const [r, g, b] = hsvToRgb(hue, 1, 1);
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
  const toLabelId = (value: number): number => {
    if (!Number.isFinite(value)) {
      return 0;
    }
    if (value <= 0) {
      return 0;
    }
    const rounded = Math.round(value);
    return rounded <= 0 ? 0 : rounded;
  };

  let maxLabel = 0;
  for (let i = 0; i < voxelCount; i++) {
    const label = toLabelId(source[i]);
    if (label > maxLabel) {
      maxLabel = label;
    }
  }

  const colorTable = createSegmentationColorTable(maxLabel, seed);
  const normalized = new Uint8Array(voxelCount * 4);
  const segmentationLabels = new Uint32Array(voxelCount);

  for (let i = 0; i < voxelCount; i++) {
    const rawLabel = toLabelId(source[i]);
    const label = rawLabel > maxLabel ? maxLabel : rawLabel;
    segmentationLabels[i] = label;
    const tableIndex = label * 3;
    const destIndex = i * 4;
    const red = colorTable[tableIndex];
    const green = colorTable[tableIndex + 1];
    const blue = colorTable[tableIndex + 2];
    normalized[destIndex] = red;
    normalized[destIndex + 1] = green;
    normalized[destIndex + 2] = blue;
    normalized[destIndex + 3] = label === 0 ? 0 : 255;
  }

  return {
    width,
    height,
    depth,
    channels: 4,
    dataType: 'uint8',
    normalized,
    min: 0,
    max: 255,
    segmentationLabels,
    segmentationLabelDataType: dataType
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
      dataType,
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
    dataType,
    normalized,
    min,
    max
  };
}

type SourceArray = VolumeTypedArray;

function createSourceArray(data: ArrayBufferLike, dataType: VolumeDataType): SourceArray {
  return createVolumeTypedArray(dataType, data);
}
