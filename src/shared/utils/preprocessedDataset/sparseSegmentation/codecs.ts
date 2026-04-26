import {
  SPARSE_BRICK_PAYLOAD_HEADER_BYTE_LENGTH,
  codecFromId,
  codecToId,
  ensureUint32,
  toByteView
} from './binaryLayout';
import { localCoordForOffset } from './brickCoordinates';
import type {
  DecodedSparseSegmentationBrick,
  SparseSegmentationBrickCodec,
  SparseSegmentationBrickDirectoryRecord,
  SparseSegmentationBrickSize,
  SparseSegmentationLocalVoxel
} from './types';

type EncodedPayloadCandidate = {
  codec: SparseSegmentationBrickCodec;
  bytes: Uint8Array;
};

type XRun = {
  z: number;
  y: number;
  xStart: number;
  length: number;
  label: number;
};

const CODEC_TIE_ORDER: SparseSegmentationBrickCodec[] = [
  'coord-list-v1',
  'x-run-v1',
  'bitmask-labels-v1',
  'dense-local-v1'
];

function brickCapacity(brickSize: SparseSegmentationBrickSize): number {
  return brickSize[0] * brickSize[1] * brickSize[2];
}

function writePayloadHeader({
  view,
  codec,
  itemCount,
  nonzeroVoxelCount
}: {
  view: DataView;
  codec: SparseSegmentationBrickCodec;
  itemCount: number;
  nonzeroVoxelCount: number;
}): void {
  view.setUint8(0, codecToId(codec));
  view.setUint8(1, 1);
  view.setUint16(2, SPARSE_BRICK_PAYLOAD_HEADER_BYTE_LENGTH, true);
  view.setUint32(4, itemCount, true);
  view.setUint32(8, nonzeroVoxelCount, true);
  view.setUint32(12, 0, true);
}

function validateSortedVoxels(
  voxels: readonly SparseSegmentationLocalVoxel[],
  brickSize: SparseSegmentationBrickSize
): SparseSegmentationLocalVoxel[] {
  const capacity = brickCapacity(brickSize);
  const sorted = [...voxels].sort((left, right) => left.offset - right.offset);
  let previousOffset = -1;
  for (let index = 0; index < sorted.length; index += 1) {
    const voxel = sorted[index]!;
    if (!Number.isInteger(voxel.offset) || voxel.offset < 0 || voxel.offset >= capacity) {
      throw new Error(`Invalid sparse segmentation local offset ${voxel.offset}.`);
    }
    if (voxel.offset === previousOffset) {
      throw new Error(`Duplicate sparse segmentation local offset ${voxel.offset}.`);
    }
    if (voxel.offset < previousOffset) {
      throw new Error('Sparse segmentation local offsets must be sorted.');
    }
    ensureUint32(voxel.label, `local voxel ${voxel.offset}`);
    if (voxel.label === 0) {
      throw new Error('Sparse segmentation foreground payloads must not encode label 0.');
    }
    previousOffset = voxel.offset;
  }
  return sorted;
}

function encodeCoordList(voxels: readonly SparseSegmentationLocalVoxel[]): EncodedPayloadCandidate {
  const bytes = new Uint8Array(SPARSE_BRICK_PAYLOAD_HEADER_BYTE_LENGTH + voxels.length * 2 + voxels.length * 4);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  writePayloadHeader({
    view,
    codec: 'coord-list-v1',
    itemCount: voxels.length,
    nonzeroVoxelCount: voxels.length
  });
  let offsetCursor = SPARSE_BRICK_PAYLOAD_HEADER_BYTE_LENGTH;
  for (const voxel of voxels) {
    view.setUint16(offsetCursor, voxel.offset, true);
    offsetCursor += 2;
  }
  for (const voxel of voxels) {
    view.setUint32(offsetCursor, voxel.label, true);
    offsetCursor += 4;
  }
  return { codec: 'coord-list-v1', bytes };
}

