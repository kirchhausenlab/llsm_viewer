import { HISTOGRAM_BINS } from '../../histogram';
import { encodeInt32ArrayLE } from '../../int32';
import {
  buildBrickSubcellChunkData,
  buildBrickSubcellTextureSize,
  writeBrickSubcellChunkData
} from '../../brickSubcell';
import { getBytesPerValue } from '../../../../types/volume';
import type {
  PreprocessedBrickAtlasTextureFormat,
  PreprocessedScalePlaybackAtlasZarrDescriptor,
  PreprocessedScaleSkipHierarchyZarrDescriptor,
  PreprocessedScaleSubcellZarrDescriptor,
  PreprocessedShardedBlobDescriptor,
  ZarrArrayDescriptor
} from '../types';
import type { BackgroundMaskVolume } from '../../backgroundMask';
import type { ChunkWriteDispatcher } from './chunkWriter';

export function mapPlaybackSourceChannelToTextureChannel(
  sourceChannel: number,
  sourceChannels: number,
  textureFormat: PreprocessedBrickAtlasTextureFormat
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
  if (sourceChannels === 3 && sourceChannel === 3) {
    return null;
  }
  return sourceChannel;
}

export function createSyntheticDescriptorForBlob(descriptor: PreprocessedShardedBlobDescriptor): ZarrArrayDescriptor {
  return {
    path: descriptor.path,
    shape: [descriptor.entryCount],
    chunkShape: [1],
    dataType: 'uint8',
    ...(descriptor.sharding !== undefined ? { sharding: descriptor.sharding } : {})
  };
}

export function chunkStart(chunkIndex: number, chunkSize: number): number {
  return chunkIndex * chunkSize;
}

export function chunkLength(totalSize: number, start: number, chunkSize: number): number {
  return Math.max(0, Math.min(chunkSize, totalSize - start));
}

