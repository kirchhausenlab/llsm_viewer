import * as THREE from 'three';
import type { NormalizedVolume } from '../../../../core/volumeProcessing';
import type { VolumeBrickAtlasTextureFormat, VolumeBrickPageTable } from '../../../../core/volumeProvider';

export function disposeMaterial(material: THREE.Material | THREE.Material[] | null | undefined) {
  if (Array.isArray(material)) {
    material.forEach((entry) => entry?.dispose?.());
    return;
  }
  material?.dispose?.();
}

export function getExpectedSliceBufferLength(volume: NormalizedVolume) {
  const pixelCount = volume.width * volume.height;
  return pixelCount * 4;
}

export function prepareSliceTexture(
  volume: NormalizedVolume,
  sliceIndex: number,
  existingBuffer: Uint8Array | null,
) {
  const { width, height, depth, channels, normalized } = volume;
  const pixelCount = width * height;
  const targetLength = pixelCount * 4;

  let buffer = existingBuffer ?? null;
  if (!buffer || buffer.length !== targetLength) {
    buffer = new Uint8Array(targetLength);
  }

  const maxIndex = Math.max(0, depth - 1);
  const clampedIndex = Math.min(Math.max(sliceIndex, 0), maxIndex);
  const sliceStride = pixelCount * channels;
  const sliceOffset = clampedIndex * sliceStride;

  for (let i = 0; i < pixelCount; i++) {
    const sourceOffset = sliceOffset + i * channels;
    const targetOffset = i * 4;

    const red = normalized[sourceOffset] ?? 0;
    const green = channels > 1 ? normalized[sourceOffset + 1] ?? 0 : red;
    const blue = channels > 2 ? normalized[sourceOffset + 2] ?? 0 : green;
    const alpha = channels > 3 ? normalized[sourceOffset + 3] ?? 255 : 255;

    if (channels === 1) {
      buffer[targetOffset] = red;
      buffer[targetOffset + 1] = red;
      buffer[targetOffset + 2] = red;
      buffer[targetOffset + 3] = 255;
    } else if (channels === 2) {
      buffer[targetOffset] = red;
      buffer[targetOffset + 1] = green;
      buffer[targetOffset + 2] = 0;
      buffer[targetOffset + 3] = 255;
    } else if (channels === 3) {
      buffer[targetOffset] = red;
      buffer[targetOffset + 1] = green;
      buffer[targetOffset + 2] = blue;
      buffer[targetOffset + 3] = 255;
    } else {
      buffer[targetOffset] = red;
      buffer[targetOffset + 1] = green;
      buffer[targetOffset + 2] = blue;
      buffer[targetOffset + 3] = alpha;
    }
  }

  return { data: buffer, format: THREE.RGBAFormat } as const;
}

type BrickAtlasSliceSource = {
  pageTable: Pick<VolumeBrickPageTable, 'gridShape' | 'chunkShape' | 'volumeShape' | 'brickAtlasIndices'>;
  atlasData: Uint8Array;
  textureFormat: VolumeBrickAtlasTextureFormat;
  sourceChannels: number;
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

function sampleBrickAtlasVoxelByte(
  source: BrickAtlasSliceSource,
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

export function prepareSliceTextureFromBrickAtlas(
  source: BrickAtlasSliceSource,
  sliceIndex: number,
  existingBuffer: Uint8Array | null,
) {
  const depth = Math.max(1, source.pageTable.volumeShape[0]);
  const height = Math.max(1, source.pageTable.volumeShape[1]);
  const width = Math.max(1, source.pageTable.volumeShape[2]);
  const channels = Math.max(1, source.sourceChannels);
  const pixelCount = width * height;
  const targetLength = pixelCount * 4;

  let buffer = existingBuffer ?? null;
  if (!buffer || buffer.length !== targetLength) {
    buffer = new Uint8Array(targetLength);
  }

  const maxIndex = Math.max(0, depth - 1);
  const clampedIndex = Math.min(Math.max(sliceIndex, 0), maxIndex);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const targetOffset = (y * width + x) * 4;
      const red = sampleBrickAtlasVoxelByte(source, x, y, clampedIndex, 0);
      const green = channels > 1 ? sampleBrickAtlasVoxelByte(source, x, y, clampedIndex, 1) : red;
      const blue = channels > 2 ? sampleBrickAtlasVoxelByte(source, x, y, clampedIndex, 2) : green;
      const alpha = channels > 3 ? sampleBrickAtlasVoxelByte(source, x, y, clampedIndex, 3) : 255;

      if (channels === 1) {
        buffer[targetOffset] = red;
        buffer[targetOffset + 1] = red;
        buffer[targetOffset + 2] = red;
        buffer[targetOffset + 3] = 255;
      } else if (channels === 2) {
        buffer[targetOffset] = red;
        buffer[targetOffset + 1] = green;
        buffer[targetOffset + 2] = 0;
        buffer[targetOffset + 3] = 255;
      } else if (channels === 3) {
        buffer[targetOffset] = red;
        buffer[targetOffset + 1] = green;
        buffer[targetOffset + 2] = blue;
        buffer[targetOffset + 3] = 255;
      } else {
        buffer[targetOffset] = red;
        buffer[targetOffset + 1] = green;
        buffer[targetOffset + 2] = blue;
        buffer[targetOffset + 3] = alpha;
      }
    }
  }

  return {
    data: buffer,
    width,
    height,
    depth,
    format: THREE.RGBAFormat
  } as const;
}
