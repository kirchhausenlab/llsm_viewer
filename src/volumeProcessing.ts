import type { VolumePayload } from './api';

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
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;

  for (const volume of volumes) {
    const source = new Float32Array(volume.data);
    for (let i = 0; i < source.length; i++) {
      const value = source[i];
      if (value < min) min = value;
      if (value > max) max = value;
    }
  }

  if (!Number.isFinite(min) || min === Number.POSITIVE_INFINITY) {
    min = 0;
  }
  if (!Number.isFinite(max) || max === Number.NEGATIVE_INFINITY) {
    max = 1;
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
  const { width, height, depth, channels, data } = volume;
  const source = new Float32Array(data);
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
