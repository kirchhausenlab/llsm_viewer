import type { MutableRefObject } from 'react';
import * as THREE from 'three';

import { getLod0FeatureFlags } from '../../../config/lod0Flags';
import type { VolumeBrickPageTable } from '../../../core/volumeProvider';
import type { VolumeResources } from '../VolumeViewer.types';

type TextureFormat = THREE.Data3DTexture['format'];

type BrickResidencyState = {
  sourceToken: object | null;
  pageTable: VolumeBrickPageTable | null;
  textureFormat: TextureFormat | null;
  textureComponents: number;
  chunkWidth: number;
  chunkHeight: number;
  chunkDepth: number;
  slotCapacity: number;
  slotGridX: number;
  slotGridY: number;
  slotGridZ: number;
  allocatedSlotCapacity: number;
  atlasWidth: number;
  atlasHeight: number;
  atlasDepth: number;
  slotSourceIndices: Int32Array;
  sourceToSlot: Map<number, number>;
  sourceLastUsedTick: Map<number, number>;
  residentAtlasData: Uint8Array;
  residentAtlasIndices: Float32Array;
  tick: number;
  uploads: number;
  evictions: number;
  residentBytes: number;
  budgetBytes: number;
  lastCameraDistance: number | null;
  scaleLevel: number;
  bootstrapUpdatesRemaining: number;
};

type BrickResidencyMetrics = NonNullable<VolumeResources['gpuBrickResidencyMetrics']>;

type BrickAtlasSlotLayout = {
  slotGridX: number;
  slotGridY: number;
  slotGridZ: number;
  allocatedSlotCapacity: number;
  atlasWidth: number;
  atlasHeight: number;
  atlasDepth: number;
};

type GpuBrickResidencyResult = {
  atlasData: Uint8Array;
  atlasSize: { width: number; height: number; depth: number };
  slotGrid: { x: number; y: number; z: number };
  atlasIndices: Float32Array;
  metrics: BrickResidencyMetrics;
  texturesDirty: boolean;
};

const DEFAULT_MAX_GPU_BRICK_BYTES = 48 * 1024 * 1024;
const AUTO_EXPANDED_MAX_GPU_BRICK_BYTES = 512 * 1024 * 1024;
const DEFAULT_MAX_BRICK_UPLOADS_PER_UPDATE = 24;
const BOOTSTRAP_UPLOAD_BURST_UPDATES = 3;
const BOOTSTRAP_UPLOAD_BURST_MULTIPLIER = 8;
const BOOTSTRAP_UPLOAD_BURST_MAX = 256;
const RESIDENCY_STICKINESS_TICKS = 4;
const BRICK_ATLAS_HALO_VOXELS = 1;

const LOD0_FLAGS = getLod0FeatureFlags();
const gpuBrickResidencyStateByResource = new WeakMap<VolumeResources, BrickResidencyState>();

function resolveNumericEnvValue(name: string): number {
  const fromImportMeta = Number((import.meta as { env?: Record<string, unknown> })?.env?.[name] ?? Number.NaN);
  if (Number.isFinite(fromImportMeta)) {
    return fromImportMeta;
  }
  const fromProcessEnv =
    typeof process !== 'undefined' && process?.env ? Number(process.env[name] ?? Number.NaN) : Number.NaN;
  return fromProcessEnv;
}

function getTextureComponentsFromFormat(format: TextureFormat): number | null {
  if (format === THREE.RedFormat) {
    return 1;
  }
  if (format === THREE.RGFormat) {
    return 2;
  }
  if (format === THREE.RGBAFormat) {
    return 4;
  }
  return null;
}

function resolveGpuBrickBudgetBytes(): number {
  const configured = resolveNumericEnvValue('VITE_MAX_GPU_BRICK_BYTES');
  if (!Number.isFinite(configured) || configured <= 0) {
    return DEFAULT_MAX_GPU_BRICK_BYTES;
  }
  return Math.max(1, Math.floor(configured));
}

function hasExplicitGpuBrickBudgetBytes(): boolean {
  const configured = resolveNumericEnvValue('VITE_MAX_GPU_BRICK_BYTES');
  return Number.isFinite(configured) && configured > 0;
}

