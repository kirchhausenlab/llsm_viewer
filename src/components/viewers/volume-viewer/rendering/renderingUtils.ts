import * as THREE from 'three';
import {
  getNormalizedIntensityDenominator,
  isSegmentationVolume,
  type NormalizedVolume
} from '../../../../core/volumeProcessing';
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
  existingBuffer: Uint8Array | Float32Array | null,
  segmentationColorTable: Uint8Array | null = null,
) {
  const { width, height, depth } = volume;
  const pixelCount = width * height;
  const targetLength = pixelCount * 4;

  let buffer = existingBuffer ?? null;
  if (!buffer || buffer.length !== targetLength) {
    buffer = isSegmentationVolume(volume) || volume.normalizedDataType === 'uint8'
      ? new Uint8Array(targetLength)
      : new Float32Array(targetLength);
  }

  const maxIndex = Math.max(0, depth - 1);
  const clampedIndex = Math.min(Math.max(sliceIndex, 0), maxIndex);
  if (isSegmentationVolume(volume)) {
    const sliceOffset = clampedIndex * pixelCount;
    for (let i = 0; i < pixelCount; i += 1) {
      const label = volume.labels[sliceOffset + i] ?? 0;
      const targetOffset = i * 4;
      if (segmentationColorTable) {
        const colorOffset = label * 4;
        buffer[targetOffset] = segmentationColorTable[colorOffset] ?? 0;
        buffer[targetOffset + 1] = segmentationColorTable[colorOffset + 1] ?? 0;
        buffer[targetOffset + 2] = segmentationColorTable[colorOffset + 2] ?? 0;
        buffer[targetOffset + 3] = segmentationColorTable[colorOffset + 3] ?? 0;
      } else {
        const clamped = Math.min(label, 255);
        buffer[targetOffset] = clamped;
        buffer[targetOffset + 1] = clamped;
        buffer[targetOffset + 2] = clamped;
        buffer[targetOffset + 3] = label > 0 ? 255 : 0;
      }
    }
    return { data: buffer, format: THREE.RGBAFormat } as const;
  }

  const { channels, normalized, normalizedDataType } = volume;
  const denominator = getNormalizedIntensityDenominator(normalizedDataType);
  const alphaOpaque = normalizedDataType === 'uint16' ? 1 : denominator;
  const sliceStride = pixelCount * channels;
  const sliceOffset = clampedIndex * sliceStride;

  for (let i = 0; i < pixelCount; i++) {
    const sourceOffset = sliceOffset + i * channels;
    const targetOffset = i * 4;

    const redSource = normalized[sourceOffset] ?? 0;
    const greenSource = channels > 1 ? normalized[sourceOffset + 1] ?? 0 : redSource;
    const blueSource = channels > 2 ? normalized[sourceOffset + 2] ?? 0 : greenSource;
    const alphaSource = channels > 3 ? normalized[sourceOffset + 3] ?? denominator : denominator;
    const red = normalizedDataType === 'uint16' ? redSource / denominator : redSource;
    const green = normalizedDataType === 'uint16' ? greenSource / denominator : greenSource;
    const blue = normalizedDataType === 'uint16' ? blueSource / denominator : blueSource;
    const alpha = normalizedDataType === 'uint16' ? alphaSource / denominator : alphaSource;

    if (channels === 1) {
      buffer[targetOffset] = red;
      buffer[targetOffset + 1] = red;
      buffer[targetOffset + 2] = red;
      buffer[targetOffset + 3] = alphaOpaque;
    } else if (channels === 2) {
      buffer[targetOffset] = red;
      buffer[targetOffset + 1] = green;
      buffer[targetOffset + 2] = 0;
      buffer[targetOffset + 3] = alphaOpaque;
    } else if (channels === 3) {
      buffer[targetOffset] = red;
      buffer[targetOffset + 1] = green;
      buffer[targetOffset + 2] = blue;
      buffer[targetOffset + 3] = alphaOpaque;
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
  kind: 'intensity' | 'segmentation';
  pageTable: Pick<VolumeBrickPageTable, 'gridShape' | 'chunkShape' | 'volumeShape' | 'brickAtlasIndices'>;
  atlasData: Uint8Array | Uint16Array;
  textureFormat: VolumeBrickAtlasTextureFormat;
  sourceChannels: number;
  dataType: 'uint8' | 'uint16';
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
  existingBuffer: Uint8Array | Float32Array | null,
  segmentationColorTable: Uint8Array | null = null,
) {
  const depth = Math.max(1, source.pageTable.volumeShape[0]);
  const height = Math.max(1, source.pageTable.volumeShape[1]);
  const width = Math.max(1, source.pageTable.volumeShape[2]);
  const channels = Math.max(1, source.sourceChannels);
  const pixelCount = width * height;
  const targetLength = pixelCount * 4;

  let buffer = existingBuffer ?? null;
  if (!buffer || buffer.length !== targetLength) {
    buffer = source.kind === 'segmentation' || source.dataType === 'uint8'
      ? new Uint8Array(targetLength)
      : new Float32Array(targetLength);
  }

  const maxIndex = Math.max(0, depth - 1);
  const clampedIndex = Math.min(Math.max(sliceIndex, 0), maxIndex);

  if (source.kind === 'segmentation') {
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const targetOffset = (y * width + x) * 4;
        const label = sampleBrickAtlasVoxelValue(source, x, y, clampedIndex, 0);
        if (segmentationColorTable) {
          const colorOffset = label * 4;
          buffer[targetOffset] = segmentationColorTable[colorOffset] ?? 0;
          buffer[targetOffset + 1] = segmentationColorTable[colorOffset + 1] ?? 0;
          buffer[targetOffset + 2] = segmentationColorTable[colorOffset + 2] ?? 0;
          buffer[targetOffset + 3] = segmentationColorTable[colorOffset + 3] ?? 0;
        } else {
          const clamped = Math.min(label, 255);
          buffer[targetOffset] = clamped;
          buffer[targetOffset + 1] = clamped;
          buffer[targetOffset + 2] = clamped;
          buffer[targetOffset + 3] = label > 0 ? 255 : 0;
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

  const denominator = getNormalizedIntensityDenominator(source.dataType);
  const alphaOpaque = source.dataType === 'uint16' ? 1 : denominator;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const targetOffset = (y * width + x) * 4;
      const redSource = sampleBrickAtlasVoxelValue(source, x, y, clampedIndex, 0);
      const greenSource = channels > 1 ? sampleBrickAtlasVoxelValue(source, x, y, clampedIndex, 1) : redSource;
      const blueSource = channels > 2 ? sampleBrickAtlasVoxelValue(source, x, y, clampedIndex, 2) : greenSource;
      const alphaSource = channels > 3 ? sampleBrickAtlasVoxelValue(source, x, y, clampedIndex, 3) : denominator;
      const red = source.dataType === 'uint16' ? redSource / denominator : redSource;
      const green = source.dataType === 'uint16' ? greenSource / denominator : greenSource;
      const blue = source.dataType === 'uint16' ? blueSource / denominator : blueSource;
      const alpha = source.dataType === 'uint16' ? alphaSource / denominator : alphaSource;

      if (channels === 1) {
        buffer[targetOffset] = red;
        buffer[targetOffset + 1] = red;
        buffer[targetOffset + 2] = red;
        buffer[targetOffset + 3] = alphaOpaque;
      } else if (channels === 2) {
        buffer[targetOffset] = red;
        buffer[targetOffset + 1] = green;
        buffer[targetOffset + 2] = 0;
        buffer[targetOffset + 3] = alphaOpaque;
      } else if (channels === 3) {
        buffer[targetOffset] = red;
        buffer[targetOffset + 1] = green;
        buffer[targetOffset + 2] = blue;
        buffer[targetOffset + 3] = alphaOpaque;
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
