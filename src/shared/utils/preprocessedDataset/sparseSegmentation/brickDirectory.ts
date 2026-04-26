import {
  SPARSE_BRICK_DIRECTORY_MAGIC,
  SPARSE_BRICK_DIRECTORY_RECORD_BYTE_LENGTH,
  SPARSE_HEADER_BYTE_LENGTH,
  codecFromId,
  codecToId,
  expectMagic,
  readU64AsNumber,
  writeAscii8,
  writeU64
} from './binaryLayout';
import { brickKey } from './brickCoordinates';
import type {
  SparseSegmentationBrickCoord,
  SparseSegmentationBrickDirectory,
  SparseSegmentationBrickDirectoryRecord,
  SparseSegmentationBrickSize
} from './types';

function compareRecords(
  left: SparseSegmentationBrickDirectoryRecord,
  right: SparseSegmentationBrickDirectoryRecord
): number {
  return (
    left.timepoint - right.timepoint ||
    left.scaleLevel - right.scaleLevel ||
    left.brickCoord.z - right.brickCoord.z ||
    left.brickCoord.y - right.brickCoord.y ||
    left.brickCoord.x - right.brickCoord.x
  );
}

export function sortSparseSegmentationDirectoryRecords(
  records: readonly SparseSegmentationBrickDirectoryRecord[]
): SparseSegmentationBrickDirectoryRecord[] {
  return [...records].sort(compareRecords);
}

export function encodeSparseSegmentationBrickDirectory({
  records,
  scaleLevel,
  timepointCount,
  brickGridShape,
  brickSize
}: {
  records: readonly SparseSegmentationBrickDirectoryRecord[];
  scaleLevel: number;
  timepointCount: number;
  brickGridShape: SparseSegmentationBrickSize;
  brickSize: SparseSegmentationBrickSize;
}): Uint8Array {
  const sorted = sortSparseSegmentationDirectoryRecords(records);
  for (let index = 0; index < sorted.length; index += 1) {
    const record = sorted[index]!;
    if (record.scaleLevel !== scaleLevel) {
      throw new Error(`Sparse directory record scale mismatch: expected ${scaleLevel}, got ${record.scaleLevel}.`);
    }
    if (index > 0 && compareRecords(sorted[index - 1]!, record) === 0) {
      throw new Error(
        `Duplicate sparse segmentation brick directory record for ${brickKey(
          record.timepoint,
          record.scaleLevel,
          record.brickCoord
        )}.`
      );
    }
  }

  const recordsByteLength = sorted.length * SPARSE_BRICK_DIRECTORY_RECORD_BYTE_LENGTH;
  const bytes = new Uint8Array(SPARSE_HEADER_BYTE_LENGTH + recordsByteLength);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  writeAscii8(view, 0, SPARSE_BRICK_DIRECTORY_MAGIC);
  view.setUint16(8, 1, true);
  view.setUint16(10, SPARSE_HEADER_BYTE_LENGTH, true);
  view.setUint16(12, SPARSE_BRICK_DIRECTORY_RECORD_BYTE_LENGTH, true);
  view.setUint16(14, 0, true);
  view.setUint32(16, sorted.length, true);
  view.setUint32(20, scaleLevel, true);
  view.setUint32(24, timepointCount, true);
  view.setUint32(28, brickGridShape[0], true);
  view.setUint32(32, brickGridShape[1], true);
  view.setUint32(36, brickGridShape[2], true);
  view.setUint16(40, brickSize[0], true);
  view.setUint16(42, brickSize[1], true);
  view.setUint16(44, brickSize[2], true);
  view.setUint16(46, 0, true);
  writeU64(view, 48, recordsByteLength);
  writeU64(view, 56, 0);

  let cursor = SPARSE_HEADER_BYTE_LENGTH;
  for (const record of sorted) {
    view.setUint32(cursor, record.timepoint, true);
    view.setUint32(cursor + 4, record.scaleLevel, true);
    view.setUint32(cursor + 8, record.brickCoord.z, true);
    view.setUint32(cursor + 12, record.brickCoord.y, true);
    view.setUint32(cursor + 16, record.brickCoord.x, true);
    view.setUint16(cursor + 20, record.localBounds.min.z, true);
    view.setUint16(cursor + 22, record.localBounds.min.y, true);
    view.setUint16(cursor + 24, record.localBounds.min.x, true);
    view.setUint16(cursor + 26, record.localBounds.max.z, true);
    view.setUint16(cursor + 28, record.localBounds.max.y, true);
    view.setUint16(cursor + 30, record.localBounds.max.x, true);
    view.setUint32(cursor + 32, record.nonzeroVoxelCount, true);
    view.setUint32(cursor + 36, record.labelMin, true);
    view.setUint32(cursor + 40, record.labelMax, true);
    view.setUint8(cursor + 44, codecToId(record.codec));
    view.setUint8(cursor + 45, 0);
    view.setUint16(cursor + 46, 0, true);
    view.setUint32(cursor + 48, record.shardId, true);
    view.setUint32(cursor + 52, record.payloadByteLength, true);
    writeU64(view, cursor + 56, record.payloadByteOffset);
    view.setUint32(cursor + 64, record.decodedVoxelCount, true);
    view.setUint32(cursor + 68, record.payloadCrc32, true);
    view.setUint32(cursor + 72, 0, true);
    view.setUint32(cursor + 76, 0, true);
    cursor += SPARSE_BRICK_DIRECTORY_RECORD_BYTE_LENGTH;
  }
  return bytes;
}