export function resolveMaxBrickUploadsPerUpdate(): number {
  const configured = resolveNumericEnvValue('VITE_MAX_BRICK_UPLOADS_PER_UPDATE');
  if (!Number.isFinite(configured) || configured <= 0) {
    return DEFAULT_MAX_BRICK_UPLOADS_PER_UPDATE;
  }
  return Math.max(1, Math.floor(configured));
}

export function hasExplicitMaxBrickUploadsPerUpdate(): boolean {
  const configured = resolveNumericEnvValue('VITE_MAX_BRICK_UPLOADS_PER_UPDATE');
  return Number.isFinite(configured) && configured > 0;
}

export function resolveRendererMax3DTextureSize(
  rendererRef: MutableRefObject<THREE.WebGLRenderer | null> | undefined
): number | null {
  const renderer = rendererRef?.current;
  if (!renderer || !renderer.capabilities?.isWebGL2) {
    return null;
  }
  const gl = renderer.getContext() as WebGL2RenderingContext | null;
  if (!gl) {
    return null;
  }
  const raw = Number(gl.getParameter(gl.MAX_3D_TEXTURE_SIZE));
  if (!Number.isFinite(raw) || raw <= 0) {
    return null;
  }
  return Math.floor(raw);
}

export function exceeds3DTextureSizeLimit(
  size: { width: number; height: number; depth: number },
  max3DTextureSize: number | null | undefined
): boolean {
  if (!max3DTextureSize || !Number.isFinite(max3DTextureSize) || max3DTextureSize <= 0) {
    return false;
  }
  return size.width > max3DTextureSize || size.height > max3DTextureSize || size.depth > max3DTextureSize;
}