export function extractDataChunkBytesAndComputeStatistics({
  source,
  dataType,
  isSegmentation,
  width,
  height,
  channels,
  zStart,
  zLength,
  yStart,
  yLength,
  xStart,
  xLength,
  histogram,
  backgroundMask
}: {
  source: Uint8Array | Uint16Array;
  dataType: 'uint8' | 'uint16';
  isSegmentation: boolean;
  width: number;
  height: number;
  channels: number;
  zStart: number;
  zLength: number;
  yStart: number;
  yLength: number;
  xStart: number;
  xLength: number;
  histogram?: Uint32Array;
  backgroundMask?: BackgroundMaskVolume | null;
}): {
  chunk: Uint8Array;
  stats: {
    min: number;
    max: number;
    occupancy: number;
  };
} {
  if (channels <= 0) {
    throw new Error(`Invalid channel count while computing chunk statistics: ${channels}.`);
  }
  if (histogram && histogram.length !== HISTOGRAM_BINS) {
    throw new Error(
      `Histogram length mismatch while computing chunk statistics: expected ${HISTOGRAM_BINS}, got ${histogram.length}.`
    );
  }

  const rowStride = width * channels;
  const planeStride = height * rowStride;
  const maskRowStride = width;
  const maskPlaneStride = height * maskRowStride;
  const lineLength = xLength * channels;
  const chunkValueCount = zLength * yLength * lineLength;
  const chunkValues = dataType === 'uint16'
    ? new Uint16Array(chunkValueCount)
    : new Uint8Array(chunkValueCount);
  if (chunkValues.length === 0) {
    return {
      chunk: new Uint8Array(0),
      stats: { min: 0, max: 0, occupancy: 0 }
    };
  }
  if (
    backgroundMask &&
    (
      backgroundMask.width !== width ||
      backgroundMask.height !== height ||
      backgroundMask.depth < zStart + zLength
    )
  ) {
    throw new Error('Background mask dimensions do not match the chunk source dimensions.');
  }

  const denominator = dataType === 'uint16' ? 0xffff : 0xff;
  let min = denominator;
  let max = 0;
  let occupiedVoxelCount = 0;
  const voxelCount = zLength * yLength * xLength;
  let consideredVoxelCount = 0;

  let destinationOffset = 0;
  for (let localZ = 0; localZ < zLength; localZ += 1) {
    const sourceZBase = (zStart + localZ) * planeStride;
    const maskZBase = backgroundMask ? (zStart + localZ) * maskPlaneStride : 0;
    for (let localY = 0; localY < yLength; localY += 1) {
      const sourceOffset = sourceZBase + (yStart + localY) * rowStride + xStart * channels;
      const sourceLine = source.subarray(sourceOffset, sourceOffset + lineLength);
      chunkValues.set(sourceLine, destinationOffset);
      const maskOffset = maskZBase + (yStart + localY) * maskRowStride + xStart;
      const maskLine = backgroundMask
        ? backgroundMask.data.subarray(maskOffset, maskOffset + xLength)
        : null;

      if (isSegmentation) {
        for (let voxelIndex = 0; voxelIndex < xLength; voxelIndex += 1) {
          if (maskLine && (maskLine[voxelIndex] ?? 0) > 0) {
            continue;
          }
          const value = sourceLine[voxelIndex] ?? 0;
          if (value > 0) {
            occupiedVoxelCount += 1;
            min = 255;
            max = 255;
          }
          consideredVoxelCount += 1;
        }
      } else if (channels === 1) {
        for (let voxelIndex = 0; voxelIndex < xLength; voxelIndex += 1) {
          if (maskLine && (maskLine[voxelIndex] ?? 0) > 0) {
            continue;
          }
          const value = sourceLine[voxelIndex] ?? 0;
          if (value < min) {
            min = value;
          }
          if (value > max) {
            max = value;
          }
          if (value > 0) {
            occupiedVoxelCount += 1;
          }
          if (histogram) {
            histogram[Math.round((value * 255) / denominator)] += 1;
          }
          consideredVoxelCount += 1;
        }
      } else if (channels === 2) {
        for (let voxelIndex = 0; voxelIndex < xLength; voxelIndex += 1) {
          if (maskLine && (maskLine[voxelIndex] ?? 0) > 0) {
            continue;
          }
          const voxelBase = voxelIndex * 2;
          const red = sourceLine[voxelBase] ?? 0;
          const green = sourceLine[voxelBase + 1] ?? 0;
          if (red < min) {
            min = red;
          }
          if (green < min) {
            min = green;
          }
          if (red > max) {
            max = red;
          }
          if (green > max) {
            max = green;
          }
          if (red > 0 || green > 0) {
            occupiedVoxelCount += 1;
          }
          if (histogram) {
            histogram[Math.round((Math.round((red + green) * 0.5) * 255) / denominator)] += 1;
          }
          consideredVoxelCount += 1;
        }
      } else {
        for (let voxelIndex = 0; voxelIndex < xLength; voxelIndex += 1) {
          if (maskLine && (maskLine[voxelIndex] ?? 0) > 0) {
            continue;
          }
          const voxelBase = voxelIndex * channels;
          const red = sourceLine[voxelBase] ?? 0;
          const green = sourceLine[voxelBase + 1] ?? 0;
          const blue = sourceLine[voxelBase + 2] ?? 0;
          let voxelMin = red;
          let voxelMax = red;
          let voxelOccupied = red > 0 || green > 0 || blue > 0;

          if (green < voxelMin) {
            voxelMin = green;
          }
          if (green > voxelMax) {
            voxelMax = green;
          }
          if (blue < voxelMin) {
            voxelMin = blue;
          }
          if (blue > voxelMax) {
            voxelMax = blue;
          }

          for (let channel = 3; channel < channels; channel += 1) {
            const value = sourceLine[voxelBase + channel] ?? 0;
            if (value < voxelMin) {
              voxelMin = value;
            }
            if (value > voxelMax) {
              voxelMax = value;
            }
            if (!voxelOccupied && value > 0) {
              voxelOccupied = true;
            }
          }

          if (voxelMin < min) {
            min = voxelMin;
          }
          if (voxelMax > max) {
            max = voxelMax;
          }

          if (histogram) {
            const intensity = Math.round(red * 0.2126 + green * 0.7152 + blue * 0.0722);
            histogram[Math.round((intensity * 255) / denominator)] += 1;
          }

          if (voxelOccupied) {
            occupiedVoxelCount += 1;
          }
          consideredVoxelCount += 1;
        }
      }

      destinationOffset += lineLength;
    }
  }

  if (!histogram && occupiedVoxelCount === 0) {
    min = 0;
    max = 0;
  }

  const chunk = toByteView(chunkValues);
  return {
    chunk,
    stats: {
      min: consideredVoxelCount > 0 ? min : 0,
      max: consideredVoxelCount > 0 ? max : 0,
      occupancy: voxelCount > 0 ? occupiedVoxelCount / voxelCount : 0
    }
  };
}

