import fs from 'node:fs/promises';
import { fromArrayBuffer } from 'geotiff';

const path = process.argv[2];
if (!path) throw new Error('path required');
const bytes = await fs.readFile(path);
const tiff = await fromArrayBuffer(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
const image = await tiff.getImage();
const rasters = await image.readRasters({ interleave: true });
let min = Infinity;
let max = -Infinity;
let nonZero = 0;
for (let i = 0; i < rasters.length; i += 1) {
  const value = rasters[i];
  if (value < min) min = value;
  if (value > max) max = value;
  if (value !== 0) nonZero += 1;
}
console.log(JSON.stringify({ width: image.getWidth(), height: image.getHeight(), samplesPerPixel: image.getSamplesPerPixel(), bitsPerSample: image.getBitsPerSample(), length: rasters.length, min, max, nonZero }, null, 2));
