import {
  SPARSE_HEADER_BYTE_LENGTH,
  SPARSE_LABEL_METADATA_MAGIC,
  SPARSE_LABEL_METADATA_RECORD_BYTE_LENGTH,
  expectMagic,
  readU64AsNumber,
  writeAscii8,
  writeU64
} from './binaryLayout';
import type { SparseSegmentationLabelMetadata } from './types';

export type SparseSegmentationLabelStatsAccumulator = {
  labelId: number;
  voxelCount: number;
  minZ: number;
  minY: number;
  minX: number;
  maxZ: number;
  maxY: number;
  maxX: number;
  sumZ: number;
  sumY: number;
  sumX: number;
  firstTimepoint: number;
  lastTimepoint: number;
};

export function updateSparseSegmentationLabelStats(
  stats: Map<number, SparseSegmentationLabelStatsAccumulator>,
  labelId: number,
  timepoint: number,
  z: number,
  y: number,
  x: number
): void {
  let entry = stats.get(labelId);
  if (!entry) {
    entry = {
      labelId,
      voxelCount: 0,
      minZ: z,
      minY: y,
      minX: x,
      maxZ: z,
      maxY: y,
      maxX: x,
      sumZ: 0,
      sumY: 0,
      sumX: 0,
      firstTimepoint: timepoint,
      lastTimepoint: timepoint
    };
    stats.set(labelId, entry);
  }
  entry.voxelCount += 1;
  entry.minZ = Math.min(entry.minZ, z);
  entry.minY = Math.min(entry.minY, y);
  entry.minX = Math.min(entry.minX, x);
  entry.maxZ = Math.max(entry.maxZ, z);
  entry.maxY = Math.max(entry.maxY, y);
  entry.maxX = Math.max(entry.maxX, x);
  entry.sumZ += z;
  entry.sumY += y;
  entry.sumX += x;
  entry.firstTimepoint = Math.min(entry.firstTimepoint, timepoint);
  entry.lastTimepoint = Math.max(entry.lastTimepoint, timepoint);
}

export function encodeSparseSegmentationLabelMetadata({
  stats,
  timepointCount
}: {
  stats: ReadonlyMap<number, SparseSegmentationLabelStatsAccumulator>;
  timepointCount: number;
}): Uint8Array {
  const records = Array.from(stats.values()).sort((left, right) => left.labelId - right.labelId);
  const recordsByteLength = records.length * SPARSE_LABEL_METADATA_RECORD_BYTE_LENGTH;
  const bytes = new Uint8Array(SPARSE_HEADER_BYTE_LENGTH + recordsByteLength);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  writeAscii8(view, 0, SPARSE_LABEL_METADATA_MAGIC);
  view.setUint16(8, 1, true);
  view.setUint16(10, SPARSE_HEADER_BYTE_LENGTH, true);
  view.setUint16(12, SPARSE_LABEL_METADATA_RECORD_BYTE_LENGTH, true);
  view.setUint16(14, 0, true);
  view.setUint32(16, records.length, true);
  view.setUint32(20, timepointCount, true);
  writeU64(view, 24, recordsByteLength);
  writeU64(view, 32, 0);
  writeU64(view, 40, 0);
  writeU64(view, 48, 0);
  writeU64(view, 56, 0);

  let cursor = SPARSE_HEADER_BYTE_LENGTH;
  for (const record of records) {
    view.setUint32(cursor, record.labelId, true);
    view.setUint32(cursor + 4, 0, true);
    writeU64(view, cursor + 8, record.voxelCount);
    view.setUint32(cursor + 16, record.minZ, true);
    view.setUint32(cursor + 20, record.minY, true);
    view.setUint32(cursor + 24, record.minX, true);
    view.setUint32(cursor + 28, record.maxZ, true);
    view.setUint32(cursor + 32, record.maxY, true);
    view.setUint32(cursor + 36, record.maxX, true);
    writeU64(view, cursor + 40, record.sumZ);
    writeU64(view, cursor + 48, record.sumY);
    writeU64(view, cursor + 56, record.sumX);
    view.setUint32(cursor + 64, record.firstTimepoint, true);
    view.setUint32(cursor + 68, record.lastTimepoint, true);
    writeU64(view, cursor + 72, 0);
    view.setUint32(cursor + 80, 0, true);
    view.setUint32(cursor + 84, 0, true);
    writeU64(view, cursor + 88, 0);
    cursor += SPARSE_LABEL_METADATA_RECORD_BYTE_LENGTH;
  }
  return bytes;
}