export function extractBackgroundMaskChunkBytes({
  source,
  width,
  height,
  zStart,
  zLength,
  yStart,
  yLength,
  xStart,
  xLength
}: {
  source: Uint8Array;
  width: number;
  height: number;
  zStart: number;
  zLength: number;
  yStart: number;
  yLength: number;
  xStart: number;
  xLength: number;
}): Uint8Array {
  const rowStride = width;
  const planeStride = height * rowStride;
  const chunk = new Uint8Array(zLength * yLength * xLength);

  let destinationOffset = 0;
  for (let localZ = 0; localZ < zLength; localZ += 1) {
    const sourceZBase = (zStart + localZ) * planeStride;
    for (let localY = 0; localY < yLength; localY += 1) {
      const sourceOffset = sourceZBase + (yStart + localY) * rowStride + xStart;
      const sourceLine = source.subarray(sourceOffset, sourceOffset + xLength);
      chunk.set(sourceLine, destinationOffset);
      destinationOffset += xLength;
    }
  }

  return chunk;
}

export function assertSkipHierarchyDescriptorMatchesGrid({
  descriptor,
  expectedTimepoints,
  expectedGridShape,
  expectedDataType,
  label
}: {
  descriptor: ZarrArrayDescriptor;
  expectedTimepoints: number;
  expectedGridShape: [number, number, number];
  expectedDataType: ZarrArrayDescriptor['dataType'];
  label: string;
}): void {
  if (descriptor.dataType !== expectedDataType) {
    throw new Error(
      `Skip hierarchy descriptor dtype mismatch for ${label} (${descriptor.path}): expected ${expectedDataType}, got ${descriptor.dataType}.`
    );
  }
  if (descriptor.shape.length !== 4) {
    throw new Error(`Skip hierarchy descriptor for ${label} (${descriptor.path}) must have rank 4.`);
  }
  const [shapeTimepoints, shapeZ, shapeY, shapeX] = descriptor.shape;
  if (
    shapeTimepoints !== expectedTimepoints ||
    shapeZ !== expectedGridShape[0] ||
    shapeY !== expectedGridShape[1] ||
    shapeX !== expectedGridShape[2]
  ) {
    throw new Error(
      `Skip hierarchy descriptor shape mismatch for ${label} (${descriptor.path}): expected ${expectedTimepoints}x${expectedGridShape[0]}x${expectedGridShape[1]}x${expectedGridShape[2]}, got ${shapeTimepoints}x${shapeZ}x${shapeY}x${shapeX}.`
    );
  }
  if (descriptor.chunkShape.length !== 4) {
    throw new Error(`Skip hierarchy descriptor chunk shape for ${label} (${descriptor.path}) must have rank 4.`);
  }
  const [chunkTimepoints, chunkZ, chunkY, chunkX] = descriptor.chunkShape;
  if (
    chunkTimepoints !== 1 ||
    chunkZ !== expectedGridShape[0] ||
    chunkY !== expectedGridShape[1] ||
    chunkX !== expectedGridShape[2]
  ) {
    throw new Error(
      `Skip hierarchy descriptor chunk shape mismatch for ${label} (${descriptor.path}): expected 1x${expectedGridShape[0]}x${expectedGridShape[1]}x${expectedGridShape[2]}, got ${chunkTimepoints}x${chunkZ}x${chunkY}x${chunkX}.`
    );
  }
}

type SkipHierarchyLevelBuffers = {
  gridShape: [number, number, number];
  min: Uint8Array | Uint16Array;
  max: Uint8Array | Uint16Array;
  occupancy: Uint8Array;
};

function toByteView(view: Uint8Array | Uint16Array): Uint8Array {
  return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
}

