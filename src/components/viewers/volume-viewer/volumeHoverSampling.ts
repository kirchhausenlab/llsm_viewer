import { denormalizeValue } from '../../../shared/utils/intensityFormatting';
import { clampValue } from '../../../shared/utils/hoverSampling';
import { getNormalizedIntensityDenominator, isSegmentationVolume, type NormalizedVolume } from '../../../core/volumeProcessing';
import type { VolumeBrickAtlasTextureFormat, VolumeBrickPageTable } from '../../../core/volumeProvider';

type VectorLike = { x: number; y: number; z: number };

type BrickAtlasSampleSource = {
  kind: 'intensity' | 'segmentation';
  pageTable: Pick<VolumeBrickPageTable, 'gridShape' | 'chunkShape' | 'volumeShape' | 'brickAtlasIndices'>;
  atlasData: Uint8Array | Uint16Array | Float32Array;
  textureFormat: VolumeBrickAtlasTextureFormat;
  sourceChannels: number;
  dataType: 'uint8' | 'uint16';
  min: number;
  max: number;
};

function getBrickAtlasTextureChannels(textureFormat: VolumeBrickAtlasTextureFormat): number {
  if (textureFormat === 'red') {
    return 1;
  }
  if (textureFormat === 'rg') {
    return 2;
  }
  return 4;
}

function mapSourceChannelToTextureChannel(
  sourceChannel: number,
  sourceChannelCount: number,
  textureFormat: VolumeBrickAtlasTextureFormat,
): number | null {
  if (textureFormat === 'red') {
    return sourceChannel === 0 ? 0 : null;
  }
  if (textureFormat === 'rg') {
    return sourceChannel >= 0 && sourceChannel <= 1 ? sourceChannel : null;
  }
  if (sourceChannel < 0 || sourceChannel > 3) {
    return null;
  }
  if (sourceChannelCount === 3 && sourceChannel === 3) {
    return null;
  }
  return sourceChannel;
}

function sampleBrickAtlasVoxelValue(
  source: BrickAtlasSampleSource,
  voxelX: number,
  voxelY: number,
  voxelZ: number,
  sourceChannel: number,
): number {
  const [gridZ, gridY, gridX] = source.pageTable.gridShape;
  const [chunkDepth, chunkHeight, chunkWidth] = source.pageTable.chunkShape;
  const [volumeDepth, volumeHeight, volumeWidth] = source.pageTable.volumeShape;
  const textureChannels = getBrickAtlasTextureChannels(source.textureFormat);
  const textureChannel = mapSourceChannelToTextureChannel(
    sourceChannel,
    Math.max(1, source.sourceChannels),
    source.textureFormat,
  );
  if (textureChannel === null) {
    return 0;
  }

  const clampedX = Math.max(0, Math.min(volumeWidth - 1, voxelX));
  const clampedY = Math.max(0, Math.min(volumeHeight - 1, voxelY));
  const clampedZ = Math.max(0, Math.min(volumeDepth - 1, voxelZ));

  const brickX = Math.floor(clampedX / chunkWidth);
  const brickY = Math.floor(clampedY / chunkHeight);
  const brickZ = Math.floor(clampedZ / chunkDepth);
  if (brickX < 0 || brickX >= gridX || brickY < 0 || brickY >= gridY || brickZ < 0 || brickZ >= gridZ) {
    return 0;
  }

  const flatBrickIndex = ((brickZ * gridY) + brickY) * gridX + brickX;
  const atlasIndex = source.pageTable.brickAtlasIndices[flatBrickIndex] ?? -1;
  if (atlasIndex < 0) {
    return 0;
  }

  const localX = clampedX - brickX * chunkWidth;
  const localY = clampedY - brickY * chunkHeight;
  const localZ = clampedZ - brickZ * chunkDepth;
  const atlasZ = atlasIndex * chunkDepth + localZ;
  const atlasPlaneStride = chunkWidth * chunkHeight * textureChannels;
  if (atlasPlaneStride <= 0) {
    return 0;
  }
  const atlasDepth = Math.floor(source.atlasData.length / atlasPlaneStride);
  if (atlasZ < 0 || atlasZ >= atlasDepth) {
    return 0;
  }

  const atlasVoxelOffset = (((atlasZ * chunkHeight + localY) * chunkWidth + localX) * textureChannels) + textureChannel;
  return source.atlasData[atlasVoxelOffset] ?? 0;
}

