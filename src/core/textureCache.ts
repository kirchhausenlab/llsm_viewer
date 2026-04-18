import * as THREE from 'three';
import { clearHistogramCache } from '../autoContrast';
import type { IntensityVolume } from './volumeProcessing';

export type PreparedTexture = {
  data: Uint8Array | Float32Array;
  format: THREE.Data3DTexture['format'];
};

let cache = new WeakMap<IntensityVolume, PreparedTexture>();

function normalizeUint16ToFloat32(data: Uint16Array): Float32Array {
  const normalized = new Float32Array(data.length);
  const scale = 1 / 65535;
  for (let index = 0; index < data.length; index += 1) {
    normalized[index] = (data[index] ?? 0) * scale;
  }
  return normalized;
}

function computeTextureData(volume: IntensityVolume): PreparedTexture {
  const { normalized, normalizedDataType, width, height, depth, channels } = volume;
  const voxelCount = width * height * depth;
  const alphaOpaque = normalizedDataType === 'uint16' ? 1 : 0xff;

  const isTightlyPacked =
    normalized.byteOffset === 0 &&
    normalized.byteLength === normalized.buffer.byteLength;

  if (channels <= 2) {
    const data =
      normalizedDataType === 'uint16'
        ? normalizeUint16ToFloat32(isTightlyPacked ? normalized as Uint16Array : normalized.slice() as Uint16Array)
        : (isTightlyPacked ? normalized as Uint8Array : normalized.slice() as Uint8Array);
    const format = channels === 1 ? THREE.RedFormat : THREE.RGFormat;
    return { data, format };
  }

  if (channels === 3) {
    const packed = normalizedDataType === 'uint16'
      ? new Float32Array(voxelCount * 4)
      : new Uint8Array(voxelCount * 4);
    for (let index = 0; index < voxelCount; index++) {
      const srcBase = index * 3;
      const dstBase = index * 4;
      packed[dstBase] = normalizedDataType === 'uint16' ? (normalized[srcBase] ?? 0) / 65535 : normalized[srcBase];
      packed[dstBase + 1] =
        normalizedDataType === 'uint16' ? (normalized[srcBase + 1] ?? 0) / 65535 : normalized[srcBase + 1];
      packed[dstBase + 2] =
        normalizedDataType === 'uint16' ? (normalized[srcBase + 2] ?? 0) / 65535 : normalized[srcBase + 2];
      packed[dstBase + 3] = alphaOpaque;
    }
    return { data: packed, format: THREE.RGBAFormat };
  }

  if (channels === 4) {
    const data =
      normalizedDataType === 'uint16'
        ? normalizeUint16ToFloat32(isTightlyPacked ? normalized as Uint16Array : normalized.slice() as Uint16Array)
        : (isTightlyPacked ? normalized as Uint8Array : normalized.slice() as Uint8Array);
    return { data, format: THREE.RGBAFormat };
  }

  const packed = normalizedDataType === 'uint16'
    ? new Float32Array(voxelCount * 4)
    : new Uint8Array(voxelCount * 4);
  const alphaChannels = Math.min(channels, 3);

  for (let index = 0; index < voxelCount; index++) {
    const srcBase = index * channels;
    const dstBase = index * 4;

    const r = normalized[srcBase];
    const g = channels > 1 ? normalized[srcBase + 1] : r;
    const b = channels > 2 ? normalized[srcBase + 2] : g;

    packed[dstBase] = normalizedDataType === 'uint16' ? r / 65535 : r;
    packed[dstBase + 1] = normalizedDataType === 'uint16' ? g / 65535 : g;
    packed[dstBase + 2] = normalizedDataType === 'uint16' ? b / 65535 : b;

    if (channels >= 4) {
      packed[dstBase + 3] =
        normalizedDataType === 'uint16'
          ? (normalized[srcBase + 3] ?? 0) / 65535
          : normalized[srcBase + 3];
    } else {
      let alphaSum = 0;
      for (let channel = 0; channel < alphaChannels; channel++) {
        alphaSum += normalized[srcBase + channel];
      }
      packed[dstBase + 3] =
        normalizedDataType === 'uint16'
          ? alphaSum / Math.max(1, alphaChannels) / 65535
          : Math.round(alphaSum / alphaChannels);
    }
  }

  return { data: packed, format: THREE.RGBAFormat };
}

export function getCachedTextureData(volume: IntensityVolume): PreparedTexture {
  const cached = cache.get(volume);
  if (cached) {
    return cached;
  }
  const prepared = computeTextureData(volume);
  cache.set(volume, prepared);
  return prepared;
}

export function clearTextureCache() {
  cache = new WeakMap<IntensityVolume, PreparedTexture>();
  clearHistogramCache();
}
