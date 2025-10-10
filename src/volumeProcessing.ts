import type { VolumeDataType, VolumePayload } from './api';

export type NormalizedVolume = {
  width: number;
  height: number;
  depth: number;
  channels: number;
  normalized: Uint8Array;
  min: number;
  max: number;
};

export type NormalizationParameters = {
  min: number;
  max: number;
};

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
  const totalValues = source.length;

  const { min, max } = parameters;
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

type SourceArray =
  | Uint8Array
  | Int8Array
  | Uint16Array
  | Int16Array
  | Uint32Array
  | Int32Array
  | Float32Array
  | Float64Array;

function createSourceArray(data: ArrayBuffer, dataType: VolumeDataType): SourceArray {
  switch (dataType) {
    case 'uint8':
      return new Uint8Array(data);
    case 'int8':
      return new Int8Array(data);
    case 'uint16':
      return new Uint16Array(data);
    case 'int16':
      return new Int16Array(data);
    case 'uint32':
      return new Uint32Array(data);
    case 'int32':
      return new Int32Array(data);
    case 'float32':
      return new Float32Array(data);
    case 'float64':
      return new Float64Array(data);
    default: {
      const exhaustiveCheck: never = dataType;
      throw new Error(`Unsupported volume data type: ${exhaustiveCheck}`);
    }
  }
}