function buildDirectory({
  scaleLevel,
  timepointCount,
  brickGridShape,
  brickSize,
  records
}: {
  scaleLevel: number;
  timepointCount: number;
  brickGridShape: SparseSegmentationBrickSize;
  brickSize: SparseSegmentationBrickSize;
  records: SparseSegmentationBrickDirectoryRecord[];
}): SparseSegmentationBrickDirectory {
  const byKey = new Map<string, SparseSegmentationBrickDirectoryRecord>();
  const byTimepoint = new Map<number, SparseSegmentationBrickDirectoryRecord[]>();
  for (const record of records) {
    const key = brickKey(record.timepoint, record.scaleLevel, record.brickCoord);
    if (byKey.has(key)) {
      throw new Error(`Duplicate sparse segmentation directory record for ${key}.`);
    }
    byKey.set(key, record);
    const timeRecords = byTimepoint.get(record.timepoint);
    if (timeRecords) {
      timeRecords.push(record);
    } else {
      byTimepoint.set(record.timepoint, [record]);
    }
  }
  return {
    scaleLevel,
    timepointCount,
    brickGridShape,
    brickSize,
    records,
    lookup(timepoint: number, coord: SparseSegmentationBrickCoord) {
      return byKey.get(brickKey(timepoint, scaleLevel, coord)) ?? null;
    },
    recordsForTimepoint(timepoint: number) {
      return byTimepoint.get(timepoint) ?? [];
    },
    recordsIntersectingSlice(timepoint: number, axis: 'x' | 'y' | 'z', index: number) {
      const axisIndex = axis === 'z' ? 0 : axis === 'y' ? 1 : 2;
      const brickAxisSize = brickSize[axisIndex] ?? 1;
      return (byTimepoint.get(timepoint) ?? []).filter((record) => {
        const brickAxisCoord =
          axis === 'z' ? record.brickCoord.z : axis === 'y' ? record.brickCoord.y : record.brickCoord.x;
        const localMin =
          axis === 'z'
            ? record.localBounds.min.z
            : axis === 'y'
              ? record.localBounds.min.y
              : record.localBounds.min.x;
        const localMax =
          axis === 'z'
            ? record.localBounds.max.z
            : axis === 'y'
              ? record.localBounds.max.y
              : record.localBounds.max.x;
        const localIndex = index - brickAxisCoord * brickAxisSize;
        return localIndex >= localMin && localIndex <= localMax;
      });
    }
  };
}

