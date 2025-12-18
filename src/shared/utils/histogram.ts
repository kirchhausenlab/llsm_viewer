import { ensureArrayBuffer } from './buffer';

export const HISTOGRAM_BINS = 256;

function computeIntensity(data: Uint8Array, offset: number, channels: number): number {
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
  return luminance;
}

export function computeUint8VolumeHistogram(volume: {
  normalized: Uint8Array;
  width: number;
  height: number;
  depth: number;
  channels: number;
}): Uint32Array {
  const { normalized, width, height, depth } = volume;
  const channels = Math.max(1, volume.channels);
  const voxelCount = width * height * depth;
  const expectedLength = voxelCount * channels;
  const histogram = new Uint32Array(HISTOGRAM_BINS);

  if (normalized.length < expectedLength) {
    throw new Error(
      `Normalized volume length (${normalized.length}) is less than expected (${expectedLength}) for ${width}x${height}x${depth} with ${channels} channel(s).`
    );
  }

  if (voxelCount === 0 || normalized.length === 0) {
    return histogram;
  }

  for (let index = 0, offset = 0; index < voxelCount; index++, offset += channels) {
    const intensity = computeIntensity(normalized, offset, channels);
    const clamped = intensity < 0 ? 0 : intensity > 255 ? 255 : intensity;
    histogram[clamped] += 1;
  }

  return histogram;
}

export function encodeUint32ArrayLE(values: Uint32Array): Uint8Array {
  const bytes = new Uint8Array(values.length * 4);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < values.length; index += 1) {
    view.setUint32(index * 4, values[index] ?? 0, true);
  }
  return bytes;
}

export function decodeUint32ArrayLE(bytes: Uint8Array, length: number): Uint32Array {
  const expectedBytes = length * 4;
  if (bytes.byteLength !== expectedBytes) {
    throw new Error(`Invalid uint32 array byte length (expected ${expectedBytes}, got ${bytes.byteLength}).`);
  }

  const buffer = ensureArrayBuffer(bytes);
  const view = new DataView(buffer, bytes.byteOffset, bytes.byteLength);
  const values = new Uint32Array(length);
  for (let index = 0; index < length; index += 1) {
    values[index] = view.getUint32(index * 4, true);
  }
  return values;
}

