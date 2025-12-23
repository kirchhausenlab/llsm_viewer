import assert from 'node:assert/strict';

import { encodeRgbTiffStack } from '../src/shared/utils/tiffWriter.ts';

console.log('Starting tiffWriter tests');

(() => {
  const width = 2;
  const height = 1;
  const depth = 2;
  // Slice 0: [red, green], Slice 1: [blue, white]
  const rgb = new Uint8Array([
    255, 0, 0, 0, 255, 0,
    0, 0, 255, 255, 255, 255,
  ]);

  const buffer = encodeRgbTiffStack({ width, height, depth, rgb });
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  assert.strictEqual(String.fromCharCode(bytes[0] ?? 0, bytes[1] ?? 0), 'II');
  assert.strictEqual(view.getUint16(2, true), 42);

  const bytesPerSlice = width * height * 3;
  const dataStart = 8;
  const ifdStart = dataStart + bytesPerSlice * depth;
  assert.strictEqual(view.getUint32(4, true), ifdStart);

  // Verify image payload placement.
  assert.deepStrictEqual(Array.from(bytes.slice(dataStart, dataStart + rgb.length)), Array.from(rgb));

  // IFD 0 basic checks.
  const entryCount = view.getUint16(ifdStart, true);
  assert.strictEqual(entryCount, 11);
  const nextIfdOffset = view.getUint32(ifdStart + 2 + entryCount * 12, true);
  assert.strictEqual(nextIfdOffset > ifdStart, true);

  const tagAt = (entryIndex: number) => view.getUint16(ifdStart + 2 + entryIndex * 12, true);
  assert.strictEqual(tagAt(0), 256); // ImageWidth
  assert.strictEqual(tagAt(1), 257); // ImageLength
  assert.strictEqual(tagAt(5), 273); // StripOffsets

  // Strip offset should point to slice 0.
  const stripOffsetValue = view.getUint32(ifdStart + 2 + 5 * 12 + 8, true);
  assert.strictEqual(stripOffsetValue, dataStart);

  // IFD 1 strip offset should point to slice 1.
  const ifdSize = 2 + entryCount * 12 + 4;
  const ifd1 = ifdStart + ifdSize;
  const stripOffsetValue1 = view.getUint32(ifd1 + 2 + 5 * 12 + 8, true);
  assert.strictEqual(stripOffsetValue1, dataStart + bytesPerSlice);
})();

console.log('tiffWriter tests passed');