export function decodeSparseSegmentationBrickDirectory(
  bytes: Uint8Array,
  path = 'brick directory'
): SparseSegmentationBrickDirectory {
  if (bytes.byteLength < SPARSE_HEADER_BYTE_LENGTH) {
    throw new Error(`Sparse segmentation directory ${path} is truncated.`);
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  expectMagic(view, SPARSE_BRICK_DIRECTORY_MAGIC, path);
  const version = view.getUint16(8, true);
  const headerByteLength = view.getUint16(10, true);
  const recordByteLength = view.getUint16(12, true);
  const flags = view.getUint16(14, true);
  const recordCount = view.getUint32(16, true);
  const scaleLevel = view.getUint32(20, true);
  const timepointCount = view.getUint32(24, true);
  const brickGridShape: SparseSegmentationBrickSize = [
    view.getUint32(28, true),
    view.getUint32(32, true),
    view.getUint32(36, true)
  ];
  const brickSize: SparseSegmentationBrickSize = [
    view.getUint16(40, true),
    view.getUint16(42, true),
    view.getUint16(44, true)
  ];
  const reserved0 = view.getUint16(46, true);
  const recordsByteLength = readU64AsNumber(view, 48, `${path}.recordsByteLength`);
  const reserved1 = readU64AsNumber(view, 56, `${path}.reserved1`);
  if (
    version !== 1 ||
    headerByteLength !== SPARSE_HEADER_BYTE_LENGTH ||
    recordByteLength !== SPARSE_BRICK_DIRECTORY_RECORD_BYTE_LENGTH ||
    flags !== 0 ||
    reserved0 !== 0 ||
    reserved1 !== 0
  ) {
    throw new Error(`Invalid sparse segmentation directory header at ${path}.`);
  }
  const expectedByteLength = SPARSE_HEADER_BYTE_LENGTH + recordCount * SPARSE_BRICK_DIRECTORY_RECORD_BYTE_LENGTH;
  if (recordsByteLength !== recordCount * SPARSE_BRICK_DIRECTORY_RECORD_BYTE_LENGTH || bytes.byteLength !== expectedByteLength) {
    throw new Error(`Sparse segmentation directory byte-length mismatch at ${path}.`);
  }
  const records: SparseSegmentationBrickDirectoryRecord[] = [];
  let cursor = SPARSE_HEADER_BYTE_LENGTH;
  for (let index = 0; index < recordCount; index += 1) {
    const recordScaleLevel = view.getUint32(cursor + 4, true);
    if (recordScaleLevel !== scaleLevel) {
      throw new Error(`Sparse segmentation directory record scale mismatch at ${path}[${index}].`);
    }
    const record: SparseSegmentationBrickDirectoryRecord = {
      timepoint: view.getUint32(cursor, true),
      scaleLevel: recordScaleLevel,
      brickCoord: {
        z: view.getUint32(cursor + 8, true),
        y: view.getUint32(cursor + 12, true),
        x: view.getUint32(cursor + 16, true)
      },
      localBounds: {
        min: {
          z: view.getUint16(cursor + 20, true),
          y: view.getUint16(cursor + 22, true),
          x: view.getUint16(cursor + 24, true)
        },
        max: {
          z: view.getUint16(cursor + 26, true),
          y: view.getUint16(cursor + 28, true),
          x: view.getUint16(cursor + 30, true)
        }
      },
      nonzeroVoxelCount: view.getUint32(cursor + 32, true),
      labelMin: view.getUint32(cursor + 36, true),
      labelMax: view.getUint32(cursor + 40, true),
      codec: codecFromId(view.getUint8(cursor + 44)),
      shardId: view.getUint32(cursor + 48, true),
      payloadByteLength: view.getUint32(cursor + 52, true),
      payloadByteOffset: readU64AsNumber(view, cursor + 56, `${path}[${index}].payloadByteOffset`),
      decodedVoxelCount: view.getUint32(cursor + 64, true),
      payloadCrc32: view.getUint32(cursor + 68, true)
    };
    const flagsByte = view.getUint8(cursor + 45);
    const reservedRecord0 = view.getUint16(cursor + 46, true);
    const reservedRecord1 = view.getUint32(cursor + 72, true);
    const reservedRecord2 = view.getUint32(cursor + 76, true);
    if (flagsByte !== 0 || reservedRecord0 !== 0 || reservedRecord1 !== 0 || reservedRecord2 !== 0) {
      throw new Error(`Invalid sparse segmentation directory reserved fields at ${path}[${index}].`);
    }
    if (record.nonzeroVoxelCount <= 0 || record.decodedVoxelCount < record.nonzeroVoxelCount) {
      throw new Error(`Invalid sparse segmentation directory voxel count at ${path}[${index}].`);
    }
    records.push(record);
    cursor += SPARSE_BRICK_DIRECTORY_RECORD_BYTE_LENGTH;
  }
  const sorted = sortSparseSegmentationDirectoryRecords(records);
  for (let index = 0; index < records.length; index += 1) {
    if (records[index] !== sorted[index]) {
      throw new Error(`Sparse segmentation directory records are not sorted at ${path}.`);
    }
  }
  return buildDirectory({ scaleLevel, timepointCount, brickGridShape, brickSize, records });
}
