import { ensureArrayBuffer } from './buffer';
import { getNormalizedIntensityDenominator, type NormalizedIntensityDataType } from '../../core/volumeProcessing';

export const HISTOGRAM_BINS = 256;

function normalizeHistogramSample(value: number, normalizedDataType: NormalizedIntensityDataType): number {
  const denominator = getNormalizedIntensityDenominator(normalizedDataType);
  const scaled = Math.round((Math.max(0, Math.min(denominator, value)) * 255) / denominator);
  return scaled < 0 ? 0 : scaled > 255 ? 255 : scaled;
}

function computeIntensity(
  data: Uint8Array | Uint16Array,
  offset: number,
  channels: number,
  normalizedDataType: NormalizedIntensityDataType
): number {
  const sourceR = data[offset] ?? 0;
  if (channels <= 1) {
    return normalizeHistogramSample(sourceR, normalizedDataType);
  }

  const sourceG = data[offset + 1] ?? 0;
  if (channels === 2) {
    return normalizeHistogramSample(Math.round((sourceR + sourceG) * 0.5), normalizedDataType);
  }

  const sourceB = data[offset + 2] ?? 0;
  return normalizeHistogramSample(Math.round(sourceR * 0.2126 + sourceG * 0.7152 + sourceB * 0.0722), normalizedDataType);
}

export function computeNormalizedVolumeHistogram(volume: {
  normalized: Uint8Array | Uint16Array;
  normalizedDataType: NormalizedIntensityDataType;
  width: number;
  height: number;
  depth: number;
  channels: number;
}): Uint32Array {
  const { normalized, normalizedDataType, width, height, depth } = volume;
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
    histogram[computeIntensity(normalized, offset, channels, normalizedDataType)] += 1;
  }

  return histogram;
}

export function computeUint8VolumeHistogram(volume: {
  normalized: Uint8Array;
  width: number;
  height: number;
  depth: number;
  channels: number;
}): Uint32Array {
  return computeNormalizedVolumeHistogram({
    ...volume,
    normalizedDataType: 'uint8'
  });
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
