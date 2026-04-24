import type { VolumeBrickPageTable } from '../../../core/volumeProvider';

export type FullGpuBrickResidencyLayout = {
  slotGrid: { x: number; y: number; z: number };
  atlasSize: { width: number; height: number; depth: number };
  residentBytes: number;
};

export type FullGpuBrickResidencyBuildResult = FullGpuBrickResidencyLayout & {
  atlasData: Uint8Array;
  atlasIndices: Float32Array;
};

const BRICK_ATLAS_HALO_VOXELS = 1;

function resolveBrickAtlasSlotLayout({
  slotCapacity,
  chunkWidth,
  chunkHeight,
  chunkDepth,
  max3DTextureSize,
}: {
  slotCapacity: number;
  chunkWidth: number;
  chunkHeight: number;
  chunkDepth: number;
  max3DTextureSize: number | null;
}): {
  slotGridX: number;
  slotGridY: number;
  slotGridZ: number;
  allocatedSlotCapacity: number;
  atlasWidth: number;
  atlasHeight: number;
  atlasDepth: number;
} {
  const normalizedSlotCapacity = Math.max(1, Math.floor(slotCapacity));
  const safeChunkWidth = Math.max(1, Math.floor(chunkWidth));
  const safeChunkHeight = Math.max(1, Math.floor(chunkHeight));
  const safeChunkDepth = Math.max(1, Math.floor(chunkDepth));
  const safeMax3D =
    max3DTextureSize && Number.isFinite(max3DTextureSize) && max3DTextureSize > 0
      ? Math.max(1, Math.floor(max3DTextureSize))
      : null;

  if (!safeMax3D) {
    const slotGridX = 1;
    const slotGridY = 1;
    const slotGridZ = normalizedSlotCapacity;
    return {
      slotGridX,
      slotGridY,
      slotGridZ,
      allocatedSlotCapacity: slotGridX * slotGridY * slotGridZ,
      atlasWidth: safeChunkWidth,
      atlasHeight: safeChunkHeight,
      atlasDepth: safeChunkDepth * slotGridZ,
    };
  }

  const maxSlotsX = Math.max(1, Math.floor(safeMax3D / safeChunkWidth));
  const maxSlotsY = Math.max(1, Math.floor(safeMax3D / safeChunkHeight));
  const maxSlotsZ = Math.max(1, Math.floor(safeMax3D / safeChunkDepth));
  let slotGridX = Math.min(maxSlotsX, normalizedSlotCapacity);
  let slotGridY = Math.min(maxSlotsY, Math.max(1, Math.ceil(normalizedSlotCapacity / slotGridX)));
  let slotGridZ = Math.max(1, Math.ceil(normalizedSlotCapacity / (slotGridX * slotGridY)));
  if (slotGridZ > maxSlotsZ) {
    slotGridZ = maxSlotsZ;
    const requiredPlaneSlots = Math.max(1, Math.ceil(normalizedSlotCapacity / slotGridZ));
    slotGridX = Math.min(maxSlotsX, requiredPlaneSlots);
    slotGridY = Math.min(maxSlotsY, Math.max(1, Math.ceil(requiredPlaneSlots / slotGridX)));
  }
  const allocatedSlotCapacity = Math.max(1, slotGridX * slotGridY * slotGridZ);

  return {
    slotGridX,
    slotGridY,
    slotGridZ,
    allocatedSlotCapacity,
    atlasWidth: safeChunkWidth * slotGridX,
    atlasHeight: safeChunkHeight * slotGridY,
    atlasDepth: safeChunkDepth * slotGridZ,
  };
}

function resolveBrickAtlasSlotCoordinates(
  slotIndex: number,
  slotGridX: number,
  slotGridY: number
): { slotX: number; slotY: number; slotZ: number } {
  const safeSlotIndex = Math.max(0, Math.floor(slotIndex));
  const safeSlotGridX = Math.max(1, Math.floor(slotGridX));
  const safeSlotGridY = Math.max(1, Math.floor(slotGridY));
  const slotsPerPlane = safeSlotGridX * safeSlotGridY;
  const slotZ = Math.floor(safeSlotIndex / slotsPerPlane);
  const withinPlane = safeSlotIndex % slotsPerPlane;
  const slotY = Math.floor(withinPlane / safeSlotGridX);
  const slotX = withinPlane % safeSlotGridX;
  return { slotX, slotY, slotZ };
}