function resolveBrickAtlasSlotLayout({
  slotCapacity,
  chunkWidth,
  chunkHeight,
  chunkDepth,
  max3DTextureSize,
  allowWidePacking
}: {
  slotCapacity: number;
  chunkWidth: number;
  chunkHeight: number;
  chunkDepth: number;
  max3DTextureSize: number | null;
  allowWidePacking: boolean;
}): BrickAtlasSlotLayout {
  const normalizedSlotCapacity = Math.max(1, Math.floor(slotCapacity));
  const safeChunkWidth = Math.max(1, Math.floor(chunkWidth));
  const safeChunkHeight = Math.max(1, Math.floor(chunkHeight));
  const safeChunkDepth = Math.max(1, Math.floor(chunkDepth));
  const safeMax3D =
    max3DTextureSize && Number.isFinite(max3DTextureSize) && max3DTextureSize > 0
      ? Math.max(1, Math.floor(max3DTextureSize))
      : null;

  if (!allowWidePacking || !safeMax3D) {
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
      atlasDepth: safeChunkDepth * slotGridZ
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
    atlasDepth: safeChunkDepth * slotGridZ
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
      local: Math.min(Math.max(coordinate + safeCoreSize, 0), safeCoreSize - 1)
    };
  }
  if (coordinate >= safeCoreSize) {
    return {
      brickOffset: 1,
      local: Math.min(Math.max(coordinate - safeCoreSize, 0), safeCoreSize - 1)
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
  textureComponents
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

function buildViewPrioritySourceIndices({
  pageTable,
  cameraPosition,
  fullResolutionSize
}: {
  pageTable: VolumeBrickPageTable;
  cameraPosition: THREE.Vector3 | null;
  fullResolutionSize: { width: number; height: number; depth: number };
}): Array<{ sourceIndex: number; distanceSq: number }> {
  const entries: Array<{ sourceIndex: number; distanceSq: number }> = [];
  const [gridZ, gridY, gridX] = pageTable.gridShape;
  const [chunkDepth, chunkHeight, chunkWidth] = pageTable.chunkShape;
  const [scaleDepth, scaleHeight, scaleWidth] = pageTable.volumeShape;
  const plane = gridY * gridX;
  const ratioX = fullResolutionSize.width > 0 ? scaleWidth / fullResolutionSize.width : 1;
  const ratioY = fullResolutionSize.height > 0 ? scaleHeight / fullResolutionSize.height : 1;
  const ratioZ = fullResolutionSize.depth > 0 ? scaleDepth / fullResolutionSize.depth : 1;
  const scaledCamera = cameraPosition
    ? new THREE.Vector3(cameraPosition.x * ratioX, cameraPosition.y * ratioY, cameraPosition.z * ratioZ)
    : null;

  for (let flatBrickIndex = 0; flatBrickIndex < pageTable.brickAtlasIndices.length; flatBrickIndex += 1) {
    const sourceIndex = pageTable.brickAtlasIndices[flatBrickIndex] ?? -1;
    if (sourceIndex < 0) {
      continue;
    }
    const brickZ = Math.floor(flatBrickIndex / plane);
    const withinPlane = flatBrickIndex % plane;
    const brickY = Math.floor(withinPlane / gridX);
    const brickX = withinPlane % gridX;
    if (brickZ < 0 || brickZ >= gridZ || brickY < 0 || brickY >= gridY || brickX < 0 || brickX >= gridX) {
      continue;
    }
    const centerX = brickX * chunkWidth + chunkWidth * 0.5;
    const centerY = brickY * chunkHeight + chunkHeight * 0.5;
    const centerZ = brickZ * chunkDepth + chunkDepth * 0.5;
    const distanceSq =
      scaledCamera
        ? (centerX - scaledCamera.x) * (centerX - scaledCamera.x) +
          (centerY - scaledCamera.y) * (centerY - scaledCamera.y) +
          (centerZ - scaledCamera.z) * (centerZ - scaledCamera.z)
        : sourceIndex;
    entries.push({ sourceIndex, distanceSq });
  }

  entries.sort((left, right) => {
    if (left.distanceSq !== right.distanceSq) {
      return left.distanceSq - right.distanceSq;
    }
    return left.sourceIndex - right.sourceIndex;
  });
  return entries;
}

export function updateGpuBrickResidency({
  resource,
  pageTable,
  sourceData,
  sourceToken,
  textureFormat,
  cameraPosition,
  atlasSize,
  max3DTextureSize,
  layerKey,
  timepoint,
  maxUploadsPerUpdate,
  allowBootstrapUploadBurst,
  forceFullResidency
}: {
  resource: VolumeResources;
  pageTable: VolumeBrickPageTable;
  sourceData: Uint8Array;
  sourceToken: object | null;
  textureFormat: TextureFormat;
  cameraPosition: THREE.Vector3 | null;
  atlasSize: { width: number; height: number; depth: number };
  max3DTextureSize: number | null;
  layerKey: string;
  timepoint: number;
  maxUploadsPerUpdate: number;
  allowBootstrapUploadBurst: boolean;
  forceFullResidency: boolean;
}): GpuBrickResidencyResult {
  const components = getTextureComponentsFromFormat(textureFormat);
  if (!components) {
    return {
      atlasData: new Uint8Array([0]),
      atlasSize: { width: 1, height: 1, depth: 1 },
      slotGrid: { x: 1, y: 1, z: 1 },
      atlasIndices: new Float32Array(pageTable.brickAtlasIndices.length),
      metrics: {
        layerKey,
        timepoint,
        scaleLevel: pageTable.scaleLevel,
        residentBricks: 0,
        totalBricks: pageTable.occupiedBrickCount,
        residentBytes: 0,
        budgetBytes: resolveGpuBrickBudgetBytes(),
        uploads: 0,
        evictions: 0,
        pendingBricks: pageTable.occupiedBrickCount,
        prioritizedBricks: pageTable.occupiedBrickCount,
        scheduledUploads: 0,
        lastCameraDistance: null
      },
      texturesDirty: false
    };
  }

  const coreChunkDepth = Math.max(1, pageTable.chunkShape[0]);
  const coreChunkHeight = Math.max(1, pageTable.chunkShape[1]);
  const coreChunkWidth = Math.max(1, pageTable.chunkShape[2]);
  const haloVoxels = pageTable.scaleLevel > 0 ? Math.max(0, BRICK_ATLAS_HALO_VOXELS) : 0;
  const residentChunkDepth = coreChunkDepth + haloVoxels * 2;
  const residentChunkHeight = coreChunkHeight + haloVoxels * 2;
  const residentChunkWidth = coreChunkWidth + haloVoxels * 2;
  const bytesPerBrick = residentChunkDepth * residentChunkHeight * residentChunkWidth * components;
  const configuredBudgetBytes = resolveGpuBrickBudgetBytes();
  const explicitBudget = hasExplicitGpuBrickBudgetBytes();
  const canAutoExpandBudget = !forceFullResidency && !explicitBudget;
  const targetBudgetBytes = forceFullResidency
    ? Math.max(configuredBudgetBytes, bytesPerBrick * pageTable.occupiedBrickCount)
    : canAutoExpandBudget
      ? Math.min(
          AUTO_EXPANDED_MAX_GPU_BRICK_BYTES,
          Math.max(configuredBudgetBytes, bytesPerBrick * pageTable.occupiedBrickCount)
        )
      : configuredBudgetBytes;
  const budgetBytes = Math.max(1, targetBudgetBytes);
  const budgetLimitedSlotCapacity = Math.floor(budgetBytes / bytesPerBrick) || 1;
  const safeMax3DTextureSize =
    max3DTextureSize && Number.isFinite(max3DTextureSize) && max3DTextureSize > 0
      ? Math.max(1, Math.floor(max3DTextureSize))
      : null;
  const maxDepthLimitedSlotCapacity =
    safeMax3DTextureSize ? Math.floor(safeMax3DTextureSize / residentChunkDepth) : Number.POSITIVE_INFINITY;
  const allowWidePacking = forceFullResidency;
  const maxDimensionLimitedSlotCapacity = (() => {
    if (!allowWidePacking) {
      return maxDepthLimitedSlotCapacity;
    }
    if (!safeMax3DTextureSize) {
      return Number.POSITIVE_INFINITY;
    }
    const maxSlotsX = Math.floor(safeMax3DTextureSize / residentChunkWidth);
    const maxSlotsY = Math.floor(safeMax3DTextureSize / residentChunkHeight);
    const maxSlotsZ = Math.floor(safeMax3DTextureSize / residentChunkDepth);
    if (maxSlotsX <= 0 || maxSlotsY <= 0 || maxSlotsZ <= 0) {
      return 0;
    }
    return maxSlotsX * maxSlotsY * maxSlotsZ;
  })();
  const existing = gpuBrickResidencyStateByResource.get(resource);
  const requestedSlotCapacity = Math.max(
    1,
    Math.min(pageTable.occupiedBrickCount, budgetLimitedSlotCapacity, maxDimensionLimitedSlotCapacity)
  );
  const canPreserveExistingSlotCapacity =
    !explicitBudget &&
    Boolean(
      existing &&
      existing.sourceToken === sourceToken &&
      existing.pageTable === pageTable &&
      existing.textureFormat === textureFormat
    );
  const provisionalSlotCapacity = canPreserveExistingSlotCapacity
    ? Math.max(requestedSlotCapacity, existing?.slotCapacity ?? requestedSlotCapacity)
    : requestedSlotCapacity;
  const slotLayout = resolveBrickAtlasSlotLayout({
    slotCapacity: provisionalSlotCapacity,
    chunkWidth: residentChunkWidth,
    chunkHeight: residentChunkHeight,
    chunkDepth: residentChunkDepth,
    max3DTextureSize: safeMax3DTextureSize,
    allowWidePacking
  });
  const slotCapacity = Math.max(1, Math.min(provisionalSlotCapacity, slotLayout.allocatedSlotCapacity));
  const expectedResidentDataLength =
    slotLayout.atlasWidth * slotLayout.atlasHeight * slotLayout.atlasDepth * components;
  const expectedResidentIndexLength = pageTable.brickAtlasIndices.length;
  const shouldReset =
    !existing ||
    existing.sourceToken !== sourceToken ||
    existing.pageTable !== pageTable ||
    existing.textureFormat !== textureFormat ||
    existing.slotCapacity !== slotCapacity ||
    existing.slotGridX !== slotLayout.slotGridX ||
    existing.slotGridY !== slotLayout.slotGridY ||
    existing.slotGridZ !== slotLayout.slotGridZ ||
    existing.allocatedSlotCapacity !== slotLayout.allocatedSlotCapacity ||
    existing.atlasWidth !== slotLayout.atlasWidth ||
    existing.atlasHeight !== slotLayout.atlasHeight ||
    existing.atlasDepth !== slotLayout.atlasDepth ||
    existing.chunkDepth !== residentChunkDepth ||
    existing.chunkHeight !== residentChunkHeight ||
    existing.chunkWidth !== residentChunkWidth;

  const state: BrickResidencyState =
    shouldReset || !existing
      ? {
          sourceToken,
          pageTable,
          textureFormat,
          textureComponents: components,
          chunkWidth: residentChunkWidth,
          chunkHeight: residentChunkHeight,
          chunkDepth: residentChunkDepth,
          slotCapacity,
          slotGridX: slotLayout.slotGridX,
          slotGridY: slotLayout.slotGridY,
          slotGridZ: slotLayout.slotGridZ,
          allocatedSlotCapacity: slotLayout.allocatedSlotCapacity,
          atlasWidth: slotLayout.atlasWidth,
          atlasHeight: slotLayout.atlasHeight,
          atlasDepth: slotLayout.atlasDepth,
          slotSourceIndices: new Int32Array(slotCapacity).fill(-1),
          sourceToSlot: new Map<number, number>(),
          sourceLastUsedTick: new Map<number, number>(),
          residentAtlasData: new Uint8Array(expectedResidentDataLength),
          residentAtlasIndices: new Float32Array(expectedResidentIndexLength),
          tick: 1,
          uploads: 0,
          evictions: 0,
          residentBytes: slotLayout.allocatedSlotCapacity * bytesPerBrick,
          budgetBytes,
          lastCameraDistance: null,
          scaleLevel: pageTable.scaleLevel,
          bootstrapUpdatesRemaining: BOOTSTRAP_UPLOAD_BURST_UPDATES
        }
      : existing;

  if (state.residentAtlasData.length !== expectedResidentDataLength) {
    state.residentAtlasData = new Uint8Array(expectedResidentDataLength);
  }
  if (state.residentAtlasIndices.length !== expectedResidentIndexLength) {
    state.residentAtlasIndices = new Float32Array(expectedResidentIndexLength);
  }
  state.slotGridX = slotLayout.slotGridX;
  state.slotGridY = slotLayout.slotGridY;
  state.slotGridZ = slotLayout.slotGridZ;
  state.allocatedSlotCapacity = slotLayout.allocatedSlotCapacity;
  state.atlasWidth = slotLayout.atlasWidth;
  state.atlasHeight = slotLayout.atlasHeight;
  state.atlasDepth = slotLayout.atlasDepth;
  state.budgetBytes = budgetBytes;
  state.residentBytes = slotLayout.allocatedSlotCapacity * bytesPerBrick;
  state.scaleLevel = pageTable.scaleLevel;
  state.pageTable = pageTable;

  const canHoldAllSources = slotCapacity >= pageTable.occupiedBrickCount;
  const isFullyResident = canHoldAllSources && state.sourceToSlot.size >= pageTable.occupiedBrickCount;
  if (forceFullResidency && isFullyResident) {
    gpuBrickResidencyStateByResource.set(resource, state);
    return {
      atlasData: state.residentAtlasData,
      atlasSize: { width: state.atlasWidth, height: state.atlasHeight, depth: state.atlasDepth },
      slotGrid: { x: state.slotGridX, y: state.slotGridY, z: state.slotGridZ },
      atlasIndices: state.residentAtlasIndices,
      metrics: {
        layerKey,
        timepoint,
        scaleLevel: state.scaleLevel,
        residentBricks: state.sourceToSlot.size,
        totalBricks: pageTable.occupiedBrickCount,
        residentBytes: state.residentBytes,
        budgetBytes: state.budgetBytes,
        uploads: state.uploads,
        evictions: state.evictions,
        pendingBricks: 0,
        prioritizedBricks: pageTable.occupiedBrickCount,
        scheduledUploads: 0,
        lastCameraDistance: state.lastCameraDistance
      },
      texturesDirty: false
    };
  }

  const sourceIndexToFlatBrick = new Int32Array(Math.max(1, pageTable.occupiedBrickCount)).fill(-1);
  for (let flatBrickIndex = 0; flatBrickIndex < pageTable.brickAtlasIndices.length; flatBrickIndex += 1) {
    const sourceIndex = pageTable.brickAtlasIndices[flatBrickIndex] ?? -1;
    if (sourceIndex < 0 || sourceIndex >= sourceIndexToFlatBrick.length) {
      continue;
    }
    sourceIndexToFlatBrick[sourceIndex] = flatBrickIndex;
  }
  const [gridZ, gridY, gridX] = pageTable.gridShape;

  const priorityEntries = buildViewPrioritySourceIndices({
    pageTable,
    cameraPosition,
    fullResolutionSize: {
      width: resource.dimensions.width,
      height: resource.dimensions.height,
      depth: resource.dimensions.depth
    }
  });
  const desiredSources = new Set<number>(priorityEntries.slice(0, slotCapacity).map((entry) => entry.sourceIndex));
  state.tick += 1;

  const pendingSources = priorityEntries
    .map((entry) => entry.sourceIndex)
    .filter((sourceIndex) => desiredSources.has(sourceIndex) && !state.sourceToSlot.has(sourceIndex));
  const baseUploadBudget = Math.max(1, maxUploadsPerUpdate);
  const pendingPressureRatio = slotCapacity > 0 ? pendingSources.length / slotCapacity : 0;
  const adaptiveBurstMultiplier =
    LOD0_FLAGS.residencyTuning
      ? pendingPressureRatio >= 0.85
        ? BOOTSTRAP_UPLOAD_BURST_MULTIPLIER
        : pendingPressureRatio >= 0.55
          ? Math.max(2, Math.floor(BOOTSTRAP_UPLOAD_BURST_MULTIPLIER / 2))
          : 1
      : BOOTSTRAP_UPLOAD_BURST_MULTIPLIER;
  const boostedUploadBudget =
    allowBootstrapUploadBurst && state.bootstrapUpdatesRemaining > 0
      ? Math.min(BOOTSTRAP_UPLOAD_BURST_MAX, baseUploadBudget * adaptiveBurstMultiplier)
      : baseUploadBudget;
  const pendingLimit = forceFullResidency
    ? pendingSources.length
    : Math.min(Math.max(baseUploadBudget, boostedUploadBudget), pendingSources.length);

  for (let pendingIndex = 0; pendingIndex < pendingLimit; pendingIndex += 1) {
    const sourceIndex = pendingSources[pendingIndex]!;
    const slot = state.sourceToSlot.get(sourceIndex);
    if (slot !== undefined) {
      state.sourceLastUsedTick.set(sourceIndex, state.tick);
      continue;
    }

    let replacementSlot = state.slotSourceIndices.indexOf(-1);
    if (replacementSlot < 0) {
      const pickReplacementSlot = (respectStickiness: boolean): number => {
        let selectedSlot = -1;
        let oldestTick = Number.POSITIVE_INFINITY;
        for (let slotIndex = 0; slotIndex < state.slotSourceIndices.length; slotIndex += 1) {
          const residentSource = state.slotSourceIndices[slotIndex] ?? -1;
          if (residentSource < 0) {
            return slotIndex;
          }
          if (desiredSources.has(residentSource)) {
            continue;
          }
          const residentTick = state.sourceLastUsedTick.get(residentSource) ?? 0;
          if (
            respectStickiness &&
            LOD0_FLAGS.residencyTuning &&
            state.tick - residentTick < RESIDENCY_STICKINESS_TICKS
          ) {
            continue;
          }
          if (residentTick < oldestTick) {
            oldestTick = residentTick;
            selectedSlot = slotIndex;
          }
        }
        return selectedSlot;
      };

      replacementSlot = pickReplacementSlot(LOD0_FLAGS.residencyTuning);
      if (replacementSlot < 0 && LOD0_FLAGS.residencyTuning) {
        replacementSlot = pickReplacementSlot(false);
      }
      if (replacementSlot < 0) {
        continue;
      }
    }

    const evictedSource = state.slotSourceIndices[replacementSlot] ?? -1;
    if (evictedSource >= 0) {
      state.sourceToSlot.delete(evictedSource);
      state.sourceLastUsedTick.delete(evictedSource);
      state.evictions += 1;
    }
    copyBrickIntoResidentAtlas({
      sourceData,
      sourceIndex,
      destinationData: state.residentAtlasData,
      destinationSlot: replacementSlot,
      coreChunkWidth,
      coreChunkHeight,
      coreChunkDepth,
      haloVoxels,
      sourceBrickWidth: atlasSize.width,
      sourceBrickHeight: atlasSize.height,
      sourceBrickDepth: coreChunkDepth,
      sourceIndexToFlatBrick,
      brickAtlasIndices: pageTable.brickAtlasIndices,
      gridX,
      gridY,
      gridZ,
      slotGridX: state.slotGridX,
      slotGridY: state.slotGridY,
      destinationWidth: state.atlasWidth,
      destinationHeight: state.atlasHeight,
      destinationDepth: state.atlasDepth,
      textureComponents: components
    });
    state.slotSourceIndices[replacementSlot] = sourceIndex;
    state.sourceToSlot.set(sourceIndex, replacementSlot);
    state.sourceLastUsedTick.set(sourceIndex, state.tick);
    state.uploads += 1;
  }

  for (const sourceIndex of desiredSources) {
    if (state.sourceToSlot.has(sourceIndex)) {
      state.sourceLastUsedTick.set(sourceIndex, state.tick);
    }
  }

  for (let flatBrickIndex = 0; flatBrickIndex < pageTable.brickAtlasIndices.length; flatBrickIndex += 1) {
    const sourceIndex = pageTable.brickAtlasIndices[flatBrickIndex] ?? -1;
    const slot = sourceIndex >= 0 ? state.sourceToSlot.get(sourceIndex) : undefined;
    state.residentAtlasIndices[flatBrickIndex] = slot === undefined ? 0 : slot + 1;
  }

  const nearestDistanceSq = priorityEntries[0]?.distanceSq;
  state.lastCameraDistance =
    nearestDistanceSq !== undefined && Number.isFinite(nearestDistanceSq) ? Math.sqrt(nearestDistanceSq) : null;
  if (state.bootstrapUpdatesRemaining > 0) {
    state.bootstrapUpdatesRemaining -= 1;
  }
  gpuBrickResidencyStateByResource.set(resource, state);

  return {
    atlasData: state.residentAtlasData,
    atlasSize: { width: state.atlasWidth, height: state.atlasHeight, depth: state.atlasDepth },
    slotGrid: { x: state.slotGridX, y: state.slotGridY, z: state.slotGridZ },
    atlasIndices: state.residentAtlasIndices,
    metrics: {
      layerKey,
      timepoint,
      scaleLevel: state.scaleLevel,
      residentBricks: state.sourceToSlot.size,
      totalBricks: pageTable.occupiedBrickCount,
      residentBytes: state.residentBytes,
      budgetBytes: state.budgetBytes,
      uploads: state.uploads,
      evictions: state.evictions,
      pendingBricks: pendingSources.length,
      prioritizedBricks: priorityEntries.length,
      scheduledUploads: pendingLimit,
      lastCameraDistance: state.lastCameraDistance
    },
    texturesDirty: pendingLimit > 0
  };
}

export function clearGpuBrickResidencyState(resource: object): void {
  if ('gpuBrickResidencyMetrics' in (resource as { gpuBrickResidencyMetrics?: unknown })) {
    (resource as { gpuBrickResidencyMetrics?: VolumeResources['gpuBrickResidencyMetrics'] }).gpuBrickResidencyMetrics = null;
  }
  gpuBrickResidencyStateByResource.delete(resource as VolumeResources);
}