function reduceSkipHierarchyLevelBuffers(child: SkipHierarchyLevelBuffers): SkipHierarchyLevelBuffers {
  const [childZ, childY, childX] = child.gridShape;
  const parentGridShape: [number, number, number] = [
    Math.max(1, Math.ceil(childZ / 2)),
    Math.max(1, Math.ceil(childY / 2)),
    Math.max(1, Math.ceil(childX / 2))
  ];
  const [parentZ, parentY, parentX] = parentGridShape;
  const parentVoxelCount = parentZ * parentY * parentX;
  const parentMin = child.min instanceof Uint16Array ? new Uint16Array(parentVoxelCount) : new Uint8Array(parentVoxelCount);
  const parentMax = child.max instanceof Uint16Array ? new Uint16Array(parentVoxelCount) : new Uint8Array(parentVoxelCount);
  const parentOccupancy = new Uint8Array(parentVoxelCount);
  const childPlaneSize = childY * childX;
  const parentPlaneSize = parentY * parentX;
  const denominator = child.min instanceof Uint16Array ? 0xffff : 0xff;

  for (let z = 0; z < parentZ; z += 1) {
    const childZStart = z * 2;
    for (let y = 0; y < parentY; y += 1) {
      const childYStart = y * 2;
      for (let x = 0; x < parentX; x += 1) {
        const childXStart = x * 2;
        const parentIndex = (z * parentPlaneSize) + (y * parentX) + x;
        let occupied = false;
        let localMin = denominator;
        let localMax = 0;

        for (let localZ = 0; localZ < 2; localZ += 1) {
          const sourceZ = childZStart + localZ;
          if (sourceZ >= childZ) {
            continue;
          }
          for (let localY = 0; localY < 2; localY += 1) {
            const sourceY = childYStart + localY;
            if (sourceY >= childY) {
              continue;
            }
            for (let localX = 0; localX < 2; localX += 1) {
              const sourceX = childXStart + localX;
              if (sourceX >= childX) {
                continue;
              }
              const childIndex = (sourceZ * childPlaneSize) + (sourceY * childX) + sourceX;
              if ((child.occupancy[childIndex] ?? 0) === 0) {
                continue;
              }
              occupied = true;
              const childMin = child.min[childIndex] ?? 0;
              const childMax = child.max[childIndex] ?? 0;
              if (childMin < localMin) {
                localMin = childMin;
              }
              if (childMax > localMax) {
                localMax = childMax;
              }
            }
          }
        }

        if (!occupied) {
          parentOccupancy[parentIndex] = 0;
          parentMin[parentIndex] = 0;
          parentMax[parentIndex] = 0;
          continue;
        }
        parentOccupancy[parentIndex] = 255;
        parentMin[parentIndex] = localMin;
        parentMax[parentIndex] = localMax;
      }
    }
  }

  return {
    gridShape: parentGridShape,
    min: parentMin,
    max: parentMax,
    occupancy: parentOccupancy
  };
}

export function buildSkipHierarchyLevelBuffersFromLeaf({
  leafGridShape,
  leafMin,
  leafMax,
  leafOccupancy,
  levelCount
}: {
  leafGridShape: [number, number, number];
  leafMin: Uint8Array | Uint16Array;
  leafMax: Uint8Array | Uint16Array;
  leafOccupancy: Uint8Array;
  levelCount: number;
}): SkipHierarchyLevelBuffers[] {
  if (levelCount <= 0) {
    return [];
  }
  const levels: SkipHierarchyLevelBuffers[] = [
    {
      gridShape: leafGridShape,
      min: leafMin,
      max: leafMax,
      occupancy: leafOccupancy
    }
  ];
  while (levels.length < levelCount) {
    const previous = levels[levels.length - 1];
    if (!previous) {
      break;
    }
    levels.push(reduceSkipHierarchyLevelBuffers(previous));
  }
  return levels;
}

type PlaybackAtlasWriteState = {
  descriptor: PreprocessedScalePlaybackAtlasZarrDescriptor;
  dataEntryDescriptor: ZarrArrayDescriptor;
  brickAtlasIndices: Int32Array;
  occupiedBrickCount: number;
  blockByteLength: number;
  blocks: Uint8Array[];
};

export function createPlaybackAtlasWriteState({
  descriptor,
  chunkDepth,
  chunkHeight,
  chunkWidth,
  expectedBrickCount
}: {
  descriptor: PreprocessedScalePlaybackAtlasZarrDescriptor;
  chunkDepth: number;
  chunkHeight: number;
  chunkWidth: number;
  expectedBrickCount: number;
}): PlaybackAtlasWriteState {
  return {
    descriptor,
    dataEntryDescriptor: createSyntheticDescriptorForBlob(descriptor.data),
    brickAtlasIndices: new Int32Array(expectedBrickCount).fill(-1),
    occupiedBrickCount: 0,
    blockByteLength:
      chunkDepth *
      chunkHeight *
      chunkWidth *
      descriptor.textureChannels *
      getBytesPerValue(descriptor.dataType),
    blocks: []
  };
}