function resolveBrickGridCoordinatesFromFlatIndex(
  flatIndex: number,
  gridX: number,
  gridY: number
): { brickX: number; brickY: number; brickZ: number } {
  const safeFlatIndex = Math.max(0, Math.floor(flatIndex));
  const safeGridX = Math.max(1, Math.floor(gridX));
  const safeGridY = Math.max(1, Math.floor(gridY));
  const plane = safeGridY * safeGridX;
  const brickZ = Math.floor(safeFlatIndex / plane);
  const withinPlane = safeFlatIndex % plane;
  const brickY = Math.floor(withinPlane / safeGridX);
  const brickX = withinPlane % safeGridX;
  return { brickX, brickY, brickZ };
}

function flattenBrickGridCoordinates(
  brickX: number,
  brickY: number,
  brickZ: number,
  gridX: number,
  gridY: number
): number {
  return (brickZ * gridY + brickY) * gridX + brickX;
}

function resolveLocalVoxelForCoreAndHalo(
  coordinate: number,
  coreSize: number
): { brickOffset: -1 | 0 | 1; local: number } {
  const safeCoreSize = Math.max(1, Math.floor(coreSize));
  if (coordinate < 0) {
    return {
      brickOffset: -1,
      local: Math.min(Math.max(coordinate + safeCoreSize, 0), safeCoreSize - 1),
    };
  }
  if (coordinate >= safeCoreSize) {
    return {
      brickOffset: 1,
      local: Math.min(Math.max(coordinate - safeCoreSize, 0), safeCoreSize - 1),
    };
  }
  return { brickOffset: 0, local: coordinate };
}