function buildXRuns(
  voxels: readonly SparseSegmentationLocalVoxel[],
  brickSize: SparseSegmentationBrickSize
): XRun[] {
  const runs: XRun[] = [];
  let current: XRun | null = null;
  for (const voxel of voxels) {
    const local = localCoordForOffset(voxel.offset, brickSize);
    if (
      current &&
      current.z === local.z &&
      current.y === local.y &&
      current.label === voxel.label &&
      current.xStart + current.length === local.x
    ) {
      current.length += 1;
      continue;
    }
    if (current) {
      runs.push(current);
    }
    current = {
      z: local.z,
      y: local.y,
      xStart: local.x,
      length: 1,
      label: voxel.label
    };
  }
  if (current) {
    runs.push(current);
  }
  return runs;
}

function encodeXRuns(
  voxels: readonly SparseSegmentationLocalVoxel[],
  brickSize: SparseSegmentationBrickSize
): EncodedPayloadCandidate {
  const runs = buildXRuns(voxels, brickSize);
  const bytes = new Uint8Array(SPARSE_BRICK_PAYLOAD_HEADER_BYTE_LENGTH + runs.length * 16);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  writePayloadHeader({
    view,
    codec: 'x-run-v1',
    itemCount: runs.length,
    nonzeroVoxelCount: voxels.length
  });
  let cursor = SPARSE_BRICK_PAYLOAD_HEADER_BYTE_LENGTH;
  for (const run of runs) {
    view.setUint16(cursor, run.z, true);
    view.setUint16(cursor + 2, run.y, true);
    view.setUint16(cursor + 4, run.xStart, true);
    view.setUint16(cursor + 6, run.length, true);
    view.setUint32(cursor + 8, run.label, true);
    view.setUint32(cursor + 12, 0, true);
    cursor += 16;
  }
  return { codec: 'x-run-v1', bytes };
}

function encodeBitmaskLabels(
  voxels: readonly SparseSegmentationLocalVoxel[],
  brickSize: SparseSegmentationBrickSize
): EncodedPayloadCandidate {
  const capacity = brickCapacity(brickSize);
  const bitmaskByteLength = Math.ceil(capacity / 8);
  const bytes = new Uint8Array(SPARSE_BRICK_PAYLOAD_HEADER_BYTE_LENGTH + bitmaskByteLength + voxels.length * 4);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  writePayloadHeader({
    view,
    codec: 'bitmask-labels-v1',
    itemCount: voxels.length,
    nonzeroVoxelCount: voxels.length
  });
  const bitmask = bytes.subarray(
    SPARSE_BRICK_PAYLOAD_HEADER_BYTE_LENGTH,
    SPARSE_BRICK_PAYLOAD_HEADER_BYTE_LENGTH + bitmaskByteLength
  );
  let labelCursor = SPARSE_BRICK_PAYLOAD_HEADER_BYTE_LENGTH + bitmaskByteLength;
  for (const voxel of voxels) {
    bitmask[Math.floor(voxel.offset / 8)] |= 1 << (voxel.offset % 8);
    view.setUint32(labelCursor, voxel.label, true);
    labelCursor += 4;
  }
  return { codec: 'bitmask-labels-v1', bytes };
}

function encodeDenseLocal(
  voxels: readonly SparseSegmentationLocalVoxel[],
  brickSize: SparseSegmentationBrickSize
): EncodedPayloadCandidate {
  const labels = new Uint32Array(brickCapacity(brickSize));
  for (const voxel of voxels) {
    labels[voxel.offset] = voxel.label;
  }
  const bytes = new Uint8Array(SPARSE_BRICK_PAYLOAD_HEADER_BYTE_LENGTH + labels.byteLength);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  writePayloadHeader({
    view,
    codec: 'dense-local-v1',
    itemCount: labels.length,
    nonzeroVoxelCount: voxels.length
  });
  bytes.set(toByteView(labels), SPARSE_BRICK_PAYLOAD_HEADER_BYTE_LENGTH);
  return { codec: 'dense-local-v1', bytes };
}

