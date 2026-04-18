import {
  createVolumeTypedArray,
  type VolumeDataType,
  type VolumePayload,
  type VolumeTypedArray
} from '../types/volume';

export type NormalizedIntensityDataType = 'uint8' | 'uint16';
export type NormalizedIntensityArray = Uint8Array | Uint16Array;

type BaseViewerVolume = {
  width: number;
  height: number;
  depth: number;
  scaleLevel?: number;
  downsampleFactor?: [number, number, number];
};

export type IntensityVolume = BaseViewerVolume & {
  kind: 'intensity';
  channels: number;
  dataType: VolumeDataType;
  normalizedDataType: NormalizedIntensityDataType;
  /**
   * Normalized voxel data. This view must be treated as read-only because it
   * can share the underlying buffer with the source volume when normalization
   * is already in the full normalized storage range for the target precision.
   */
  readonly normalized: NormalizedIntensityArray;
  /**
   * Optional precomputed intensity histogram for the normalized bytes, using the
   * viewer's intensity definition (1ch=R, 2ch=avg(R,G), >=3ch=luminance(R,G,B)).
   */
  histogram?: Uint32Array;
  min: number;
  max: number;
  readonly labels?: never;
};

export type SegmentationVolume = BaseViewerVolume & {
  kind: 'segmentation';
  channels: 1;
  dataType: 'uint16';
  readonly labels: Uint16Array;
  readonly normalized?: never;
  histogram?: never;
  min: 0;
  max: number;
};

export type NormalizedVolume = IntensityVolume | SegmentationVolume;

export type NormalizationParameters = {
  min: number;
  max: number;
};

export function getNormalizedIntensityDenominator(type: NormalizedIntensityDataType): number {
  return type === 'uint16' ? 0xffff : 0xff;
}

export const MAX_SEGMENTATION_LABEL_ID = 0xffff;
export const SEGMENTATION_PALETTE_SIZE = MAX_SEGMENTATION_LABEL_ID + 1;

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

export const isSegmentationVolume = (volume: NormalizedVolume): volume is SegmentationVolume =>
  volume.kind === 'segmentation';

export const isIntensityVolume = (volume: NormalizedVolume): volume is IntensityVolume =>
  volume.kind === 'intensity';

export function toSegmentationLabelId(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  if (value <= 0) {
    return 0;
  }
  const rounded = Math.round(value);
  if (rounded <= 0) {
    return 0;
  }
  if (rounded > MAX_SEGMENTATION_LABEL_ID) {
    throw new Error(
      `Segmentation label ${rounded} exceeds the supported uint16 range (${MAX_SEGMENTATION_LABEL_ID}).`
    );
  }
  return rounded;
}

export const createSegmentationColorTable = (seed: number): Uint8Array => {
  const table = new Uint8Array(SEGMENTATION_PALETTE_SIZE * 4);
  table[0] = 0;
  table[1] = 0;
  table[2] = 0;
  table[3] = 0;

  const rng = createDeterministicRng(seed);
  for (let label = 1; label < SEGMENTATION_PALETTE_SIZE; label += 1) {
    const hue = rng() * 360;
    const [r, g, b] = hsvToRgb(hue, 1, 1);
    const index = label * 4;
    table[index] = r;
    table[index + 1] = g;
    table[index + 2] = b;
    table[index + 3] = 255;
  }
  return table;
};

function canonicalizeSegmentationFromSource({
  width,
  height,
  depth,
  source
}: {
  width: number;
  height: number;
  depth: number;
  source: SourceArray;
}): SegmentationVolume {
  const voxelCount = source.length;
  let maxLabel = 0;
  for (let i = 0; i < voxelCount; i++) {
    const label = toSegmentationLabelId(source[i]);
    if (label > maxLabel) {
      maxLabel = label;
    }
  }

  const labels = new Uint16Array(voxelCount);

  for (let i = 0; i < voxelCount; i++) {
    labels[i] = toSegmentationLabelId(source[i]);
  }

  return {
    kind: 'segmentation',
    width,
    height,
    depth,
    channels: 1,
    dataType: 'uint16',
    labels,
    min: 0,
    max: maxLabel
  };
}

