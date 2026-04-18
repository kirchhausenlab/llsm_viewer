import { inflateSync } from 'node:zlib';

const PNG_SIGNATURE = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);

function readUint32BE(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] ?? 0) << 24) |
    ((bytes[offset + 1] ?? 0) << 16) |
    ((bytes[offset + 2] ?? 0) << 8) |
    (bytes[offset + 3] ?? 0)
  ) >>> 0;
}

function paethPredictor(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) {
    return a;
  }
  if (pb <= pc) {
    return b;
  }
  return c;
}

export function computePngBrightnessStats(pngBytes: Uint8Array): {
  width: number;
  height: number;
  nonZeroPixels: number;
  maxLuminance: number;
  meanLuminance: number;
} {
  for (let index = 0; index < PNG_SIGNATURE.length; index += 1) {
    if (pngBytes[index] !== PNG_SIGNATURE[index]) {
      throw new Error('Invalid PNG signature.');
    }
  }

  let offset = PNG_SIGNATURE.length;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idatChunks: Uint8Array[] = [];

  while (offset + 8 <= pngBytes.length) {
    const chunkLength = readUint32BE(pngBytes, offset);
    const chunkTypeOffset = offset + 4;
    const chunkDataOffset = offset + 8;
    const chunkEnd = chunkDataOffset + chunkLength;
    const chunkType = String.fromCharCode(
      pngBytes[chunkTypeOffset] ?? 0,
      pngBytes[chunkTypeOffset + 1] ?? 0,
      pngBytes[chunkTypeOffset + 2] ?? 0,
      pngBytes[chunkTypeOffset + 3] ?? 0,
    );

    if (chunkEnd + 4 > pngBytes.length) {
      throw new Error(`Invalid PNG chunk length for ${chunkType}.`);
    }

    if (chunkType === 'IHDR') {
      width = readUint32BE(pngBytes, chunkDataOffset);
      height = readUint32BE(pngBytes, chunkDataOffset + 4);
      bitDepth = pngBytes[chunkDataOffset + 8] ?? 0;
      colorType = pngBytes[chunkDataOffset + 9] ?? 0;
    } else if (chunkType === 'IDAT') {
      idatChunks.push(pngBytes.slice(chunkDataOffset, chunkEnd));
    } else if (chunkType === 'IEND') {
      break;
    }

    offset = chunkEnd + 4;
  }

  let bytesPerPixel = 0;
  if (bitDepth === 8 && colorType === 6) {
    bytesPerPixel = 4;
  } else if (bitDepth === 8 && colorType === 2) {
    bytesPerPixel = 3;
  } else if (bitDepth === 8 && colorType === 0) {
    bytesPerPixel = 1;
  }

  if (width <= 0 || height <= 0 || bytesPerPixel === 0 || idatChunks.length === 0) {
    throw new Error('Unsupported PNG layout. Expected 8-bit grayscale, RGB, or RGBA PNG data.');
  }

  const inflated = inflateSync(Buffer.concat(idatChunks.map((chunk) => Buffer.from(chunk))));
  const stride = width * bytesPerPixel;
  const expectedLength = height * (stride + 1);
  if (inflated.length !== expectedLength) {
    throw new Error(`Unexpected PNG payload length (expected ${expectedLength}, got ${inflated.length}).`);
  }

  const decoded = new Uint8Array(width * height * bytesPerPixel);
  for (let row = 0; row < height; row += 1) {
    const filter = inflated[row * (stride + 1)] ?? 0;
    const rowStart = row * stride;
    const scanlineStart = row * (stride + 1) + 1;
    for (let column = 0; column < stride; column += 1) {
      const raw = inflated[scanlineStart + column] ?? 0;
      const left = column >= bytesPerPixel ? decoded[rowStart + column - bytesPerPixel] ?? 0 : 0;
      const up = row > 0 ? decoded[rowStart + column - stride] ?? 0 : 0;
      const upLeft =
        row > 0 && column >= bytesPerPixel
          ? decoded[rowStart + column - stride - bytesPerPixel] ?? 0
          : 0;
      let value = raw;
      if (filter === 1) {
        value = (raw + left) & 0xff;
      } else if (filter === 2) {
        value = (raw + up) & 0xff;
      } else if (filter === 3) {
        value = (raw + Math.floor((left + up) * 0.5)) & 0xff;
      } else if (filter === 4) {
        value = (raw + paethPredictor(left, up, upLeft)) & 0xff;
      } else if (filter !== 0) {
        throw new Error(`Unsupported PNG filter type ${filter}.`);
      }
      decoded[rowStart + column] = value;
    }
  }

  let nonZeroPixels = 0;
  let maxLuminance = 0;
  let luminanceSum = 0;
  for (let offset = 0; offset < decoded.length; offset += bytesPerPixel) {
    const red = decoded[offset] ?? 0;
    const green = bytesPerPixel >= 3 ? (decoded[offset + 1] ?? 0) : red;
    const blue = bytesPerPixel >= 3 ? (decoded[offset + 2] ?? 0) : red;
    const luminance = red + green + blue;
    if (luminance > 0) {
      nonZeroPixels += 1;
    }
    if (luminance > maxLuminance) {
      maxLuminance = luminance;
    }
    luminanceSum += luminance;
  }

  return {
    width,
    height,
    nonZeroPixels,
    maxLuminance,
    meanLuminance: luminanceSum / Math.max(1, width * height) / 3,
  };
}
