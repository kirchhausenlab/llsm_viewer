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

  const normalized = new Uint8Array(voxelCount * channels);

  if (channels === 1) {
    for (let i = 0; i < voxelCount; i++) {
      const value = source[i];
      if (value < min) min = value;
      if (value > max) max = value;
    }

    if (!Number.isFinite(min) || !Number.isFinite(max) || min === Number.POSITIVE_INFINITY) {
      min = 0;
      max = 1;
    }

    const range = max - min || 1;
    for (let i = 0; i < voxelCount; i++) {
      const normalizedValue = (source[i] - min) / range;
      const clamped = Math.max(0, Math.min(1, normalizedValue));
      normalized[i] = Math.round(clamped * 255);
    }
  } else {
    const channelMins = new Array<number>(channels).fill(Number.POSITIVE_INFINITY);
    const channelMaxes = new Array<number>(channels).fill(Number.NEGATIVE_INFINITY);

    for (let i = 0; i < voxelCount; i++) {
      let sum = 0;
      const base = i * channels;
      for (let channel = 0; channel < channels; channel++) {
        const value = source[base + channel];
        if (value < channelMins[channel]) channelMins[channel] = value;
        if (value > channelMaxes[channel]) channelMaxes[channel] = value;
        sum += value;
      }
      const intensity = sum / channels;
      if (intensity < min) min = intensity;
      if (intensity > max) max = intensity;
    }

    for (let channel = 0; channel < channels; channel++) {
      if (!Number.isFinite(channelMins[channel]) || channelMins[channel] === Number.POSITIVE_INFINITY) {
        channelMins[channel] = 0;
      }
      if (!Number.isFinite(channelMaxes[channel]) || channelMaxes[channel] === Number.NEGATIVE_INFINITY) {
        channelMaxes[channel] = 1;
      }
    }

    if (!Number.isFinite(min) || !Number.isFinite(max) || min === Number.POSITIVE_INFINITY) {
      min = 0;
      max = 1;
    }

    const ranges = channelMins.map((channelMin, index) => {
      const channelRange = channelMaxes[index] - channelMin;
      return channelRange === 0 ? 1 : channelRange;
    });

    for (let i = 0; i < voxelCount; i++) {
      const base = i * channels;
      for (let channel = 0; channel < channels; channel++) {
        const value = source[base + channel];
        const normalizedValue = (value - channelMins[channel]) / ranges[channel];
        const clamped = Math.max(0, Math.min(1, normalizedValue));
        normalized[base + channel] = Math.round(clamped * 255);
      }
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
