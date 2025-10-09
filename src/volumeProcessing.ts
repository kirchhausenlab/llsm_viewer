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

export function normalizeVolume(volume: VolumePayload): NormalizedVolume {
  const { width, height, depth, channels, data } = volume;
  const voxelCount = width * height * depth;

  const source = new Float32Array(data);

  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;

  if (channels === 1) {
    for (let i = 0; i < voxelCount; i++) {
      const value = source[i];
      if (value < min) min = value;
      if (value > max) max = value;
    }
  } else {
    for (let i = 0; i < voxelCount; i++) {
      let sum = 0;
      const base = i * channels;
      for (let channel = 0; channel < channels; channel++) {
        sum += source[base + channel];
      }
      const value = sum / channels;
      if (value < min) min = value;
      if (value > max) max = value;
    }
  }

  if (!Number.isFinite(min) || !Number.isFinite(max) || min === Number.POSITIVE_INFINITY) {
    min = 0;
    max = 1;
  }

  const range = max - min || 1;
  const normalized = new Uint8Array(voxelCount);

  if (channels === 1) {
    for (let i = 0; i < voxelCount; i++) {
      const normalizedValue = (source[i] - min) / range;
      const clamped = Math.max(0, Math.min(1, normalizedValue));
      normalized[i] = Math.round(clamped * 255);
    }
  } else {
    for (let i = 0; i < voxelCount; i++) {
      let sum = 0;
      const base = i * channels;
      for (let channel = 0; channel < channels; channel++) {
        sum += source[base + channel];
      }
      const normalizedValue = sum / channels;
      const scaled = (normalizedValue - min) / range;
      const clamped = Math.max(0, Math.min(1, scaled));
      normalized[i] = Math.round(clamped * 255);
    }
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
