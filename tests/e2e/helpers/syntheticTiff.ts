import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TYPE_SHORT = 3;
const TYPE_LONG = 4;
const TAG_IMAGE_WIDTH = 256;
const TAG_IMAGE_LENGTH = 257;
const TAG_BITS_PER_SAMPLE = 258;
const TAG_COMPRESSION = 259;
const TAG_PHOTOMETRIC_INTERPRETATION = 262;
const TAG_STRIP_OFFSETS = 273;
const TAG_SAMPLES_PER_PIXEL = 277;
const TAG_ROWS_PER_STRIP = 278;
const TAG_STRIP_BYTE_COUNTS = 279;
const TAG_SAMPLE_FORMAT = 339;

function encodeGrayscaleTiffStack(width: number, height: number, depth: number, data: Uint8Array): Buffer {
  const bytesPerSlice = width * height;
  const headerSize = 8;
  const dataStart = headerSize;
  const dataSize = bytesPerSlice * depth;
  const ifdEntryCount = 10;
  const ifdSize = 2 + ifdEntryCount * 12 + 4;
  const ifdStart = dataStart + dataSize;
  const totalSize = ifdStart + ifdSize * depth;

  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  bytes.set(new Uint8Array([0x49, 0x49]), 0);
  view.setUint16(2, 42, true);
  view.setUint32(4, ifdStart, true);
  bytes.set(data, dataStart);

  for (let z = 0; z < depth; z += 1) {
    const ifdOffset = ifdStart + z * ifdSize;
    const stripOffset = dataStart + z * bytesPerSlice;
    view.setUint16(ifdOffset, ifdEntryCount, true);

    const entries = [
      [TAG_IMAGE_WIDTH, TYPE_LONG, 1, width],
      [TAG_IMAGE_LENGTH, TYPE_LONG, 1, height],
      [TAG_BITS_PER_SAMPLE, TYPE_SHORT, 1, 8],
      [TAG_COMPRESSION, TYPE_SHORT, 1, 1],
      [TAG_PHOTOMETRIC_INTERPRETATION, TYPE_SHORT, 1, 1],
      [TAG_STRIP_OFFSETS, TYPE_LONG, 1, stripOffset],
      [TAG_SAMPLES_PER_PIXEL, TYPE_SHORT, 1, 1],
      [TAG_ROWS_PER_STRIP, TYPE_LONG, 1, height],
      [TAG_STRIP_BYTE_COUNTS, TYPE_LONG, 1, bytesPerSlice],
      [TAG_SAMPLE_FORMAT, TYPE_SHORT, 1, 1],
    ] as const;

    let entryOffset = ifdOffset + 2;
    for (const [tag, type, count, value] of entries) {
      view.setUint16(entryOffset, tag, true);
      view.setUint16(entryOffset + 2, type, true);
      view.setUint32(entryOffset + 4, count, true);
      view.setUint32(entryOffset + 8, value, true);
      entryOffset += 12;
    }

    const nextIfdOffset = z === depth - 1 ? 0 : ifdStart + (z + 1) * ifdSize;
    view.setUint32(ifdOffset + 2 + ifdEntryCount * 12, nextIfdOffset, true);
  }

  return Buffer.from(buffer);
}

export function createSyntheticVolumeTiffPath(options?: {
  width?: number;
  height?: number;
  depth?: number;
  seed?: number;
}): string {
  const width = options?.width ?? 8;
  const height = options?.height ?? 8;
  const depth = options?.depth ?? 4;
  const seed = options?.seed ?? 0;
  const data = new Uint8Array(width * height * depth);

  for (let z = 0; z < depth; z += 1) {
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = ((z * height) + y) * width + x;
        data[index] = (x * 20 + y * 10 + z * 30 + seed * 7) % 255;
      }
    }
  }

  const filePath = path.join(
    os.tmpdir(),
    `llsm-viewer-synth-${process.pid}-${Date.now()}-${seed}.tiff`
  );
  fs.writeFileSync(filePath, encodeGrayscaleTiffStack(width, height, depth, data));
  return filePath;
}

export function createSyntheticVolumeMovieTiffPaths(options?: {
  timepoints?: number;
  width?: number;
  height?: number;
  depth?: number;
  seed?: number;
}): string[] {
  const timepoints = options?.timepoints ?? 3;
  const seed = options?.seed ?? 0;
  const paths: string[] = [];
  for (let timepoint = 0; timepoint < timepoints; timepoint += 1) {
    paths.push(
      createSyntheticVolumeTiffPath({
        width: options?.width,
        height: options?.height,
        depth: options?.depth,
        seed: seed + timepoint * 17,
      })
    );
  }
  return paths;
}

export function createCustomVolumeTiffPath(options: {
  width: number;
  height: number;
  depth: number;
  fill: (x: number, y: number, z: number) => number;
  label?: string;
}): string {
  const { width, height, depth, fill, label = 'custom' } = options;
  const data = new Uint8Array(width * height * depth);

  for (let z = 0; z < depth; z += 1) {
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = ((z * height) + y) * width + x;
        const value = fill(x, y, z);
        data[index] = Math.max(0, Math.min(255, Math.round(value)));
      }
    }
  }

  const filePath = path.join(
    os.tmpdir(),
    `llsm-viewer-${label}-${process.pid}-${Date.now()}.tiff`
  );
  fs.writeFileSync(filePath, encodeGrayscaleTiffStack(width, height, depth, data));
  return filePath;
}