export function sampleBrickAtlasAtVoxel(
  source: BrickAtlasSampleSource,
  voxelX: number,
  voxelY: number,
  voxelZ: number,
): { normalizedValues: number[]; rawValues: number[] } {
  if (source.kind === 'segmentation') {
    const label = sampleBrickAtlasVoxelValue(source, voxelX, voxelY, voxelZ, 0);
    return {
      normalizedValues: [label > 0 ? 1 : 0],
      rawValues: [label],
    };
  }

  const channels = Math.max(1, source.sourceChannels);
  const safeMin = Number.isFinite(source.min) ? source.min : 0;
  const safeMax = Number.isFinite(source.max) ? source.max : 255;
  const range = safeMax - safeMin;
  const denominator = getNormalizedIntensityDenominator(source.dataType);
  const atlasUsesFloatNormalization = source.atlasData instanceof Float32Array;
  const normalizedValues: number[] = [];
  const rawValues: number[] = [];

  for (let channelIndex = 0; channelIndex < channels; channelIndex += 1) {
    const sampleValue = sampleBrickAtlasVoxelValue(source, voxelX, voxelY, voxelZ, channelIndex);
    const normalizedValue = atlasUsesFloatNormalization ? sampleValue : sampleValue / denominator;
    normalizedValues.push(normalizedValue);
    rawValues.push(safeMin + normalizedValue * range);
  }

  return { normalizedValues, rawValues };
}

export function sampleBrickAtlasAtNormalizedPosition(
  source: BrickAtlasSampleSource,
  coords: VectorLike,
): { normalizedValues: number[]; rawValues: number[] } {
  if (source.kind === 'segmentation') {
    const label = sampleBrickAtlasLabelAtNormalizedPosition(source, coords);
    return {
      normalizedValues: [label > 0 ? 1 : 0],
      rawValues: [label]
    };
  }

  const channels = Math.max(1, source.sourceChannels);
  const volumeDepth = Math.max(1, source.pageTable.volumeShape[0]);
  const volumeHeight = Math.max(1, source.pageTable.volumeShape[1]);
  const volumeWidth = Math.max(1, source.pageTable.volumeShape[2]);

  const x = clampValue(coords.x * volumeWidth, 0, volumeWidth - 1);
  const y = clampValue(coords.y * volumeHeight, 0, volumeHeight - 1);
  const z = clampValue(coords.z * volumeDepth, 0, volumeDepth - 1);

  const leftX = Math.floor(x);
  const rightX = Math.min(volumeWidth - 1, leftX + 1);
  const topY = Math.floor(y);
  const bottomY = Math.min(volumeHeight - 1, topY + 1);
  const frontZ = Math.floor(z);
  const backZ = Math.min(volumeDepth - 1, frontZ + 1);

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

  const safeMin = Number.isFinite(source.min) ? source.min : 0;
  const safeMax = Number.isFinite(source.max) ? source.max : 255;
  const range = safeMax - safeMin;
  const denominator = getNormalizedIntensityDenominator(source.dataType);
  const atlasUsesFloatNormalization = source.atlasData instanceof Float32Array;

  const normalizedValues: number[] = [];
  const rawValues: number[] = [];

  for (let channelIndex = 0; channelIndex < channels; channelIndex += 1) {
    const topLeftFront = sampleBrickAtlasVoxelValue(source, leftX, topY, frontZ, channelIndex);
    const topRightFront = sampleBrickAtlasVoxelValue(source, rightX, topY, frontZ, channelIndex);
    const bottomLeftFront = sampleBrickAtlasVoxelValue(source, leftX, bottomY, frontZ, channelIndex);
    const bottomRightFront = sampleBrickAtlasVoxelValue(source, rightX, bottomY, frontZ, channelIndex);
    const topLeftBack = sampleBrickAtlasVoxelValue(source, leftX, topY, backZ, channelIndex);
    const topRightBack = sampleBrickAtlasVoxelValue(source, rightX, topY, backZ, channelIndex);
    const bottomLeftBack = sampleBrickAtlasVoxelValue(source, leftX, bottomY, backZ, channelIndex);
    const bottomRightBack = sampleBrickAtlasVoxelValue(source, rightX, bottomY, backZ, channelIndex);

    const interpolated =
      topLeftFront * weight000 +
      topRightFront * weight100 +
      bottomLeftFront * weight010 +
      bottomRightFront * weight110 +
      topLeftBack * weight001 +
      topRightBack * weight101 +
      bottomLeftBack * weight011 +
      bottomRightBack * weight111;

    const normalizedValue = atlasUsesFloatNormalization ? interpolated : interpolated / denominator;
    normalizedValues.push(normalizedValue);
    rawValues.push(safeMin + normalizedValue * range);
  }

  return { normalizedValues, rawValues };
}

