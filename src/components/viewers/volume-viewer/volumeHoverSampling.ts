import { denormalizeValue } from '../../../shared/utils/intensityFormatting';
import { clampValue } from '../../../shared/utils/hoverSampling';
import type { NormalizedVolume } from '../../../core/volumeProcessing';

type VectorLike = { x: number; y: number; z: number };

export function sampleVolumeAtNormalizedPosition(
  volume: NormalizedVolume,
  coords: VectorLike,
): { normalizedValues: number[]; rawValues: number[] } {
  const channels = Math.max(1, volume.channels);
  const sliceStride = volume.width * volume.height * channels;
  const rowStride = volume.width * channels;

  const x = clampValue(coords.x * volume.width, 0, volume.width - 1);
  const y = clampValue(coords.y * volume.height, 0, volume.height - 1);
  const z = clampValue(coords.z * volume.depth, 0, volume.depth - 1);

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

  const normalizedValues: number[] = [];
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

    normalizedValues.push(interpolated / 255);
    rawValues.push(denormalizeValue(interpolated, volume));
  }

  return { normalizedValues, rawValues };
}

export function computeVolumeLuminance(values: number[], channels: number): number {
  if (channels === 1) {
    return values[0] ?? 0;
  }
  if (channels === 2) {
    return 0.5 * ((values[0] ?? 0) + (values[1] ?? 0));
  }
  if (channels === 3) {
    return 0.2126 * (values[0] ?? 0) + 0.7152 * (values[1] ?? 0) + 0.0722 * (values[2] ?? 0);
  }
  return Math.max(...values, 0);
}

export function adjustWindowedIntensity(
  value: number,
  windowMin: number,
  windowMax: number,
  invert: boolean,
): number {
  const range = Math.max(windowMax - windowMin, 1e-5);
  const normalized = clampValue((value - windowMin) / range, 0, 1);
  return invert ? 1 - normalized : normalized;
}