function copyBrickIntoResidentAtlas({
  sourceData,
  sourceIndex,
  destinationData,
  destinationSlot,
  coreChunkWidth,
  coreChunkHeight,
  coreChunkDepth,
  haloVoxels,
  sourceBrickWidth,
  sourceBrickHeight,
  sourceBrickDepth,
  sourceIndexToFlatBrick,
  brickAtlasIndices,
  gridX,
  gridY,
  gridZ,
  slotGridX,
  slotGridY,
  destinationWidth,
  destinationHeight,
  destinationDepth,
  textureComponents,
}: {
  sourceData: Uint8Array;
  sourceIndex: number;
  destinationData: Uint8Array;
  destinationSlot: number;
  coreChunkWidth: number;
  coreChunkHeight: number;
  coreChunkDepth: number;
  haloVoxels: number;
  sourceBrickWidth: number;
  sourceBrickHeight: number;
  sourceBrickDepth: number;
  sourceIndexToFlatBrick: Int32Array;
  brickAtlasIndices: Int32Array;
  gridX: number;
  gridY: number;
  gridZ: number;
  slotGridX: number;
  slotGridY: number;
  destinationWidth: number;
  destinationHeight: number;
  destinationDepth: number;
  textureComponents: number;
}): void {
  const paddedChunkWidth = coreChunkWidth + haloVoxels * 2;
  const paddedChunkHeight = coreChunkHeight + haloVoxels * 2;
  const paddedChunkDepth = coreChunkDepth + haloVoxels * 2;
  const { slotX, slotY, slotZ } = resolveBrickAtlasSlotCoordinates(destinationSlot, slotGridX, slotGridY);
  const destinationXBase = slotX * paddedChunkWidth;
  const destinationYBase = slotY * paddedChunkHeight;
  const destinationZBase = slotZ * paddedChunkDepth;
  const destinationRowStride = destinationWidth * textureComponents;
  const destinationSliceStride = destinationHeight * destinationRowStride;
  const sourceRowStride = sourceBrickWidth * textureComponents;
  const sourceSliceStride = sourceBrickHeight * sourceRowStride;
  const sourceBrickStride = sourceBrickDepth * sourceSliceStride;

  if (haloVoxels <= 0) {
    const sourceBrickBaseOffset = sourceIndex * sourceBrickStride;
    for (let localZ = 0; localZ < coreChunkDepth; localZ += 1) {
      const destinationZ = destinationZBase + localZ;
      if (destinationZ >= destinationDepth) {
        continue;
      }
      const sourceZOffset = sourceBrickBaseOffset + localZ * sourceSliceStride;
      const destinationZOffset = destinationZ * destinationSliceStride;
      for (let localY = 0; localY < coreChunkHeight; localY += 1) {
        const destinationY = destinationYBase + localY;
        if (destinationY >= destinationHeight) {
          continue;
        }
        const sourceYOffset = sourceZOffset + localY * sourceRowStride;
        const destinationYOffset = destinationZOffset + destinationY * destinationRowStride;
        for (let localX = 0; localX < coreChunkWidth; localX += 1) {
          const destinationX = destinationXBase + localX;
          if (destinationX >= destinationWidth) {
            continue;
          }
          const sourceVoxelOffset = sourceYOffset + localX * textureComponents;
          const destinationVoxelOffset = destinationYOffset + destinationX * textureComponents;
          for (let component = 0; component < textureComponents; component += 1) {
            destinationData[destinationVoxelOffset + component] = sourceData[sourceVoxelOffset + component] ?? 0;
          }
        }
      }
    }
    return;
  }

  const sourceFlatBrickIndex = sourceIndexToFlatBrick[sourceIndex] ?? -1;
  if (sourceFlatBrickIndex < 0) {
    return;
  }
  const { brickX: sourceBrickX, brickY: sourceBrickY, brickZ: sourceBrickZ } = resolveBrickGridCoordinatesFromFlatIndex(
    sourceFlatBrickIndex,
    gridX,
    gridY
  );

  const xOffsets = new Int8Array(paddedChunkWidth);
  const yOffsets = new Int8Array(paddedChunkHeight);
  const zOffsets = new Int8Array(paddedChunkDepth);
  const xLocals = new Int16Array(paddedChunkWidth);
  const yLocals = new Int16Array(paddedChunkHeight);
  const zLocals = new Int16Array(paddedChunkDepth);
  const xClamped = new Int16Array(paddedChunkWidth);
  const yClamped = new Int16Array(paddedChunkHeight);
  const zClamped = new Int16Array(paddedChunkDepth);

  for (let localX = 0; localX < paddedChunkWidth; localX += 1) {
    const sourceCoreX = localX - haloVoxels;
    const localXInfo = resolveLocalVoxelForCoreAndHalo(sourceCoreX, coreChunkWidth);
    xOffsets[localX] = localXInfo.brickOffset;
    xLocals[localX] = localXInfo.local;
    xClamped[localX] = Math.min(Math.max(sourceCoreX, 0), coreChunkWidth - 1);
  }
  for (let localY = 0; localY < paddedChunkHeight; localY += 1) {
    const sourceCoreY = localY - haloVoxels;
    const localYInfo = resolveLocalVoxelForCoreAndHalo(sourceCoreY, coreChunkHeight);
    yOffsets[localY] = localYInfo.brickOffset;
    yLocals[localY] = localYInfo.local;
    yClamped[localY] = Math.min(Math.max(sourceCoreY, 0), coreChunkHeight - 1);
  }
  for (let localZ = 0; localZ < paddedChunkDepth; localZ += 1) {
    const sourceCoreZ = localZ - haloVoxels;
    const localZInfo = resolveLocalVoxelForCoreAndHalo(sourceCoreZ, coreChunkDepth);
    zOffsets[localZ] = localZInfo.brickOffset;
    zLocals[localZ] = localZInfo.local;
    zClamped[localZ] = Math.min(Math.max(sourceCoreZ, 0), coreChunkDepth - 1);
  }

  const neighborSourceIndexByOffset = new Int32Array(27).fill(-1);
  for (let offsetZ = -1; offsetZ <= 1; offsetZ += 1) {
    const candidateBrickZ = sourceBrickZ + offsetZ;
    const zInBounds = candidateBrickZ >= 0 && candidateBrickZ < gridZ;
    for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
      const candidateBrickY = sourceBrickY + offsetY;
      const yInBounds = candidateBrickY >= 0 && candidateBrickY < gridY;
      for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
        const key = (offsetZ + 1) * 9 + (offsetY + 1) * 3 + (offsetX + 1);
        const candidateBrickX = sourceBrickX + offsetX;
        const inBounds = zInBounds && yInBounds && candidateBrickX >= 0 && candidateBrickX < gridX;
        if (!inBounds) {
          neighborSourceIndexByOffset[key] = -1;
          continue;
        }
        neighborSourceIndexByOffset[key] =
          brickAtlasIndices[
            flattenBrickGridCoordinates(candidateBrickX, candidateBrickY, candidateBrickZ, gridX, gridY)
          ] ?? -1;
      }
    }
  }

  for (let localZ = 0; localZ < paddedChunkDepth; localZ += 1) {
    const destinationZ = destinationZBase + localZ;
    if (destinationZ >= destinationDepth) {
      continue;
    }
    const zOffset = zOffsets[localZ] ?? 0;
    const zLocal = zLocals[localZ] ?? 0;
    const zLocalClamped = zClamped[localZ] ?? 0;
    const destinationZOffset = destinationZ * destinationSliceStride;
    const zOffsetKeyBase = (zOffset + 1) * 9;
    for (let localY = 0; localY < paddedChunkHeight; localY += 1) {
      const destinationY = destinationYBase + localY;
      if (destinationY >= destinationHeight) {
        continue;
      }
      const yOffset = yOffsets[localY] ?? 0;
      const yLocal = yLocals[localY] ?? 0;
      const yLocalClamped = yClamped[localY] ?? 0;
      const destinationYOffset = destinationZOffset + destinationY * destinationRowStride;
      const yzOffsetKeyBase = zOffsetKeyBase + (yOffset + 1) * 3;
      for (let localX = 0; localX < paddedChunkWidth; localX += 1) {
        const destinationX = destinationXBase + localX;
        if (destinationX >= destinationWidth) {
          continue;
        }
        const xOffset = xOffsets[localX] ?? 0;
        const xLocal = xLocals[localX] ?? 0;
        const xLocalClamped = xClamped[localX] ?? 0;
        const candidateSourceIndex = neighborSourceIndexByOffset[yzOffsetKeyBase + (xOffset + 1)] ?? -1;
        const selectedSourceIndex = candidateSourceIndex >= 0 ? candidateSourceIndex : sourceIndex;
        const selectedLocalX = candidateSourceIndex >= 0 ? xLocal : xLocalClamped;
        const selectedLocalY = candidateSourceIndex >= 0 ? yLocal : yLocalClamped;
        const selectedLocalZ = candidateSourceIndex >= 0 ? zLocal : zLocalClamped;
        const sourceVoxelOffset =
          selectedSourceIndex * sourceBrickStride +
          selectedLocalZ * sourceSliceStride +
          selectedLocalY * sourceRowStride +
          selectedLocalX * textureComponents;
        const destinationVoxelOffset = destinationYOffset + destinationX * textureComponents;
        for (let component = 0; component < textureComponents; component += 1) {
          destinationData[destinationVoxelOffset + component] = sourceData[sourceVoxelOffset + component] ?? 0;
        }
      }
    }
  }
}

