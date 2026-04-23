import * as THREE from 'three';

import { isSegmentationVolume, type NormalizedVolume } from '../../core/volumeProcessing';
import { denormalizeValue } from './intensityFormatting';

type VoxelLike = { x: number; y: number; z: number };

export const clampValue = (value: number, min: number, max: number): number => {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
};

export const mapDisplayCoordinateToDataCoordinate = (
  displayCoord: number,
  displaySize: number,
  dataSize: number,
): number => {
  const safeDisplaySize = Number.isFinite(displaySize) ? Math.max(1, Math.round(displaySize)) : 1;
  const safeDataSize = Number.isFinite(dataSize) ? Math.max(1, Math.round(dataSize)) : 1;
  if (safeDisplaySize <= 1 || safeDataSize <= 1) {
    return 0;
  }

  const clampedDisplayCoord = Math.round(clampValue(displayCoord, 0, safeDisplaySize - 1));
  return Math.min(
    safeDataSize - 1,
    Math.max(0, Math.floor((clampedDisplayCoord / safeDisplaySize) * safeDataSize)),
  );
};

export const sampleSegmentationLabel = (
  volume: NormalizedVolume,
  normalizedPosition: THREE.Vector3,
) => {
  if (!isSegmentationVolume(volume)) {
    return null;
  }

  const x = Math.round(clampValue(normalizedPosition.x * volume.width, 0, volume.width - 1));
  const y = Math.round(clampValue(normalizedPosition.y * volume.height, 0, volume.height - 1));
  const z = Math.round(clampValue(normalizedPosition.z * volume.depth, 0, volume.depth - 1));

  const sliceStride = volume.width * volume.height;
  const index = z * sliceStride + y * volume.width + x;
  return volume.labels[index] ?? null;
};

export const sampleRawValuesAtVoxel = (
  volume: NormalizedVolume,
  voxel: VoxelLike,
) => {
  if (isSegmentationVolume(volume)) {
    const x = Math.round(clampValue(voxel.x, 0, volume.width - 1));
    const y = Math.round(clampValue(voxel.y, 0, volume.height - 1));
    const z = Math.round(clampValue(voxel.z, 0, volume.depth - 1));
    const sliceStride = volume.width * volume.height;
    const label = volume.labels[z * sliceStride + y * volume.width + x] ?? null;
    return label === null ? [] : [label];
  }

  const channels = Math.max(1, volume.channels);
  const x = Math.round(clampValue(voxel.x, 0, volume.width - 1));
  const y = Math.round(clampValue(voxel.y, 0, volume.height - 1));
  const z = Math.round(clampValue(voxel.z, 0, volume.depth - 1));
  const voxelOffset = ((z * volume.height + y) * volume.width + x) * channels;
  const rawValues: number[] = [];

  for (let channelIndex = 0; channelIndex < channels; channelIndex++) {
    const normalized = volume.normalized[voxelOffset + channelIndex] ?? 0;
    rawValues.push(denormalizeValue(normalized, volume));
  }

  return rawValues;
};

export const sampleRawValuesAtPosition = (
  volume: NormalizedVolume,
  normalizedPosition: THREE.Vector3,
) =>
  sampleRawValuesAtVoxel(volume, {
    x: Math.round(clampValue(normalizedPosition.x * volume.width, 0, volume.width - 1)),
    y: Math.round(clampValue(normalizedPosition.y * volume.height, 0, volume.height - 1)),
    z: Math.round(clampValue(normalizedPosition.z * volume.depth, 0, volume.depth - 1)),
  });
