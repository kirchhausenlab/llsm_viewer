import {
  SPARSE_HEADER_BYTE_LENGTH,
  SPARSE_OCCUPANCY_MAGIC,
  expectMagic,
  readU64AsNumber,
  writeAscii8,
  writeU64
} from './binaryLayout';
import { brickIndex } from './brickCoordinates';
import type {
  SparseSegmentationBrickDirectoryRecord,
  SparseSegmentationBrickSize,
  SparseSegmentationOccupancyHierarchy,
  SparseSegmentationOccupancyHierarchyLevel
} from './types';

function countOccupied(data: Uint8Array): number {
  let count = 0;
  for (let index = 0; index < data.length; index += 1) {
    if ((data[index] ?? 0) !== 0) {
      count += 1;
    }
  }
  return count;
}

function reduceOccupancyLevel(level: SparseSegmentationOccupancyHierarchyLevel): SparseSegmentationOccupancyHierarchyLevel {
  const [childZ, childY, childX] = level.gridShape;
  const gridShape: SparseSegmentationBrickSize = [
    Math.max(1, Math.ceil(childZ / 2)),
    Math.max(1, Math.ceil(childY / 2)),
    Math.max(1, Math.ceil(childX / 2))
  ];
  const [parentZ, parentY, parentX] = gridShape;
  const data = new Uint8Array(parentZ * parentY * parentX);
  for (let z = 0; z < childZ; z += 1) {
    for (let y = 0; y < childY; y += 1) {
      for (let x = 0; x < childX; x += 1) {
        const childIndex = (z * childY + y) * childX + x;
        if ((level.data[childIndex] ?? 0) === 0) {
          continue;
        }
        const parentIndex =
          (Math.floor(z / 2) * parentY + Math.floor(y / 2)) * parentX + Math.floor(x / 2);
        data[parentIndex] = 1;
      }
    }
  }
  return {
    level: level.level + 1,
    gridShape,
    data,
    occupiedNodeCount: countOccupied(data)
  };
}

export function buildSparseSegmentationOccupancyHierarchy({
  brickGridShape,
  records,
  timepoint
}: {
  brickGridShape: SparseSegmentationBrickSize;
  records: readonly SparseSegmentationBrickDirectoryRecord[];
  timepoint?: number | null;
}): SparseSegmentationOccupancyHierarchy {
  const level0Data = new Uint8Array(brickGridShape[0] * brickGridShape[1] * brickGridShape[2]);
  for (const record of records) {
    if (timepoint !== undefined && timepoint !== null && record.timepoint !== timepoint) {
      continue;
    }
    level0Data[brickIndex(record.brickCoord, brickGridShape)] = 1;
  }
  const levels: SparseSegmentationOccupancyHierarchyLevel[] = [
    {
      level: 0,
      gridShape: brickGridShape,
      data: level0Data,
      occupiedNodeCount: countOccupied(level0Data)
    }
  ];
  while (levels[levels.length - 1]!.gridShape.some((axis) => axis > 1)) {
    levels.push(reduceOccupancyLevel(levels[levels.length - 1]!));
  }
  return { levels };
}

export function encodeSparseSegmentationOccupancyLevel(
  level: SparseSegmentationOccupancyHierarchyLevel
): Uint8Array {
  const bodyByteLength = level.data.byteLength;
  const bytes = new Uint8Array(SPARSE_HEADER_BYTE_LENGTH + bodyByteLength);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  writeAscii8(view, 0, SPARSE_OCCUPANCY_MAGIC);
  view.setUint16(8, 1, true);
  view.setUint16(10, SPARSE_HEADER_BYTE_LENGTH, true);
  view.setUint32(12, level.level, true);
  view.setUint32(16, level.gridShape[0], true);
  view.setUint32(20, level.gridShape[1], true);
  view.setUint32(24, level.gridShape[2], true);
  view.setUint32(28, level.occupiedNodeCount, true);
  writeU64(view, 32, bodyByteLength);
  writeU64(view, 40, 0);
  writeU64(view, 48, 0);
  writeU64(view, 56, 0);
  bytes.set(level.data, SPARSE_HEADER_BYTE_LENGTH);
  return bytes;
}

export function decodeSparseSegmentationOccupancyLevel(
  bytes: Uint8Array,
  path = 'occupancy hierarchy'
): SparseSegmentationOccupancyHierarchyLevel {
  if (bytes.byteLength < SPARSE_HEADER_BYTE_LENGTH) {
    throw new Error(`Sparse segmentation occupancy hierarchy ${path} is truncated.`);
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  expectMagic(view, SPARSE_OCCUPANCY_MAGIC, path);
  const version = view.getUint16(8, true);
  const headerByteLength = view.getUint16(10, true);
  const level = view.getUint32(12, true);
  const gridShape: SparseSegmentationBrickSize = [
    view.getUint32(16, true),
    view.getUint32(20, true),
    view.getUint32(24, true)
  ];
  const occupiedNodeCount = view.getUint32(28, true);
  const bodyByteLength = readU64AsNumber(view, 32, `${path}.bodyByteLength`);
  if (version !== 1 || headerByteLength !== SPARSE_HEADER_BYTE_LENGTH) {
    throw new Error(`Invalid sparse segmentation occupancy hierarchy header at ${path}.`);
  }
  const expectedBodyLength = gridShape[0] * gridShape[1] * gridShape[2];
  if (bodyByteLength !== expectedBodyLength || bytes.byteLength !== SPARSE_HEADER_BYTE_LENGTH + expectedBodyLength) {
    throw new Error(`Sparse segmentation occupancy hierarchy byte-length mismatch at ${path}.`);
  }
  const data = bytes.slice(SPARSE_HEADER_BYTE_LENGTH);
  for (let index = 0; index < data.length; index += 1) {
    const value = data[index] ?? 0;
    if (value !== 0 && value !== 1) {
      throw new Error(`Invalid sparse segmentation occupancy value at ${path}[${index}].`);
    }
  }
  if (countOccupied(data) !== occupiedNodeCount) {
    throw new Error(`Sparse segmentation occupancy count mismatch at ${path}.`);
  }
  return { level, gridShape, data, occupiedNodeCount };
}