export function canonicalizeSegmentationVolume(volume: VolumePayload): SegmentationVolume {
  const { width, height, depth, dataType } = volume;
  const source = createSourceArray(volume.data, dataType);
  return canonicalizeSegmentationFromSource({
    width,
    height,
    depth,
    source
  });
}

export function canonicalizeSegmentationTypedArray({
  width,
  height,
  depth,
  dataType,
  source
}: {
  width: number;
  height: number;
  depth: number;
  dataType: VolumeDataType;
  source: VolumeTypedArray;
}): SegmentationVolume {
  void dataType;
  return canonicalizeSegmentationFromSource({
    width,
    height,
    depth,
    source
  });
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
    // Preserve constant positive signals: avoid collapsing them to zero during uint8 normalization.
    if (max > 0) {
      min = 0;
    } else if (min < 0) {
      max = 0;
    } else {
      max = 1;
    }
  }

  return { min, max };
}

function normalizeFromSource({
  width,
  height,
  depth,
  channels,
  dataType,
  source,
  parameters,
  normalizedDataType
}: {
  width: number;
  height: number;
  depth: number;
  channels: number;
  dataType: VolumeDataType;
  source: SourceArray;
  parameters: NormalizationParameters;
  normalizedDataType: NormalizedIntensityDataType;
}): NormalizedVolume {
  const { min, max } = parameters;
  const denominator = getNormalizedIntensityDenominator(normalizedDataType);

  if (
    (
      (normalizedDataType === 'uint8' &&
        dataType === 'uint8' &&
        min === 0 &&
        max === 255 &&
        source instanceof Uint8Array) ||
      (normalizedDataType === 'uint16' &&
        dataType === 'uint16' &&
        min === 0 &&
        max === denominator &&
        source instanceof Uint16Array)
    )
  ) {
    return {
      kind: 'intensity',
      width,
      height,
      depth,
      channels,
      dataType,
      normalizedDataType,
      normalized: source,
      min,
      max
    };
  }

  const totalValues = source.length;
  const range = max - min || 1;
  const normalized = normalizedDataType === 'uint16'
    ? new Uint16Array(totalValues)
    : new Uint8Array(totalValues);

  for (let i = 0; i < totalValues; i++) {
    const normalizedValue = (source[i] - min) / range;
    const clamped = Math.max(0, Math.min(1, normalizedValue));
    normalized[i] = Math.round(clamped * denominator);
  }

  return {
    kind: 'intensity',
    width,
    height,
    depth,
    channels,
    dataType,
    normalizedDataType,
    normalized,
    min,
    max
  };
}

export function normalizeVolume(
  volume: VolumePayload,
  parameters: NormalizationParameters,
  normalizedDataType: NormalizedIntensityDataType = 'uint8'
): NormalizedVolume {
  const { width, height, depth, channels, data, dataType } = volume;
  const source = createSourceArray(data, dataType);
  return normalizeFromSource({
    width,
    height,
    depth,
    channels,
    dataType,
    source,
    parameters,
    normalizedDataType
  });
}

export function normalizeTypedArray({
  width,
  height,
  depth,
  channels,
  dataType,
  source,
  parameters,
  normalizedDataType = 'uint8'
}: {
  width: number;
  height: number;
  depth: number;
  channels: number;
  dataType: VolumeDataType;
  source: VolumeTypedArray;
  parameters: NormalizationParameters;
  normalizedDataType?: NormalizedIntensityDataType;
}): NormalizedVolume {
  return normalizeFromSource({
    width,
    height,
    depth,
    channels,
    dataType,
    source,
    parameters,
    normalizedDataType
  });
}

type SourceArray = VolumeTypedArray;

function createSourceArray(data: ArrayBufferLike, dataType: VolumeDataType): SourceArray {
  return createVolumeTypedArray(dataType, data);
}
