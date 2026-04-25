import type {
  SparseSegmentationBrickCoord,
  SparseSegmentationBrickSize,
  SparseSegmentationVoxelCoord
} from './types';

export function computeBrickGridShape(
  dimensions: { depth: number; height: number; width: number },
  brickSize: SparseSegmentationBrickSize
): SparseSegmentationBrickSize {
  return [
    Math.max(1, Math.ceil(dimensions.depth / brickSize[0])),
    Math.max(1, Math.ceil(dimensions.height / brickSize[1])),
    Math.max(1, Math.ceil(dimensions.width / brickSize[2]))
  ];
}

export function brickCoordForVoxel(
  voxel: SparseSegmentationVoxelCoord,
  brickSize: SparseSegmentationBrickSize
): SparseSegmentationBrickCoord {
  return {
    z: Math.floor(voxel.z / brickSize[0]),
    y: Math.floor(voxel.y / brickSize[1]),
    x: Math.floor(voxel.x / brickSize[2])
  };
}

export function localCoordForVoxel(
  voxel: SparseSegmentationVoxelCoord,
  brickSize: SparseSegmentationBrickSize
): SparseSegmentationVoxelCoord {
  return {
    z: voxel.z % brickSize[0],
    y: voxel.y % brickSize[1],
    x: voxel.x % brickSize[2]
  };
}

export function localOffsetForCoord(
  local: SparseSegmentationVoxelCoord,
  brickSize: SparseSegmentationBrickSize
): number {
  return (local.z * brickSize[1] + local.y) * brickSize[2] + local.x;
}

export function localCoordForOffset(
  offset: number,
  brickSize: SparseSegmentationBrickSize
): SparseSegmentationVoxelCoord {
  const plane = brickSize[1] * brickSize[2];
  const z = Math.floor(offset / plane);
  const remainder = offset - z * plane;
  const y = Math.floor(remainder / brickSize[2]);
  const x = remainder - y * brickSize[2];
  return { z, y, x };
}

export function localOffsetForVoxel(
  voxel: SparseSegmentationVoxelCoord,
  brickSize: SparseSegmentationBrickSize
): number {
  return localOffsetForCoord(localCoordForVoxel(voxel, brickSize), brickSize);
}

export function globalCoordForLocalOffset(
  brickCoord: SparseSegmentationBrickCoord,
  offset: number,
  brickSize: SparseSegmentationBrickSize
): SparseSegmentationVoxelCoord {
  const local = localCoordForOffset(offset, brickSize);
  return {
    z: brickCoord.z * brickSize[0] + local.z,
    y: brickCoord.y * brickSize[1] + local.y,
    x: brickCoord.x * brickSize[2] + local.x
  };
}

export function brickIndex(
  coord: SparseSegmentationBrickCoord,
  brickGridShape: SparseSegmentationBrickSize
): number {
  return (coord.z * brickGridShape[1] + coord.y) * brickGridShape[2] + coord.x;
}

export function brickCoordFromIndex(
  index: number,
  brickGridShape: SparseSegmentationBrickSize
): SparseSegmentationBrickCoord {
  const plane = brickGridShape[1] * brickGridShape[2];
  const z = Math.floor(index / plane);
  const remainder = index - z * plane;
  const y = Math.floor(remainder / brickGridShape[2]);
  const x = remainder - y * brickGridShape[2];
  return { z, y, x };
}

export function brickKey(
  timepoint: number,
  scaleLevel: number,
  coord: SparseSegmentationBrickCoord
): string {
  return `${timepoint}:${scaleLevel}:${coord.z}:${coord.y}:${coord.x}`;
}

export function coordKey(coord: SparseSegmentationBrickCoord): string {
  return `${coord.z}:${coord.y}:${coord.x}`;
}

export function validBrickLocalSize({
  dimensions,
  brickCoord,
  brickSize
}: {
  dimensions: { depth: number; height: number; width: number };
  brickCoord: SparseSegmentationBrickCoord;
  brickSize: SparseSegmentationBrickSize;
}): SparseSegmentationBrickSize {
  return [
    Math.max(0, Math.min(brickSize[0], dimensions.depth - brickCoord.z * brickSize[0])),
    Math.max(0, Math.min(brickSize[1], dimensions.height - brickCoord.y * brickSize[1])),
    Math.max(0, Math.min(brickSize[2], dimensions.width - brickCoord.x * brickSize[2]))
  ];
}
