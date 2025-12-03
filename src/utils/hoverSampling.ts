import * as THREE from 'three';

import type { NormalizedVolume } from '../volumeProcessing';
import { denormalizeValue } from './intensityFormatting';

export const clampValue = (value: number, min: number, max: number): number => {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
};

export const sampleSegmentationLabel = (
  volume: NormalizedVolume,
  normalizedPosition: THREE.Vector3,
) => {
  if (!volume.segmentationLabels) {
    return null;
  }

  const x = Math.round(clampValue(normalizedPosition.x * volume.width, 0, volume.width - 1));
  const y = Math.round(clampValue(normalizedPosition.y * volume.height, 0, volume.height - 1));
  const z = Math.round(clampValue(normalizedPosition.z * volume.depth, 0, volume.depth - 1));

  const sliceStride = volume.width * volume.height;
  const index = z * sliceStride + y * volume.width + x;
  return volume.segmentationLabels[index] ?? null;
};

export const sampleRawValuesAtPosition = (
  volume: NormalizedVolume,
  normalizedPosition: THREE.Vector3,
) => {
  const channels = Math.max(1, volume.channels);
  const sliceStride = volume.width * volume.height * channels;
  const rowStride = volume.width * channels;

  const x = clampValue(normalizedPosition.x * volume.width, 0, volume.width - 1);
  const y = clampValue(normalizedPosition.y * volume.height, 0, volume.height - 1);
  const z = clampValue(normalizedPosition.z * volume.depth, 0, volume.depth - 1);

  const leftX = Math.floor(x);
  const rightX = Math.min(volume.width - 1, leftX + 1);
  const topY = Math.floor(y);
  const bottomY = Math.min(volume.height - 1, topY + 1);
  const frontZ = Math.floor(z);
  const backZ = Math.min(volume.depth - 1, frontZ + 1);

  const tX = x - leftX;
  const tY = y - topY;
  const tZ = z - frontZ;
  const invTX = 1 - tX;
  const invTY = 1 - tY;
  const invTZ = 1 - tZ;

  const weight000 = invTX * invTY * invTZ;
  const weight100 = tX * invTY * invTZ;
  const weight010 = invTX * tY * invTZ;
  const weight110 = tX * tY * invTZ;
  const weight001 = invTX * invTY * tZ;
  const weight101 = tX * invTY * tZ;
  const weight011 = invTX * tY * tZ;
  const weight111 = tX * tY * tZ;

  const frontOffset = frontZ * sliceStride;
  const backOffset = backZ * sliceStride;
  const topFrontOffset = frontOffset + topY * rowStride;
  const bottomFrontOffset = frontOffset + bottomY * rowStride;
  const topBackOffset = backOffset + topY * rowStride;
  const bottomBackOffset = backOffset + bottomY * rowStride;

  const rawValues: number[] = [];

  for (let channelIndex = 0; channelIndex < channels; channelIndex++) {
    const baseChannelOffset = channelIndex;
    const topLeftFront = volume.normalized[topFrontOffset + leftX * channels + baseChannelOffset] ?? 0;
    const topRightFront = volume.normalized[topFrontOffset + rightX * channels + baseChannelOffset] ?? 0;
    const bottomLeftFront = volume.normalized[bottomFrontOffset + leftX * channels + baseChannelOffset] ?? 0;
    const bottomRightFront = volume.normalized[bottomFrontOffset + rightX * channels + baseChannelOffset] ?? 0;

    const topLeftBack = volume.normalized[topBackOffset + leftX * channels + baseChannelOffset] ?? 0;
    const topRightBack = volume.normalized[topBackOffset + rightX * channels + baseChannelOffset] ?? 0;
    const bottomLeftBack = volume.normalized[bottomBackOffset + leftX * channels + baseChannelOffset] ?? 0;
    const bottomRightBack = volume.normalized[bottomBackOffset + rightX * channels + baseChannelOffset] ?? 0;

    const interpolated =
      topLeftFront * weight000 +
      topRightFront * weight100 +
      bottomLeftFront * weight010 +
      bottomRightFront * weight110 +
      topLeftBack * weight001 +
      topRightBack * weight101 +
      bottomLeftBack * weight011 +
      bottomRightBack * weight111;

    rawValues.push(denormalizeValue(interpolated, volume));
  }

  return rawValues;
};
