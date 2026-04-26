export const SPARSE_BRICK_DIRECTORY_MAGIC = 'SSBDIR01';
export const SPARSE_PAYLOAD_SHARD_MAGIC = 'SSBSHR01';
export const SPARSE_OCCUPANCY_MAGIC = 'SSBOCC01';
export const SPARSE_LABEL_METADATA_MAGIC = 'SSBLAB01';

export const SPARSE_BINARY_VERSION = 1;
export const SPARSE_HEADER_BYTE_LENGTH = 64;
export const SPARSE_BRICK_DIRECTORY_RECORD_BYTE_LENGTH = 80;
export const SPARSE_LABEL_METADATA_RECORD_BYTE_LENGTH = 96;
export const SPARSE_BRICK_PAYLOAD_HEADER_BYTE_LENGTH = 16;

export function writeAscii8(view: DataView, offset: number, value: string): void {
  if (value.length !== 8) {
    throw new Error(`Sparse segmentation magic must be 8 bytes, got ${value.length}.`);
  }
  for (let index = 0; index < 8; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

export function readAscii8(view: DataView, offset: number): string {
  let output = '';
  for (let index = 0; index < 8; index += 1) {
    output += String.fromCharCode(view.getUint8(offset + index));
  }
  return output;
}

export function expectMagic(view: DataView, expected: string, path: string): void {
  const actual = readAscii8(view, 0);
  if (actual !== expected) {
    throw new Error(`Invalid sparse segmentation binary at ${path}: expected magic ${expected}, got ${actual}.`);
  }
}

export function readU64AsNumber(view: DataView, offset: number, path: string): number {
  const value = view.getBigUint64(offset, true);
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`Invalid sparse segmentation binary at ${path}: u64 value exceeds Number.MAX_SAFE_INTEGER.`);
  }
  return Number(value);
}

export function writeU64(view: DataView, offset: number, value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Sparse segmentation u64 value must be a non-negative safe integer, got ${value}.`);
  }
  view.setBigUint64(offset, BigInt(value), true);
}

export function toByteView(view: Uint8Array | Uint16Array | Uint32Array): Uint8Array {
  return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
}

export function assertByteLength(bytes: Uint8Array, expected: number, path: string): void {
  if (bytes.byteLength !== expected) {
    throw new Error(
      `Invalid sparse segmentation binary at ${path}: expected ${expected} bytes, got ${bytes.byteLength}.`
    );
  }
}

export function ensureUint32(value: number, path: string): number {
  if (!Number.isFinite(value) || Math.floor(value) !== value || value < 0 || value > 0xffffffff) {
    throw new Error(`Invalid sparse segmentation uint32 at ${path}: ${value}.`);
  }
  return value;
}

let crc32Table: Uint32Array | null = null;

function getCrc32Table(): Uint32Array {
  if (crc32Table) {
    return crc32Table;
  }
  const table = new Uint32Array(256);
  for (let index = 0; index < table.length; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) !== 0 ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
    }
    table[index] = value >>> 0;
  }
  crc32Table = table;
  return table;
}

export function computeSparseSegmentationCrc32(bytes: Uint8Array): number {
  const table = getCrc32Table();
  let crc = 0xffffffff;
  for (let index = 0; index < bytes.length; index += 1) {
    crc = table[(crc ^ (bytes[index] ?? 0)) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function codecToId(codec: import('./types').SparseSegmentationBrickCodec): number {
  switch (codec) {
    case 'coord-list-v1':
      return 1;
    case 'x-run-v1':
      return 2;
    case 'bitmask-labels-v1':
      return 3;
    case 'dense-local-v1':
      return 4;
    default: {
      const exhaustive: never = codec;
      throw new Error(`Unsupported sparse segmentation codec: ${exhaustive}`);
    }
  }
}

export function codecFromId(id: number): import('./types').SparseSegmentationBrickCodec {
  switch (id) {
    case 1:
      return 'coord-list-v1';
    case 2:
      return 'x-run-v1';
    case 3:
      return 'bitmask-labels-v1';
    case 4:
      return 'dense-local-v1';
    default:
      throw new Error(`Unsupported sparse segmentation codec id: ${id}.`);
  }
}