export function buildPlaybackAtlasBlock({
  chunkBytes,
  dataType,
  zExtent,
  yExtent,
  xExtent,
  sourceChannels,
  chunkDepth,
  chunkHeight,
  chunkWidth,
  textureFormat,
  textureChannels
}: {
  chunkBytes: Uint8Array;
  dataType: 'uint8' | 'uint16';
  zExtent: number;
  yExtent: number;
  xExtent: number;
  sourceChannels: number;
  chunkDepth: number;
  chunkHeight: number;
  chunkWidth: number;
  textureFormat: PreprocessedBrickAtlasTextureFormat;
  textureChannels: number;
}): Uint8Array {
  const bytesPerValue = getBytesPerValue(dataType);
  const expectedChunkBytes = zExtent * yExtent * xExtent * sourceChannels * bytesPerValue;
  if (chunkBytes.byteLength !== expectedChunkBytes) {
    throw new Error(`Playback atlas block byte length mismatch: expected ${expectedChunkBytes}, got ${chunkBytes.byteLength}.`);
  }
  const blockValueCount = chunkDepth * chunkHeight * chunkWidth * textureChannels;
  const denominator = dataType === 'uint16' ? 0xffff : 0xff;
  const blockValues = dataType === 'uint16'
    ? new Uint16Array(blockValueCount)
    : new Uint8Array(blockValueCount);
  const chunkValues = dataType === 'uint16'
    ? new Uint16Array(chunkBytes.buffer, chunkBytes.byteOffset, chunkBytes.byteLength / 2)
    : chunkBytes;
  for (let localZ = 0; localZ < zExtent; localZ += 1) {
    for (let localY = 0; localY < yExtent; localY += 1) {
      for (let localX = 0; localX < xExtent; localX += 1) {
        const sourceVoxelOffset = (((localZ * yExtent + localY) * xExtent + localX) * sourceChannels);
        const atlasVoxelOffset = (((localZ * chunkHeight + localY) * chunkWidth + localX) * textureChannels);
        if (textureFormat === 'rgba' && sourceChannels === 3) {
          blockValues[atlasVoxelOffset + 3] = denominator;
        }
        for (let sourceChannel = 0; sourceChannel < sourceChannels; sourceChannel += 1) {
          const textureChannel = mapPlaybackSourceChannelToTextureChannel(
            sourceChannel,
            sourceChannels,
            textureFormat
          );
          if (textureChannel === null) {
            continue;
          }
          blockValues[atlasVoxelOffset + textureChannel] = chunkValues[sourceVoxelOffset + sourceChannel] ?? 0;
        }
      }
    }
  }
  return new Uint8Array(blockValues.buffer, blockValues.byteOffset, blockValues.byteLength);
}

