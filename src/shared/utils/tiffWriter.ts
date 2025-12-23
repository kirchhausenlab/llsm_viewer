type RgbTiffStackInput = {
  width: number;
  height: number;
  depth: number;
  /**
   * Interleaved RGB bytes in Z-major order: (z, y, x, c).
   * Length must be width * height * depth * 3.
   */
  rgb: Uint8Array;
};

const TIFF_MAGIC = 42;

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
const TAG_PLANAR_CONFIGURATION = 284;
const TAG_SAMPLE_FORMAT = 339;

const writeAscii = (view: DataView, offset: number, text: string) => {
  for (let i = 0; i < text.length; i++) {
    view.setUint8(offset + i, text.charCodeAt(i) & 0xff);
  }
};

type TiffEntry = {
  tag: number;
  type: number;
  count: number;
  value: number;
};

const writeIfdEntry = (view: DataView, offset: number, entry: TiffEntry) => {
  view.setUint16(offset, entry.tag, true);
  view.setUint16(offset + 2, entry.type, true);
  view.setUint32(offset + 4, entry.count >>> 0, true);
  view.setUint32(offset + 8, entry.value >>> 0, true);
};

export function encodeRgbTiffStack({ width, height, depth, rgb }: RgbTiffStackInput): ArrayBuffer {
  if (!Number.isFinite(width) || width <= 0 || !Number.isInteger(width)) {
    throw new Error('encodeRgbTiffStack: width must be a positive integer.');
  }
  if (!Number.isFinite(height) || height <= 0 || !Number.isInteger(height)) {
    throw new Error('encodeRgbTiffStack: height must be a positive integer.');
  }
  if (!Number.isFinite(depth) || depth <= 0 || !Number.isInteger(depth)) {
    throw new Error('encodeRgbTiffStack: depth must be a positive integer.');
  }

  const expectedLength = width * height * depth * 3;
  if (rgb.length !== expectedLength) {
    throw new Error(`encodeRgbTiffStack: rgb length must be ${expectedLength} bytes.`);
  }

  const bytesPerSlice = width * height * 3;
  const headerSize = 8;
  const dataStart = headerSize;
  const dataSize = bytesPerSlice * depth;
  const ifdEntryCount = 11;
  const ifdSize = 2 + ifdEntryCount * 12 + 4;
  const ifdStart = dataStart + dataSize;
  const ifdsSize = ifdSize * depth;
  const bitsPerSampleOffset = ifdStart + ifdsSize;
  const sampleFormatOffset = bitsPerSampleOffset + 6;
  const totalSize = sampleFormatOffset + 6;

  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  // Header: little-endian (II), magic 42, first IFD offset.
  writeAscii(view, 0, 'II');
  view.setUint16(2, TIFF_MAGIC, true);
  view.setUint32(4, ifdStart, true);

  // Image data (uncompressed, one strip per slice).
  bytes.set(rgb, dataStart);

  // Shared arrays.
  view.setUint16(bitsPerSampleOffset, 8, true);
  view.setUint16(bitsPerSampleOffset + 2, 8, true);
  view.setUint16(bitsPerSampleOffset + 4, 8, true);

  view.setUint16(sampleFormatOffset, 1, true);
  view.setUint16(sampleFormatOffset + 2, 1, true);
  view.setUint16(sampleFormatOffset + 4, 1, true);

  for (let z = 0; z < depth; z++) {
    const ifdOffset = ifdStart + z * ifdSize;
    view.setUint16(ifdOffset, ifdEntryCount, true);
    let entryOffset = ifdOffset + 2;

    const stripOffset = dataStart + z * bytesPerSlice;

    const entries: TiffEntry[] = [
      { tag: TAG_IMAGE_WIDTH, type: TYPE_LONG, count: 1, value: width },
      { tag: TAG_IMAGE_LENGTH, type: TYPE_LONG, count: 1, value: height },
      { tag: TAG_BITS_PER_SAMPLE, type: TYPE_SHORT, count: 3, value: bitsPerSampleOffset },
      { tag: TAG_COMPRESSION, type: TYPE_SHORT, count: 1, value: 1 },
      { tag: TAG_PHOTOMETRIC_INTERPRETATION, type: TYPE_SHORT, count: 1, value: 2 },
      { tag: TAG_STRIP_OFFSETS, type: TYPE_LONG, count: 1, value: stripOffset },
      { tag: TAG_SAMPLES_PER_PIXEL, type: TYPE_SHORT, count: 1, value: 3 },
      { tag: TAG_ROWS_PER_STRIP, type: TYPE_LONG, count: 1, value: height },
      { tag: TAG_STRIP_BYTE_COUNTS, type: TYPE_LONG, count: 1, value: bytesPerSlice },
      { tag: TAG_PLANAR_CONFIGURATION, type: TYPE_SHORT, count: 1, value: 1 },
      { tag: TAG_SAMPLE_FORMAT, type: TYPE_SHORT, count: 3, value: sampleFormatOffset },
    ];

    for (const entry of entries) {
      writeIfdEntry(view, entryOffset, entry);
      entryOffset += 12;
    }

    const nextIfdOffset = z === depth - 1 ? 0 : ifdStart + (z + 1) * ifdSize;
    view.setUint32(ifdOffset + 2 + ifdEntryCount * 12, nextIfdOffset, true);
  }

  return buffer;
}