export function sampleVolumeAtVoxel(
  volume: NormalizedVolume,
  voxelX: number,
  voxelY: number,
  voxelZ: number,
): { normalizedValues: number[]; rawValues: number[] } {
  if (isSegmentationVolume(volume)) {
    const label = sampleVolumeLabelAtNormalizedPosition(volume, {
      x: voxelX / Math.max(1, volume.width),
      y: voxelY / Math.max(1, volume.height),
      z: voxelZ / Math.max(1, volume.depth),
    });
    return {
      normalizedValues: [label > 0 ? 1 : 0],
      rawValues: [label],
    };
  }

  const channels = Math.max(1, volume.channels);
  const x = Math.round(clampValue(voxelX, 0, volume.width - 1));
  const y = Math.round(clampValue(voxelY, 0, volume.height - 1));
  const z = Math.round(clampValue(voxelZ, 0, volume.depth - 1));
  const normalizedValues: number[] = [];
  const rawValues: number[] = [];
  const denominator = getNormalizedIntensityDenominator(volume.normalizedDataType);
  const voxelOffset = ((z * volume.height + y) * volume.width + x) * channels;

  for (let channelIndex = 0; channelIndex < channels; channelIndex++) {
    const normalized = volume.normalized[voxelOffset + channelIndex] ?? 0;
    normalizedValues.push(normalized / denominator);
    rawValues.push(denormalizeValue(normalized, volume));
  }

  return { normalizedValues, rawValues };
}

export function sampleVolumeAtNormalizedPosition(
  volume: NormalizedVolume,
  coords: VectorLike,
): { normalizedValues: number[]; rawValues: number[] } {
  if (isSegmentationVolume(volume)) {
    const label = sampleVolumeLabelAtNormalizedPosition(volume, coords);
    return {
      normalizedValues: [label > 0 ? 1 : 0],
      rawValues: [label]
    };
  }

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
  const denominator = getNormalizedIntensityDenominator(volume.normalizedDataType);

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

    normalizedValues.push(interpolated / denominator);
    rawValues.push(denormalizeValue(interpolated, volume));
  }

  return { normalizedValues, rawValues };
}

export function sampleBrickAtlasLabelAtNormalizedPosition(
  source: BrickAtlasSampleSource,
  coords: VectorLike,
): number {
  const volumeDepth = Math.max(1, source.pageTable.volumeShape[0]);
  const volumeHeight = Math.max(1, source.pageTable.volumeShape[1]);
  const volumeWidth = Math.max(1, source.pageTable.volumeShape[2]);
  const voxelX = Math.round(clampValue(coords.x * volumeWidth, 0, volumeWidth - 1));
  const voxelY = Math.round(clampValue(coords.y * volumeHeight, 0, volumeHeight - 1));
  const voxelZ = Math.round(clampValue(coords.z * volumeDepth, 0, volumeDepth - 1));
  return sampleBrickAtlasVoxelValue(source, voxelX, voxelY, voxelZ, 0);
}

export function sampleVolumeLabelAtNormalizedPosition(
  volume: NormalizedVolume,
  coords: VectorLike,
): number {
  if (!isSegmentationVolume(volume)) {
    return 0;
  }
  const voxelX = Math.round(clampValue(coords.x * volume.width, 0, volume.width - 1));
  const voxelY = Math.round(clampValue(coords.y * volume.height, 0, volume.height - 1));
  const voxelZ = Math.round(clampValue(coords.z * volume.depth, 0, volume.depth - 1));
  return volume.labels[(voxelZ * volume.height + voxelY) * volume.width + voxelX] ?? 0;
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