export function resolveFullGpuBrickResidencyLayout({
  pageTable,
  textureComponents,
  max3DTextureSize,
}: {
  pageTable: Pick<VolumeBrickPageTable, 'chunkShape' | 'occupiedBrickCount' | 'scaleLevel'>;
  textureComponents: number;
  max3DTextureSize: number | null;
}): FullGpuBrickResidencyLayout | null {
  if (!Number.isFinite(textureComponents) || textureComponents <= 0) {
    return null;
  }

  const coreChunkDepth = Math.max(1, pageTable.chunkShape[0]);
  const coreChunkHeight = Math.max(1, pageTable.chunkShape[1]);
  const coreChunkWidth = Math.max(1, pageTable.chunkShape[2]);
  const haloVoxels = pageTable.scaleLevel > 0 ? Math.max(0, BRICK_ATLAS_HALO_VOXELS) : 0;
  const residentChunkDepth = coreChunkDepth + haloVoxels * 2;
  const residentChunkHeight = coreChunkHeight + haloVoxels * 2;
  const residentChunkWidth = coreChunkWidth + haloVoxels * 2;
  const bytesPerBrick = residentChunkDepth * residentChunkHeight * residentChunkWidth * textureComponents;
  const slotLayout = resolveBrickAtlasSlotLayout({
    slotCapacity: pageTable.occupiedBrickCount,
    chunkWidth: residentChunkWidth,
    chunkHeight: residentChunkHeight,
    chunkDepth: residentChunkDepth,
    max3DTextureSize,
  });
  if (slotLayout.allocatedSlotCapacity < pageTable.occupiedBrickCount) {
    return null;
  }
  if (
    max3DTextureSize &&
    Number.isFinite(max3DTextureSize) &&
    max3DTextureSize > 0 &&
    (slotLayout.atlasWidth > max3DTextureSize ||
      slotLayout.atlasHeight > max3DTextureSize ||
      slotLayout.atlasDepth > max3DTextureSize)
  ) {
    return null;
  }

  return {
    slotGrid: {
      x: slotLayout.slotGridX,
      y: slotLayout.slotGridY,
      z: slotLayout.slotGridZ,
    },
    atlasSize: {
      width: slotLayout.atlasWidth,
      height: slotLayout.atlasHeight,
      depth: slotLayout.atlasDepth,
    },
    residentBytes: slotLayout.allocatedSlotCapacity * bytesPerBrick,
  };
}