export function encodeSparseSegmentationBrickPayload({
  voxels,
  brickSize
}: {
  voxels: readonly SparseSegmentationLocalVoxel[];
  brickSize: SparseSegmentationBrickSize;
}): EncodedPayloadCandidate {
  const sorted = validateSortedVoxels(voxels, brickSize);
  if (sorted.length === 0) {
    throw new Error('Sparse segmentation brick payloads must contain at least one foreground voxel.');
  }
  const candidates = [
    encodeCoordList(sorted),
    encodeXRuns(sorted, brickSize),
    encodeBitmaskLabels(sorted, brickSize),
    encodeDenseLocal(sorted, brickSize)
  ];
  candidates.sort((left, right) => {
    const lengthDelta = left.bytes.byteLength - right.bytes.byteLength;
    if (lengthDelta !== 0) {
      return lengthDelta;
    }
    return CODEC_TIE_ORDER.indexOf(left.codec) - CODEC_TIE_ORDER.indexOf(right.codec);
  });
  return candidates[0]!;
}

function readPayloadHeader(
  bytes: Uint8Array,
  expectedCodec: SparseSegmentationBrickCodec,
  expectedNonzeroVoxelCount: number
): { codec: SparseSegmentationBrickCodec; itemCount: number; nonzeroVoxelCount: number } {
  if (bytes.byteLength < SPARSE_BRICK_PAYLOAD_HEADER_BYTE_LENGTH) {
    throw new Error('Sparse segmentation brick payload is truncated before the header.');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const codec = codecFromId(view.getUint8(0));
  const version = view.getUint8(1);
  const headerByteLength = view.getUint16(2, true);
  const itemCount = view.getUint32(4, true);
  const nonzeroVoxelCount = view.getUint32(8, true);
  const reserved0 = view.getUint32(12, true);
  if (codec !== expectedCodec) {
    throw new Error(`Sparse segmentation codec mismatch: expected ${expectedCodec}, got ${codec}.`);
  }
  if (version !== 1 || headerByteLength !== SPARSE_BRICK_PAYLOAD_HEADER_BYTE_LENGTH || reserved0 !== 0) {
    throw new Error('Invalid sparse segmentation brick payload header.');
  }
  if (nonzeroVoxelCount !== expectedNonzeroVoxelCount) {
    throw new Error(
      `Sparse segmentation payload count mismatch: expected ${expectedNonzeroVoxelCount}, got ${nonzeroVoxelCount}.`
    );
  }
  return { codec, itemCount, nonzeroVoxelCount };
}

function validateDecodedVoxels({
  voxels,
  record,
  brickSize
}: {
  voxels: SparseSegmentationLocalVoxel[];
  record: SparseSegmentationBrickDirectoryRecord;
  brickSize: SparseSegmentationBrickSize;
}): SparseSegmentationLocalVoxel[] {
  const sorted = validateSortedVoxels(voxels, brickSize);
  if (sorted.length !== record.nonzeroVoxelCount) {
    throw new Error(
      `Sparse segmentation decoded voxel count mismatch for brick ${record.brickCoord.z},${record.brickCoord.y},${record.brickCoord.x}.`
    );
  }
  let labelMin = Number.POSITIVE_INFINITY;
  let labelMax = 0;
  for (const voxel of sorted) {
    if (voxel.label < labelMin) {
      labelMin = voxel.label;
    }
    if (voxel.label > labelMax) {
      labelMax = voxel.label;
    }
  }
  if (labelMin !== record.labelMin || labelMax !== record.labelMax) {
    throw new Error('Sparse segmentation decoded label range does not match directory record.');
  }
  return sorted;
}

function decodeCoordList(
  bytes: Uint8Array,
  record: SparseSegmentationBrickDirectoryRecord,
  brickSize: SparseSegmentationBrickSize
): SparseSegmentationLocalVoxel[] {
  const { itemCount } = readPayloadHeader(bytes, 'coord-list-v1', record.nonzeroVoxelCount);
  const expectedByteLength = SPARSE_BRICK_PAYLOAD_HEADER_BYTE_LENGTH + itemCount * 2 + itemCount * 4;
  if (bytes.byteLength !== expectedByteLength) {
    throw new Error(`Sparse segmentation coordinate-list payload byte-length mismatch.`);
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const labelsOffset = SPARSE_BRICK_PAYLOAD_HEADER_BYTE_LENGTH + itemCount * 2;
  const voxels: SparseSegmentationLocalVoxel[] = [];
  for (let index = 0; index < itemCount; index += 1) {
    voxels.push({
      offset: view.getUint16(SPARSE_BRICK_PAYLOAD_HEADER_BYTE_LENGTH + index * 2, true),
      label: view.getUint32(labelsOffset + index * 4, true)
    });
  }
  return validateDecodedVoxels({ voxels, record, brickSize });
}

function decodeXRuns(
  bytes: Uint8Array,
  record: SparseSegmentationBrickDirectoryRecord,
  brickSize: SparseSegmentationBrickSize
): SparseSegmentationLocalVoxel[] {
  const { itemCount } = readPayloadHeader(bytes, 'x-run-v1', record.nonzeroVoxelCount);
  const expectedByteLength = SPARSE_BRICK_PAYLOAD_HEADER_BYTE_LENGTH + itemCount * 16;
  if (bytes.byteLength !== expectedByteLength) {
    throw new Error('Sparse segmentation x-run payload byte-length mismatch.');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const voxels: SparseSegmentationLocalVoxel[] = [];
  for (let index = 0; index < itemCount; index += 1) {
    const cursor = SPARSE_BRICK_PAYLOAD_HEADER_BYTE_LENGTH + index * 16;
    const localZ = view.getUint16(cursor, true);
    const localY = view.getUint16(cursor + 2, true);
    const xStart = view.getUint16(cursor + 4, true);
    const length = view.getUint16(cursor + 6, true);
    const label = view.getUint32(cursor + 8, true);
    const reserved0 = view.getUint32(cursor + 12, true);
    if (length <= 0 || reserved0 !== 0) {
      throw new Error('Invalid sparse segmentation x-run record.');
    }
    if (localZ >= brickSize[0] || localY >= brickSize[1] || xStart + length > brickSize[2]) {
      throw new Error('Sparse segmentation x-run record is out of brick bounds.');
    }
    for (let localX = xStart; localX < xStart + length; localX += 1) {
      voxels.push({
        offset: (localZ * brickSize[1] + localY) * brickSize[2] + localX,
        label
      });
    }
  }
  return validateDecodedVoxels({ voxels, record, brickSize });
}

function decodeBitmaskLabels(
  bytes: Uint8Array,
  record: SparseSegmentationBrickDirectoryRecord,
  brickSize: SparseSegmentationBrickSize
): SparseSegmentationLocalVoxel[] {
  const { itemCount } = readPayloadHeader(bytes, 'bitmask-labels-v1', record.nonzeroVoxelCount);
  const capacity = brickCapacity(brickSize);
  const bitmaskByteLength = Math.ceil(capacity / 8);
  const expectedByteLength = SPARSE_BRICK_PAYLOAD_HEADER_BYTE_LENGTH + bitmaskByteLength + itemCount * 4;
  if (bytes.byteLength !== expectedByteLength) {
    throw new Error('Sparse segmentation bitmask-label payload byte-length mismatch.');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const bitmask = bytes.subarray(
    SPARSE_BRICK_PAYLOAD_HEADER_BYTE_LENGTH,
    SPARSE_BRICK_PAYLOAD_HEADER_BYTE_LENGTH + bitmaskByteLength
  );
  const labelsOffset = SPARSE_BRICK_PAYLOAD_HEADER_BYTE_LENGTH + bitmaskByteLength;
  const voxels: SparseSegmentationLocalVoxel[] = [];
  let labelIndex = 0;
  for (let offset = 0; offset < capacity; offset += 1) {
    if ((bitmask[Math.floor(offset / 8)]! & (1 << (offset % 8))) === 0) {
      continue;
    }
    if (labelIndex >= itemCount) {
      throw new Error('Sparse segmentation bitmask has more set bits than labels.');
    }
    voxels.push({
      offset,
      label: view.getUint32(labelsOffset + labelIndex * 4, true)
    });
    labelIndex += 1;
  }
  if (labelIndex !== itemCount) {
    throw new Error('Sparse segmentation bitmask popcount does not match label count.');
  }
  return validateDecodedVoxels({ voxels, record, brickSize });
}

function decodeDenseLocal(
  bytes: Uint8Array,
  record: SparseSegmentationBrickDirectoryRecord,
  brickSize: SparseSegmentationBrickSize
): SparseSegmentationLocalVoxel[] {
  const { itemCount } = readPayloadHeader(bytes, 'dense-local-v1', record.nonzeroVoxelCount);
  const capacity = brickCapacity(brickSize);
  if (itemCount !== capacity) {
    throw new Error(`Sparse segmentation dense-local item count mismatch: expected ${capacity}, got ${itemCount}.`);
  }
  const expectedByteLength = SPARSE_BRICK_PAYLOAD_HEADER_BYTE_LENGTH + capacity * 4;
  if (bytes.byteLength !== expectedByteLength) {
    throw new Error('Sparse segmentation dense-local payload byte-length mismatch.');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const voxels: SparseSegmentationLocalVoxel[] = [];
  for (let offset = 0; offset < capacity; offset += 1) {
    const label = view.getUint32(SPARSE_BRICK_PAYLOAD_HEADER_BYTE_LENGTH + offset * 4, true);
    if (label !== 0) {
      voxels.push({ offset, label });
    }
  }
  return validateDecodedVoxels({ voxels, record, brickSize });
}

export function decodeSparseSegmentationBrickPayload({
  layerKey,
  bytes,
  record,
  brickSize
}: {
  layerKey: string;
  bytes: Uint8Array;
  record: SparseSegmentationBrickDirectoryRecord;
  brickSize: SparseSegmentationBrickSize;
}): DecodedSparseSegmentationBrick {
  const voxels =
    record.codec === 'coord-list-v1'
      ? decodeCoordList(bytes, record, brickSize)
      : record.codec === 'x-run-v1'
        ? decodeXRuns(bytes, record, brickSize)
        : record.codec === 'bitmask-labels-v1'
          ? decodeBitmaskLabels(bytes, record, brickSize)
          : decodeDenseLocal(bytes, record, brickSize);
  const offsets = new Uint16Array(voxels.length);
  const labels = new Uint32Array(voxels.length);
  for (let index = 0; index < voxels.length; index += 1) {
    offsets[index] = voxels[index]!.offset;
    labels[index] = voxels[index]!.label;
  }
  return {
    kind: 'decoded-sparse-segmentation-brick',
    layerKey,
    timepoint: record.timepoint,
    scaleLevel: record.scaleLevel,
    brickCoord: record.brickCoord,
    brickSize,
    codec: record.codec,
    nonzeroVoxelCount: record.nonzeroVoxelCount,
    localBounds: record.localBounds,
    labelAtOffset(offset: number): number {
      let low = 0;
      let high = offsets.length - 1;
      while (low <= high) {
        const mid = (low + high) >> 1;
        const candidate = offsets[mid] ?? 0;
        if (candidate === offset) {
          return labels[mid] ?? 0;
        }
        if (candidate < offset) {
          low = mid + 1;
        } else {
          high = mid - 1;
        }
      }
      return 0;
    },
    forEachNonzero(callback: (offset: number, label: number) => void): void {
      for (let index = 0; index < offsets.length; index += 1) {
        callback(offsets[index] ?? 0, labels[index] ?? 0);
      }
    }
  };
}