export function decodeSparseSegmentationLabelMetadata(
  bytes: Uint8Array,
  path = 'label metadata'
): SparseSegmentationLabelMetadata[] {
  if (bytes.byteLength < SPARSE_HEADER_BYTE_LENGTH) {
    throw new Error(`Sparse segmentation label metadata ${path} is truncated.`);
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  expectMagic(view, SPARSE_LABEL_METADATA_MAGIC, path);
  const version = view.getUint16(8, true);
  const headerByteLength = view.getUint16(10, true);
  const recordByteLength = view.getUint16(12, true);
  const flags = view.getUint16(14, true);
  const recordCount = view.getUint32(16, true);
  const recordsByteLength = readU64AsNumber(view, 24, `${path}.recordsByteLength`);
  if (
    version !== 1 ||
    headerByteLength !== SPARSE_HEADER_BYTE_LENGTH ||
    recordByteLength !== SPARSE_LABEL_METADATA_RECORD_BYTE_LENGTH ||
    flags !== 0 ||
    recordsByteLength !== recordCount * SPARSE_LABEL_METADATA_RECORD_BYTE_LENGTH ||
    bytes.byteLength !== SPARSE_HEADER_BYTE_LENGTH + recordsByteLength
  ) {
    throw new Error(`Invalid sparse segmentation label metadata header at ${path}.`);
  }
  const records: SparseSegmentationLabelMetadata[] = [];
  let cursor = SPARSE_HEADER_BYTE_LENGTH;
  for (let index = 0; index < recordCount; index += 1) {
    const labelId = view.getUint32(cursor, true);
    const flagsValue = view.getUint32(cursor + 4, true);
    const voxelCount = readU64AsNumber(view, cursor + 8, `${path}[${index}].voxelCount`);
    const sumZ = readU64AsNumber(view, cursor + 40, `${path}[${index}].sumZ`);
    const sumY = readU64AsNumber(view, cursor + 48, `${path}[${index}].sumY`);
    const sumX = readU64AsNumber(view, cursor + 56, `${path}[${index}].sumX`);
    const presenceBitsetOffset = readU64AsNumber(view, cursor + 72, `${path}[${index}].presenceBitsetOffset`);
    const presenceBitsetByteLength = view.getUint32(cursor + 80, true);
    const reserved0 = view.getUint32(cursor + 84, true);
    const reserved1 = readU64AsNumber(view, cursor + 88, `${path}[${index}].reserved1`);
    if (
      labelId === 0 ||
      flagsValue !== 0 ||
      voxelCount <= 0 ||
      presenceBitsetOffset !== 0 ||
      presenceBitsetByteLength !== 0 ||
      reserved0 !== 0 ||
      reserved1 !== 0
    ) {
      throw new Error(`Invalid sparse segmentation label metadata record at ${path}[${index}].`);
    }
    records.push({
      labelId,
      voxelCount,
      bounds: {
        min: {
          z: view.getUint32(cursor + 16, true),
          y: view.getUint32(cursor + 20, true),
          x: view.getUint32(cursor + 24, true)
        },
        max: {
          z: view.getUint32(cursor + 28, true),
          y: view.getUint32(cursor + 32, true),
          x: view.getUint32(cursor + 36, true)
        }
      },
      sums: { z: sumZ, y: sumY, x: sumX },
      centroid: {
        z: sumZ / voxelCount,
        y: sumY / voxelCount,
        x: sumX / voxelCount
      },
      firstTimepoint: view.getUint32(cursor + 64, true),
      lastTimepoint: view.getUint32(cursor + 68, true)
    });
    cursor += SPARSE_LABEL_METADATA_RECORD_BYTE_LENGTH;
  }
  return records;
}