export function buildFullGpuBrickResidencyAtlas({
  pageTable,
  sourceData,
  textureComponents,
  max3DTextureSize,
}: {
  pageTable: Pick<
    VolumeBrickPageTable,
    'gridShape' | 'chunkShape' | 'volumeShape' | 'occupiedBrickCount' | 'brickAtlasIndices' | 'scaleLevel'
  >;
  sourceData: Uint8Array;
  textureComponents: number;
  max3DTextureSize: number | null;
}): FullGpuBrickResidencyBuildResult | null {
  const layout = resolveFullGpuBrickResidencyLayout({
    pageTable,
    textureComponents,
    max3DTextureSize,
  });
  if (!layout) {
    return null;
  }

  const coreChunkDepth = Math.max(1, pageTable.chunkShape[0]);
  const coreChunkHeight = Math.max(1, pageTable.chunkShape[1]);
  const coreChunkWidth = Math.max(1, pageTable.chunkShape[2]);
  const expectedSourceLength =
    coreChunkWidth * coreChunkHeight * coreChunkDepth * pageTable.occupiedBrickCount * textureComponents;
  if (sourceData.length !== expectedSourceLength) {
    return null;
  }

  const residentAtlasData = new Uint8Array(
    layout.atlasSize.width * layout.atlasSize.height * layout.atlasSize.depth * textureComponents
  );
  const atlasIndices = new Float32Array(pageTable.brickAtlasIndices.length);
  const sourceIndexToFlatBrick = new Int32Array(pageTable.occupiedBrickCount).fill(-1);
  for (let flatBrickIndex = 0; flatBrickIndex < pageTable.brickAtlasIndices.length; flatBrickIndex += 1) {
    const sourceIndex = pageTable.brickAtlasIndices[flatBrickIndex] ?? -1;
    if (sourceIndex < 0 || sourceIndex >= sourceIndexToFlatBrick.length) {
      continue;
    }
    sourceIndexToFlatBrick[sourceIndex] = flatBrickIndex;
    atlasIndices[flatBrickIndex] = sourceIndex + 1;
  }

  for (let sourceIndex = 0; sourceIndex < pageTable.occupiedBrickCount; sourceIndex += 1) {
    if ((sourceIndexToFlatBrick[sourceIndex] ?? -1) < 0) {
      continue;
    }
    copyBrickIntoResidentAtlas({
      sourceData,
      sourceIndex,
      destinationData: residentAtlasData,
      destinationSlot: sourceIndex,
      coreChunkWidth,
      coreChunkHeight,
      coreChunkDepth,
      haloVoxels: pageTable.scaleLevel > 0 ? Math.max(0, BRICK_ATLAS_HALO_VOXELS) : 0,
      sourceBrickWidth: coreChunkWidth,
      sourceBrickHeight: coreChunkHeight,
      sourceBrickDepth: coreChunkDepth,
      sourceIndexToFlatBrick,
      brickAtlasIndices: pageTable.brickAtlasIndices,
      gridX: Math.max(1, pageTable.gridShape[2]),
      gridY: Math.max(1, pageTable.gridShape[1]),
      gridZ: Math.max(1, pageTable.gridShape[0]),
      slotGridX: layout.slotGrid.x,
      slotGridY: layout.slotGrid.y,
      destinationWidth: layout.atlasSize.width,
      destinationHeight: layout.atlasSize.height,
      destinationDepth: layout.atlasSize.depth,
      textureComponents,
    });
  }

  return {
    atlasData: residentAtlasData,
    atlasIndices,
    atlasSize: layout.atlasSize,
    slotGrid: layout.slotGrid,
    residentBytes: layout.residentBytes,
  };
}
