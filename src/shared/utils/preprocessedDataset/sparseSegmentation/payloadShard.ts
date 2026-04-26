import {
  SPARSE_HEADER_BYTE_LENGTH,
  SPARSE_PAYLOAD_SHARD_MAGIC,
  computeSparseSegmentationCrc32,
  expectMagic,
  readU64AsNumber,
  writeAscii8,
  writeU64
} from './binaryLayout';
import type { SparseSegmentationBrickDirectoryRecord } from './types';

export type SparsePayloadShardBuildResult = {
  shardId: number;
  bytes: Uint8Array;
  payloadOffsets: number[];
};

export function buildSparseSegmentationPayloadShard({
  shardId,
  payloads
}: {
  shardId: number;
  payloads: readonly Uint8Array[];
}): SparsePayloadShardBuildResult {
  const payloadBytes = payloads.reduce((sum, payload) => sum + payload.byteLength, 0);
  const fileByteLength = SPARSE_HEADER_BYTE_LENGTH + payloadBytes;
  const bytes = new Uint8Array(fileByteLength);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  writeAscii8(view, 0, SPARSE_PAYLOAD_SHARD_MAGIC);
  view.setUint16(8, 1, true);
  view.setUint16(10, SPARSE_HEADER_BYTE_LENGTH, true);
  view.setUint32(12, shardId, true);
  view.setUint32(16, payloads.length, true);
  view.setUint32(20, 0, true);
  writeU64(view, 24, payloadBytes);
  writeU64(view, 32, fileByteLength);
  writeU64(view, 40, 0);
  writeU64(view, 48, 0);
  writeU64(view, 56, 0);

  const payloadOffsets: number[] = [];
  let cursor = SPARSE_HEADER_BYTE_LENGTH;
  for (const payload of payloads) {
    payloadOffsets.push(cursor);
    bytes.set(payload, cursor);
    cursor += payload.byteLength;
  }
  return { shardId, bytes, payloadOffsets };
}

export function validateSparseSegmentationPayloadShard(bytes: Uint8Array, path: string): void {
  if (bytes.byteLength < SPARSE_HEADER_BYTE_LENGTH) {
    throw new Error(`Sparse segmentation payload shard ${path} is truncated.`);
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  expectMagic(view, SPARSE_PAYLOAD_SHARD_MAGIC, path);
  const version = view.getUint16(8, true);
  const headerByteLength = view.getUint16(10, true);
  const payloadBytes = readU64AsNumber(view, 24, `${path}.payloadBytes`);
  const fileByteLength = readU64AsNumber(view, 32, `${path}.fileByteLength`);
  if (version !== 1 || headerByteLength !== SPARSE_HEADER_BYTE_LENGTH) {
    throw new Error(`Invalid sparse segmentation payload shard header at ${path}.`);
  }
  if (fileByteLength !== bytes.byteLength || payloadBytes !== bytes.byteLength - SPARSE_HEADER_BYTE_LENGTH) {
    throw new Error(`Sparse segmentation payload shard length mismatch at ${path}.`);
  }
}

export function readSparseSegmentationPayloadFromShard({
  shardBytes,
  record,
  path
}: {
  shardBytes: Uint8Array;
  record: SparseSegmentationBrickDirectoryRecord;
  path: string;
}): Uint8Array {
  validateSparseSegmentationPayloadShard(shardBytes, path);
  const start = record.payloadByteOffset;
  const end = start + record.payloadByteLength;
  if (start < SPARSE_HEADER_BYTE_LENGTH || end > shardBytes.byteLength || start > end) {
    throw new Error(
      `Sparse segmentation payload range is invalid for brick ${record.brickCoord.z},${record.brickCoord.y},${record.brickCoord.x}.`
    );
  }
  const payload = shardBytes.slice(start, end);
  const actualCrc32 = computeSparseSegmentationCrc32(payload);
  if (actualCrc32 !== record.payloadCrc32) {
    throw new Error(
      `Sparse segmentation payload checksum mismatch for brick ${record.brickCoord.z},${record.brickCoord.y},${record.brickCoord.x}.`
    );
  }
  return payload;
}