export async function writeDataChunksForScale({
  chunkWriter,
  descriptor,
  skipHierarchyDescriptor,
  subcellDescriptor,
  playbackAtlasDescriptor,
  timepoint,
  volume,
  isSegmentation = false,
  emitHistogram = false,
  backgroundMask,
  signal
}: {
  chunkWriter: ChunkWriteDispatcher;
  descriptor: ZarrArrayDescriptor;
  skipHierarchyDescriptor?: PreprocessedScaleSkipHierarchyZarrDescriptor;
  subcellDescriptor?: PreprocessedScaleSubcellZarrDescriptor;
  playbackAtlasDescriptor?: PreprocessedScalePlaybackAtlasZarrDescriptor;
  timepoint: number;
  volume: {
    width: number;
    height: number;
    depth: number;
    channels: number;
    data: Uint8Array | Uint16Array;
  };
  isSegmentation?: boolean;
  emitHistogram?: boolean;
  backgroundMask?: BackgroundMaskVolume | null;
  signal?: AbortSignal;
}): Promise<Uint32Array | null> {
  const expectedDataLength = volume.depth * volume.height * volume.width * volume.channels;
  if (volume.data.length !== expectedDataLength) {
    throw new Error(
      `Scale payload size mismatch for ${descriptor.path}: expected ${expectedDataLength} values, got ${volume.data.length}.`
    );
  }

  const [, descriptorDepth, descriptorHeight, descriptorWidth, descriptorChannels] = descriptor.shape;
  if (
    descriptorDepth !== volume.depth ||
    descriptorHeight !== volume.height ||
    descriptorWidth !== volume.width ||
    descriptorChannels !== volume.channels
  ) {
    throw new Error(
      `Scale descriptor shape mismatch for ${descriptor.path}: expected ${descriptorDepth}x${descriptorHeight}x${descriptorWidth}x${descriptorChannels}, got ${volume.depth}x${volume.height}x${volume.width}x${volume.channels}.`
    );
  }
  if (descriptor.chunkShape.length !== 5) {
    throw new Error(`Data chunk shape for ${descriptor.path} must have rank 5.`);
  }

  const [, chunkDepth, chunkHeight, chunkWidth, chunkChannels] = descriptor.chunkShape;
  if (chunkChannels !== volume.channels) {
    throw new Error(
      `Data chunk channel dimension mismatch for ${descriptor.path}: expected ${volume.channels}, got ${chunkChannels}.`
    );
  }

  const zChunks = Math.ceil(volume.depth / chunkDepth);
  const yChunks = Math.ceil(volume.height / chunkHeight);
  const xChunks = Math.ceil(volume.width / chunkWidth);
  const chunkCount = zChunks * yChunks * xChunks;
  const leafGridShape: [number, number, number] = [zChunks, yChunks, xChunks];
  const expectedTimepoints = descriptor.shape[0] ?? 0;
  const histogram = emitHistogram ? new Uint32Array(HISTOGRAM_BINS) : null;

  let leafMinValues: Uint8Array | Uint16Array | null = null;
  let leafMaxValues: Uint8Array | Uint16Array | null = null;
  let leafOccupancyValues: Uint8Array | null = null;
  if (skipHierarchyDescriptor) {
    const leafLevel = skipHierarchyDescriptor.levels[0];
    if (!leafLevel) {
      throw new Error(`Skip hierarchy is missing level 0 for ${descriptor.path}.`);
    }
    assertSkipHierarchyDescriptorMatchesGrid({
      descriptor: leafLevel.min,
      expectedTimepoints,
      expectedGridShape: leafGridShape,
      expectedDataType: leafLevel.min.dataType,
      label: 'min'
    });
    assertSkipHierarchyDescriptorMatchesGrid({
      descriptor: leafLevel.max,
      expectedTimepoints,
      expectedGridShape: leafGridShape,
      expectedDataType: leafLevel.max.dataType,
      label: 'max'
    });
    assertSkipHierarchyDescriptorMatchesGrid({
      descriptor: leafLevel.occupancy,
      expectedTimepoints,
      expectedGridShape: leafGridShape,
      expectedDataType: 'uint8',
      label: 'occupancy'
    });

    leafMinValues = leafLevel.min.dataType === 'uint16' ? new Uint16Array(chunkCount) : new Uint8Array(chunkCount);
    leafMaxValues = leafLevel.max.dataType === 'uint16' ? new Uint16Array(chunkCount) : new Uint8Array(chunkCount);
    leafOccupancyValues = new Uint8Array(chunkCount);
  }

  let subcellTextureBytes: Uint8Array | Uint16Array | null = null;
  let subcellTextureSize: { width: number; height: number; depth: number } | null = null;
  let subcellGridShape: [number, number, number] | null = null;
  if (subcellDescriptor) {
    const subcellGrid = {
      x: subcellDescriptor.gridShape[2],
      y: subcellDescriptor.gridShape[1],
      z: subcellDescriptor.gridShape[0]
    };
    subcellTextureSize = buildBrickSubcellTextureSize({
      gridShape: leafGridShape,
      subcellGrid
    });
    const expectedTextureLength = subcellTextureSize.width * subcellTextureSize.height * subcellTextureSize.depth * 4;
    const expectedTimepointShape = [
      subcellTextureSize.depth,
      subcellTextureSize.height,
      subcellTextureSize.width,
      4
    ];
    const actualTimepointShape = subcellDescriptor.data.shape.slice(1);
    if (
      actualTimepointShape.length !== expectedTimepointShape.length ||
      actualTimepointShape.some((value, index) => value !== expectedTimepointShape[index])
    ) {
      throw new Error(`Subcell descriptor shape mismatch for ${descriptor.path}.`);
    }
    subcellTextureBytes = subcellDescriptor.data.dataType === 'uint16'
      ? new Uint16Array(expectedTextureLength)
      : new Uint8Array(expectedTextureLength);
    subcellGridShape = subcellDescriptor.gridShape;
  }

  const playbackAtlasState = playbackAtlasDescriptor
    ? createPlaybackAtlasWriteState({
        descriptor: playbackAtlasDescriptor,
        chunkDepth,
        chunkHeight,
        chunkWidth,
        expectedBrickCount: chunkCount
      })
    : null;

  for (let zChunk = 0; zChunk < zChunks; zChunk += 1) {
    const zStart = chunkStart(zChunk, chunkDepth);
    const zLength = chunkLength(volume.depth, zStart, chunkDepth);
    for (let yChunk = 0; yChunk < yChunks; yChunk += 1) {
      const yStart = chunkStart(yChunk, chunkHeight);
      const yLength = chunkLength(volume.height, yStart, chunkHeight);
      for (let xChunk = 0; xChunk < xChunks; xChunk += 1) {
        const xStart = chunkStart(xChunk, chunkWidth);
        const xLength = chunkLength(volume.width, xStart, chunkWidth);
        const { chunk, stats } = extractDataChunkBytesAndComputeStatistics({
          source: volume.data,
          dataType: descriptor.dataType as 'uint8' | 'uint16',
          isSegmentation,
          width: volume.width,
          height: volume.height,
          channels: volume.channels,
          zStart,
          zLength,
          yStart,
          yLength,
          xStart,
          xLength,
          histogram: histogram ?? undefined,
          backgroundMask
        });
        await chunkWriter.writeChunk({
          descriptor,
          chunkCoords: [timepoint, zChunk, yChunk, xChunk, 0],
          bytes: chunk,
          signal
        });
        const chunkIndex = (zChunk * yChunks + yChunk) * xChunks + xChunk;
        if (leafMinValues && leafMaxValues && leafOccupancyValues) {
          leafMinValues[chunkIndex] = stats.min;
          leafMaxValues[chunkIndex] = stats.max;
          leafOccupancyValues[chunkIndex] = stats.occupancy > 0 ? 255 : 0;
        }
        if (playbackAtlasState && stats.occupancy > 0) {
          playbackAtlasState.brickAtlasIndices[chunkIndex] = playbackAtlasState.occupiedBrickCount;
          playbackAtlasState.occupiedBrickCount += 1;
          playbackAtlasState.blocks.push(
            buildPlaybackAtlasBlock({
              chunkBytes: chunk,
              dataType: playbackAtlasState.descriptor.dataType,
              zExtent: zLength,
              yExtent: yLength,
              xExtent: xLength,
              sourceChannels: volume.channels,
              chunkDepth,
              chunkHeight,
              chunkWidth,
              textureFormat: playbackAtlasState.descriptor.textureFormat,
              textureChannels: playbackAtlasState.descriptor.textureChannels
            })
          );
        }
        if (subcellTextureBytes && subcellTextureSize && subcellGridShape) {
          const subcellChunk = buildBrickSubcellChunkData({
            chunkShape: [chunkDepth, chunkHeight, chunkWidth],
            components: volume.channels,
            outputDataType: subcellDescriptor?.data.dataType === 'uint16' ? 'uint16' : 'uint8',
            readVoxelComponent: (localZ, localY, localX, component) => {
              if (localZ < 0 || localZ >= zLength || localY < 0 || localY >= yLength || localX < 0 || localX >= xLength) {
                return 0;
              }
              const sourceIndex = (((localZ * yLength + localY) * xLength + localX) * volume.channels) + component;
              return chunk[sourceIndex] ?? 0;
            }
          });
          if (!subcellChunk) {
            throw new Error(`Failed to build subcell texture data for ${descriptor.path}.`);
          }
          if (
            subcellChunk.subcellGrid.z !== subcellGridShape[0] ||
            subcellChunk.subcellGrid.y !== subcellGridShape[1] ||
            subcellChunk.subcellGrid.x !== subcellGridShape[2]
          ) {
            throw new Error(`Subcell grid mismatch for ${descriptor.path}.`);
          }
          writeBrickSubcellChunkData({
            targetData: subcellTextureBytes,
            targetSize: subcellTextureSize,
            brickCoords: { x: xChunk, y: yChunk, z: zChunk },
            chunkData: subcellChunk.data,
            subcellGrid: subcellChunk.subcellGrid
          });
        }
      }
    }
  }

  if (skipHierarchyDescriptor && leafMinValues && leafMaxValues && leafOccupancyValues) {
    const hierarchyBuffers = buildSkipHierarchyLevelBuffersFromLeaf({
      leafGridShape,
      leafMin: leafMinValues,
      leafMax: leafMaxValues,
      leafOccupancy: leafOccupancyValues,
      levelCount: skipHierarchyDescriptor.levels.length
    });
    if (hierarchyBuffers.length !== skipHierarchyDescriptor.levels.length) {
      throw new Error(`Skip hierarchy build mismatch for ${descriptor.path}.`);
    }
    for (let hierarchyLevel = 0; hierarchyLevel < skipHierarchyDescriptor.levels.length; hierarchyLevel += 1) {
      const hierarchyDescriptor = skipHierarchyDescriptor.levels[hierarchyLevel];
      const hierarchyData = hierarchyBuffers[hierarchyLevel];
      if (!hierarchyDescriptor || !hierarchyData) {
        throw new Error(`Skip hierarchy level mismatch for ${descriptor.path} at level ${hierarchyLevel}.`);
      }
      const expectedGridShape = hierarchyDescriptor.gridShape;
      const actualGridShape = hierarchyData.gridShape;
      if (
        expectedGridShape[0] !== actualGridShape[0] ||
        expectedGridShape[1] !== actualGridShape[1] ||
        expectedGridShape[2] !== actualGridShape[2]
      ) {
        throw new Error(
          `Skip hierarchy grid mismatch for ${descriptor.path} at level ${hierarchyLevel}: expected ${expectedGridShape.join('x')}, got ${actualGridShape.join('x')}.`
        );
      }
      await chunkWriter.writeChunk({
        descriptor: hierarchyDescriptor.min,
        chunkCoords: [timepoint, 0, 0, 0],
        bytes: toByteView(hierarchyData.min),
        signal
      });
      await chunkWriter.writeChunk({
        descriptor: hierarchyDescriptor.max,
        chunkCoords: [timepoint, 0, 0, 0],
        bytes: toByteView(hierarchyData.max),
        signal
      });
      await chunkWriter.writeChunk({
        descriptor: hierarchyDescriptor.occupancy,
        chunkCoords: [timepoint, 0, 0, 0],
        bytes: hierarchyData.occupancy,
        signal
      });
    }
  }

  if (subcellDescriptor && subcellTextureBytes) {
    await chunkWriter.writeChunk({
      descriptor: subcellDescriptor.data,
      chunkCoords: [timepoint, 0, 0, 0, 0],
      bytes: toByteView(subcellTextureBytes),
      signal
    });
  }

  if (playbackAtlasState) {
    const atlasBytes = new Uint8Array(playbackAtlasState.occupiedBrickCount * playbackAtlasState.blockByteLength);
    for (let blockIndex = 0; blockIndex < playbackAtlasState.blocks.length; blockIndex += 1) {
      const block = playbackAtlasState.blocks[blockIndex];
      if (!block) {
        continue;
      }
      atlasBytes.set(block, blockIndex * playbackAtlasState.blockByteLength);
    }
    await chunkWriter.writeChunk({
      descriptor: playbackAtlasState.descriptor.brickAtlasIndices,
      chunkCoords: [timepoint, 0, 0, 0],
      bytes: encodeInt32ArrayLE(playbackAtlasState.brickAtlasIndices),
      signal
    });
    await chunkWriter.writeChunk({
      descriptor: playbackAtlasState.dataEntryDescriptor,
      chunkCoords: [timepoint],
      bytes: atlasBytes,
      signal
    });
  }

  return histogram;
}

