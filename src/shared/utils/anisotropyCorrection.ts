import type {
  AnisotropyScaleFactors,
  VoxelResolutionValues
} from '../../types/voxelResolution';
import {
  createVolumeTypedArray,
  createWritableVolumeArray,
  isVolumeDataHandle,
  type VolumeDataType,
  type VolumePayload
} from '../../types/volume';

const SCALE_IDENTITY_EPSILON = 1e-4;

type AxisSample = {
  index0: number;
  index1: number;
  weight: number;
  nearest: number;
};

type ResampleOptions = {
  scale: AnisotropyScaleFactors;
  interpolation: 'linear' | 'nearest';
  targetDataType?: VolumeDataType;
};

export function computeAnisotropyScale(
  voxelResolution: VoxelResolutionValues | null
): AnisotropyScaleFactors | null {
  if (!voxelResolution || !voxelResolution.correctAnisotropy) {
    return null;
  }
  const axes: Array<'x' | 'y' | 'z'> = ['x', 'y', 'z'];
  const values = axes.map((axis) => voxelResolution[axis]);
  if (values.some((value) => !Number.isFinite(value) || value <= 0)) {
    return null;
  }
  const minSpacing = Math.min(...values);
  if (minSpacing <= 0) {
    return null;
  }
  const scale: AnisotropyScaleFactors = {
    x: voxelResolution.x / minSpacing,
    y: voxelResolution.y / minSpacing,
    z: voxelResolution.z / minSpacing
  };
  if (isIdentityScale(scale)) {
    return null;
  }
  return scale;
}

export function isIdentityScale(scale: AnisotropyScaleFactors): boolean {
  return (
    Math.abs(scale.x - 1) < SCALE_IDENTITY_EPSILON &&
    Math.abs(scale.y - 1) < SCALE_IDENTITY_EPSILON &&
    Math.abs(scale.z - 1) < SCALE_IDENTITY_EPSILON
  );
}

export function resampleVolume(
  volume: VolumePayload<ArrayBufferLike>,
  { scale, interpolation, targetDataType }: ResampleOptions
): VolumePayload<ArrayBufferLike> {
  if (isVolumeDataHandle(volume.data)) {
    throw new Error('Expected materialized volume data but received a VolumeDataHandle.');
  }

  const sourceWidth = Math.max(1, volume.width);
  const sourceHeight = Math.max(1, volume.height);
  const sourceDepth = Math.max(1, volume.depth);
  const channelCount = volume.channels;

  const targetWidth = Math.max(1, Math.round(sourceWidth * scale.x));
  const targetHeight = Math.max(1, Math.round(sourceHeight * scale.y));
  const targetDepth = Math.max(1, Math.round(sourceDepth * scale.z));

  const source = createVolumeTypedArray(volume.dataType, volume.data);
  const destinationType: VolumeDataType = targetDataType ?? volume.dataType;
  const totalValues = targetWidth * targetHeight * targetDepth * channelCount;
  const destination = createWritableVolumeArray(destinationType, totalValues);

  const xSamples = buildAxisSamples(sourceWidth, targetWidth);
  const ySamples = buildAxisSamples(sourceHeight, targetHeight);
  const zSamples = buildAxisSamples(sourceDepth, targetDepth);

  const sourceRowStride = sourceWidth * channelCount;
  const sourceSliceStride = sourceRowStride * sourceHeight;

  const readValue = (x: number, y: number, z: number, channel: number): number => {
    const index = z * sourceSliceStride + y * sourceRowStride + x * channelCount + channel;
    return source[index] as number;
  };

  const writeValue = (index: number, channel: number, value: number): void => {
    const clamped = Number.isFinite(value) ? value : 0;
    destination[index + channel] = clamped as number;
  };

  const sampleNearest = (
    channel: number,
    xEntry: AxisSample,
    yEntry: AxisSample,
    zEntry: AxisSample
  ): number => {
    return readValue(xEntry.nearest, yEntry.nearest, zEntry.nearest, channel);
  };

  const sampleLinear = (
    channel: number,
    xEntry: AxisSample,
    yEntry: AxisSample,
    zEntry: AxisSample
  ): number => {
    const x0 = xEntry.index0;
    const x1 = xEntry.index1;
    const y0 = yEntry.index0;
    const y1 = yEntry.index1;
    const z0 = zEntry.index0;
    const z1 = zEntry.index1;
    const tx = xEntry.weight;
    const ty = yEntry.weight;
    const tz = zEntry.weight;

    const c000 = readValue(x0, y0, z0, channel);
    const c100 = readValue(x1, y0, z0, channel);
    const c010 = readValue(x0, y1, z0, channel);
    const c110 = readValue(x1, y1, z0, channel);
    const c001 = readValue(x0, y0, z1, channel);
    const c101 = readValue(x1, y0, z1, channel);
    const c011 = readValue(x0, y1, z1, channel);
    const c111 = readValue(x1, y1, z1, channel);

    const c00 = c000 * (1 - tx) + c100 * tx;
    const c10 = c010 * (1 - tx) + c110 * tx;
    const c01 = c001 * (1 - tx) + c101 * tx;
    const c11 = c011 * (1 - tx) + c111 * tx;

    const c0 = c00 * (1 - ty) + c10 * ty;
    const c1 = c01 * (1 - ty) + c11 * ty;

    return c0 * (1 - tz) + c1 * tz;
  };

  const samplingFn = interpolation === 'nearest' ? sampleNearest : sampleLinear;

  let destinationIndex = 0;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;

  for (let z = 0; z < targetDepth; z += 1) {
    const zEntry = zSamples[z];
    for (let y = 0; y < targetHeight; y += 1) {
      const yEntry = ySamples[y];
      for (let x = 0; x < targetWidth; x += 1) {
        const xEntry = xSamples[x];
        for (let channel = 0; channel < channelCount; channel += 1) {
          const value = samplingFn(channel, xEntry, yEntry, zEntry);
          writeValue(destinationIndex, channel, value);
          const numericValue = Number.isFinite(value) ? value : 0;
          if (numericValue < min) {
            min = numericValue;
          }
          if (numericValue > max) {
            max = numericValue;
          }
        }
        destinationIndex += channelCount;
      }
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

  return {
    ...volume,
    width: targetWidth,
    height: targetHeight,
    depth: targetDepth,
    dataType: destinationType,
    data: destination.buffer,
    min,
    max
  };
}

function buildAxisSamples(sourceSize: number, targetSize: number): AxisSample[] {
  const entries: AxisSample[] = [];
  const safeSourceSize = Math.max(1, sourceSize);
  const safeTargetSize = Math.max(1, targetSize);
  const sourceMaxIndex = safeSourceSize - 1;

  if (safeTargetSize === 1 || sourceMaxIndex === 0) {
    for (let i = 0; i < safeTargetSize; i += 1) {
      entries.push({ index0: 0, index1: 0, weight: 0, nearest: 0 });
    }
    return entries;
  }

  const denominator = safeTargetSize - 1;
  for (let i = 0; i < safeTargetSize; i += 1) {
    const position = (i / denominator) * sourceMaxIndex;
    const index0 = Math.floor(position);
    const index1 = Math.min(index0 + 1, sourceMaxIndex);
    const weight = position - index0;
    const nearest = clampIndex(Math.round(position), sourceMaxIndex);
    entries.push({ index0, index1, weight, nearest });
  }
  return entries;
}

function clampIndex(value: number, max: number): number {
  if (value < 0) {
    return 0;
  }
  if (value > max) {
    return max;
  }
  return value;
}
