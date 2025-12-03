import * as THREE from 'three';
import { clearHistogramCache } from '../autoContrast';
import type { NormalizedVolume } from './volumeProcessing';

export type PreparedTexture = {
  data: Uint8Array;
  format: THREE.Data3DTexture['format'];
};

let cache = new WeakMap<NormalizedVolume, PreparedTexture>();

function computeTextureData(volume: NormalizedVolume): PreparedTexture {
  const { normalized, width, height, depth, channels } = volume;
  const voxelCount = width * height * depth;

  const isTightlyPacked =
    normalized.byteOffset === 0 &&
    normalized.byteLength === normalized.buffer.byteLength;

  if (channels <= 2) {
    const data = isTightlyPacked ? normalized : normalized.slice();
    const format = channels === 1 ? THREE.RedFormat : THREE.RGFormat;
    return { data, format };
  }

  if (channels === 3) {
    const packed = new Uint8Array(voxelCount * 4);

    for (let index = 0; index < voxelCount; index++) {
      const srcBase = index * channels;
      const dstBase = index * 4;

      packed[dstBase] = normalized[srcBase];
      packed[dstBase + 1] = normalized[srcBase + 1];
      packed[dstBase + 2] = normalized[srcBase + 2];
      packed[dstBase + 3] = 255;
    }

    return { data: packed, format: THREE.RGBAFormat };
  }

  const packed = new Uint8Array(voxelCount * 4);
  const alphaChannels = Math.min(channels, 3);

  for (let index = 0; index < voxelCount; index++) {
    const srcBase = index * channels;
    const dstBase = index * 4;

    const r = normalized[srcBase];
    const g = channels > 1 ? normalized[srcBase + 1] : r;
    const b = channels > 2 ? normalized[srcBase + 2] : g;

    packed[dstBase] = r;
    packed[dstBase + 1] = g;
    packed[dstBase + 2] = b;

    if (channels >= 4) {
      packed[dstBase + 3] = normalized[srcBase + 3];
    } else {
      let alphaSum = 0;
      for (let channel = 0; channel < alphaChannels; channel++) {
        alphaSum += normalized[srcBase + channel];
      }
      packed[dstBase + 3] = Math.round(alphaSum / alphaChannels);
    }
  }

  return { data: packed, format: THREE.RGBAFormat };
}

export function getCachedTextureData(volume: NormalizedVolume): PreparedTexture {
  const cached = cache.get(volume);
  if (cached) {
    return cached;
  }
  const prepared = computeTextureData(volume);
  cache.set(volume, prepared);
  return prepared;
}

export function clearTextureCache() {
  cache = new WeakMap<NormalizedVolume, PreparedTexture>();
  clearHistogramCache();
}