export async function writeBackgroundMaskChunksForScale({
  chunkWriter,
  descriptor,
  mask,
  signal
}: {
  chunkWriter: ChunkWriteDispatcher;
  descriptor: ZarrArrayDescriptor;
  mask: BackgroundMaskVolume;
  signal?: AbortSignal;
}): Promise<void> {
  const expectedMaskCount = mask.depth * mask.height * mask.width;
  if (mask.data.length !== expectedMaskCount) {
    throw new Error(
      `Background mask payload size mismatch for ${descriptor.path}: expected ${expectedMaskCount}, got ${mask.data.length}.`
    );
  }
  const [descriptorDepth, descriptorHeight, descriptorWidth] = descriptor.shape;
  if (
    descriptorDepth !== mask.depth ||
    descriptorHeight !== mask.height ||
    descriptorWidth !== mask.width
  ) {
    throw new Error(
      `Background mask descriptor shape mismatch for ${descriptor.path}: expected ${descriptorDepth}x${descriptorHeight}x${descriptorWidth}, got ${mask.depth}x${mask.height}x${mask.width}.`
    );
  }
  if (descriptor.chunkShape.length !== 3) {
    throw new Error(`Background mask chunk shape for ${descriptor.path} must have rank 3.`);
  }

  const [chunkDepth, chunkHeight, chunkWidth] = descriptor.chunkShape;
  const zChunks = Math.ceil(mask.depth / chunkDepth);
  const yChunks = Math.ceil(mask.height / chunkHeight);
  const xChunks = Math.ceil(mask.width / chunkWidth);

  for (let zChunk = 0; zChunk < zChunks; zChunk += 1) {
    const zStart = chunkStart(zChunk, chunkDepth);
    const zLength = chunkLength(mask.depth, zStart, chunkDepth);
    for (let yChunk = 0; yChunk < yChunks; yChunk += 1) {
      const yStart = chunkStart(yChunk, chunkHeight);
      const yLength = chunkLength(mask.height, yStart, chunkHeight);
      for (let xChunk = 0; xChunk < xChunks; xChunk += 1) {
        const xStart = chunkStart(xChunk, chunkWidth);
        const xLength = chunkLength(mask.width, xStart, chunkWidth);
        const chunkBytes = extractBackgroundMaskChunkBytes({
          source: mask.data,
          width: mask.width,
          height: mask.height,
          zStart,
          zLength,
          yStart,
          yLength,
          xStart,
          xLength
        });
        await chunkWriter.writeChunk({
          descriptor,
          chunkCoords: [zChunk, yChunk, xChunk],
          bytes: chunkBytes,
          signal
        });
      }
    }
  }
}
